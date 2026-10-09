# Warehouse upgrade audit — 2026-10-09

Approved groups 1–9 plus scan notifications implemented. Local evidence: 45 real HTTP assertions, warehouse crash/recovery/checksum tests, 28 UI source checks, Chromium desktop/mobile and full internal gate PASS. Exact coverage/limits: `V1_WAREHOUSE_UPGRADE_TEST_REPORT.md`. Windows full acceptance / complete restore UNVERIFIED; **NOT STABLE, no V2**. Check Actions for the exact delivered commit, not an earlier revision.

---
# Current V1 audit — 2026-10-09

**NOT STABLE.** Latest executed local gate, schema/core/crash tests, 30 HTTP business assertions, 23 UI source checks, Chromium UI and 1000-SKU/3000-image performance fixture PASS. Detailed scope/evidence: `V1_FINAL_PREFLIGHT_2026-10-09.md`. Windows and full restore remain UNVERIFIED; historical procedures mentioning writes to a real warehouse are superseded by the sandbox-only Windows guide. Latest GitHub Actions result must be checked for the current commit.

---
# Latest V1 quality gate — 2026-10-08 / pre-Windows handoff

**Automated verification PASS (run 37729772120). Real Windows warehouse verification: NOT PERFORMED. Verdict: PRE-WINDOWS TEST CANDIDATE, NOT V1 STABLE.** Earlier paragraphs below are retained for history and must not override this conclusion.

## Evidence matrix
| Gate | Latest result | Evidence |
| --- | --- | --- |
| Dependency production audit | PASS at critical threshold | GitHub Actions verify |
| TypeScript, build, schema migration | PASS | schema110 core and SQLite VACUUM INTO snapshot tests |
| Core business/inventory integrity | PASS | disposable SQLite self-test |
| Goods receipt loss/restart, idempotence | PASS | hard child process termination after COPY + fresh child recovery; three receipt workflows; corrupt/mixed journals halt safely |
| HTTP integration | PASS, 26 assertions | Disposable local server, approval, import, physical stock, ledger, original SHA, lossless backup, restart |
| Browser UI | PASS | Chromium widths 320/390/430/768, all six tabs, responsive charts, autocomplete, dark mode and fold controls |
| Full backup validation | PASS (byte copy / checksum) | verified SQLite snapshot + image SHA256; detects corrupt backup |
| Real Windows D: copy / browser / restart | **NOT TESTED** | `WINDOWS_V1_ACCEPTANCE_TEST.md` user acceptance procedure |
| Full restore onto Windows destination | **NOT TESTED** | Needs explicit restore dry-run on a disposable directory |
| Live goods-receipt progress streaming | **NOT IMPLEMENTED** | UI honestly reports result after server completes |
| Corrupted partial copy recovery | **FAIL-CLOSED / MANUAL** | Journal preserved; no dangerous automatic deletion |

## Windows test handoff
Use `RUN_WINDOWS_V1_SAFE_TEST.bat` only. It creates and uses a separate database at `%LOCALAPPDATA%\ShopMeCaCao\V1AcceptanceSandbox\database\shop-acceptance.db` and images under the same sandbox. Opens `http://127.0.0.1:3005` and shows an explicit TEST SANDBOX warning. It must never write to `D:\1-Me CaCao Store`. Follow the detailed checklist in `WINDOWS_V1_ACCEPTANCE_TEST.md`.

Original customer image protection remains mandatory: original source files must stay byte-identical, unregistered copies are removed only when verified safe, and mixed/corrupt journals block startup rather than delete ambiguous files.

---
# V1 ACCEPTANCE REPORT — latest checkpoint 2026-10-08

**Verdict:** Web UI automated gate PASSED; Windows warehouse acceptance NOT STARTED. Therefore **V1 is NOT STABLE and NOT fully accepted**. Historical claims below about Windows readiness/old endpoint states do not override this verdict.

## Browser evidence
- GitHub Actions [run 37716663127](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/runs/37716663127): schema regression, SQLite integration, TypeScript, production build, 16 UI source-contract checks, Chromium mobile smoke and Pages deployment all SUCCESS.
- GitHub Actions [run 37716897742](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/runs/37716897742): 320px/390px/430px/768px responsive overflow and chart-label smoke, real DOM navigation, mobile search autocomplete, Size filtering, collapsible dashboards and dark KPI legibility; verify SUCCESS. Later six-tab test requires a fresh CI result.
- Every Chromium run uploads visual snapshots to the workflow artifact named `mobile-smoke-<commit SHA>`.
- Corrected screenshot findings: vertical per-character labels in stock chart; dark-mode white figures on pale KPI cards; dark square inside a light drawer input; nearly invisible inventory heading; missing catalog demo breakdowns; weak receipt-KPI contrast.
- User-provided iPhone screenshots are evidence of the OLD broken rendering, not a pass. Chrome CI cannot replace final visual checks on the user's iPhone.

## Business / data gates remaining
- Inventory: registered canonical images that still exist are the sole physical-stock count; ledger balances remain audit figures and may differ.
- Goods receipts: content-hash duplicate detection and rollback on ordinary exceptions tested; **forced termination during file-copy/SQLite commit is not crash-safe until durable recovery journal implemented and tested**.
- No-image physical receipt is rejected. Explicit ledger-only transaction workflow must never be presented as creating physical inventory.
- Progress callbacks are buffered on the server; **not true real-time streaming**.
- Windows acceptance is restricted to a disposable copy of `D:\\1-Me CaCao Store`; verify import modes, originals unchanged, SQLite/database persistence, reboot, filesystem recovery, backup manifest, and full restore. Never mutate originals during test.
- Security: backend binds `127.0.0.1` by default; overriding `SHOP_HOST` to expose it beyond localhost requires access controls.
- A successful CI/deploy is necessary, not sufficient, for Windows deployment or V1 STABLE sign-off.

---
# FINAL AUDIT V1
Updated: 2026-10-06
Status: READY FOR WINDOWS ACCEPTANCE — INTERNAL VERIFY + DEPLOY PASS

## Scope audited
Architecture, Node/runtime contract, SQLite schema/integrity, products/SKU, inventory ledger, rollback, scanner/import, images, filters/history/settings, inactive workflow, backups, frontend state/UX, Windows setup/start, CI/security/deploy.

## Final-audit fixes
- Reject invalid inventory adjustment direction instead of silently treating it as plus.
- Require Node >=22.5 to match built-in node:sqlite runtime.
- Windows first-time setup now runs schema + core self-tests, not only typecheck/build.
- Import-review opening stock is normalized to integer.
- Manual product refresh no longer mutates the search string as a refresh hack.
- Inventory operations now guard double submit/network failures and integer quantities.
- Added invalid status-filter regression coverage.
- A syntax regression introduced during hardening was caught by CI and fixed before acceptance.

## Goods receipt hardening — 2026-10-07
- Separate daily incoming-goods flow from existing-store onboarding.
- Physical COPY into canonical Product/Size warehouse; source originals untouched.
- Existing/new Product and Size; per-size current cost/sale price; immutable historical IMPORT unit cost.
- Source-folder image count proposes quantity; confirmed quantity is authoritative for ledger.
- Rollback removes session-created files and newly created empty folders on failure.
- Integrity/foreign-key validation occurs before commit boundary completes.
- Progress phases exposed: VALIDATE, PREPARE, COPY, VERIFY, DB_COMMIT, INTEGRITY, DONE/ROLLBACK.
- Schema 100→110 now creates pre-migration DB snapshot and regression verifies price migration + historical ledger preservation.

## Evidence
GitHub Actions run 37636041261 verify SUCCESS + deploy SUCCESS (acceptance candidate).
- Production dependency critical audit: PASS (0 production vulnerabilities at critical gate).
- Web/API TypeScript: PASS.
- Schema safety self-test: PASS.
- Core integration self-test: PASS.
- Production build: PASS.

## Known non-blocking / future hardening
- Dev/tooling dependency tree still reports 2 critical audit findings; production-only audit is clean. Do not auto-fix major dependency changes without controlled upgrade testing.
- GitHub Actions emits deprecation warnings for action runtime internals; workflow itself passes.
- Scanner permission failures currently surface indirectly as empty results/warnings rather than detailed per-folder permission diagnostics.
- HEIC/HEIF browser preview support depends on browser; optimized image backup can decode supported Sharp inputs, but local preview may not render every HEIC in-browser.
- Current server binds 127.0.0.1 by default. Explicit SHOP_HOST override must not be exposed without authentication/network policy.
- V1 remains PRE-ACCEPTANCE until Windows real-runtime acceptance with actual warehouse data passes.

## Stability decision
No V2 feature work before Windows acceptance and V1 stable checkpoint.

## Windows acceptance procedure
Run this once on the real Windows machine before marking V1 STABLE.

1. Preserve any current `data/shop.db` and warehouse images. Never delete real data for acceptance.
2. Run `scripts\\SETUP_FIRST_TIME.bat`. Expected: install, TypeScript, schema self-test, core self-test and production build all PASS.
3. Run `START_SHOP.bat`. Expected: server health becomes READY and browser opens `http://localhost:3000`.
4. Product flow: create one temporary manual product with at least 2 free-form sizes and opening stock. Verify code/SKU suggestions remain editable.
5. Existing-store flow: scan the real warehouse root, inspect preview/warnings, import one safe product only after confirmation, verify its image thumbnails.
6. Daily incoming-goods flow: use **Nhập hàng** with one existing SKU, one new Size, and one new Product. Use a safe test image folder; verify image count proposal, deliberately try an incorrect quantity and confirm it is rejected, then confirm images are physically copied to canonical Product/Size folders and originals remain untouched. Verify failed/invalid source leaves no stock increment or orphan session files/folders.
7. Inventory flow: batch-import at least 2 sizes, adjust +, adjust -, attempt an over-minus and confirm it is rejected. Verify totals and per-SKU/global history.
8. Filter flow: search + category + size + stock state + active/inactive filters.
9. Lifecycle flow: mark a product inactive and verify stock mutations are blocked; reactivate it.
10. Persistence flow: close the server window, start again, verify products, stock, history and settings remain unchanged.
11. Backup flow: create DB backup; optionally run manual optimized-image backup and verify originals are untouched.
12. Acceptance is PASS only if there is no unexplained error, incorrect stock, missing committed data, broken image path, or startup failure.

Do not begin V2 until this procedure passes.

## 2026-10-08 — Reopened comprehensive acceptance gate
This document's earlier READY FOR WINDOWS ACCEPTANCE headline is historical; **current status is NOT ACCEPTED / V1 IN PROGRESS**.
- Source changes under test: duplicate incoming-image SHA-256 rejection, prevent importing from canonical destination, stale folder-picker fix, honest non-streaming progress UI.
- Audit discovered that /api/inventory (ledger-based), /api/products (ledger total) and /api/inventory/explorer (physical registered-image total) are not yet unified. Must clearly label or reconcile every displayed number.
- Audit discovered crash-window risk: files copied before SQLite commit, so forced process termination can leave orphan copied files. No persistent receipt journal yet.
- Audit discovered that API progress events are buffered and returned at request completion; true real-time progress is not implemented.
- Manual Windows D: verification remains REQUIRED: on a disposable copy of warehouse, exercise all three receipt flows, duplicate files, missing source, failed copy, original preservation, restart, backups, restore and inventory reconciliation. Real customer files must not be modified during testing.
- Do not claim full Windows or iPhone acceptance based on CI.
- CI status for latest patch: check GitHub Actions after run completes.
