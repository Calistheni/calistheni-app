import assert from "node:assert/strict";
import test from "node:test";
import {
  executeHomeSupplementTake,
  hasHomeSupplementCompletion,
  removeHomeSupplementCompletion,
  upsertHomeSupplementCompletion,
  type HomeSupplementActivityState,
} from "@/lib/home-supplement-activity";
import { getHomeSupplementQuickActions, type HomeSupplementQuickActionPlan } from "@/lib/supplement-quick-actions";

const today = "2026-10-08";

function plan(id: string, name: string): HomeSupplementQuickActionPlan {
  return {
    id,
    customName: null,
    dosage: id === "creatine" ? "3.4" : "200",
    unit: id === "creatine" ? "g" : "mg",
    frequency: "DAILY",
    weekdays: [],
    everyNDays: null,
    preferredTime: null,
    isActive: true,
    archivedAt: null,
    createdAt: "2026-10-01T08:00:00.000Z",
    supplementDefinition: { name },
    logs: [],
  };
}

function initialState(): HomeSupplementActivityState {
  return {
    plans: [plan("creatine", "Creatine Monohydrate"), plan("magnesium", "Magnesium")],
    supplementStates: [
      {
        date: "2026-10-07",
        scheduled: 2,
        completed: 0,
        status: "missed",
        completedSupplements: [],
      },
      {
        date: today,
        scheduled: 2,
        completed: 0,
        status: "missed",
        completedSupplements: [],
      },
    ],
  };
}

function responseFor(id: string, name: string, dosage: string, completedAt = "2026-10-08T09:15:00.000Z") {
  return new Response(JSON.stringify({
    created: true,
    log: {
      id: `log-${id}`,
      userSupplementPlanId: id,
      scheduledFor: `${today}T00:00:00.000Z`,
      completedAt,
      dosageSnapshot: dosage,
      unitSnapshot: id === "creatine" ? "g" : "mg",
      supplementNameSnapshot: name,
    },
  }), { status: 201, headers: { "Content-Type": "application/json" } });
}

test("the real Home take transaction updates the button and calendar before its request resolves", async () => {
  let state = initialState();
  let resolveRequest!: (response: Response) => void;
  const request = new Promise<Response>((resolve) => { resolveRequest = resolve; });
  const transaction = executeHomeSupplementTake({
    plan: state.plans[0]!,
    scheduledDate: today,
    name: "Creatine Monohydrate",
    update: (updater) => { state = updater(state); },
    request: () => request,
    now: () => new Date("2026-10-08T09:14:00.000Z"),
  });

  assert.equal(hasHomeSupplementCompletion(state, "creatine", today), true);
  assert.equal(
    getHomeSupplementQuickActions(state.plans, today, "UTC").find(
      (action) => action.id === "creatine"
    )?.taken,
    true
  );
  assert.deepEqual(state.supplementStates[1]?.completedSupplements, [{
    planId: "creatine",
    name: "Creatine Monohydrate",
    dosage: "3.4",
    unit: "g",
    completedAt: "2026-10-08T09:14:00.000Z",
  }]);
  assert.equal(state.supplementStates[1]?.completed, 1);

  resolveRequest(responseFor("creatine", "Creatine Monohydrate", "3.4"));
  assert.deepEqual(await transaction, { ok: true });
  assert.equal(state.supplementStates[1]?.completedSupplements.length, 1);
  assert.equal(state.supplementStates[1]?.completedSupplements[0]?.completedAt, "2026-10-08T09:15:00.000Z");
});

test("server failure rolls back only its optimistic activity", async () => {
  let state = initialState();
  state = upsertHomeSupplementCompletion(state, {
    id: "log-magnesium",
    planId: "magnesium",
    scheduledFor: `${today}T00:00:00.000Z`,
    completedAt: "2026-10-08T08:00:00.000Z",
    dosage: "200",
    unit: "mg",
    name: "Magnesium",
  });
  const result = await executeHomeSupplementTake({
    plan: state.plans[0]!,
    scheduledDate: today,
    name: "Creatine Monohydrate",
    update: (updater) => { state = updater(state); },
    request: async () => new Response(JSON.stringify({ error: "Try again." }), { status: 500 }),
  });

  assert.deepEqual(result, { ok: false, error: "Try again." });
  assert.equal(hasHomeSupplementCompletion(state, "creatine", today), false);
  assert.equal(hasHomeSupplementCompletion(state, "magnesium", today), true);
  assert.deepEqual(state.supplementStates[1]?.completedSupplements.map((item) => item.planId), ["magnesium"]);
});

test("canonical reconciliation and repeated delivery never duplicate a plan/day activity", () => {
  let state = initialState();
  const completion = {
    id: "log-creatine",
    planId: "creatine",
    scheduledFor: `${today}T00:00:00.000Z`,
    completedAt: "2026-10-08T09:15:00.000Z",
    dosage: "3.4",
    unit: "g",
    name: "Creatine Monohydrate",
  };
  state = upsertHomeSupplementCompletion(state, completion);
  state = upsertHomeSupplementCompletion(state, completion);
  assert.equal(state.plans[0]?.logs.length, 1);
  assert.equal(state.supplementStates[1]?.completed, 1);
  assert.equal(state.supplementStates[1]?.completedSupplements.length, 1);
});

test("taking multiple supplements preserves every activity and updates only today's local key", async () => {
  let state = initialState();
  for (const [id, name, dosage] of [
    ["creatine", "Creatine Monohydrate", "3.4"],
    ["magnesium", "Magnesium", "200"],
  ] as const) {
    const selectedPlan = state.plans.find((item) => item.id === id)!;
    const result = await executeHomeSupplementTake({
      plan: selectedPlan,
      scheduledDate: today,
      name,
      update: (updater) => { state = updater(state); },
      request: async () => responseFor(id, name, dosage),
    });
    assert.deepEqual(result, { ok: true });
  }
  assert.deepEqual(state.supplementStates[1]?.completedSupplements.map((item) => item.planId), ["creatine", "magnesium"]);
  assert.equal(state.supplementStates[1]?.status, "complete");
  assert.equal(state.supplementStates[0]?.completed, 0);
});

test("undo immediately removes only the matching plan/day calendar activity", () => {
  let state = initialState();
  for (const [id, name, dosage, unit] of [
    ["creatine", "Creatine Monohydrate", "3.4", "g"],
    ["magnesium", "Magnesium", "200", "mg"],
  ] as const) {
    state = upsertHomeSupplementCompletion(state, {
      id: `log-${id}`,
      planId: id,
      scheduledFor: `${today}T00:00:00.000Z`,
      completedAt: "2026-10-08T09:15:00.000Z",
      dosage,
      unit,
      name,
    });
  }
  state = removeHomeSupplementCompletion(state, "creatine", today);
  assert.equal(hasHomeSupplementCompletion(state, "creatine", today), false);
  assert.equal(hasHomeSupplementCompletion(state, "magnesium", today), true);
  assert.deepEqual(state.supplementStates[1]?.completedSupplements.map((item) => item.planId), ["magnesium"]);
});

test("a malformed success cannot leave an invented optimistic calendar entry", async () => {
  let state = initialState();
  const result = await executeHomeSupplementTake({
    plan: state.plans[0]!,
    scheduledDate: today,
    name: "Creatine Monohydrate",
    update: (updater) => { state = updater(state); },
    request: async () => new Response(JSON.stringify({ created: true }), { status: 201 }),
  });
  assert.equal(result.ok, false);
  assert.equal(state.supplementStates[1]?.completed, 0);
  assert.equal(hasHomeSupplementCompletion(state, "creatine", today), false);
});
