import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("superset round form reserves a dedicated mobile-safe scrolling body", async () => {
  const [form, builder] = await Promise.all([
    readFile(new URL("components/workouts/SupersetRoundForm.tsx", root), "utf8"),
    readFile(new URL("components/workouts/WorkoutBuilder.tsx", root), "utf8"),
  ]);

  assert.match(form, /data-slot="superset-round-scroll-area"/);
  assert.match(form, /min-h-0 flex-1.*overflow-y-auto/s);
  assert.match(form, /z-10 shrink-0 grid grid-cols-2/);
  assert.match(builder, /h-\[90dvh\].*max-h-\[calc\(100dvh-env\(safe-area-inset-top\)/s);
  assert.match(builder, /SheetHeader className="shrink-0 border-b/);
});
