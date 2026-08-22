import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("park popups use a scoped Calistheni surface without restyling Mapbox controls", async () => {
  const [map, styles] = await Promise.all([
    readFile(new URL("components/ParksMap.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(map, /className: "calistheni-park-popup"/);
  assert.doesNotMatch(map, /className: "calistheni-park-popup dark"/);
  assert.match(map, /className=\{`calistheni-parks-map h-full w-full/);
  assert.match(
    styles,
    /\.calistheni-parks-map \.mapboxgl-popup\.calistheni-park-popup \{[\s\S]*--popover: oklch\(0\.19 0\.012 264\);[\s\S]*--popover-foreground: oklch\(0\.985 0 0\);[\s\S]*--border: oklch\(1 0 0 \/ 12%\);/
  );
  assert.match(
    styles,
    /\.calistheni-parks-map[\s\S]*\.mapboxgl-popup\.calistheni-park-popup[\s\S]*\.mapboxgl-popup-content \{[\s\S]*background-color: var\(--popover\);[\s\S]*color: var\(--popover-foreground\);[\s\S]*border: 1px solid var\(--border\)/
  );
  assert.match(styles, /mapboxgl-popup-anchor-top-left[\s\S]*border-bottom-color: var\(--popover\)/);
  assert.match(styles, /mapboxgl-popup-anchor-bottom-right[\s\S]*border-top-color: var\(--popover\)/);
  assert.match(styles, /mapboxgl-popup-anchor-left[\s\S]*border-right-color: var\(--popover\)/);
  assert.match(styles, /mapboxgl-popup-anchor-right[\s\S]*border-left-color: var\(--popover\)/);
  assert.doesNotMatch(styles, /^\.mapboxgl-popup-content \{/m);
  assert.doesNotMatch(styles, /\.mapboxgl-ctrl[^\n]*background:/);
});
