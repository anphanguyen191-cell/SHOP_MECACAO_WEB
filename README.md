# SHOP MECACAO WEB

Greenfield local-first web app cho Shop Mẹ CaCao.

## Stable baseline
**V0.1.2 — Foundation Stable**

- Frontend: React + TypeScript + Vite + PWA
- Local API: Node.js + Express
- Database: SQLite via built-in `node:sqlite`
- Local production: `http://localhost:3000`
- GitHub Pages: DEMO/PREVIEW
- Windows acceptance test: PASS
- Không yêu cầu Visual Studio Build Tools

## Windows
1. Node.js 22+.
2. Chạy `scripts/SETUP_FIRST_TIME.bat` lần đầu.
3. Chạy `START_SHOP.bat`.
4. Local app: `http://localhost:3000`.
5. Dữ liệu local: `data/shop.db`.

## Project governance
- `DEVELOPMENT_PRINCIPLES.md`: nguyên tắc bắt buộc về an toàn dữ liệu và hoàn thiện chức năng/giao diện cùng nhau.
- `PROJECT_STATE.md`: source of truth.
- `CHANGELOG.md`: lịch sử baseline/fix.
- `ROADMAP.md`: roadmap và gate.
