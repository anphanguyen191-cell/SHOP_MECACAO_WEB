# PROJECT STATE — SHOP MECACAO WEB

Updated: 2026-10-06

## Current baseline

- Version: **V0.1**
- Codename: **Foundation**
- Status: **READY FOR USER TEST**
- Stable baseline: **NO — pending user test**

## Architecture decisions — APPROVED

1. Greenfield project; không phụ thuộc core desktop cũ.
2. Local-first web app.
3. React + TypeScript + Vite + PWA cho frontend.
4. Node.js + Express cho local API.
5. SQLite là database local chính.
6. GitHub dùng cho source/version/test preview; không lưu dữ liệu shop thật.
7. GitHub Pages chạy DEMO/PREVIEW mode.
8. Local production chạy tại `http://localhost:3000`.
9. Module hóa để tránh phụ thuộc chéo.
10. Mọi phát triển mới phải Proposal → Approve → Implement → Test → PASS → Baseline.

## DONE in V0.1

- [x] Monorepo foundation.
- [x] Web shell responsive.
- [x] PWA build foundation.
- [x] Local API `/api/health`.
- [x] SQLite bootstrap + metadata.
- [x] LOCAL/DEMO mode indicator.
- [x] Windows first-time setup script.
- [x] Windows start script.
- [x] GitHub Pages Actions workflow.
- [x] Project governance files.
- [x] Clean GitHub repository connected.

## TESTING

- [ ] GitHub Actions build.
- [ ] GitHub Pages preview on iPhone.
- [ ] Setup on actual Windows laptop.
- [ ] `START_SHOP.bat` opens localhost correctly.
- [ ] Local badge shows `LOCAL`.
- [ ] PWA installability on target devices.

## NOT STARTED

- Product master.
- SKU / variants.
- Inventory ledger.
- Stock import/export/adjustment.
- Orders.
- Customers.
- Receipt PNG.
- Reports.
- LAN mobile access.
- Cloud sync.

## Next milestone after V0.1 PASS

**V1.0 — Product + SKU + Inventory Ledger**

Do not start V1.0 until V0.1 is user-tested and this file is checkpointed as STABLE.
