# Nutrition food foundation

Calistheni searches its local `Food` catalogue first. When fewer than five strong local matches exist, the server queries USDA FoodData Central and Open Food Facts in parallel and returns previews. Previews are never persisted until the user imports one.

## Configuration

Obtain a USDA key at <https://fdc.nal.usda.gov/api-key-signup>, then set `USDA_FDC_API_KEY` in the server environment. It is never returned by a route or bundled for the browser. Open Food Facts reads use `OPEN_FOOD_FACTS_USER_AGENT`; production use must retain a descriptive app/contact User-Agent and comply with its terms, attribution, API usage form, and rate limits.

USDA uses `/foods/search` and `/food/{fdcId}`. Open Food Facts uses its current product endpoint for barcode lookups and its documented legacy full-text search endpoint for preview search. Provider calls have short timeouts; failures return partial/local results.

## Canonical data, freshness, and revisions

Canonical nutrition is normalized to 100 g. USDA generic foods revalidate after 180 days by default; Open Food Facts products after 30 days; incomplete data after seven days. HTTP caching is separate from persisted freshness. A stale local result remains usable immediately.

Each import stores a raw source audit record and immutable revision 1. A refresh stores another source record, but makes a new revision only when identity or normalized nutrition changes by more than `0.05` units. A less-complete provider response never replaces an active complete record. Removed sources retain their last known data with `SOURCE_REMOVED` freshness.

## Historical snapshots

`NutritionEntrySnapshot` is the contract for a later meal-entry UI. It stores the food revision ID and calculated nutrient values for consumed grams. Existing snapshots are never recalculated when a future provider refresh updates `Food`.

## Manual verification

Open `/nutrition/foods` while authenticated. Search `salmon`, `chicken breast`, `rice`, a Cyrillic query, or a known packaged barcode. Import a preview, search again, then use the revalidation endpoint with a stale imported food. Live USDA verification requires the configured key; tests mock provider payloads and never call providers.

## Nutrition quick actions

The daily Nutrition picker has three distinct logging tools:

- Barcode reads EAN-13, EAN-8, UPC-A, and UPC-E from a locally processed photo (native `BarcodeDetector` when available, with ZXing as a browser fallback) or accepts an 8–14 digit value manually. Both paths use the same authenticated local-first barcode endpoint, then Open Food Facts when the product is not yet canonical.
- AI Scan compresses the chosen image to WebP on the client, removes source metadata through canvas re-encoding, and sends the ephemeral image to the authenticated AI route. The image is not stored in Calistheni. AI identifies labels and estimates grams only; nutrition is resolved from canonical food records and requires review before logging.
- Describe is a manual, temporary meal builder. It does not call the AI route or create a reusable Saved Meal.

Set `OPENAI_API_KEY` in the server environment to enable live AI food recognition. `OPENAI_NUTRITION_MODEL` is optional and defaults to `gpt-4o-mini`. Requests use structured output and `store: false`; missing configuration returns a clear `503` rather than fabricated scan data.

Confirmed AI Scan and Describe drafts use `/api/nutrition/entries/batch`. The endpoint validates at most 20 canonical foods before creating immutable nutrition snapshots in one transaction and returns the same canonical entry DTO used by the daily tracker.

Camera and library controls use standards-based file capture, which also works in the Capacitor WebView. This milestone does not add a native Capacitor plugin. iOS adds only a human-readable camera usage description for direct capture; Android needs no broad camera or storage declaration for the system file/camera chooser.

## Limitations

Open Food Facts is community data and can be incomplete. USDA is strongest for US/generic foods. Live AI recognition requires the server credential above; automated scheduled batch revalidation remains separate future work.
