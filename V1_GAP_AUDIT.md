# V1.0 GAP AUDIT

Updated: 2026-10-06
Source of truth: V1_SPEC.md
Status: IMPLEMENTATION GAPS IDENTIFIED — NOT READY FOR USER TEST

## Implemented
- Schema v100 core tables + derived inventory_stock view.
- Product/SKU backend create/read/search.
- OPENING / IMPORT / ADJUST_PLUS / ADJUST_MINUS ledger.
- Negative-stock guard and integer quantity validation.
- Existing warehouse scanner with preview.
- Explicitly confirmed store import with DB transaction/rollback.
- Warehouse image path containment validation.
- Product/stock UI and per-SKU inventory operations/history.
- SQLite backup service + API.
- Disposable self-test DB and ledger/import/rollback/backup source tests.
- GitHub DEMO isolation.

## Missing vs approved V1_SPEC
### P0 — required before user test
1. Product creation UI independent of warehouse scanner.
2. Batch stock import for multiple sizes in one atomic operation.
3. Inventory list/filter by category, size and stock state; configurable low-stock threshold.
4. Dedicated inventory history screen, not only history inside selected product.
5. Safe local image-serving endpoint + product image preview.
6. Settings/Backup UI and settings API.
7. Product inactive workflow; no hard-delete for products with ledger history.
8. Product input validation parity: createProduct still truncates opening stock and needs price validation.
9. Collision-safe product-code/SKU suggestions.
10. Migration framework with pre-migration backup/version steps.
11. Persistence/reopen test and schema-integrity test.
12. Runtime CI/typecheck/build confirmation.

### P1 — complete V1 UX
- Categories API/list support.
- Better scanner warnings for unreadable folders.
- Full API validation/error normalization.
- Mobile navigation polish.

## Decision
Do not ask the user to test V1 yet. Complete P0 items, run automated gate, then perform one consolidated Windows + real-warehouse acceptance test.
