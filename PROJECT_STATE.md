# Trạng thái hiện tại — MAIN TEST 3.4.0-stage6-main-test

Chặng 6 đã được hoàn thiện phần mềm: quản lý HTTPS/tài khoản/bật tắt LAN ngay trên Windows, giao diện dùng chung trên điện thoại, quyền API, cập nhật gần thời gian thực và hộp ảnh iPhone. Chưa STABLE: cần nghiệm thu Windows/iPhone vật lý, CA và Firewall trên mạng shop.

Nguồn nền tảng phát triển tiếp: [checkpoint tổng hợp](MAIN_CHECKPOINT_STAGE6_2026-10-11.md). Cách tải/chạy: [hướng dẫn bản main](MAIN_TEST_STAGE6_RELEASE.md). Thiết lập điện thoại: [hướng dẫn LAN](STAGE6_MOBILE_LAN_SETUP.md). Bằng chứng: [test report](STAGE6_TEST_REPORT.md), [Actions](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/workflows/pages.yml).

| Phạm vi | Trạng thái hiện tại |
|---|---|
| Chặng 1–2 | Kho theo ảnh, nhập COPY/scan/import/rename, chia sẻ, nháp/bán/SOLD, khách/contact snapshot, ship và PNG; backup/recovery/restore |
| Chặng 3 | Thu/cọc/hoàn/điều chỉnh, COD/chuyển khoản/tiền mặt, công nợ, giao hàng/vận đơn, hậu mãi |
| Chặng 4 | Báo cáo doanh số/dòng tiền/lãi gộp/thiếu vốn/CSV; kiểm kê không tự chỉnh tồn |
| Chặng 5A | Kiểm chứng ảnh SOLD chỉ đọc; chưa có 5B di chuyển lưu trữ hoặc 5C xóa |
| Chặng 6 | HTTPS cùng LAN, 4 vai trò, session/audit, polling, ảnh chờ; toàn bộ thiết lập thông thường bằng UI |
| Windows | START_SHOP.bat; chọn kho tự tạo trên UI trước dữ liệu; đầy đủ chức năng LOCAL của main |
| Dữ liệu | Thư mục cài mới có DB mới; mở lại cùng bản giữ DB/kho; không bắt nối dữ liệu thử cũ |
| Giao diện | Khối chức năng sáng/tối có màu rõ, responsive, phiên bản và tiến độ hiển thị |
| Chưa triển khai | Cloud/truy cập ngoài LAN/offline queue, Stage5B/5C, tự chỉnh tồn, ngân hàng/vận chuyển tự động |

DB của bản này vẫn là `data/stage6-main-test/database/shop-stage6-main-test.db`. LAN mặc định tắt mỗi lần mở ứng dụng, bật trên giao diện khi cần. TLS dùng chung Express/SQLite với LOCAL, không tạo kho hoặc DB thứ hai. Tài khoản/chứng chỉ giữ trong bản cài; đổi tài khoản qua UI thu hồi mọi phiên điện thoại ngay.

Kiểm thử Codex/CI chỉ dùng ảnh/SQLite/thư mục tạm giả lập. Chủ shop được chọn kho tự tạo và thao tác như kho thật; không cần marker fixture. Tồn theo ảnh canonical còn hiện hữu, nháp không giữ/trừ hàng, SOLD bất biến. Giữ transaction/request key/version/journal/hash/lock/recovery; backup không thay thế nghiệm thu CA/Firewall/iPhone.

Các checkpoint V1/V2 và Stage1–5 trước đây là lịch sử, không thay trạng thái hiện tại. Baseline trước bản này: `5ab31e27925f67089d6593841ed51fb45b393763` (3.3.1). Quyền triển khai phần đã duyệt và đưa main/CI đã có; ngoài phạm vi đề xuất riêng.
