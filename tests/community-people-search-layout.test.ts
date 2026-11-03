import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../components/community/PeopleSearchInput.tsx", import.meta.url),
  "utf8"
);

test("community search icon is centered inside an isolated input wrapper", () => {
  assert.match(
    source,
    /<div className="relative">[\s\S]*<Search[\s\S]*className="pointer-events-none absolute top-1\/2 left-3 size-4 -translate-y-1\/2 text-muted-foreground"[\s\S]*<Input[\s\S]*className="h-11 pl-10"[\s\S]*<\/div>\s*<p className="mt-2/
  );
});

test("community search behavior remains debounced and URL-driven", () => {
  assert.match(source, /window\.setTimeout\(\(\) => \{/);
  assert.match(source, /}, 350\)/);
  assert.match(source, /router\.replace\(next, \{ scroll: false \}\)/);
  assert.match(source, /onChange=\{\(event\) => setQuery\(event\.target\.value\)\}/);
});
