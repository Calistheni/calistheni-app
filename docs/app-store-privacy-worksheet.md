# Calistheni iOS App Store privacy checklist

Use this checklist for the signed iOS release and the Calistheni site loaded in its production WebView. Each selected row below uses **Tracking: No** based on the reviewed code and published provider behavior. Reconfirm the release configuration before publishing the label. The repository manifest includes the conservative selections marked provisional.

| App Store Connect data type | Select | Purposes | Linked | Evidence |
|---|---|---|---|---|
| Name | Yes | App Functionality | Yes | Account and profile names in `User` and identity providers |
| Email Address | Yes | App Functionality | Yes | Sign-in, recovery, security messages, and billing contact |
| Other User Contact Info | Yes | App Functionality | Yes | The public footer links to the partner form, which retains contact name and business website in the same inquiry |
| Health | Yes | App Functionality, Analytics | Yes | Saved nutrition and measurements, optional Apple Health imports, and authorized internal summaries of per-account nutrition activity |
| Fitness | Yes | App Functionality, Analytics | Yes | Workout and exercise logs, progress, and workout engagement counts |
| Precise Location | Yes | App Functionality | Yes | Park photo GPS or optional device location is stored with the contributor's submission. Directions hand off the park coordinates to the chosen maps provider and do not use Calistheni's location permission. |
| Photos or Videos | Yes | App Functionality | Yes | Workout and park photos, and optional images sent to OpenAI for nutrition analysis |
| Other User Content | Yes | App Functionality | Yes | Workout notes, community submissions and reports, and optional food descriptions |
| Search History | Yes, provisional | App Functionality | Yes, provisional | Exercise, people, and park searches can place terms in URLs visible to runtime logs. Food search uses POST to Calistheni, and remote providers can receive search terms or barcodes. There is no saved search history feature. |
| User ID | Yes | App Functionality, Analytics | Yes | Account ownership, sign-in, entitlements, and deduplicated active-user measures |
| Device ID | Yes | App Functionality, Analytics | Yes, provisional | Mapbox GL JS stores a rotating WebView or browser identifier used in map usage and billing events. Calistheni does not attach its account ID. |
| Purchase History | Yes | App Functionality, Analytics | Yes | Apple and Stripe transaction and entitlement records, plus subscription trends |
| Product Interaction | Yes | App Functionality, Analytics | Yes | Account presence, activity counts, barcode outcomes, AI usage quotas, and Mapbox map usage |
| Performance Data | Yes | App Functionality | Yes, provisional | Mapbox GL JS enables performance reporting by default. The performance payload includes timing and device characteristics and does not carry the map usage identifier. Mapbox's ability to join the records requires verification. |
| Other Diagnostic Data | Yes, provisional | App Functionality | Yes, provisional | Server authentication and error events, plus hosting request logs. Verify retained fields and potential linkage in the release environment. |
| Other Data Types | Yes | App Functionality | Yes | Optional date of birth stored as an account field |

For Health, Analytics covers authorized review of nutrition logging frequency and summaries. The reviewed general product analytics dashboard does not use imported HealthKit measurements. Leave Product Personalization off for Health. Progress reports and calculations implement features requested by the user.

## Checks before publication

- **Mapbox:** Confirm the release sends the reviewed usage and performance events and confirm their retention, purpose, device linkage, and onward use. Keep provisional linked selections until evidence supports unlinkability. If performance metrics are also used to evaluate the product or feature, add Analytics. Check for any separately retained approximate user location before adding Coarse Location. A map viewport or a park's coordinates alone do not establish user location.
- **Search and technical logs:** Check which URL parameters, bodies, identifiers, and diagnostic events Vercel or log drains retain. Check search-term retention at USDA FoodData Central and Open Food Facts. Change Search History or Other Diagnostic Data to Not Linked only if the retained records cannot be associated with an account or device. Omit the category only if nothing applicable is retained beyond the request.
- **Support and crash reports:** The support page opens email or Instagram and has no in-app ticket upload. Confirm whether external support correspondence is retained and whether Apple's optional-disclosure criteria apply. If in scope, select Customer Support, App Functionality, with linkage based on the records. No crash-reporting integration was found in source. Add Crash Data only for crash reports actually collected in the release.
- **OpenAI:** Confirm actual project-level abuse-monitoring and retention controls. AI Scan, Describe, nutrition-label extraction, and proposal generation require confirmation before submitting a request. `store: false` is a Responses API application-state setting. OpenAI's published default for abuse-monitoring logs is up to 30 days, with exceptions.
- **Archive and questionnaire:** Compare the signed archive's aggregated privacy report, the deployed WebView, and the App Store Connect selections. The checked-in app manifest keeps UserDefaults reason `CA92.1` and has no tracking domains. Confirm the partner form's reachability and the active provider settings. The questionnaire and manifest are independently maintained.

No Payment Info selection is supported for the reviewed Apple and Stripe hosted payment flows. Calistheni does not receive payment card details. No source evidence supports contacts, audio recordings, private-message contents, browsing history, or advertising data.

## Sources

- [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
- [Apple privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing)
- [Mapbox GL JS performance option](https://docs.mapbox.com/mapbox-gl-js/api/map/#map-options-performancemetricscollection)
- [Mapbox telemetry endpoints](https://docs.mapbox.com/mapbox-gl-js/guides/security-and-testing/)
- [Mapbox Privacy Policy](https://www.mapbox.com/legal/privacy)
- [Vercel runtime logs](https://vercel.com/docs/logs/runtime)
- [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data)
