# MAIN TEST — Stage 5A + Stage 6 (bản thử Windows/iPhone)

**Phiên bản:** `3.3.0-stage6-main-test`. Đây là phiên bản MAIN TEST để chủ shop nghiệm thu, **chưa STABLE**.

## Chạy trên Windows
1. Sau khi CI trên main đạt, tải ZIP: https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/archive/refs/heads/main.zip.
2. Giải nén vào **thư mục hoàn toàn mới**; không chép đè bản Stage 4, không dùng ảnh hoặc SQLite thật.
3. Cài Node.js 22.13+ hoặc Node 24. Mở `START_SHOP.bat`; kiểm tra trên giao diện hiện nhãn MAIN TEST và phiên bản `3.3.0-stage6-main-test`.
4. Chạy `CREATE_MAIN_TEST_WAREHOUSE.bat` tạo ảnh giả lập trong `data/stage6-main-test-fixture`.
5. Trên Windows bấm Chọn kho → chỉ chọn kho thử có marker vừa tạo. Quét/import mẫu giả, thực hiện thử chọn ảnh, đơn nháp, SOLD, công nợ, thu tiền, báo cáo, kiểm kê, backup/restore test.
6. DB thử của release nằm trong `data/stage6-main-test/database/shop-stage6-main-test.db`, tách biệt `data/stage4`. Không nhập kho kinh doanh: launcher/API sẽ chặn kho thường không có marker.

## Bật Mobile LAN HTTPS để thử trên iPhone cùng Wi-Fi
1. Mở `SETUP_LAN_USERS.bat` để tạo tài khoản. Chuẩn bị `data/stage6-main-test/lan/cert.pem` và `key.pem` khớp với IP Wi-Fi Windows; CA phải được tin cậy trên iPhone.
2. Chỉ khi firewall giới hạn TCP 3443 trong LAN, không cấu hình router port forwarding, mới chạy `START_SHOP_LAN.bat`.
3. Safari iPhone mở `https://IP-WINDOWS:3443`; đăng nhập. Kiểm tra Tồn kho, Khách hàng, Bán hàng, Công nợ, Kiểm kê và gửi ảnh test. Xem ảnh vừa gửi trong hộp chờ Windows → Duyệt bản sao → chuyển Nhập hàng. Bước duyệt không tự cộng tồn.
4. Thử mất Wi-Fi giữa lúc xác nhận, đổi tài khoản owner/cashier/inventory/viewer, restart và kiểm tra chống bán trùng.

## Điều kiện chấp nhận
- CI Linux, Windows Node 22/24 và trình duyệt PASS cho đúng commit release.
- Đủ chức năng trên thiết bị Windows/iPhone thật với kho thử và dữ liệu giả.
- Không xoá hoặc chuyển ảnh nguồn/SOLD, không đổi DB Stage 4.
- Đối chiếu UI màu sắc, card, biểu mẫu, màn hình sáng/tối, iPhone không tràn ngang.
- Chưa được dùng kho thật và chưa gọi STABLE trước khi chủ shop nghiệm thu.

Chi tiết: [hướng dẫn LAN](STAGE6_MOBILE_LAN_SETUP.md), [checkpoint](PREVIEW_CHECKPOINT_STAGE5_STAGE6_2026-10-10.md).
