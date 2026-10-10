# Báo cáo kiểm thử main — 3.0.1-stage2

Ngày xác nhận: 10/10/2026. Baseline runtime: [`099386ad48cef9babb525eb2d43e63fe22099449`](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/commit/099386ad48cef9babb525eb2d43e63fe22099449). [Actions 38042560022](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/runs/38042560022): **Linux, Windows Node 22, Windows Node 24, deploy đều SUCCESS**.

| Kiểm tra | Kết quả / Phạm vi |
|---|---|
| Toàn bộ gate | PASS: typecheck/schema/core/performance/warehouse/sharing/drafts/preflight/preview/archive/staging/commit/confirm/sales/restore/tasks/stage2/build/source UI |
| Chặng 2 service | PASS 26 kiểm tra khách trùng/version, snapshot, ship/miễn ship, tiền/overflow/idempotency, PNG nhiều trang, SOLD khóa sửa, restart/restore |
| HTTP bản cài mới | PASS 35 kiểm tra DB rỗng, metadata phiên bản/chặng, chọn kho UI, scan/import, khóa server trùng, nguồn COPY, contact/đơn/PNG, origin, restart/bán/backup DIRECT/restore READY |
| Launcher và UI main | Chromium PASS: chạy launcher chính trong bản cài tạm, phiên bản/tiến độ, folder picker, chọn kho, tự restart, reload đúng kho |
| Browser nghiệp vụ | PASS các luồng chọn ảnh/nháp, cảnh báo, lưu contact/ship, PNG, bán/lịch sử/khóa SOLD, full restore UI |
| Giao diện | PASS 1366px và 390px sáng/tối; ảnh CI đã xem, màu nhóm/viền/chữ rõ, không tràn ngang; kiểm tra source UI PASS 31 mục |
| Hồi quy tương thích | CI PASS setup/biến môi trường, V1 backup → bản sao LOCAL V2, rollback và API trong kho giả lập |
| GitHub Pages | Deploy SUCCESS sau Linux và cả Windows; Pages là DEMO, không kết nối DB/kho shop |

Toàn bộ kiểm thử dùng fixture/thư mục tạm. Không truy cập kho kinh doanh của chủ shop. Browser chạy trong CI Linux; host phát triển không cài/chạy Chromium cho nhiệm vụ này. Mã runtime của bản main đầy đủ chức năng LOCAL được kiểm chứng, không chỉ một UI mock.

## Giới hạn

- Chủ shop chưa xác nhận nghiệm thu Windows **bản 3.0.1-stage2**. Các PASS chủ shop của checkpoint cũ không áp dụng tự động cho bản này.
- Cầu nối clipboard và kiểm tra Windows có trong source/CI; việc Ctrl+V vào Zalo/Messenger thực tế của chủ shop chưa được xác nhận. Web Share phụ thuộc thiết bị/trình duyệt.
- Không gắn STABLE chỉ từ CI; không khẳng định mọi lỗi thực tế đã được loại bỏ.
- COD/chuyển khoản/thu tiền/công nợ/hậu mãi, báo cáo đầy đủ, LAN/cloud chưa triển khai.
- Backup SQLite hoặc ảnh nén riêng không thay full backup. Restore thử tạo vùng mới, không tự chuyển DB đang dùng.

Cập nhật tổng hợp tài liệu sau baseline này không đổi mã chạy hoặc phiên bản runtime. Nếu mã chạy đổi, cần CI mới tương ứng; không dùng PASS của baseline thay cho code mới. Phạm vi chức năng/kiến trúc để phát triển tiếp nằm trong [MAIN_CHECKPOINT_2026-10-10.md](MAIN_CHECKPOINT_2026-10-10.md).
