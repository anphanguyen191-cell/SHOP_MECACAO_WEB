# ROADMAP — SHOP MECACAO WEB

Statuses: BACKLOG / PROPOSED / APPROVED / IMPLEMENTING / TESTING / DONE / REJECTED

| Version | Milestone | Status |
|---|---|---|
| V0.1.2 | Foundation / local + GitHub preview | DONE / STABLE |
| V1.0 | Product + SKU + Inventory Ledger | PROPOSED NEXT |
| V2.0 | Orders / sales / stock deduction | BACKLOG |
| V3.0 | Customers + receipt PNG | BACKLOG |
| V4.0 | Reports + stocktake | BACKLOG |
| V5.0 | PWA/mobile LAN workflow | BACKLOG |
| V6.0 | Local-first sync/cloud | BACKLOG |

## Gate rule
Không bắt đầu milestone kế tiếp cho đến khi milestone hiện tại:
1. source/config/dependencies được rà;
2. build/typecheck PASS;
3. startup/API health/database checks PASS ở mức có thể kiểm tự động;
4. user acceptance test PASS;
5. `PROJECT_STATE.md` + `CHANGELOG.md` cập nhật;
6. baseline mới được khóa.

Mọi hạng mục chưa thể xác minh phải ghi **UNVERIFIED**, không được coi là PASS.
