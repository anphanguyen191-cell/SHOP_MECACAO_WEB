# V1 warehouse upgrade — implementation / acceptance record

Approved scope: V1_WAREHOUSE_UPGRADE_SPEC.md. This replaces neither Windows acceptance nor the full restore gate. V1 remains NOT STABLE; V2 remains blocked.

## Implemented

- Import workspace: 10 real scan KPIs, clickable filters, search, per-Size selection, explicit selected-only bulk pricing, Product-code/new-SKU editing, thumbnails, reviewed batch confirmation, actual registration deltas and retained SAVED/ERROR/UNPROCESSED outcomes. Existing physical Product/Size names remain tied to directories; folder renaming is not implemented or implicit.
- Root/config persistence in app_settings; startup scanning and configurable periodic polling (60–86400 seconds). Opening Import also reads the remembered root. Scans are read-only and do not register stock or write ledger transactions.
- Persistent deduplicated notices with unseen/seen/resolved states, bell count, toast, optional popup suppressed during text entry, active dialogs and processing. Backend must be running; no cloud/push service added.
- Scan failures are explicit, not an empty result. Warehouse/Product cover images do not wrongly trigger the wrong-depth check.
- Registered-image filename inspection and selective rename preview. Unregistered images must be imported before renaming. Preview is hash-bound; stale/colliding plans are rejected. Image IDs/checksums/stock remain stable. Original receipt source files and directories are not renamed.
- Durable rename journal: preserve old files until DB transaction commits, then clean up verified duplicates. Before any cleanup, verify all files. Startup handles uncommitted/committed states, but mixed or mutated files stop for manual investigation. DB backup and JSON/CSV mapping logs are available. This is NOT full DB+warehouse restore.
- Auto naming, default off, applies only to COPY destinations for goods receipts and preserves file extension. Import itself leaves existing names alone until separately confirmed rename.
- App data reload after registration, receipt and rename. Responsive labelled Size cards, readable dark mode, contained images and no page overflow in tested viewport widths.

## Evidence / limits

Local gates: TypeScript/build, schema/core, 1000-SKU performance fixture, warehouse-upgrade tests, HTTP/API, real Chromium with mocked LOCAL UI. The upgrade tests include real child-process exits before/after rename commit, altered duplicate safety stops, stable ID/stock/hash checks, stale preview/collision rejection, config and notice dedup/state persistence.

Executed locally: HTTP_API_ACCEPTANCE PASS (45 assertions); source UI regressions PASS (28 checks); Chromium viewport widths 320/390/768/1280 for the new warehouse workflow. Full internal gate PASS. These are Linux/Chromium results, not Windows acceptance.

HTTP tests separately exercise real server endpoints, sandbox boundaries, image previews, startup and periodic scanner timers, rename, audit logs and restart. Mocked browser tests check KPIs, review/write counts, results, inspect/selected-preview/confirmed rename, opt-in popup, seen-state persistence and navigation to review without automatically importing, responsive/dark mode and existing receipt/catalog regressions; they are not Windows evidence.

Per-Product registration transactions are NOT one globally atomic batch. The UI states that earlier successful Products remain saved when a later Product fails. Progress reports completed requests, not live file-copy streaming.

Rename preview renders the first 100 rows (confirmation the first 50), with the complete mapping downloadable as CSV. All selected IDs are explicitly counted; no hidden auto execution. Windows file locks/long-path behavior, physical rename and complete restore still require acceptance on a copy/sandbox.

Check GitHub Actions for the exact delivered commit. Do not use a previous run as proof for a later revision.
