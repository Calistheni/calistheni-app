import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createSupplementLogRequest,
  readSupplementRequestError,
} from "@/lib/supplement-log-client";
import {
  getHomeSupplementQuickActions,
  getVisibleHomeSupplementQuickActions,
  type HomeSupplementQuickActionPlan,
} from "@/lib/supplement-quick-actions";

const today = "2026-09-05";

function plan(
  overrides: Partial<HomeSupplementQuickActionPlan> = {}
): HomeSupplementQuickActionPlan {
  return {
    id: "plan-1",
    customName: null,
    dosage: "5",
    unit: "g",
    frequency: "DAILY",
    weekdays: [],
    everyNDays: null,
    preferredTime: "MORNING",
    isActive: true,
    archivedAt: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    supplementDefinition: { name: "Creatine Monohydrate" },
    logs: [],
    ...overrides,
  };
}

test("Home derives pending and taken states from today's existing plan logs", () => {
  const actions = getHomeSupplementQuickActions(
    [
      plan(),
      plan({
        id: "plan-2",
        supplementDefinition: { name: "Vitamin D" },
        logs: [{ scheduledFor: `${today}T00:00:00.000Z` }],
      }),
    ],
    today,
    "UTC"
  );

  assert.deepEqual(
    actions.map(({ name, taken }) => ({ name, taken })),
    [
      { name: "Creatine Monohydrate", taken: false },
      { name: "Vitamin D", taken: true },
    ]
  );
});

test("Home respects existing schedules and never hides a due pending plan", () => {
  const scheduledMonday = plan({
    frequency: "SELECTED_WEEKDAYS",
    weekdays: [1],
  });
  assert.equal(
    getHomeSupplementQuickActions(
      [scheduledMonday],
      "2026-09-07",
      "UTC"
    ).length,
    1
  );
  assert.equal(
    getHomeSupplementQuickActions(
      [scheduledMonday],
      "2026-09-08",
      "UTC"
    ).length,
    0
  );

  const actions = Array.from({ length: 7 }, (_, index) => ({
    ...getHomeSupplementQuickActions(
      [plan({ id: `plan-${index}` })],
      today,
      "UTC"
    )[0]!,
    taken: index > 4,
  }));
  assert.equal(
    getVisibleHomeSupplementQuickActions(actions).filter(
      (action) => !action.taken
    ).length,
    5
  );
});

test("the shared take request posts the existing supplement log payload", async () => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  const response = await createSupplementLogRequest(
    "plan-1",
    today,
    async (url, init) => {
      requestedUrl = String(url);
      requestedInit = init;
      return new Response(JSON.stringify({ created: true }), { status: 201 });
    }
  );

  assert.equal(response.status, 201);
  assert.equal(requestedUrl, "/api/user/supplements/plan-1/logs");
  assert.equal(requestedInit?.method, "POST");
  assert.equal(requestedInit?.body, JSON.stringify({ scheduledDate: today }));

  const failed = new Response(JSON.stringify({ error: "Try again." }), {
    status: 500,
  });
  assert.equal(await readSupplementRequestError(failed, "Fallback"), "Try again.");
});

test("Home quick actions reuse tracking and reminder paths without replacing the full page", () => {
  const component = readFileSync(
    new URL("../components/home/HomeSupplementQuickActions.tsx", import.meta.url),
    "utf8"
  );
  const tracker = readFileSync(
    new URL("../components/profile/SupplementTracker.tsx", import.meta.url),
    "utf8"
  );
  const home = readFileSync(
    new URL("../app/home/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(component, /createSupplementLogRequest\(planId, today\)/);
  assert.match(tracker, /createSupplementLogRequest\(plan\.id, today\)/);
  assert.match(component, /import\("@\/lib\/native\/supplement-reminders"\)/);
  assert.match(component, /reconcileSupplementReminders\(\)/);
  assert.match(component, /Taking…/);
  assert.match(component, /toast\.error/);
  assert.match(component, /aria-label=\{`Take \$\{action\.name\}`\}/);
  assert.match(component, /href="\/profile\/supplements"/);
  assert.match(home, /calendarSupplements\.quickActionPlans/);
  assert.doesNotMatch(component, /window\.location|router\.refresh/);
});
