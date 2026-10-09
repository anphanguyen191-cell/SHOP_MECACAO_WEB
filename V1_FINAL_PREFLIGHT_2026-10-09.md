# V1 — Final pre-Windows checkpoint, 2026-10-09

Verdict: **LOCAL AUTOMATED GATES PASS; Windows and full restore UNVERIFIED; NOT STABLE.** Check the latest GitHub Actions run for its own result; no earlier CI run proves a later commit.

## Completed within V1

- Centralized request-scoped physical image reads: batched SQLite queries, one filesystem stat per image per snapshot, no persistent stock cache. Catalog, detail, inventory, autocomplete and dashboards continue to count registered physical files, never ledger quantities.
- Directories named like images do not count as stock. Inaccessible images surface an error instead of silently presenting zero stock. SKU search preserves the whole product's ledger total separately from physical stock.
- Existing Size imports are no longer skipped in the batch UI: newly discovered physical images can be registered idempotently without rewriting historical ledger quantities.
- Async receipt/folder selections retain the correct source path, ignore stale responses, lock inputs during processing, prevent double submission, clear submitted source selections and refresh receipt statistics after commit.
- Explicit loading/error/empty states and retry controls; debounced catalog requests; persisted theme/dashboard preferences; folder browsing and paste-path opening; refresh physical inventory; lazy gallery images with contain fit; readable labels, focus rings and reduced motion.
- Visual screenshot review caught an unstyled receipt form in dark mode; unified responsive form/card/input styling and added browser regressions for receipt layout and dark background.
- Full-backup verification checks manifest ID uniqueness and complete coverage against the SQLite snapshot, not just the files listed in the manifest. This is verification, **not a restore implementation**.
- Windows sandbox API rejects out-of-sandbox paths and symlink escapes. Database location is guarded. Launcher verifies backend sandbox identity, rejects an occupied health endpoint and rebuilds source rather than reusing stale dist.
- Dependencies are pinned in package-lock.json; CI and first-time Windows setup use npm ci. No architecture, schema migration or business data conversion added.

## Executed evidence

| Gate | Result |
|---|---|
| TypeScript / production build | PASS locally |
| Schema / migration snapshot | PASS locally |
| Core SQLite / rollback / 3 receipt flows / crash-recovery child processes | PASS locally |
| HTTP acceptance / restart / original SHA / full backup / sandbox boundaries | PASS, 30 business assertions plus expected HTTP statuses |
| UI source regressions | PASS, 23 checks |
| Real Chromium UI | PASS: DEMO and mocked LOCAL, widths 320/390/430/768/1280 across tested screens |
| Performance fixture | PASS: 250 products, 1000 Size/SKUs, 3000 JPEG files; catalog/explorer/dashboard reads prepare 3–4 SQL statements |
| Production dependency audit | PASS, 0 reported vulnerabilities |
| Windows runtime and user business acceptance | **UNVERIFIED** |
| Full lossless restore on Windows | **UNVERIFIED; blocker** |

Performance timing is Linux fixture evidence only, not a promise about the shop's Windows drive. No speedup ratio is claimed. Mocked LOCAL browser tests validate UI binding; real HTTP tests separately validate copy/DB behavior. Neither replaces Windows acceptance.

## Remaining gates

Use RUN_WINDOWS_V1_SAFE_TEST.bat and WINDOWS_V1_ACCEPTANCE_TEST.md in a fresh extracted source folder. Preserve any existing test sandbox and all real shop data. Full restore and corrupted-copy manual recovery remain separate sign-off requirements. Live receipt progress streaming is not implemented. No V2, cloud/LAN authentication or AI module was added.
