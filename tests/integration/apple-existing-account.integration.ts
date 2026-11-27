import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { databaseUrl, safeLocalDatabase } from "./test-database.ts";

test("the read-only Apple account lookup returns only the authenticated user's existing token", { skip: !safeLocalDatabase }, async () => {
  process.env.DATABASE_URL = databaseUrl;
  const [{ prisma }, { GET }, { getAuthSessionCookieName }] = await Promise.all([
    import("../../lib/prisma.ts"),
    import("../../app/api/billing/apple/existing-account/route.ts"),
    import("../../lib/auth/native-auth-server.ts"),
  ]);

  const mapped = await prisma.user.create({ data: {} });
  const unmapped = await prisma.user.create({ data: {} });
  try {
    const mappedSession = randomUUID();
    const unmappedSession = randomUUID();
    const expiredSession = randomUUID();
    const token = randomUUID();
    await prisma.appleBillingAccount.create({ data: { userId: mapped.id, appAccountToken: token } });
    await prisma.session.createMany({ data: [
      { sessionToken: mappedSession, userId: mapped.id, expires: new Date(Date.now() + 60_000) },
      { sessionToken: unmappedSession, userId: unmapped.id, expires: new Date(Date.now() + 60_000) },
      { sessionToken: expiredSession, userId: mapped.id, expires: new Date(0) },
    ] });
    const request = (sessionToken?: string) => new Request(
      `https://calistheni.app/api/billing/apple/existing-account?userId=${mapped.id}`,
      sessionToken ? { headers: { cookie: `${getAuthSessionCookieName()}=${sessionToken}` } } : undefined
    );

    const response = await GET(request(mappedSession));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const payload = await response.json();
    assert.deepEqual(Object.keys(payload), ["appAccountToken"]);
    assert.ok(payload.appAccountToken === token);

    const missing = await GET(request(unmappedSession));
    assert.equal(missing.status, 200);
    assert.deepEqual(await missing.json(), { appAccountToken: null });
    assert.equal(await prisma.appleBillingAccount.count({ where: { userId: unmapped.id } }), 0);
    assert.equal((await GET(request())).status, 401);
    assert.equal((await GET(request(expiredSession))).status, 401);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [mapped.id, unmapped.id] } } });
  }
});
