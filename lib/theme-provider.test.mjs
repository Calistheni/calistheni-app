import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("client theme provider does not render next-themes' raw script", async () => {
  const source = await readFile("components/ThemeProvider.tsx", "utf8");

  assert.doesNotMatch(source, /next-themes/);
  assert.doesNotMatch(source, /<script\b/i);
  assert.doesNotMatch(source, /createElement\(\s*["']script/i);
  assert.match(source, /useEffect/);
});
