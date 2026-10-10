## Test Windows V2 bán hàng trọn luồng

Chạy `RUN_WINDOWS_V2_SALES_TEST.bat` (3007, V2SalesSandbox riêng). Có confirm bán trong kho test, lịch sử ảnh nhẹ, restart và full backup/restore130. Xem [WINDOWS_V2_SALES_TEST.md](WINDOWS_V2_SALES_TEST.md). Gốc giữ staging, chưa xóa/chưa bật kho thật/STABLE.

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

### Thử full restore ở vị trí mới

Trong Cài đặt sandbox: backup đầy đủ → Phục hồi thử sang kho mới → READY. Chạy `RUN_WINDOWS_RESTORED_SANDBOX_TEST.bat` chọn1 V2 / 2 V1 để mở3016; source3005/3006 giữ nguyên. Scope/evidence/Windows steps: [V2_BACKUP_RESTORE_CHECKPOINT.md](V2_BACKUP_RESTORE_CHECKPOINT.md). Chưa tự chuyển DB đang dùng hay release bán hàng.
