# ROADMAP — SHOP MECACAO WEB

Development rules: `DEVELOPMENT_PRINCIPLES.md` (feature + workflow + polished UI together).

Statuses: BACKLOG / PROPOSED / APPROVED / IMPLEMENTING / TESTING / DONE / REJECTED

| Version | Milestone | Status |
|---|---|---|
| V0.1.2 | Foundation / local + GitHub preview | DONE / STABLE |
| V1.0 | Product + SKU + image-backed physical inventory | CI PASS; WINDOWS USER-REPORTED PASS 2026-10-10; full restore / STABLE checkpoint pending |
| V2.0 | Orders / sales / stock deduction | DRAFT SANDBOX IMPLEMENTED / SALE PENDING; sandbox drafts authorized; production sales gated on V1 STABLE + recovery/restore acceptance |
| V3.0 | Customers + receipt PNG | BACKLOG |
| V4.0 | Reports + stocktake | BACKLOG |
| V5.0 | PWA/mobile LAN workflow | BACKLOG |
| V6.0 | Local-first sync/cloud | BACKLOG |

The current V1 status is authoritative: owner reports successful Windows testing on 2026-10-10, and baseline f35375835757457bc7011f127a32f96d3856a060 has CI SUCCESS. See `V1_ACCEPTANCE_CHECKPOINT_2026-10-10.md` for scope. Full operational restore evidence / release checkpoint still need completion; do not invent per-case PASS or infer STABLE from old DONE/READY. Physical stock is the count of registered canonical Size images that still exist; ledger is history/reconciliation. Owner authorized sandbox draft implementation after the specification. See `V2_DRAFT_CHECKPOINT.md`; default V1 remains schema110. This does not release V2 sales or bypass the V1 full restore/STABLE gate.

## Gate rule
Do not begin the next milestone until the current milestone:
1. source/config/dependencies are reviewed;
2. build/typecheck pass;
3. startup/API health/database checks pass where automation can verify them;
4. user acceptance test passes;
5. PROJECT_STATE.md + CHANGELOG.md are updated;
6. a new baseline is locked.

Anything that cannot be verified must be marked UNVERIFIED, not PASS.
