import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("home reuses its calendar workout payload for the weekly report", async () => {
  const source = await readFile(new URL("app/home/page.tsx", root), "utf8");
  const querySection = source.slice(
    source.indexOf("const ["),
    source.indexOf('if (!profile) redirect("/login")')
  );

  assert.match(source, /const reportWorkouts = calendarWorkouts\.filter/);
  assert.equal(
    [...querySection.matchAll(/prisma\.workout\.findMany\(\{/g)].length,
    2,
    "home should use one detailed calendar query and one lightweight history-date query"
  );
  assert.match(source, /await Promise\.all\(\[/);
});
