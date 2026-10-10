# V2 LOCAL preparation checkpoint — 2026-10-10

Owner authorized steps1–2 following Windows sandbox acceptance: prepare LOCAL packaging and validate V1→V2 on a copy. Delivered new Windows preparation/review launchers and schema110 verified-backup-only preparation; no business activation or runtime sandbox gate bypass.

`prepareLocalV2` reads source recovery bundle, rejects schema≠110/overlapping or existing targets/corruption/invalid warehouse or Size metadata, checks available disk, restores into new candidate, verifies decoded originals, compares full business rows/IDs/sequences/settings after 110→120→130 migration, creates verified full V2 backup and restores it again, restores original V1 separately as rollback proof. Original DB and warehouse are never opened for writing. READY_FOR_REVIEW is the final durable marker only after all evidence; unfinished directories retained. Watch startup/periodic/autoRename disabled in copies; cache removed with explicit documentation. Ledger discrepancy retained, stock from images.

Review launcher explicitly selects a package (no automatic latest activation), checks marker/physical DB/integrity/schema, loopback3017, sandbox guards retained and clear copy-review UI banner. No fixture generation on restart. Review sales remain copy-only; source V1 is unchanged. Files/steps: `WINDOWS_V2_LOCAL_PREPARATION.md`.

Validation: new preparation95 assertions PASS, ten real process exits; new interactive prepare/review HTTP33 assertions PASS locally, source bytes/DB preserved, spaced/accented paths, IDs/ledger mismatch, sale/restart/full backup and path denial. Full existing test:gate PASS (TypeScript, V1/V2 unit/crash/restore, build and UI31). Linux CI adds Chromium copy-banner/no-overflow desktop/mobile light/dark screenshots; Windows22/24 run new service and actual interactive launchers/HTTP. Exact final CI results must be checked for the delivered commit.

Remaining: owner copy-data review, business activation design/approval/fresh cutover backup, live migration/rollback procedure, explicit optimized-photo quality and deletion policy. No business V2 STABLE claim; no sold-original deletion; no V3.
