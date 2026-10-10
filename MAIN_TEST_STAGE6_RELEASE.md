# MAIN TEST — Stage 5A + Stage 6 (bản thử Windows/iPhone)

**Phiên bản:** `3.3.1-stage6-main-test`. Đây là phiên bản MAIN TEST để chủ shop nghiệm thu, **chưa STABLE**.

## Chạy trên Windows
1. Sau khi CI trên main đạt, tải ZIP: https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/archive/refs/heads/main.zip.
2. Giải nén vào **thư mục hoàn toàn mới**; không chép đè bản Stage 4, không tự nối SQLite các bản thử trước.
3. Cài Node.js 22.13+ hoặc Node 24. Mở `START_SHOP.bat`; kiểm tra trên giao diện hiện nhãn MAIN TEST và phiên bản `3.3.1-stage6-main-test`.
4. Tạo thư mục kho trên laptop, ví dụ `D:\KhoTestMeCaCao\Bộ gái hoa\Size 1\001.jpg`. Có thể bắt đầu kho trống rồi dùng Nhập hàng COPY ảnh từ nguồn. `CREATE_MAIN_TEST_WAREHOUSE.bat` chỉ là lựa chọn tạo ảnh demo nhanh, không bắt buộc.
5. Trên giao diện bấm **CHỌN KHO TRÊN MÁY** trước khi có dữ liệu → chọn thư mục kho tự tạo. App tự khởi động lại. Quét/import có duyệt để đăng ký ảnh sẵn có, hoặc nhập COPY từ nguồn; rồi thao tác nháp, PNG, SOLD, tiền, báo cáo, kiểm kê và backup/restore như nghiệp vụ bình thường. Không cần marker.
6. DB thử của release nằm trong `data/stage6-main-test/database/shop-stage6-main-test.db`, tách biệt `data/stage4`. Kho đã chọn là nơi ứng dụng thao tác nhập/đổi tên/bán khi người dùng duyệt. Chọn kho trên UI không tự import ảnh. API vẫn chặn cả ổ đĩa, thư mục dữ liệu app, liên kết và kho đang thuộc bản cài khác.

## Bật Mobile LAN HTTPS để thử trên iPhone cùng Wi-Fi
1. Mở `SETUP_LAN_USERS.bat` để tạo tài khoản. Chuẩn bị `data/stage6-main-test/lan/cert.pem` và `key.pem` khớp với IP Wi-Fi Windows; CA phải được tin cậy trên iPhone.
2. Chỉ khi firewall giới hạn TCP 3443 trong LAN, không cấu hình router port forwarding, mới chạy `START_SHOP_LAN.bat`.
3. Safari iPhone mở `https://IP-WINDOWS:3443`; đăng nhập. Kiểm tra Tồn kho, Khách hàng, Bán hàng, Công nợ, Kiểm kê và gửi ảnh test. Xem ảnh vừa gửi trong hộp chờ Windows → Duyệt bản sao → chuyển Nhập hàng. Bước duyệt không tự cộng tồn.
4. Thử mất Wi-Fi giữa lúc xác nhận, đổi tài khoản owner/cashier/inventory/viewer, restart và kiểm tra chống bán trùng.

## Điều kiện chấp nhận
- CI Linux, Windows Node 22/24 và trình duyệt PASS cho đúng commit release.
- Đủ chức năng trên thiết bị Windows/iPhone thật với kho thử và dữ liệu giả.
- Nhập COPY giữ ảnh nguồn; xác nhận bán chuyển ảnh canonical sang vùng SOLD theo cơ chế đã có, giảm tồn đúng một lần; Stage5A không có thao tác dọn/xóa ảnh gốc. Không đổi DB Stage4.
- Đối chiếu UI màu sắc, card, biểu mẫu, màn hình sáng/tối, iPhone không tràn ngang.
- Chủ shop được chọn kho tự tạo để nghiệm thu; bản vẫn đang phát triển, chưa STABLE. Mọi kiểm thử tự động của Codex/CI chỉ dùng ảnh và DB giả lập.

Chi tiết: [hướng dẫn LAN](STAGE6_MOBILE_LAN_SETUP.md), [checkpoint](PREVIEW_CHECKPOINT_STAGE5_STAGE6_2026-10-10.md).
