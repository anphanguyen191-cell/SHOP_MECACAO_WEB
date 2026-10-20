# Continuous Windows → Cloud sync after v8.0.334

## Cause

Windows was allowed to write LOCAL after activation, but `/cloud/business` only
asserted that its current snapshot still matched the previous upload. Any new
customer, draft, sale or receipt invalidated that marker, returning 409 before
the image upload phase. The original Cloud import also deliberately rejected
new snapshots after activation. Retrying the old path could never make progress.

## Repair

- Keep the existing Windows UI and Windows owner authentication. The source of
  truth stays in the same laptop database and physical photo warehouse.
- Add owner-only `mc_v8_business_sync` for an already bootstrapped source of the
  same warehouse. Preserve the original bootstrap RPC and its activation fence.
- Serialize updates under the same PostgreSQL business lock as mobile commands.
  Apply local mutable records and append new evidence atomically. Preserve
  Cloud-only records and immutable SOLD/financial proofs. Conflicting proofs
  reject the whole snapshot, with no count correction or history deletion.
- Windows `/business` now uploads each current snapshot after activation. Its
  pending request key is durable until a verified response, so a restart or lost
  response cannot duplicate sale/payment entries. A later snapshot uses a new key.
- Do not replay unknown Cloud SOLD records over authoritative Windows records.
  The final inventory reconciliation still refuses a Cloud-SOLD/local-stock
  conflict; resolving such a conflict requires comparing its actual proofs.
- Expose missing/unregistered, not-ready, unavailable, SOLD-conflicting and extra
  image IDs in the read-only preview. Ready counts exclude SOLD, as mobile does.
- Activation and folder acknowledgement remain behind full business, source and
  Storage verification. Failed sync is shown as failed, not completed.

## Release gates

The Windows workflow previously continued after a failed native test command in
its multi-command upgrade step. Every command now checks its exit status. The
verified live-process check allows 20 seconds for cold Windows CIM startup,
instead of silently losing verification after a five-second timeout.

`windows-continuous-sync-selftest.mts`, in `test:cloud`, runs the production router
with Windows authority, real SQLite services and isolated PostgreSQL. It verifies
new customer/draft/SOLD/payment uploads after activation, 3084→3149→3148 inventory
reconciliation, lost-response retry, no duplicated money/SOLD, immutable evidence
rollback, blocked reverse writes and no anonymous RPC access. Image publication
is a fixture; the existing image/Storage and DOM suites test that pipeline.

The lifecycle extension also tests OPEN→RESOLVED aftercare and multiple local
stocktake saves followed by closure between uploads. It updates only lifecycle
fields, preserving identity/snapshot triggers and immutable closed history.

The preview regression classifies a synthetic 65-image discrepancy as 53 not
registered and 12 unavailable. This is a test scenario, not a claim about the
shop's exact missing image IDs.

## Actual shop acceptance

Only the laptop can supply its current 3149 physical image IDs. Updating software
does not by itself prove those files reached Cloud. Keep the laptop open, use its
existing updater, then allow the signed-in owner auto-sync to finish. Compare
both exact image sets and business history; inspect any remaining conflict IDs.
Do not alter the laptop count or insert fake Cloud stock to make totals match.

## Deployment checkpoint — 20 October 2026

- Local `test:gate`, `test:cloud`, 22 sync-audit checks and the extended continuous
  Windows-mode lifecycle fixture passed.
- Supabase migration `20261020070109_windows_continuous_business_sync` is applied.
  RPC permissions and unchanged live order/SOLD/stock counts were verified.
- The write connection recovered after the owner renewed authorization.
  `20261020074627_continuous_mutable_history` is now applied too; read-back confirms
  lifecycle support and the unchanged owner-only / anonymous-denied RPC boundary.
- The Windows release still requires CI and installation through the existing
  updater. Neither schema deployment nor CI proves the laptop's current photos
  have already uploaded; verify exact IDs after its sync finishes.
