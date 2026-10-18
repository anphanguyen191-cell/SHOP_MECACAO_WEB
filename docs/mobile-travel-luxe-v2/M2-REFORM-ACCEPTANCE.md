# Mobile Travel Luxe — mobile layout reform, 18 October 2026

Owner authorization: rebuild the mobile presentation against the supplied 16-screen reference, preserve CORE and Windows, deliver on main for iPhone acceptance. This remains M2; M3/M4 and physical-device acceptance are not implied by passing CI.

## Implemented presentation

- Compact brand/header and page title; no large repeated M2 development banner. Shared five-route dock and full-screen searchable More list. Keyboard-aware dock and reduced-motion treatment.
- Loading uses actual application loading state; Cloud login has shop branding, existing credential/recovery handlers and the existing landscape asset. No simulated progress, Google login or biometric integration.
- Mobile overview: greeting, four source-derived metrics, stock-by-product chart and task shortcuts. No fabricated revenue or sync freshness.
- Inventory opens into a two-column Product/Size photo gallery (three at tablet width), search, category chips, filter sheet, selection mode and a statistics sheet. Existing Product/Size tree remains available as an advanced view, including price tools.
- Full product detail sheet: large original-proportion photo, Size switching, individual canonical image selection, group selection, inactive restrictions and original image viewer. Selections use the existing InventoryView state/handlers and survive filters and sheet closure.
- Compact photo action panel keeps draft/share/clear accessible; Product/Size details expand on demand. Existing API validation, 100-photo limit, sharing preparation and idempotent draft handling remain authoritative.
- Cloud and LOCAL/LAN orders use mobile list/detail navigation. Cloud draft edit uses four presentational stages; LOCAL/LAN presents its existing fields through four stages. Save, preflight, conflict, finance, SOLD confirmation and PNG handlers remain unchanged.
- Customer list/detail navigation, responsive reports with date presets and optional detailed tables, and stocktake cards with real field labels.
- Cloud summary displays the last read status and actual source counts; account controls remain in an expandable section. Notification sheet shows current connection state and recent real order records, without a fabricated event history or unread count.
- Mobile appearance uses existing theme/density preferences. All layout styling is scoped to <=800px; no API/database/Supabase SQL or local data migration changes.

## Evidence and acceptance

- Local build, TypeScript, UI/source regression, mobile presentation DOM integration and existing Cloud business/DOM suites are run before push. CI browser results must be checked for the exact commit.
- `mobile-reform-dom.mjs` checks exact IDs, cross-Product/Size and filter selection persistence, inactive restrictions, input immutability, focus and Escape.
- `cloud-browser-e2e.mjs` captures signed-in gallery at 375/390/430/768px, product detail, filters, the four draft stages and the existing module/theme screenshots. It continues to exercise price workbook, durable draft retry, dirty guards, PNG, SOLD and stocktake using isolated fake transport.
- `mobile-m2-browser.mjs` captures signed-out login at four widths and checks form visibility, navigation hiding and overflow.
- `mobile-browser-smoke.mjs` covers the default mobile gallery and retains the advanced explorer tests for group/range/filter selection, physical photos, sharing and confirmation.
- The CI artifact `mobile-m2-ui-evidence` includes `cloud-browser/`, `mobile-m2/` and `main-release/` screenshots. Generated screenshots contain test fixtures, not the user's warehouse.

Owner iPhone acceptance remains required: real photos; keyboard/safe area; multi-Size selection; return/navigation state; draft edit and PNG; login/recovery; offline/read freshness; dark mode/density. CI does not constitute that acceptance. A new Windows STABLE release must never be announced before it is actually published.


## iPhone screenshot P1/P2 corrective pass — 18 Oct 2026

Owner supplied three iPhone screenshots: Catalog shows a dense instructional paragraph, Reports has oversized native localized date inputs, and Product detail has an off-center hero photo. Owner also reported no visible welcome/login and no obvious session sign-out.

### Fixes integrated to main (UI/presentation only)
- Branded short, skippable Mobile splash moved to the single app Runtime so LAN and Cloud share it without restarting when sign-in changes. A valid persisted Supabase session continues to be honored; it is NOT silently invalidated just to force a login form.
- Explicit Cloud logout using existing `cloud.auth.signOut()` in Mobile **Thêm** drawer and **Cài đặt**. Unsaved-navigation guard still applies. Sign-out clears the session through the existing SDK and takes the user back to Cloud connection/login.
- Catalog replaces the long desktop Cloud caveat with a short, scoped Mobile hint; product summary and metadata hierarchy are compact. Desktop copy and price editing are untouched.
- Mobile Reports presents compact **dd/mm/yyyy** values while retaining the actual native `type=date` controls and unchanged `YYYY-MM-DD` request values. Inputs are now arranged vertically on narrow viewports; Desktop continues to render existing date inputs.
- Product detail hero photo now has a bounded centered container, `object-fit:contain`, centered object position and nonnegative margins; original photo source, identity and selection handlers remain untouched.
- Header, footer navigation and More logout styles receive scoped mobile-only polish; reduced-motion support remains.

### Regression evidence added
- Source-level checks in `scripts/v8/mobile-luxe-m2-responsive.test.mjs`: welcome/logout, compact catalog/date UI, original date input preservation, centered detail photo.
- Chromium signed-out test `scripts/v8/mobile-m2-browser.mjs`: splash screenshot and automatic removal before login checks.
- Cloud signed-in browser fixture `scripts/cloud-browser-e2e.mjs`: 375/390/430/768 centered hero screenshots and report-date screenshots, Cloud catalog hint, Appearance sign-out button. No real inventory is used.
- `.github/workflows/mobile-m2-verify.yml` triggers on all newly changed presentation and test files. Existing Pages deployment remains gated by Linux and Windows verification.

**Quality gate**: source-level inspection confirms the intended patches exist; as of this document no completed Actions build/typecheck/browser deployment result was independently available to this reviewer. **NOT STABLE** and **NOT OWNER-ACCEPTED** until Actions PASS, deployed build verified on iPhone and the owner performs the UI acceptance. Do not change CORE or promote M3.
