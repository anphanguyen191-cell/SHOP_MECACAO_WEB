# PROJECT STATE — SHOP MECACAO WEB

Updated: 2026-10-06

## Current baseline
- Version: **V0.1.2**
- Codename: **Foundation Stable**
- Status: **DONE / STABLE**
- Stable baseline: **YES**
- User acceptance test: **PASS — Windows laptop + iPhone GitHub Preview**

## Architecture decisions — APPROVED
1. Greenfield; không phụ thuộc core desktop cũ.
2. Local-first web app.
3. React + TypeScript + Vite + PWA frontend.
4. Node.js + Express local API.
5. SQLite local database via built-in `node:sqlite`.
6. Không dùng native SQLite npm addon cần Visual Studio Build Tools.
7. GitHub = source/version/preview; không lưu dữ liệu shop thật.
8. GitHub Pages = DEMO/PREVIEW.
9. Local production = `http://localhost:3000`.
10. Development gate: Proposal → Approve → Implement → Internal checks → User Test → PASS → Baseline.
11. Không giao user test khi chưa qua pre-test gate; phần không thể xác minh phải ghi UNVERIFIED.

## V0.1.2 PASS checklist
- [x] GitHub repository/source.
- [x] GitHub Actions install/build.
- [x] GitHub Pages deploy.
- [x] iPhone preview.
- [x] DEMO mode detection.
- [x] Windows Node/npm environment.
- [x] `SETUP_FIRST_TIME.bat` → SETUP PASS.
- [x] API/frontend production build.
- [x] `START_SHOP.bat` startup patch.
- [x] `http://localhost:3000` reachable.
- [x] LOCAL mode detection.
- [x] `data/shop.db` created.

## Defects found and closed
1. `better-sqlite3` required native compilation/Visual Studio Build Tools on Node 24.
   - Resolution: replaced with built-in `node:sqlite`.
2. Initial Windows startup script opened browser while server was unavailable / quoting was fragile.
   - Resolution: V0.1.2 startup waits for `/api/health` before opening browser and preserves server error output.

## Known non-blocking item
- GitHub Preview mobile navigation can overflow horizontally; defer UI polish until feature UI exists.

## Next milestone
**V1.0 — Product + SKU + Inventory Ledger**

Status: **PROPOSAL REQUIRED — implementation must not start until user approves scope.**
