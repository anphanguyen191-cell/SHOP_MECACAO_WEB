# V2 Windows sandbox acceptance — 2026-10-10

Owner reported in chat: “đã test ổn trên window hết 10 bước trên rồi bro”. This refers to the ten-step conversational guide following the first-time setup fix, not additional fault-injection scenarios in other documents.

## Accepted checkpoint

- Delivered source: `c6f73eae7c8bf02e44f611cee8c1cad7e41d9647`.
- GitHub Actions run `38029511584`: completed SUCCESS, independently verified; Linux verify, Windows Node22, Windows Node24 and deploy all SUCCESS.
- Windows: **USER-REPORTED PASS, all ten conversational steps**, including first-time launch, warehouse import, saved draft/duplicate warning, sale and cross-module stock, SOLD history, restart, AVAILABLE rename, full backup/restore into a separate warehouse and restored-store backup, and UI review.
- Scope: schema130 opt-in sales sandbox, port3007; restored sandbox3016. Evidence is the owner's report; no newly supplied per-step screenshots, Node version or logs. Do not infer manual hard-process crash or disk-full testing from this report.

## Remaining release work

This closes owner Windows acceptance for the delivered sandbox flow. It does not authorize migration of the business database, selling business stock or deletion of retained sold originals. Do not ask the owner to repeat the accepted ten steps without a changed behavior or defect.

1. Prepare a V2 LOCAL release plan: migration from the existing V1 database, complete backup, checked restore, preserved IDs/paths/prices/history and rollback before any sale. Validate on an isolated copy; prepare a reviewable launcher/configuration before activation approval.
2. Resolve sold-image retention separately. JPEG1280/quality82 exists but explicit visual-quality acceptance and cleanup policy are pending; retain sold originals meanwhile. Cleanup remains unimplemented and must not be inferred from Windows acceptance.
3. Record the remaining gates and final release evidence before business V2 STABLE. Keep V3 customers/payment/COD/PNG and V4 reports outside this release.

No runtime, schema or business data changed by this acceptance record.
