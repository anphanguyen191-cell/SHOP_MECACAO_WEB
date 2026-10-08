# Latest V1 pre-Windows quality checkpoint — 2026-10-08

**Status: AUTOMATED PRE-WINDOWS GATE PASS at GitHub Actions run 37729772120; real Windows test UNVERIFIED; V1 NOT STABLE.** This section supersedes historical progress statements below.

- [PASS] TypeScript/web/API build, schema110 migration snapshots via SQLite VACUUM INTO, isolated SQLite core tests, 16 UI source regressions and Chromium mobile smoke screenshots.
- [PASS] Real HTTP server exercised on temporary Linux warehouse: **HTTP_API_ACCEPTANCE PASS (26 assertions)** covering scan/import approval, 3 receipt flows, duplicate rejection, physical-vs-ledger separation, four original SHA hashes, full lossless backup verification, server restart/persistence.
- [PASS] Crash-safety simulation: separate worker forcibly exits after first copied image and separate new worker recovers only the uncommitted copy; source originals are unchanged. Mixed-commit/corrupt-file journals fail closed rather than deleting ambiguous warehouse files.
- [PASS] Receipt workflow journals planned target filenames and SHA-256 before copying; SQLite WAL synchronous=FULL; existing Size scanner idempotently incorporates new images without duplicating their registration.
- [PASS] Manual full backup now includes byte-identical physical images + SQLite + SHA-256 checks; legacy DB-only and lossy optimized backups are clearly labeled as partial/non-lossless.
- [PASS] UI smoke at 320/390/430/768 width, dark-mode contrast, product chart labels, six-tab navigation, smart search, toggleable dashboards and screenshotted browser evidence.
- [PREPARED] One-click Windows *isolated* test: `RUN_WINDOWS_V1_SAFE_TEST.bat`; help in `WINDOWS_V1_ACCEPTANCE_TEST.md`; test-only port 3005, sandbox under LOCALAPPDATA. Actual Windows execution remains pending.
- [BLOCKER] Full lossless restore into an operational Windows warehouse path has **not** been proven. Journal corruption during an interrupted partial copy intentionally halts for manual review; true live progress streaming is not implemented. No external LAN authentication. Never test writes directly on the real D: warehouse.
- [RELEASE] V1 may enter disposable Windows acceptance after latest CI passes, but must remain NOT STABLE until real Windows test and recovery protocol review pass. Do not begin V2.

---
# V1 CURRENT STATUS — 2026-10-08 (authoritative; supersedes older checkpoints)

**Buildable DEMO UI: PASSED browser regression on commit 3b537594 (GitHub Actions 37716663127, verify + deploy SUCCESS).** Further six-tab browser checks are committed and require their own CI result. **Windows business-data acceptance: NOT PASSED / NOT EXECUTED. V1 remains NOT STABLE.**

- Four collapsible dashboards are now above task content: overview, catalog, goods receipts and inventory. Large branding banner is compact and placed below overview analytics.
- Responsive inventory chart regression corrected: product labels render horizontally above each bar, not in the obsolete 60px three-column CSS grid.
- Dark mode contrast corrected for catalog/inventory KPIs, drawer search (light background remains), product ranks, inventory heading and goods receipt metrics.
- The GitHub Actions V1 gate now runs web/API TypeScript, schema migration self-test, isolated real SQLite core tests, production build, 16 source UI regression checks, and Chromium browser testing with screenshot artifacts. Browser checks cover 390px navigation, visual overflow, KPI contrast, fold/unfold and search. Additional 320/430/768px and six-tab coverage are being integrated.
- Product search, Size suggestions, stock filters and product charts use registered existing physical image counts. Ledger remains separate for history and reconciliation.
- **Open safety gates:** power-loss recovery journal for mixed filesystem/DB goods receipts; genuine streaming progress; backup/restore of original images; end-to-end verification of all write flows on a disposable Windows warehouse; real iPhone acceptance. Existing full database snapshot/optimized-image backup is not a substitute for proving full restore.
- Never point destructive or acceptance experiments at the customer's real D: inventory. Test on a copy with verifiable before/after manifests.

---
# PROJECT STATE — SHOP MECACAO WEB

Updated: 2026-10-06

## Current baseline
- Version: **V0.1.2**
- Codename: **Foundation Stable**
- Status: **V1.0 REOPENED — UX + PHYSICAL-INVENTORY IMPLEMENTATION**
- Stable baseline: **YES**
- Foundation acceptance: **PASS — Windows laptop + iPhone GitHub Preview**
- V1 acceptance: **NOT PASS / REOPENED** after real Windows UX review.

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
- **Superseded 2026-10-07:** physical inventory is now image-backed for Shop Mẹ CaCao: one existing canonical Size image represents one physical item. Ledger remains audit/history and must be reconciled against physical images; mismatches are explicit, never silently rewritten.
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
- [x] Automated test gate and 390px Chromium browser smoke PASS (run 37716663127, 2026-10-08).
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


## 2026-10-07 — Approved V1 UX / inventory baseline
- V1 remains REOPENED until DATA + BUSINESS + FILESYSTEM + UX + WINDOWS gates pass.
- UI direction: colorful Shop Mẹ CaCao identity (pink/yellow/mint/baby-blue/cream), logo/banner assets, consistent controls and responsive states.
- Danh mục sản phẩm = catalog/dashboard, not a duplicate inventory list.
- Tồn kho = inventory dashboard + Windows-Explorer-style Product → Size → physical images.
- Inventory dashboard: total physical stock, products, Size/SKU, out-of-stock, Top 5 high stock, Top 5 lowest positive stock, stock by Size, reconciliation warnings.
- Inventory search autocompletes existing Product / product code / SKU / Size with physical counts; automatic browser scenarios cover core navigation, and further Windows validation is still required.
- Physical stock rule: **1 existing canonical image in a Size = 1 physical item in stock**. Missing physical image reduces physical count; ledger/image mismatch is shown for reconciliation.
- Images in Size gallery are selectable. Selection is V1 foundation for future send-to-customer, order, sale and closing-slip workflows; selection itself never performs SALE.
- Nhập hàng UX must have 3 explicit flows: (1) completely new Product, (2) new Size for existing Product, (3) additional stock for existing Product+Size. Existing Product/Size/SKU values must be selectable/autofilled.
- Incoming goods, folder picker, real-time progress, crash recovery and scanner reconciliation remain IMPLEMENTING / UNVERIFIED until deep regression passes.

## 2026-10-08 — V1 deep audit (work in progress)
- Latest UI baseline: official logo/banner committed, feature drawer, responsive product cards, physical-stock dashboard; GitHub DEMO charts explicitly illustrative.
- Goods receipt hardening commits: ec4f449 (reject SHA-256 duplicate images and self-import from canonical Size folder), 4392cbc (folder picker stale-state fix; remove misleading post-response progress replay).
- Physical stock remains count of existing registered canonical image files; ledger is a separate audit balance. `inventoryRows` and product-list totals have since been migrated to physical-image counts; the former statement was the 08:00 audit finding and is superseded by the authoritative status above.
- No-image goods receipt is **currently explicitly rejected**, not silently posted as physical stock. Separate ledger-only workflows remain distinct and need UX clarification.
- Progress is **not live-streamed**; API currently returns phase events only after synchronous completion. UI must not imply live progress.
- Crash-safe journaling/recovery and full restore testing remain **OPEN**.
- CI verification for the newest commits: **PENDING at time of this update**. Do not infer PASS from older workflow runs.
- Real Windows D: warehouse acceptance, actual restart, image-original protection, restore and iPhone visual acceptance: **UNVERIFIED**. Never use real warehouse for destructive testing.
- V1 status: **NOT STABLE / NOT ACCEPTED**. No V2.
