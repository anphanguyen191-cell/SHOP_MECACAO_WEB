# PROJECT STATE — SHOP MECACAO WEB

Updated: 2026-10-06

## Current baseline
- Version: **V0.1.1**
- Codename: **Foundation local setup patch**
- Status: **TESTING**
- Stable baseline: **NO — local retest pending**

## Architecture decisions — APPROVED
1. Greenfield; không phụ thuộc core desktop cũ.
2. Local-first web app.
3. React + TypeScript + Vite + PWA frontend.
4. Node.js + Express local API.
5. SQLite local database.
6. Dùng built-in `node:sqlite`; không dùng native npm SQLite addon cần Visual Studio Build Tools.
7. GitHub = source/version/preview; không lưu dữ liệu shop thật.
8. GitHub Pages = DEMO/PREVIEW.
9. Local production = `http://localhost:3000`.
10. Proposal → Approve → Implement → Test → PASS → Baseline.

## PASS
- [x] GitHub repository.
- [x] GitHub Actions install/build.
- [x] GitHub Pages deploy.
- [x] iPhone preview.
- [x] DEMO mode detection.

## Local test history
- V0.1 initial local setup: **FAIL**.
- Root cause: `better-sqlite3` attempted native compilation on Node 24 and required Visual Studio Build Tools.
- Decision: **do not require Visual Studio/C++ toolchain**.
- Patch V0.1.1: replaced `better-sqlite3` with Node built-in `node:sqlite`.

## RETEST REQUIRED
- [ ] Download/refresh V0.1.1 source.
- [ ] `SETUP_FIRST_TIME.bat` → PASS.
- [ ] `START_SHOP.bat` → localhost.
- [ ] Badge → LOCAL.
- [ ] `data/shop.db` created.

## Next milestone after PASS
**V1.0 — Product + SKU + Inventory Ledger**
