# ROADMAP — SHOP MECACAO WEB

Statuses: BACKLOG / PROPOSED / APPROVED / IMPLEMENTING / TESTING / DONE / REJECTED

| Version | Milestone | Status |
|---|---|---|
| V0.1.2 | Foundation / local + GitHub preview | DONE / STABLE |
| V1.0 | Product + SKU + image-backed physical inventory | AUTOMATED GATE PASS; PRE-WINDOWS ACCEPTANCE; NOT STABLE |
| V2.0 | Orders / sales / stock deduction | BLOCKED — V1 acceptance incomplete |
| V3.0 | Customers + receipt PNG | BACKLOG |
| V4.0 | Reports + stocktake | BACKLOG |
| V5.0 | PWA/mobile LAN workflow | BACKLOG |
| V6.0 | Local-first sync/cloud | BACKLOG |

The current V1 status is authoritative: automated checks pass, but Windows acceptance and full restore verification remain unverified. Do not infer V1 STABLE from historical DONE, READY, or older checkpoint text. Physical stock is the count of registered canonical Size images that still exist; the ledger is for history and reconciliation.

## Gate rule
Do not begin the next milestone until the current milestone:
1. source/config/dependencies are reviewed;
2. build/typecheck pass;
3. startup/API health/database checks pass where automation can verify them;
4. user acceptance test passes;
5. PROJECT_STATE.md + CHANGELOG.md are updated;
6. a new baseline is locked.

Anything that cannot be verified must be marked UNVERIFIED, not PASS.
