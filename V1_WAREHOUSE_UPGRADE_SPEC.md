# V1 warehouse upgrade — approved 2026-10-09

Scope: user approved improvement groups 1–9, including scan notifications. V2 remains blocked. Windows import succeeded in the user's reported scenario; full acceptance and restore remain unverified.

- Scan dashboard distinguishes detected Products, Sizes and physical files, registered images, pending images and missing registered files. Import means registration, not goods-receipt history.
- Preview supports Product/Size selection, individual metadata edits, and explicit bulk pricing for selected rows only. Preserve per-product outcomes after saving. Transactions are per Product, not globally atomic; errors stop the batch and do not undo earlier successful Products. Idempotent retry is required.
- Remember a validated root in existing app_settings (no schema migration). Optional startup scan and polling (minimum 60 seconds), backend-running only. Scan never registers images, creates ledger transactions or renames files automatically.
- Persist deduplicated scan alerts (unseen/seen/resolved), show bell plus non-focus-stealing toast. Popup is opt-in and must not interrupt form entry; errors are explicit, not an empty warehouse.
- Image naming: ShopMeCaCao_Tole_<ASCII product>_Size_<ASCII free-form size>_<4-digit sequence><original extension>. Naming is not a stock-validity requirement. Receipt auto naming applies only to copied destinations, default off.
- Existing-image rename only for registered canonical files after preview + explicit confirmation. Preserve IDs, hashes and physical stock; never overwrite paths or rename directories. Durable journal, DB backup, preflight all files and restart recovery are mandatory. Ambiguous/mutated files stop safely for manual review. Unregistered images must be imported first.
- Every data-changing operation refreshes related modules; scan UI reports success/partial/error independently. Real progress means completed server responses; do not label estimates as live filesystem streaming.
- Test all paths on isolated warehouse fixtures, including denied reads, stale plans, collision, repeated import, partial batch, missing files and crash recovery. Do not use the real shop warehouse.

Implementation status is recorded separately; this approval document is not evidence of completion or STABLE.
