# CHANGELOG

## V1 desktop experience — 2026-10-09
- Remembered Gọn / Thoải mái, compact desktop header/sidebar/KPIs/charts/cards/forms and non-overlapping import confirmation; mobile keeps its tap sizes.
- Clear receipt destination/source labels and jump-to-form action; improved dark muted-text contrast, focus visibility and reduced-motion support.
- Six-module desktop browser matrix at 1366×768 and 1920×1080, both themes/densities, plus mobile and mocked LOCAL workflows; 31 source UI regressions.
- Presentation only: no backend/schema or inventory-rule changes. Shop Windows UI acceptance and full restore pending; V1 NOT STABLE.

## Windows fsync setup blocker — 2026-10-09
- Fix EPERM on copied goods-receipt / rename files: open COPY targets with r+ instead of read-only before fsync; preserve contents, checksums and fail-closed recovery.
- Add writable-flush regression guards and native Windows Node 22/24 internal + HTTP gates. Deployment waits for Linux and Windows checks. Shop Windows acceptance and full restore remain pending.

## V1 warehouse workflow upgrade — 2026-10-09
Status: AUTOMATED LOCAL PASS / WINDOWS FULL ACCEPTANCE UNVERIFIED / NOT STABLE

- Ten scan KPIs, pending/registered separation, selected Size bulk pricing and reviewed per-Product batch registration with retained outcomes.
- Remembered warehouse, opt-in startup/periodic read-only scanning, persistent notices, bell/toast and optional non-interrupting popup.
- Registered physical-image rename with checksum-bound preview, stable IDs, DB backup, durable journal and mapping logs; source receipt images remain unchanged.
- Opt-in canonical naming for newly copied receipt images, dashboard refresh, labelled responsive forms/cards and dark mode.
- Extended API, crash/recovery and browser regressions. No schema migration, no cloud/LAN exposure, no V2; full Windows restore remains unverified.

## V1 pre-Windows hardening — 2026-10-09
Status: AUTOMATED LOCAL PASS / WINDOWS UNVERIFIED / NOT STABLE

- Batched physical inventory reads; consistent file-only stock and complete ledger totals on SKU search.
- Receipt/folder async state, double-submit prevention and automatic dashboard refresh.
- Existing Size batch-import reconciliation, folder browsing/paste, retry/loading states, UI preferences, accessible labels/focus and non-cropped lazy galleries.
- Backup manifest completeness verification against snapshot; sandbox API/db guards and fresh Windows source build.
- Dependency lockfile + npm ci; expanded core, HTTP, browser and performance regressions.
- No new schema, no V2 and no real inventory mutation. Full Windows restore remains unverified.

## V0.1.2 — Foundation Stable — 2026-10-06
Status: DONE / STABLE

### Fixed
- Windows local startup now waits for API health before opening localhost.
- Startup errors remain visible for diagnosis.
- Completed local Windows acceptance test.

### Verified
- SETUP PASS.
- Production build PASS.
- localhost:3000 PASS.
- LOCAL mode PASS.
- SQLite `data/shop.db` creation PASS.
- GitHub Pages/iPhone DEMO preview PASS.

## V0.1.1 — Foundation local setup patch — 2026-10-06
Status: SUPERSEDED

### Fixed
- Removed `better-sqlite3` native npm dependency.
- SQLite moved to built-in `node:sqlite`.
- Removed Visual Studio Build Tools requirement for Shop dependencies.

## V0.1 — Foundation — 2026-10-06
Status: SUPERSEDED

### Added
- React/TypeScript/Vite/PWA frontend.
- Node/Express local API.
- SQLite bootstrap.
- LOCAL/DEMO distinction.
- Windows scripts.
- GitHub Pages workflow.
- Project governance documents.

# Windows acceptance fix — 2026-10-09

- Reject Product/Size folders passed as warehouse scan roots with an actionable message. Clear stale scan previews and block saving previews without any selected Size containing valid image paths. Regression tests cover wrong folder depth and the UI guard. No business data changed.
