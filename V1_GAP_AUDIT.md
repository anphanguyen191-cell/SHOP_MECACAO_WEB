# V1.0 GAP AUDIT
Updated: 2026-10-06
Source of truth: V1_SPEC.md
Status: IMPLEMENTING — INTERNAL RUNTIME GATE PASS; WINDOWS ACCEPTANCE PENDING

## Implemented
- Schema v100 with guarded bootstrap and integrity/foreign-key checks.
- Product/SKU create/read/search, collision-safe suggestions and validation.
- OPENING / IMPORT / ADJUST_PLUS / ADJUST_MINUS ledger; negative-stock and inactive-product guards.
- Atomic multi-size batch import and rollback.
- Existing warehouse scanner + explicit confirmed transactional import.
- Safe image-by-database-ID resolver/API; missing files do not corrupt product metadata.
- Inventory filters/history UI; configurable low-stock threshold.
- Product inactive backend workflow.
- Settings and backup UI/API.
- DB backup package with image manifest.
- Disposable core self-test + isolated schema safety self-test.
- Persistence/reopen, rollback, integrity and foreign-key regression coverage.
- Consolidated `npm run test:gate` wired into GitHub Actions.

## Remaining before user test
1. DONE — consolidated runtime gate PASS on GitHub Actions run 37486889569.
2. Normalize remaining API error paths/runtime query validation.
3. Complete category/size/status inventory filters in UI/API parity.
4. Finish product inactive UI controls.
5. Decide/implement full physical-image backup policy; current backup contains DB snapshot + image manifest, not copied image bytes.
6. Verify GitHub DEMO deploy after V1 changes.
7. Windows real-runtime acceptance remains final user gate.

## Decision
Do not call V1 STABLE and do not ask for Windows acceptance until internal runtime gate is evidenced or explicitly marked UNVERIFIED.
