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
- Current server binds 0.0.0.0; intended future LAN/mobile work should add explicit access/auth/network policy before exposing beyond trusted local network.
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
6. Daily incoming-goods flow: use **Nhập hàng** with one existing SKU, one new Size, and one new Product. Use a safe test image folder; verify image count proposal, override quantity once, confirm images are physically copied to canonical Product/Size folders and originals remain untouched. Verify failed/invalid source leaves no stock increment or orphan session files/folders.
7. Inventory flow: batch-import at least 2 sizes, adjust +, adjust -, attempt an over-minus and confirm it is rejected. Verify totals and per-SKU/global history.
8. Filter flow: search + category + size + stock state + active/inactive filters.
9. Lifecycle flow: mark a product inactive and verify stock mutations are blocked; reactivate it.
10. Persistence flow: close the server window, start again, verify products, stock, history and settings remain unchanged.
11. Backup flow: create DB backup; optionally run manual optimized-image backup and verify originals are untouched.
12. Acceptance is PASS only if there is no unexplained error, incorrect stock, missing committed data, broken image path, or startup failure.

Do not begin V2 until this procedure passes.
