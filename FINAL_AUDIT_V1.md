# FINAL AUDIT V1
Updated: 2026-10-06
Status: PRE-ACCEPTANCE — INTERNAL VERIFY PASS

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

## Evidence
GitHub Actions run 37490484439 verify SUCCESS.
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
