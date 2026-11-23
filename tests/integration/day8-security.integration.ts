import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import test from "node:test";
import { databaseUrl, safeLocalDatabase } from "./test-database.ts";

if (safeLocalDatabase) {
  process.env.DATABASE_URL = databaseUrl;
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  process.env.AUTH_SECRET = "isolated-day8-integration-only";
  process.env.AUTH_RATE_LIMIT_SECRET = randomBytes(32).toString("base64url");
}

const origin = "http://localhost:3000";
const secret = () => randomBytes(32).toString("base64url");

test("workout photos preserve their keys and enforce access when reusing the legacy bucket", { skip: !safeLocalDatabase }, async (t) => {
  const { prisma } = await import("../../lib/prisma.ts");
  const { GET } = await import("../../app/api/workouts/[id]/photos/[photoId]/route.ts");
  const { POST } = await import("../../app/api/user/workouts/[id]/photos/route.ts");
  const { DELETE } = await import("../../app/api/user/workouts/[id]/photos/[photoId]/route.ts");
  const { getAuthSessionCookieName } = await import("../../lib/auth/native-auth-server.ts");
  const { getWorkoutPhotoKey, isWorkoutPhotoKeyForWorkout } = await import("../../lib/workout-photo.ts");
  const { getWorkoutPhotoObject, putWorkoutPhoto, deleteWorkoutPhotoObject } = await import("../../lib/workout-photo-storage.ts");
  const { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const { default: sharp } = await import("sharp");
  let expectedBucket = "isolated-test-workout-bucket";
  let acceptUpload = false;
  let uploadedKey: string | undefined;
  const r2 = t.mock.method(S3Client.prototype, "send", async (command: unknown) => {
    assert.ok(command instanceof GetObjectCommand || command instanceof PutObjectCommand ||
      command instanceof HeadObjectCommand || command instanceof DeleteObjectCommand);
    assert.equal(command.input.Bucket, expectedBucket);
    if (acceptUpload && command instanceof PutObjectCommand) {
      assert.ok(command.input.Key && isWorkoutPhotoKeyForWorkout(command.input.Key, owner.id, workout.id));
      uploadedKey = command.input.Key;
    }
    assert.equal(command.input.Key, uploadedKey ?? photo.storageKey);
    if (command instanceof GetObjectCommand) {
      return { Body: { transformToWebStream: () => new Response("image fixture").body } };
    }
    if (command instanceof PutObjectCommand) assert.equal(command.input.CacheControl, "private, no-store");
    return {};
  });
  const owner = await prisma.user.create({ data: {} });
  const viewer = await prisma.user.create({ data: {} });
  const workout = await prisma.workout.create({ data: { userId: owner.id, visibility: "PUBLIC", completedAt: new Date() } });
  const photo = await prisma.workoutPhoto.create({ data: {
    userId: owner.id, workoutId: workout.id, storageKey: getWorkoutPhotoKey(owner.id, workout.id), width: 1, height: 1,
    mimeType: "image/webp", originalFileName: "test.webp", fileSizeBytes: 1,
  } });
  const legacyKey = photo.storageKey;
  const originalSharedAccess = process.env.WORKOUT_PHOTO_R2_SHARED_BUCKET_ACCESS;
  const tokens = new Map([[owner.id, secret()], [viewer.id, secret()]]);
  const sessionHeaders = (id?: string) => id ? { cookie: `${getAuthSessionCookieName()}=${tokens.get(id)}` } : undefined;
  const requestPhoto = async (id?: string, workoutId = String(workout.id), photoId = photo.id) => GET(new Request(`${origin}/api/workouts/${workoutId}/photos/${photoId}`, {
    headers: sessionHeaders(id),
  }), { params: Promise.resolve({ id: workoutId, photoId }) });
  const allowed = async (...args: Parameters<typeof requestPhoto>) => {
    const response = await requestPhoto(...args);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("location"), null);
    if (response.status === 200) assert.equal(await response.text(), "image fixture");
    else assert.equal(response.status, 404);
    return response.status === 200;
  };
  try {
    await prisma.session.createMany({ data: [...tokens].map(([userId, sessionToken]) => ({
      userId, sessionToken, expires: new Date(Date.now() + 60_000),
    })) });
    process.env.PARK_PHOTO_R2_BUCKET_NAME = "isolated-test-public-bucket";
    process.env.WORKOUT_PHOTO_R2_BUCKET_NAME = process.env.PARK_PHOTO_R2_BUCKET_NAME;
    process.env.WORKOUT_PHOTO_R2_ENDPOINT = "https://00000000000000000000000000000000.r2.cloudflarestorage.com";
    process.env.WORKOUT_PHOTO_R2_ACCESS_KEY_ID = "test-placeholder";
    process.env.WORKOUT_PHOTO_R2_SECRET_ACCESS_KEY = "test-placeholder";
    delete process.env.WORKOUT_PHOTO_R2_SHARED_BUCKET_ACCESS;
    assert.equal(await allowed(), false);
    process.env.WORKOUT_PHOTO_R2_BUCKET_NAME = "calistheni-photos";
    assert.equal(await allowed(), false);
    process.env.WORKOUT_PHOTO_R2_SHARED_BUCKET_ACCESS = "true";
    assert.equal(await allowed(), false);
    process.env.WORKOUT_PHOTO_R2_SHARED_BUCKET_ACCESS = "app-only";
    process.env.WORKOUT_PHOTO_R2_BUCKET_NAME = process.env.PARK_PHOTO_R2_BUCKET_NAME;
    assert.equal(await allowed(), false);
    assert.equal(r2.mock.callCount(), 0);
    process.env.WORKOUT_PHOTO_R2_BUCKET_NAME = "isolated-test-workout-bucket";
    assert.equal(await allowed(), true);
    process.env.WORKOUT_PHOTO_R2_BUCKET_NAME = "calistheni-photos";
    process.env.PARK_PHOTO_R2_BUCKET_NAME = "calistheni-photos";
    expectedBucket = "calistheni-photos";
    assert.equal(await allowed(), true);
    assert.equal(await allowed(viewer.id), true);
    assert.equal(await allowed(undefined, "../48"), false);
    assert.equal(await allowed(undefined, String(workout.id + 1)), false);
    assert.equal(await allowed(undefined, String(workout.id), encodeURIComponent(legacyKey)), false);
    const invalidKeys = [
      "parks/admin/photo.webp",
      `users/${owner.id}/workouts/${workout.id}/../photo.webp`,
      getWorkoutPhotoKey(viewer.id, workout.id),
      getWorkoutPhotoKey(owner.id, workout.id + 1),
    ];
    for (const storageKey of invalidKeys) {
      await prisma.workoutPhoto.update({ where: { id: photo.id }, data: { storageKey } });
      assert.equal(await allowed(), false);
    }
    await prisma.workoutPhoto.update({ where: { id: photo.id }, data: { storageKey: legacyKey, userId: viewer.id } });
    assert.equal(await allowed(viewer.id), false);
    await prisma.workoutPhoto.update({ where: { id: photo.id }, data: { userId: owner.id } });
    for (const key of invalidKeys.slice(0, 2)) {
      await assert.rejects(getWorkoutPhotoObject(key), /invalid workout photo object key/i);
      await assert.rejects(putWorkoutPhoto(key, Uint8Array.of(0)), /invalid workout photo object key/i);
      await assert.rejects(deleteWorkoutPhotoObject(key), /invalid workout photo object key/i);
    }
    await prisma.userBlock.create({ data: { blockerId: owner.id, blockedId: viewer.id } });
    assert.equal(await allowed(viewer.id), false);
    assert.equal(await allowed(owner.id), true);
    await prisma.userBlock.deleteMany({ where: { blockerId: owner.id } });
    await prisma.workout.update({ where: { id: workout.id }, data: { visibility: "PRIVATE" } });
    assert.equal(await allowed(), false);
    assert.equal(await allowed(viewer.id), false);
    assert.equal(await allowed(owner.id), true);
    await prisma.workout.update({ where: { id: workout.id }, data: { visibility: "PUBLIC", moderationHiddenAt: new Date() } });
    assert.equal(await allowed(), false);
    assert.equal(await allowed(owner.id), false);
    assert.equal(await allowed(viewer.id), false);
    await prisma.workout.update({ where: { id: workout.id }, data: { moderationHiddenAt: null } });
    await prisma.user.update({ where: { id: owner.id }, data: { deletedAt: new Date() } });
    assert.equal(await allowed(owner.id), false);
    assert.equal(await allowed(viewer.id), false);
    await prisma.user.update({ where: { id: owner.id }, data: { deletedAt: null } });
    await prisma.workoutPhoto.delete({ where: { id: photo.id } });
    assert.equal(await allowed(), false);
    assert.equal(await allowed(owner.id), false);
    assert.equal(r2.mock.callCount(), 5);
    const endpoint = `${origin}/api/user/workouts/${workout.id}/photos`;
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).webp().toBuffer();
    const upload = (id?: string) => {
      const form = new FormData();
      form.set("file", new File([new Uint8Array(image)], "fixture.webp", { type: "image/webp" }));
      const request = new Request(endpoint, { method: "POST", headers: sessionHeaders(id), body: form });
      return POST(request, { params: Promise.resolve({ id: String(workout.id) }) });
    };
    assert.equal((await upload()).status, 401);
    assert.equal((await upload(viewer.id)).status, 404);
    assert.equal(r2.mock.callCount(), 5);
    acceptUpload = true;
    const created = await upload(owner.id);
    assert.equal(created.status, 201);
    const { photo: uploaded } = await created.json();
    assert.equal(uploaded.storageKey, uploadedKey);
    assert.equal(await allowed(undefined, String(workout.id), uploaded.id), true);
    const remove = (id?: string) => {
      const request = new Request(`${endpoint}/${uploaded.id}`, { method: "DELETE", headers: sessionHeaders(id) });
      return DELETE(request, { params: Promise.resolve({ id: String(workout.id), photoId: uploaded.id }) });
    };
    assert.equal((await remove()).status, 401);
    assert.equal((await remove(viewer.id)).status, 404);
    await prisma.workoutPhoto.update({ where: { id: uploaded.id }, data: { storageKey: invalidKeys[2] } });
    assert.equal((await remove(owner.id)).status, 404);
    await prisma.workoutPhoto.update({ where: { id: uploaded.id }, data: { storageKey: uploaded.storageKey } });
    assert.equal((await remove(owner.id)).status, 200);
    assert.equal(await allowed(undefined, String(workout.id), uploaded.id), false);
    await prisma.workout.delete({ where: { id: workout.id } });
    assert.equal(await allowed(), false);
    assert.deepEqual(r2.mock.calls.slice(5).map(({ arguments: [command] }) => command?.constructor), [
      PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand,
    ]);
  } finally {
    if (originalSharedAccess === undefined) delete process.env.WORKOUT_PHOTO_R2_SHARED_BUCKET_ACCESS;
    else process.env.WORKOUT_PHOTO_R2_SHARED_BUCKET_ACCESS = originalSharedAccess;
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, viewer.id] } } });
  }
});

test("approved park photos keep their public URLs when workout storage reuses the bucket", async (t) => {
  const { getParkPhotoUrlFromKey, getParkPhotoKeyFromUrl, getPermanentParkPhotoKey } = await import("../../lib/park-photo-storage.ts");
  const env = {
    PARK_PHOTO_R2_BUCKET_NAME: "calistheni-photos",
    PARK_PHOTO_R2_ENDPOINT: "https://00000000000000000000000000000000.r2.cloudflarestorage.com",
    PARK_PHOTO_R2_ACCESS_KEY_ID: "test-placeholder",
    PARK_PHOTO_R2_SECRET_ACCESS_KEY: "test-placeholder",
    PARK_PHOTO_R2_PUBLIC_URL: "https://photos.calistheni.app",
  };
  for (const [name, value] of Object.entries(env)) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
  const pending = "pending/parks/member/fixture.jpg";
  const approved = getPermanentParkPhotoKey(pending);
  const url = getParkPhotoUrlFromKey(approved);
  assert.equal(url, "https://photos.calistheni.app/parks/member/fixture.jpg");
  assert.equal(getParkPhotoKeyFromUrl(url), approved);
  assert.equal(getParkPhotoUrlFromKey(pending), "https://photos.calistheni.app/pending/parks/member/fixture.jpg");
});

test("Google exchange requires browser completion, both proofs and the initiating account", { skip: !safeLocalDatabase }, async () => {
  const { prisma } = await import("../../lib/prisma.ts");
  const { POST } = await import("../../app/api/auth/mobile/complete/route.ts");
  const { POST: start } = await import("../../app/api/native-auth/attempt/route.ts");
  const { GET: browserStart } = await import("../../app/api/native-auth/browser-start/route.ts");
  const { GET: browserComplete } = await import("../../app/api/native-auth/complete/route.ts");
  const { issueNativeGoogleReauthentication } = await import("../../lib/auth/native-google-reauth.ts");
  const { hashNativeAuthSecret, getAuthSessionCookieName, NATIVE_AUTH_BROWSER_COOKIE } = await import("../../lib/auth/native-auth-server.ts");
  const { hashAuthSecret } = await import("../../lib/auth/security.ts");
  const user = await prisma.user.create({ data: {} });
  const other = await prisma.user.create({ data: {} });
  const sessionToken = secret();
  const otherToken = secret();
  const expiresAt = new Date(Date.now() + 120_000);
  const browserHeaders = (token?: string) => ({
    origin, "content-type": "application/json",
    ...(token ? { cookie: `${getAuthSessionCookieName()}=${token}` } : {}),
  });
  const makeStart = (verifier: string) => start(new Request(`${origin}/api/native-auth/attempt`, {
    method: "POST", headers: browserHeaders(),
    body: JSON.stringify({ platform: "IOS", intent: "login", verifierChallenge: hashNativeAuthSecret(verifier) }),
  }));
  const submit = (body: object, token?: string) => POST(new Request(`${origin}/api/auth/mobile/complete`, {
    method: "POST", headers: browserHeaders(token), body: JSON.stringify(body),
  }));
  const valid = async (intent: "LOGIN" | "LINK" | "REAUTH", expired = false) => {
    const code = secret();
    const verifier = secret();
    const attempt = await prisma.nativeAuthAttempt.create({ data: {
      platform: "IOS", intent, userId: user.id, nonceHash: secret(),
      verifierChallenge: hashNativeAuthSecret(verifier),
      handoffCodeHash: hashNativeAuthSecret(code), handoffIssuedAt: new Date(),
      initiatingSessionHash: intent === "LOGIN" ? null : hashAuthSecret(sessionToken),
      expiresAt: expired ? new Date(Date.now() - 1000) : expiresAt,
    } });
    return { attempt: attempt.id, code, verifier };
  };

  try {
    await prisma.session.createMany({ data: [
      { userId: user.id, sessionToken, expires: expiresAt },
      { userId: other.id, sessionToken: otherToken, expires: expiresAt },
    ] });
    const verifier = secret();
    const started = await makeStart(verifier);
    assert.equal(started.status, 200);
    const payload = await started.json();
    assert.equal(new URL(payload.externalAuthUrl).searchParams.get("attempt"), payload.attemptId);
    for (const proof of [payload.handoffCode, verifier]) assert.ok(!payload.externalAuthUrl.includes(proof));
    const proof = { attempt: payload.attemptId, code: payload.handoffCode, verifier };
    assert.equal((await submit(proof)).status, 401);
    const opened = await browserStart(new Request(payload.externalAuthUrl));
    const cookie = opened.cookies.get(NATIVE_AUTH_BROWSER_COOKIE)?.value;
    assert.ok(cookie);
    assert.equal((await browserStart(new Request(payload.externalAuthUrl))).cookies.get(NATIVE_AUTH_BROWSER_COOKIE), undefined);
    const googleBrowserToken = secret();
    const complete = (token: string) => browserComplete(new Request(`${origin}/api/native-auth/complete`, {
      headers: { cookie: `${getAuthSessionCookieName()}=${token}; ${NATIVE_AUTH_BROWSER_COOKIE}=${cookie}` },
    }));
    assert.match((await complete(sessionToken)).headers.get("location")!, /error=authentication_failed/);
    await prisma.session.create({ data: {
      userId: user.id, sessionToken: googleBrowserToken, expires: expiresAt, authProvider: "google", authenticatedAt: new Date(),
    } });
    assert.equal(new URL((await complete(googleBrowserToken)).headers.get("location")!).searchParams.get("attempt"), payload.attemptId);
    assert.equal((await submit(proof)).status, 200);
    assert.equal((await submit(await valid("LOGIN", true))).status, 401);
    const login = await valid("LOGIN");
    assert.equal((await submit({ attempt: login.attempt, code: login.code })).status, 400);
    assert.equal((await submit({ ...login, verifier: secret() })).status, 401);
    assert.equal((await submit({ ...login, code: secret() })).status, 401);
    const exchanges = await Promise.all([submit(login), submit(login)]);
    assert.deepEqual(exchanges.map(({ status }) => status).sort(), [200, 401]);
    assert.ok(exchanges.find(({ status }) => status === 200)?.headers.get("set-cookie"));
    assert.equal((await submit(login)).status, 401);

    const reauth = await valid("REAUTH");
    const reauthNonce = secret();
    await prisma.nativeAuthAttempt.update({ where: { id: reauth.attempt }, data: {
      handoffIssuedAt: null, browserStartedAt: new Date(), nonceHash: hashNativeAuthSecret(reauthNonce),
    } });
    await prisma.account.createMany({ data: [
      { userId: user.id, provider: "google", providerAccountId: user.id, type: "oauth" },
      { userId: other.id, provider: "google", providerAccountId: other.id, type: "oauth" },
    ] });
    assert.equal(await issueNativeGoogleReauthentication(reauth.attempt, reauthNonce, other.id), false);
    assert.equal((await submit(reauth, sessionToken)).status, 401);
    assert.equal(await issueNativeGoogleReauthentication(reauth.attempt, secret(), user.id), false);
    assert.equal(await issueNativeGoogleReauthentication(reauth.attempt, reauthNonce, user.id), true);
    const reauthCallback = await browserComplete(new Request(`${origin}/api/native-auth/complete`, {
      headers: { cookie: `${NATIVE_AUTH_BROWSER_COOKIE}=${reauth.attempt}.${reauthNonce}` },
    }));
    assert.equal(new URL(reauthCallback.headers.get("location")!).searchParams.get("attempt"), reauth.attempt);
    assert.equal(await issueNativeGoogleReauthentication(reauth.attempt, reauthNonce, user.id), false);
    assert.equal((await submit(reauth, otherToken)).status, 401);
    assert.equal((await submit(reauth)).status, 401);
    const refreshed = await submit(reauth, sessionToken);
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.headers.get("set-cookie"), null);
    assert.ok((await prisma.session.findUniqueOrThrow({ where: { sessionToken } })).authenticatedAt);
    const link = await valid("LINK");
    await prisma.authLinkIntent.create({ data: {
      userId: user.id, provider: "google", secretHash: secret(), sessionTokenHash: secret(),
      nativeAuthAttemptId: link.attempt, expiresAt, consumedAt: new Date(),
      pendingProviderAccountId: other.id, pendingAccountType: "oauth",
    } });
    assert.equal((await submit(link, otherToken)).status, 401);
    assert.equal((await submit(link, sessionToken)).status, 401, "a Google account owned by another user cannot be linked");
    await prisma.account.delete({ where: { provider_providerAccountId: { provider: "google", providerAccountId: user.id } } });
    await prisma.authLinkIntent.update({ where: { nativeAuthAttemptId: link.attempt }, data: { pendingProviderAccountId: user.id } });
    assert.equal((await submit(link, sessionToken)).status, 200);
    assert.ok(await prisma.account.findFirst({ where: { userId: user.id, provider: "google", providerAccountId: user.id } }));

    for (let i = 1; i < 15; i++) assert.equal((await makeStart(secret())).status, 200);
    assert.equal((await makeStart(secret())).status, 429);
  } finally {
    await prisma.nativeAuthAttempt.deleteMany();
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
  }
});

test("admin login budget survives User-Agent changes and distributed requests", { skip: !safeLocalDatabase }, async () => {
  const { consumeLoginBudget } = await import("../../lib/auth/rate-limit.ts");
  const makeRequest = (address: string, agent: string) => new Request(origin, {
    headers: { "x-vercel-forwarded-for": address, "user-agent": agent, "x-forwarded-for": agent },
  });
  const previousVercel = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    const now = new Date();
    const attempts = await Promise.all(Array.from({ length: 5 }, (_, i) =>
      consumeLoginBudget(makeRequest("192.0.2.1", String(i)), "admin", now)));
    assert.ok(attempts.every((attempt) => attempt.allowed));
    assert.equal((await consumeLoginBudget(makeRequest("192.0.2.1", "rotated"), "admin", now)).allowed, false);
    for (let i = 2; i <= 26; i++) {
      assert.equal((await consumeLoginBudget(makeRequest(`192.0.2.${i}`, "distributed"), "admin", now)).allowed, true);
    }
    assert.equal((await consumeLoginBudget(makeRequest("192.0.2.27", "distributed"), "admin", now)).allowed, false);
    assert.equal((await consumeLoginBudget(makeRequest("192.0.2.1", "expired"), "admin", new Date(now.getTime() + 16 * 60_000))).allowed, true);
  } finally {
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
  }
});

test("bundled Google login binds bearer exchange to the app and shares the durable attempt budget", { skip: !safeLocalDatabase }, async () => {
  const { prisma } = await import("../../lib/prisma.ts");
  const { POST: start } = await import("../../app/api/native/v1/auth/attempt/route.ts");
  const { POST: exchange } = await import("../../app/api/native/v1/auth/exchange/route.ts");
  const { POST: cookieExchange } = await import("../../app/api/auth/mobile/complete/route.ts");
  const { hashNativeAuthSecret } = await import("../../lib/auth/native-auth-server.ts");
  const request = (path: string, body: object, nativeOrigin = "capacitor://localhost") => new Request(`${origin}${path}`, {
    method: "POST",
    headers: { origin: nativeOrigin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const attemptRoute = "/api/native/v1/auth/attempt";
  const exchangeRoute = "/api/native/v1/auth/exchange";
  const verifier = secret();
  const attemptBody = { platform: "IOS", verifierChallenge: hashNativeAuthSecret(verifier) };
  assert.equal((await start(request(attemptRoute, attemptBody))).status, 429);
  const originalHmacSecret = process.env.AUTH_RATE_LIMIT_SECRET;
  process.env.AUTH_RATE_LIMIT_SECRET = secret();
  const user = await prisma.user.create({ data: {} });
  try {
    assert.equal((await start(request(attemptRoute, { platform: "IOS" }))).status, 400);
    const response = await start(request(attemptRoute, attemptBody));
    assert.equal(response.status, 200);
    const { attemptId, handoffCode, externalAuthUrl } = await response.json();
    const browserUrl = new URL(externalAuthUrl);
    assert.deepEqual([...browserUrl.searchParams.keys()], ["attempt", "intent"]);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const proof = { attempt: attemptId, code: handoffCode, verifier };
    assert.equal((await exchange(request(exchangeRoute, proof))).status, 401);
    await prisma.nativeAuthAttempt.update({ where: { id: attemptId }, data: { userId: user.id, handoffIssuedAt: new Date() } });
    assert.equal((await cookieExchange(request("/api/auth/mobile/complete", proof, origin))).status, 401);
    assert.equal((await exchange(request(exchangeRoute, { ...proof, verifier: secret() }))).status, 401);
    assert.equal((await exchange(request(exchangeRoute, { attempt: attemptId, code: handoffCode }))).status, 400);
    const outcomes = await Promise.all([exchange(request(exchangeRoute, proof)), exchange(request(exchangeRoute, proof))]);
    assert.deepEqual(outcomes.map(({ status }) => status).sort(), [200, 401]);
    const { token } = await outcomes.find(({ status }) => status === 200)!.json();
    assert.equal(await prisma.nativeSession.count({ where: { userId: user.id, tokenHash: hashNativeAuthSecret(token) } }), 1);
    assert.equal((await exchange(request(exchangeRoute, proof))).status, 401);
  } finally {
    process.env.AUTH_RATE_LIMIT_SECRET = originalHmacSecret;
    await prisma.nativeAuthAttempt.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("admin credentials are checked only within the durable login budget", { skip: !safeLocalDatabase }, async () => {
  const { authorizeAdminLogin } = await import("../../lib/admin-auth.ts");
  const { prisma } = await import("../../lib/prisma.ts");
  const request = new Request(origin);
  const previousPassword = process.env.ADMIN_PASSWORD;
  const previousSecret = process.env.AUTH_RATE_LIMIT_SECRET;
  const password = secret();
  process.env.ADMIN_PASSWORD = password;
  // Dedicated buckets prevent this fixture from interacting with any other test.
  process.env.AUTH_RATE_LIMIT_SECRET = secret();
  try {
    for (let i = 0; i < 4; i++) assert.equal(await authorizeAdminLogin(request, "wrong"), false);
    assert.equal(await authorizeAdminLogin(request, password), true);
    assert.equal(await authorizeAdminLogin(request, password), false);
    const disconnected = prisma.$transaction;
    try {
      prisma.$transaction = (() => Promise.reject(new Error("simulated storage outage"))) as typeof prisma.$transaction;
      assert.equal(await authorizeAdminLogin(request, password), false);
    } finally {
      prisma.$transaction = disconnected;
    }
  } finally {
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
    if (previousSecret === undefined) delete process.env.AUTH_RATE_LIMIT_SECRET;
    else process.env.AUTH_RATE_LIMIT_SECRET = previousSecret;
  }
});

test("native Apple accepts signed login and reauthenticates only the initiating account session", { skip: !safeLocalDatabase }, async (t) => {
  const { prisma } = await import("../../lib/prisma.ts");
  const { POST: start } = await import("../../app/api/auth/apple/native/start/route.ts");
  const { POST: complete } = await import("../../app/api/auth/apple/native/complete/route.ts");
  const { getAuthSessionCookieName } = await import("../../lib/auth/native-auth-server.ts");
  const { exportJWK, generateKeyPair, SignJWT } = await import("jose");
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const testJwk = { ...await exportJWK(publicKey), kid: "apple-test" };
  process.env.APPLE_TEAM_ID = "fixture-team";
  process.env.APPLE_AUTH_KEY_ID = "fixture-key";
  process.env.IOS_BUNDLE_ID = "test.calistheni.app";
  process.env.APPLE_AUTH_PRIVATE_KEY = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey
    .export({ format: "pem", type: "pkcs8" }).toString();
  const signedTokens = new Map<string, string>();
  t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    if (String(input) === "https://appleid.apple.com/auth/keys") return Response.json({ keys: [testJwk] });
    if (String(input) === "https://appleid.apple.com/auth/token") {
      const code = new URLSearchParams(String(init?.body)).get("code") ?? "";
      return Response.json({ id_token: signedTokens.get(code) });
    }
    throw new Error("Unexpected external call during Apple test.");
  });
  const owner = await prisma.user.create({ data: {} });
  const other = await prisma.user.create({ data: {} });
  const ownerSession = secret();
  const otherSession = secret();
  const expires = new Date(Date.now() + 120_000);
  const request = (path: "start" | "complete", body: object, sessionToken?: string) => new Request(`${origin}/api/auth/apple/native/${path}`, {
    method: "POST", body: JSON.stringify(body),
    headers: {
      origin, "content-type": "application/json",
      ...(sessionToken ? { cookie: `${getAuthSessionCookieName()}=${sessionToken}` } : {}),
    },
  });
  async function credential(challenge: { state: string; nonce: string }, subject: string) {
    const identityToken = await new SignJWT({ nonce: challenge.nonce })
      .setProtectedHeader({ alg: "RS256", kid: "apple-test" })
      .setIssuer("https://appleid.apple.com").setAudience("test.calistheni.app")
      .setSubject(subject).setExpirationTime("2m").sign(privateKey);
    const authorizationCode = secret();
    signedTokens.set(authorizationCode, identityToken);
    return { ...challenge, identityToken, authorizationCode };
  }
  try {
    await prisma.account.createMany({ data: [owner, other].map(({ id }) => ({
      userId: id, provider: "apple", providerAccountId: id, type: "oidc",
    })) });
    await prisma.session.createMany({ data: [
      { userId: owner.id, sessionToken: ownerSession, expires },
      { userId: other.id, sessionToken: otherSession, expires },
    ] });
    assert.equal((await start(request("start", { intent: "reauth" }))).status, 403);
    const started = await start(request("start", { intent: "reauth" }, ownerSession));
    assert.equal(started.status, 200);
    const challenge = await started.json();
    const wrongApple = await credential(challenge, other.id);
    assert.equal((await complete(request("complete", wrongApple, ownerSession))).status, 401);
    const correctApple = await credential(challenge, owner.id);
    assert.equal((await complete(request("complete", correctApple, otherSession))).status, 403);
    const completed = await complete(request("complete", correctApple, ownerSession));
    assert.equal(completed.status, 200);
    assert.equal(completed.headers.get("set-cookie"), null);
    assert.ok((await prisma.session.findUniqueOrThrow({ where: { sessionToken: ownerSession } })).authenticatedAt);
    assert.equal((await prisma.session.findUniqueOrThrow({ where: { sessionToken: otherSession } })).authenticatedAt, null);
    assert.equal((await complete(request("complete", correctApple, ownerSession))).status, 400);
    const login = await start(request("start", { intent: "login" }));
    const authenticated = await complete(request("complete", await credential(await login.json(), owner.id)));
    assert.equal(authenticated.status, 200);
    assert.ok(authenticated.headers.get("set-cookie"));
  } finally {
    await prisma.appleAuthAttempt.deleteMany();
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
  }
});
