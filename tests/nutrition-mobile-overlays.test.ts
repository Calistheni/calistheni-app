import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Nutrition mobile sheet owns one scroll body and a safe-area sticky footer", async () => {
  const source = await readFile(new URL("../components/nutrition/NutritionMobileSheet.tsx", import.meta.url), "utf8");
  assert.match(source, /h-full max-h-full/);
  assert.match(source, /sm:h-\[min\(94dvh,52rem\)\]/);
  assert.match(source, /data-slot="nutrition-sheet-scroll"/);
  assert.match(source, /min-h-0 flex-1 px-4 py-4/);
  assert.match(source, /touch-pan-y overflow-y-auto overscroll-contain/);
  assert.match(source, /-webkit-overflow-scrolling:touch/);
  assert.match(source, /data-slot="nutrition-sheet-footer"/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
  assert.match(source, /overflow-hidden overscroll-none p-0/);
  assert.match(source, /scrollable = true/);
  assert.match(source, /scrollable[\s\S]*"flex flex-col overflow-hidden"/);
  assert.match(
    source,
    /scrollable \? \{ "data-keyboard-dismiss-on-scroll": true \} : \{\}/
  );
  assert.match(source, /overscroll-none/);
});

test("Add Food uses the shared stable sheet shell instead of competing viewport-sized scroll regions", async () => {
  const [picker, sheet, globals] = await Promise.all([
    readFile(new URL("../components/nutrition/FoodPicker.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ui/sheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(picker, /<NutritionMobileSheet/);
  assert.match(picker, /placeholder="Search foods"/);
  assert.match(picker, /aria-label="Food search results"/);
  assert.match(picker, /scrollable=\{false\}/);
  assert.match(picker, /min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain/);
  assert.doesNotMatch(picker, /h-\[92dvh\]/);
  assert.doesNotMatch(picker, /h-\[min\(48dvh,26rem\)\]/);
  assert.doesNotMatch(picker, /<ScrollArea/);
  assert.match(sheet, /transition-transform duration-200/);
  assert.doesNotMatch(sheet, /shadow-lg transition duration-200/);
  assert.doesNotMatch(sheet, /transition-(?:all|height|top|bottom|max-height|min-height)/);
  assert.match(
    globals,
    /\[data-slot="sheet-content"\] input,[\s\S]*scroll-margin-block: 0/
  );
  assert.match(
    globals,
    /\[data-slot="sheet-content"\],[\s\S]*scroll-behavior: auto;[\s\S]*overflow-anchor: none/
  );
});

test("shared overlays keep initial focus off editable controls and inputs remain iOS zoom-safe", async () => {
  const [sheet, dialog, input, textarea] = await Promise.all([
    readFile(new URL("../components/ui/sheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ui/dialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ui/input.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ui/textarea.tsx", import.meta.url), "utf8"),
  ]);

  for (const source of [sheet, dialog]) {
    assert.match(source, /onOpenAutoFocus/);
    assert.match(source, /event\.preventDefault\(\)/);
    assert.match(source, /focus\(\{ preventScroll: true \}\)/);
  }
  assert.match(input, /text-base/);
  assert.match(textarea, /text-base/);
});

test("keyboard dismissal waits for a real marked-surface scroll instead of a focus-time touch drift", async () => {
  const nativeShell = await readFile(
    new URL("../components/native/NativeShell.tsx", import.meta.url),
    "utf8"
  );

  assert.match(nativeShell, /let initialScrollTop = 0/);
  assert.match(nativeShell, /initialScrollTop = scrollOwner\?\.scrollTop \?\? 0/);
  assert.match(
    nativeShell,
    /requestAnimationFrame\(\(\) => \{[\s\S]*owner\.scrollTop !== scrollTopAtTouchStart[\s\S]*dismissActiveTextInput\(\)/
  );
});

test("iOS uses Capacitor body resize once instead of resizing the WKWebView frame", async () => {
  const [config, nativeShell] = await Promise.all([
    readFile(new URL("../capacitor.config.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../components/native/NativeShell.tsx", import.meta.url),
      "utf8"
    ),
  ]);

  assert.match(config, /resize: KeyboardResize\.Body/);
  assert.match(nativeShell, /Capacitor\.getPlatform\(\) !== "ios"/);
  assert.match(
    nativeShell,
    /Keyboard\.setResizeMode\(\{[\s\S]*mode: KeyboardResize\.Body/
  );
  assert.match(nativeShell, /let iOSKeyboardResizeSetup: Promise<void> \| null = null/);
  assert.match(nativeShell, /Keyboard\.getResizeMode\(\)/);
  assert.match(nativeShell, /keyboardWillShow/);
  assert.match(nativeShell, /keyboardDidHide/);
});

test("Nutrition sheets stack above the fixed app navigation", async () => {
  const [sheet, globals] = await Promise.all([
    readFile(new URL("../components/ui/sheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(sheet, /fixed inset-0 z-\[70\]/);
  assert.match(sheet, /fixed z-\[70\] flex flex-col/);
  assert.match(sheet, /safe-area-inset-top/);
  assert.match(globals, /\.app-mobile-nav[\s\S]*z-index: 60/);
});

test("AI Scan, Describe, Barcode, and meal sheets keep their final actions reachable", async () => {
  const [quick, meals] = await Promise.all([
    readFile(new URL("../components/nutrition/NutritionQuickActions.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/nutrition/NutritionSavedMeals.tsx", import.meta.url), "utf8"),
  ]);
  assert.ok((quick.match(/<NutritionMobileSheet/g) ?? []).length >= 3);
  assert.match(quick, /footer=\{\s*items\.length \? \(/);
  assert.match(quick, /footer=\{\s*review && resolvedItems\.length \? \(/);
  assert.match(quick, /`Add to \$\{mealLabel\(meal\)\}`/);
  assert.match(quick, /<Tabs defaultValue="manual">/);
  assert.equal((meals.match(/<NutritionMobileSheet/g) ?? []).length, 2);
  assert.match(meals, /Update meal items \(\{selected\.size\}\)/);
  assert.match(meals, /max-h-\[min\(58dvh,34rem\)\].*overflow-y-auto overscroll-contain/);
});

test("mobile overlays retain shadcn titles, accessible search fields, and bounded previews", async () => {
  const quick = await readFile(new URL("../components/nutrition/NutritionQuickActions.tsx", import.meta.url), "utf8");
  assert.match(quick, /<SheetTitle>AI food scan<\/SheetTitle>/);
  assert.match(quick, /<SheetTitle>Barcode<\/SheetTitle>/);
  assert.match(quick, /Review meal/);
  assert.match(quick, /placeholder="Search foods"/);
  assert.match(quick, /aria-label="Remove image"/);
  assert.match(quick, /relative h-\[min\(16rem,30dvh\)\] max-h-\[30dvh\] overflow-hidden rounded-xl/);
  assert.match(quick, /flex flex-wrap gap-2/);
});
