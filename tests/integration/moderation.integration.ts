import assert from "node:assert/strict";
import test from "node:test";
import { databaseUrl, safeLocalDatabase } from "./test-database.ts";

test(
  "reports, blocks, filtering, moderator actions, and unrelated users remain isolated",
  { skip: !safeLocalDatabase },
  async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [
      { prisma },
      { createModerationReport, communityUserWhereForViewer, usersBlockEachOther },
      { applyModerationAction },
      { ModerationActionType },
    ] = await Promise.all([
      import("../../lib/prisma.ts"),
      import("../../lib/moderation.ts"),
      import("../../lib/moderation-admin.ts"),
      import("../../lib/generated/prisma/client.ts"),
    ]);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [reporter, author, unrelated] = await Promise.all([
      prisma.user.create({ data: { name: "Reporter", email: `reporter-${suffix}@example.test` } }),
      prisma.user.create({ data: { name: "Author", email: `author-${suffix}@example.test` } }),
      prisma.user.create({ data: { name: "Unrelated", email: `unrelated-${suffix}@example.test` } }),
    ]);
    const workout = await prisma.workout.create({
      data: { userId: author.id, title: "Reported workout", completedAt: new Date(), visibility: "PUBLIC" },
    });
    const comment = await prisma.workoutComment.create({
      data: { workoutId: workout.id, userId: author.id, content: "Reported comment" },
    });

    try {
      const created = await createModerationReport({
        reporterId: reporter.id,
        targetType: "COMMENT",
        targetId: comment.id,
        reason: "HARASSMENT",
        explanation: "Integration test report",
      });
      assert.equal(created.state, "CREATED");
      assert.equal(
        (await createModerationReport({
          reporterId: reporter.id,
          targetType: "COMMENT",
          targetId: comment.id,
          reason: "SPAM",
        })).state,
        "DUPLICATE"
      );
      assert.equal(
        (await createModerationReport({
          reporterId: author.id,
          targetType: "COMMENT",
          targetId: comment.id,
          reason: "OTHER",
        })).state,
        "TARGET_NOT_FOUND",
        "authors cannot report their own content"
      );

      await prisma.userFollow.create({ data: { followerId: reporter.id, followingId: author.id } });
      await prisma.$transaction(async (tx) => {
        await tx.userBlock.create({ data: { blockerId: reporter.id, blockedId: author.id } });
        await tx.userFollow.deleteMany({
          where: {
            OR: [
              { followerId: reporter.id, followingId: author.id },
              { followerId: author.id, followingId: reporter.id },
            ],
          },
        });
      });
      assert.equal(await usersBlockEachOther(reporter.id, author.id), true);
      assert.equal(await prisma.userFollow.count({ where: { followerId: reporter.id, followingId: author.id } }), 0);
      assert.equal(await prisma.user.count({ where: { id: author.id, ...communityUserWhereForViewer(reporter.id) } }), 0);
      assert.equal(await prisma.user.count({ where: { id: unrelated.id, ...communityUserWhereForViewer(reporter.id) } }), 1);

      const action = await applyModerationAction({
        reportId: created.state === "CREATED" ? created.reportId : "",
        action: ModerationActionType.HIDE_CONTENT,
        actorLabel: "integration-test-admin",
        note: "Confirmed violation",
      });
      assert.equal(action.state, "UPDATED");
      assert.ok((await prisma.workoutComment.findUnique({ where: { id: comment.id } }))?.moderationHiddenAt);
      assert.equal(await prisma.moderationAction.count({ where: { reportId: created.state === "CREATED" ? created.reportId : "" } }), 1);
      assert.equal((await prisma.user.findUnique({ where: { id: unrelated.id } }))?.communityRestrictedAt, null);

      await prisma.userBlock.delete({ where: { blockerId_blockedId: { blockerId: reporter.id, blockedId: author.id } } });
      assert.equal(await usersBlockEachOther(reporter.id, author.id), false);
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: [reporter.id, author.id, unrelated.id] } } });
      await prisma.$disconnect();
    }
  }
);
