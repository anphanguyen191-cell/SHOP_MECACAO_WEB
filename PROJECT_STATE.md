# V2 draft duplicate choice / UI checkpoint — 2026-10-10

User reports Windows create/add draft OK and requests explicit duplicate-unit choice plus polished UI as a development rule. Implemented transactional duplicate image-ID detection with fresh conflict token, styled confirmation/cancel dialog, related-draft badges and consistent pastel action buttons. Different units of the same Product/Size remain valid; cancelled/own draft excluded, price-only edits do not prompt again. No schema/stock/ledger/file change. Scope/tests: `V2_DRAFT_DUPLICATE_CHECKPOINT.md`. Mandatory rule for every feature: `DEVELOPMENT_PRINCIPLES.md` — optimize workflow and UI while implementing, not after backend-only completion. Check Actions on this commit for exact CI evidence; V2 sales/restore/STABLE still pending.

---
# V2 draft sandbox implementation — 2026-10-10

Owner authorized “triển khai tiếp đi bro”. Phase 1/2 draft foundation implemented, **sandbox-only / not V2 sales release**: schema120 backup+transaction migration, idempotent create, optimistic update/cancel, snapshots, VND validation, no reservation or stock/ledger/file mutations, real API and inventory-to-draft UI. Scope/evidence/rollback: `V2_DRAFT_CHECKPOINT.md`. Windows steps: `WINDOWS_V2_DRAFT_TEST.md`, `RUN_WINDOWS_V2_DRAFT_TEST.bat` (isolated V2DraftSandbox/port3006).

Default LOCAL remains V1 schema110; experimental flag requires sandbox, rejects absent sandbox before DB opening. No confirm/SALE/SOLD/archive/deletion yet. V1 full restore/STABLE remains a release gate; owner-reported Windows PASS retained. Check exact new Actions run for Windows CI/browser proof; local service39 and HTTP23 PASS, local Chromium unavailable. Remaining V2 phases: archive/journal/recovery, atomic sale, all-module eligibility and complete backup/restore.

---
# V1 Windows user acceptance / V2 logic preparation — 2026-10-10

User reports “v1 mình đã test ổn rồi bro” and requests V2 logic preparation. Record **Windows V1 USER-REPORTED PASS**, not historical PRE-WINDOWS. Delivered baseline f35375835757457bc7011f127a32f96d3856a060; Actions 37945599496 SUCCESS verified again. Scope/evidence limits: `V1_ACCEPTANCE_CHECKPOINT_2026-10-10.md` (full operational restore proof still pending; no inferred per-app clipboard results).

V2 specification/checklist prepared: `V2_SALES_LOGIC_SPEC.md`, `V2_IMPLEMENTATION_CHECKLIST.md`. **PROPOSED / documentation only**, no V2 runtime, schema migration, image deletion or stock mutation. User preference for optimized sold-image retention is captured; draft/no-reservation, confirmed-order immutability, pricing and cleanup mechanics need approval before code. V1 STABLE checkpoint/full restore gate remains distinct from the user's successful Windows use report.

---
# V1 inventory send checkpoint — 2026-10-09

User approved stock-image selection and fast multi-image copy/share. Implemented Size/Product/filter groups, Shift range, large viewer, bottom action bar and Windows native CF_HDROP source bridge; mobile Web Share preparation is capability gated. Scope, proof and Windows paste checklist: `V1_INVENTORY_SEND_CHECKPOINT.md`. No inventory writes/schema migration; V1 NOT STABLE, V2 blocked. Windows bridge compilation/format and new-process native clipboard round-trip are checked by Windows CI; actual Ctrl+V into each Zalo/Messenger variant and real mobile share remain UNVERIFIED until shop acceptance. Check Actions for the exact delivered commit; old runs do not prove new changes.

---
# V1 desktop experience checkpoint — 2026-10-09

User approved comprehensive compact UI optimization. Six modules now offer remembered Gọn / Thoải mái; desktop layouts reduce spacing and use horizontal KPIs/forms/cards, while mobile tap targets stay unchanged. Evidence/scope: `V1_DESKTOP_EXPERIENCE_CHECKPOINT.md`. Browser matrix covers both densities/themes at 1366×768 and 1920×1080 plus mobile and mocked LOCAL workflows. Check latest Actions for the delivered commit. User reported the preceding Windows build works; this UI revision and complete restart/rename/full restore still need shop acceptance. **V1 NOT STABLE; V2 blocked.** Historical statements below are not proof for this revision.

---
# Windows EPERM acceptance blocker — 2026-10-09

User's Windows Node 24.21 setup failed in receiveGoods at fsync: copied images were opened read-only. The same defect affected physical rename. Both COPY targets now open r+ (writable, no truncation); flush failures still abort safely. Regression tests enforce Windows-like writable-flush rules, including rename crash workers. CI now runs isolated internal and real HTTP gates on Windows Node 22 and 24 before Pages deploy. Windows CI is not full shop acceptance / complete restore; V1 remains NOT STABLE. Check Actions for this fix's exact commit.

---
# V1 warehouse upgrade checkpoint — 2026-10-09

User approved groups 1–9 and automatic-scan notifications. Local tests PASS: 45 HTTP assertions, warehouse crash/recovery tests, build/typecheck/core/performance and Chromium desktop/mobile. Details and limits: `V1_WAREHOUSE_UPGRADE_TEST_REPORT.md`; approval: `V1_WAREHOUSE_UPGRADE_SPEC.md`. User reported one successful Windows import scenario, not full acceptance. **V1 NOT STABLE; Windows full acceptance and full restore UNVERIFIED; V2 blocked.** Historical checkpoints below do not prove this revision. Verify Actions for the delivered commit.

---
# Authoritative V1 checkpoint — 2026-10-09

Status: **LOCAL AUTOMATED GATES PASS; Windows / full restore UNVERIFIED; V1 NOT STABLE.** See `V1_FINAL_PREFLIGHT_2026-10-09.md` for current source changes, executed evidence, scope and remaining gates. This supersedes every historical statement below. Check the latest Actions run independently; do not use an older run as proof for new code. V2 remains blocked.

---
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
