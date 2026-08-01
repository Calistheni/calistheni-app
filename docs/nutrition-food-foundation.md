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

## Limitations

Open Food Facts is community data and can be incomplete. USDA is strongest for US/generic foods. Meal tracking, AI recognition, and automated scheduled batch revalidation are intentionally separate future work.
