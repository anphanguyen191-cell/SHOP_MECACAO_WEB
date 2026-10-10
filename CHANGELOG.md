# 2026-10-10 — V2 ảnh nhẹ xem trước

Sandbox nháp: so sánh ảnh gốc/JPEG 1280 quality82, dung lượng thật, guards version/hash/decode, UI pastel sáng/tối/mobile. Chỉ đọc, không bán/xóa/đổi tồn/schema. Chi tiết: V2_IMAGE_PREVIEW_CHECKPOINT.md.

## 2026-10-10 — Draft duplicate choice and UI polish

- Require explicit, transaction-revalidated choice before placing the same physical image in another draft; identify related orders, exclude cancelled/current draft, preserve idempotent retry and no reservation.
- Styled accessible conflict dialog, overlap badges and pastel primary/add/remove/secondary buttons with mobile/dark states; record mandatory feature + workflow + UI principles.
- Regression coverage for decline/accept, stale token, same Product/Size different unit and unchanged data.

## 2026-10-10 — V2 draft sandbox foundation

- Owner authorized continuation: isolated schema120 migration backup/rollback and draft CRUD with idempotent create, optimistic version, price validation and snapshots; no stock reservation/SALE/image mutation.
- Sandbox-only Bán hàng UI linked to inventory selection; add/remove images, edit/cancel/reopen; separate Windows V2 launcher port3006 and acceptance steps.
- Added service and real HTTP/browser acceptance to Linux/Windows CI; local service39/HTTP23 PASS. V1 release/full restore gate retained; no local browser claim or V2 STABLE claim.

# CHANGELOG

## V1 owner Windows report / V2 specification — 2026-10-10
- Record owner-reported successful V1 Windows testing and verified baseline CI 37945599496; retain explicit full restore/release-checkpoint evidence limits.
- Prepare V2 proposed sales logic and phased acceptance checklist: draft/confirm, image claims/idempotency, physical-stock removal, lightweight sold-image history, durable cleanup/recovery, migration and backup/restore contracts.
- Documentation only; no V2 runtime/schema or image deletion. Business proposal and image cleanup settings require approval before implementation.

## V1 stock-image copy/share — 2026-10-09
- Size/Product/filter quick selection, Shift range, retained hidden selections, large viewer and bottom copy/share bar.
- Same-machine Windows CF_HDROP clipboard bridge with complete C# source, COPY effect, ID-only validation and origin/sandbox guards; no PowerShell, Python or inventory mutation.
- Capability-gated Web Share with individually prepared JPEGs in memory; request limits and explicit error/retry. Native paste into Zalo/Messenger and real mobile share still await shop acceptance.
- Share integration plus HTTP/browser regressions; Windows CI checks native compilation/Unicode multi-file format. No schema change or V2.

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
