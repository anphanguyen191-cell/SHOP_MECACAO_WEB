# PROJECT STATE — SHOP MECACAO WEB

Updated: 2026-10-06

## Current baseline
- Version: **V0.1.2**
- Codename: **Foundation Stable**
- Status: V1.0 READY FOR WINDOWS ACCEPTANCE — INTERNAL GATE + DEPLOY PASS
- Stable baseline: **YES**
- User acceptance test: **PASS — Windows laptop + iPhone GitHub Preview**

## Architecture decisions — APPROVED
1. Greenfield; không phụ thuộc core desktop cũ.
2. Local-first web app.
3. React + TypeScript + Vite + PWA frontend.
4. Node.js + Express local API.
5. SQLite local database via built-in `node:sqlite`.
6. Không dùng native SQLite npm addon cần Visual Studio Build Tools.
7. GitHub = source/version/preview; không lưu dữ liệu shop thật.
8. GitHub Pages = DEMO/PREVIEW.
9. Local production = `http://localhost:3000`.
10. Development gate: Proposal → Approve → Implement → Internal checks → User Test → PASS → Baseline.
11. Không giao user test khi chưa qua pre-test gate; phần không thể xác minh phải ghi UNVERIFIED.

## V0.1.2 PASS checklist
- [x] GitHub repository/source.
- [x] GitHub Actions install/build.
- [x] GitHub Pages deploy.
- [x] iPhone preview.
- [x] DEMO mode detection.
- [x] Windows Node/npm environment.
- [x] `SETUP_FIRST_TIME.bat` → SETUP PASS.
- [x] API/frontend production build.
- [x] `START_SHOP.bat` startup patch.
- [x] `http://localhost:3000` reachable.
- [x] LOCAL mode detection.
- [x] `data/shop.db` created.

## Defects found and closed
1. `better-sqlite3` required native compilation/Visual Studio Build Tools on Node 24.
   - Resolution: replaced with built-in `node:sqlite`.
2. Initial Windows startup script opened browser while server was unavailable / quoting was fragile.
   - Resolution: V0.1.2 startup waits for `/api/health` before opening browser and preserves server error output.

## Known non-blocking item
- GitHub Preview mobile navigation can overflow horizontally; defer UI polish until feature UI exists.

## 2026-10-07 V1 acceptance candidate
- Schema target: **110**, per-size/SKU current pricing.
- Automatic pre-migration snapshot for existing schema 100 before migration to 110.
- Daily **Nhập hàng** flow added separately from existing-store onboarding.
- Goods receipt supports existing/new Product and Size, per-size quantity/prices, physical image COPY into canonical warehouse, source-folder image counting, confirmed quantity override, ledger `IMPORT`, rollback, and progress phases.
- Inventory remains ledger-derived; image count never mutates stock after SKU exists.
- GitHub Actions run **37636041261**: verify SUCCESS + deploy SUCCESS.
- Windows real-runtime/real-warehouse acceptance remains **UNVERIFIED** until user executes acceptance procedure.

## Next milestone
**V1.0 — Product + SKU + Inventory Ledger**

Status: **IMPLEMENTING — inventory operations/history UI committed; automated gate next**

Specification: `V1_SPEC.md`

Approved decisions: size tự do; storage theo `1-Me CaCao Store/<Tên sản phẩm>/<Size>/ảnh`; mã/SKU được gợi ý tự động nhưng người dùng được chọn/chỉnh trước khi lưu.


## V1.0 implementation progress
- [x] Specification locked.
- [x] SQLite schema v100: categories, products, variants, images, inventory ledger, settings.
- [x] Derived stock view; no direct stock column.
- [x] API/service layer.
- [x] Product/SKU engine/workflows (backend).
- [x] Existing folder/image scanner backend (read-only preview).
- [x] Import approval/commit backend with explicit confirmation + DB rollback.
- [x] Product/Inventory list UI + store scanner preview UI.
- [x] Import edit/approval UI with explicit confirmation.
- [x] Inventory operations/history UI source committed.
- [x] Isolated disposable test database runner.
- [x] Store import commit/rollback self-test source.
- [x] Backup creation self-test source.
- [ ] Automated test gate runtime PASS (GitHub workflow status unavailable via connector).
- [ ] User acceptance test.

## Internal Gate Evidence — 2026-10-06
- GitHub Actions run 37486889569: verify SUCCESS, deploy SUCCESS.
- TypeScript web/API: PASS.
- SCHEMA_SELF_TEST: PASS (blank, reopen, future-version guard, legacy guard, corrupt-version guard).
- SELF_TEST_V1: PASS (ledger, rollback, filters/settings/inactive, image pipeline, persistence/integrity/FK, store import rollback, backup cleanup).
- Production build: PASS.
- GitHub Pages deploy: PASS.
- Remaining: Windows/local real warehouse acceptance; physical image-copy backup policy; dependency security audit (npm reported 2 critical vulnerabilities during install).

## Pre-Acceptance Checkpoint — optimized image backup
- GitHub Actions run 37489137893: verify SUCCESS, deploy SUCCESS.
- Production dependency audit: 0 vulnerabilities at critical gate (dev/tooling warnings remain isolated from production audit).
- Sharp install/runtime on CI: PASS through core integration test.
- Manual optimized image backup: PASS (real JPEG generation, resize max 1920, quality 85, no enlargement, physical backup file verified, reduced-byte assertion on test fixture).
- Image backup is manual only; no automatic physical image backup task exists.
- Original warehouse images remain untouched.
- V1 is ready for consolidated Windows/local acceptance after acceptance package/instructions are prepared.
