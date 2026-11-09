import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { databaseUrl, safeLocalDatabase } from "./test-database.ts";

let prisma: (typeof import("../../lib/prisma.ts"))["prisma"] | undefined;
let createAuthActionToken: typeof import("../../lib/auth/action-tokens.ts")["createAuthActionToken"];
let processAuthEmailOutboxBatch: typeof import("../../lib/auth/email-outbox.ts")["processAuthEmailOutboxBatch"];

before(async () => {
  if (!safeLocalDatabase || !databaseUrl) return;
  process.env.DATABASE_URL = databaseUrl;
  process.env.AUTH_SECRET ??= "local-integration-auth-email-secret-local-integration-auth-email-secret";
  process.env.AUTH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64url");
  const [database, tokenModule, workerModule] = await Promise.all([
    import("../../lib/prisma.ts"),
    import("../../lib/auth/action-tokens.ts"),
    import("../../lib/auth/email-outbox.ts"),
  ]);
  prisma = database.prisma;
  createAuthActionToken = tokenModule.createAuthActionToken;
  processAuthEmailOutboxBatch = workerModule.processAuthEmailOutboxBatch;
});

after(async () => {
  await prisma?.$disconnect();
});

async function createQueuedDelivery(label: string, purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET" = "PASSWORD_RESET") {
  assert.ok(prisma && createAuthActionToken);
  const suffix = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: { email: `email-outbox-${suffix}@example.test`, emailVerified: new Date() },
  });
  const action = await createAuthActionToken({ userId: user.id, emailNormalized: user.email!, purpose });
  return { user, action };
}

test("outbox worker delivers a valid action and records only delivery state", { skip: !safeLocalDatabase }, async () => {
  assert.ok(prisma && processAuthEmailOutboxBatch);
  const { user, action } = await createQueuedDelivery("success");
  let sentToken = "";
  try {
    const result = await processAuthEmailOutboxBatch({
      deliveryId: action.deliveryId,
      send: async (_purpose, _email, token) => { sentToken = token; },
    });
    const delivery = await prisma.authEmailDelivery.findUnique({ where: { id: action.deliveryId } });
    assert.equal(result.sent, 1);
    assert.equal(sentToken, action.token);
    assert.ok(delivery?.deliveredAt);
    assert.equal(delivery?.attempts, 1);
    assert.equal(delivery?.lastError, null);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("temporary provider failures schedule exponential retry and a later retry succeeds", { skip: !safeLocalDatabase }, async () => {
  assert.ok(prisma && processAuthEmailOutboxBatch);
  const { user, action } = await createQueuedDelivery("retry");
  const fixedNow = new Date();
  try {
    const failed = await processAuthEmailOutboxBatch({
      deliveryId: action.deliveryId,
      now: () => fixedNow,
      send: async () => { throw Object.assign(new Error("mocked provider outage"), { retryable: true, category: "PROVIDER_TRANSIENT" }); },
    });
    let delivery = await prisma.authEmailDelivery.findUnique({ where: { id: action.deliveryId } });
    assert.equal(failed.retried, 1);
    assert.equal(delivery?.attempts, 1);
    assert.equal(delivery?.nextAttemptAt.getTime(), fixedNow.getTime() + 30_000);
    assert.equal(delivery?.lastErrorCategory, "PROVIDER_TRANSIENT");
    assert.equal(delivery?.leaseId, null);

    await prisma.authEmailDelivery.update({ where: { id: action.deliveryId }, data: { nextAttemptAt: new Date(fixedNow.getTime() - 1) } });
    const succeeded = await processAuthEmailOutboxBatch({ deliveryId: action.deliveryId, send: async () => undefined });
    delivery = await prisma.authEmailDelivery.findUnique({ where: { id: action.deliveryId } });
    assert.equal(succeeded.sent, 1);
    assert.equal(delivery?.attempts, 2);
    assert.ok(delivery?.deliveredAt);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("permanent provider failures stop retrying and remain visible as terminal failures", { skip: !safeLocalDatabase }, async () => {
  assert.ok(prisma && processAuthEmailOutboxBatch);
  const { user, action } = await createQueuedDelivery("permanent");
  try {
    const result = await processAuthEmailOutboxBatch({
      deliveryId: action.deliveryId,
      send: async () => { throw Object.assign(new Error("mocked invalid recipient"), { retryable: false, category: "PROVIDER_PERMANENT" }); },
    });
    const delivery = await prisma.authEmailDelivery.findUnique({ where: { id: action.deliveryId } });
    assert.equal(result.permanentlyFailed, 1);
    assert.ok(delivery?.permanentlyFailedAt);
    assert.equal(delivery?.lastErrorCategory, "PROVIDER_PERMANENT");
    assert.equal(delivery?.leaseId, null);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("concurrent workers claim a delivery once and an expired lease can be recovered", { skip: !safeLocalDatabase }, async () => {
  assert.ok(prisma && processAuthEmailOutboxBatch);
  const { user, action } = await createQueuedDelivery("concurrent");
  let sends = 0;
  let entered!: () => void;
  let release!: () => void;
  const enteredSend = new Promise<void>((resolve) => { entered = resolve; });
  const sendGate = new Promise<void>((resolve) => { release = resolve; });
  try {
    const firstWorker = processAuthEmailOutboxBatch({
      deliveryId: action.deliveryId,
      send: async () => { sends += 1; entered(); await sendGate; },
    });
    await enteredSend;
    const secondWorker = await processAuthEmailOutboxBatch({ deliveryId: action.deliveryId, send: async () => { sends += 1; } });
    assert.equal(secondWorker.claimed, 0);
    release();
    const firstResult = await firstWorker;
    assert.equal(firstResult.sent, 1);
    assert.equal(sends, 1);

    const { user: leaseUser, action: leaseAction } = await createQueuedDelivery("lease");
    try {
      await prisma.authEmailDelivery.update({
        where: { id: leaseAction.deliveryId },
        data: { leaseId: "simulated-crashed-worker", leaseExpiresAt: new Date(Date.now() + 60_000) },
      });
      const blocked = await processAuthEmailOutboxBatch({ deliveryId: leaseAction.deliveryId, send: async () => undefined });
      assert.equal(blocked.claimed, 0);
      await prisma.authEmailDelivery.update({ where: { id: leaseAction.deliveryId }, data: { leaseExpiresAt: new Date(Date.now() - 1) } });
      const recovered = await processAuthEmailOutboxBatch({ deliveryId: leaseAction.deliveryId, send: async () => undefined });
      assert.equal(recovered.sent, 1);
    } finally {
      await prisma.user.delete({ where: { id: leaseUser.id } });
    }
  } finally {
    release();
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("expired, consumed, and deleted-account actions are never delivered", { skip: !safeLocalDatabase }, async () => {
  assert.ok(prisma && processAuthEmailOutboxBatch);
  const fixtures = await Promise.all([
    createQueuedDelivery("expired-verification", "EMAIL_VERIFICATION"),
    createQueuedDelivery("consumed"),
    createQueuedDelivery("deleted"),
  ]);
  let sends = 0;
  try {
    // deliveryId and action-token ID are intentionally distinct; resolve the relation for each fixture.
    const tokenIds = await prisma.authEmailDelivery.findMany({ where: { id: { in: fixtures.map((item) => item.action.deliveryId) } }, select: { id: true, actionTokenId: true } });
    const byDelivery = new Map(tokenIds.map((item) => [item.id, item.actionTokenId]));
    await prisma.authActionToken.update({ where: { id: byDelivery.get(fixtures[0]!.action.deliveryId)! }, data: { expiresAt: new Date(Date.now() - 1) } });
    await prisma.authActionToken.update({ where: { id: byDelivery.get(fixtures[1]!.action.deliveryId)! }, data: { consumedAt: new Date() } });
    await prisma.user.update({ where: { id: fixtures[2]!.user.id }, data: { deletedAt: new Date() } });
    for (const fixture of fixtures) {
      const result = await processAuthEmailOutboxBatch({ deliveryId: fixture.action.deliveryId, send: async () => { sends += 1; } });
      assert.equal(result.skipped, 1);
      const delivery = await prisma.authEmailDelivery.findUnique({ where: { id: fixture.action.deliveryId } });
      assert.ok(delivery?.permanentlyFailedAt);
    }
    assert.equal(sends, 0);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: fixtures.map((item) => item.user.id) } } });
  }
});

test("outbox batch processing is bounded", { skip: !safeLocalDatabase }, async () => {
  assert.ok(prisma && processAuthEmailOutboxBatch);
  const fixtures = await Promise.all(Array.from({ length: 3 }, (_, index) => createQueuedDelivery(`bounded-${index}`)));
  try {
    const first = await processAuthEmailOutboxBatch({ limit: 2, send: async () => undefined });
    assert.equal(first.claimed, 2);
    const remaining = await prisma.authEmailDelivery.count({
      where: { id: { in: fixtures.map((item) => item.action.deliveryId) }, deliveredAt: null },
    });
    assert.equal(remaining, 1);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: fixtures.map((item) => item.user.id) } } });
  }
});
