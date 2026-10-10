# Bản main mới — 3.4.0-stage6-main-test

Đầy đủ các chức năng đã triển khai chặng 1–4, Stage5A và Stage6; chưa STABLE nghiệm thu thiết bị thật. Không cần chạy đường dẫn DB V1 hoặc nối dữ liệu thử cũ.

## Chạy trên laptop Windows

1. Kiểm tra CI đúng bản main tại [Actions](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/workflows/pages.yml), tải [main.zip](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/archive/refs/heads/main.zip).
2. Giải nén vào thư mục mới. Cài Node.js 22.13+ hoặc Node 24, mở **START_SHOP.bat**. Giao diện phải hiện **3.4.0-stage6-main-test · MAIN TEST · chặng 6**.
3. Tạo kho của mình trên laptop, ví dụ `D:\KhoMeCaCao\Bộ gái hoa\Size 1\001.jpg`. Có thể kho trống rồi Nhập hàng COPY. Không cần marker hoặc script tạo kho mẫu.
4. Bấm **CHỌN KHO TRÊN MÁY** trước khi có dữ liệu → chọn kho. Ứng dụng tự mở lại. **Chọn kho chưa import ảnh**: quét/import có duyệt, hoặc Nhập hàng COPY ảnh từ nguồn.
5. Dùng đầy đủ tồn, nháp, khách/ship/PNG, xác nhận SOLD, tiền/công nợ, báo cáo/kiểm kê và backup/restore. Nhập COPY giữ nguồn; xác nhận SOLD theo cơ chế journal, không xóa ảnh SOLD.

Bản cài mới bắt đầu DB mới; đóng/mở cùng bản giữ DB/kho. DB `data/stage6-main-test/database/shop-stage6-main-test.db` không tự đọc stage4/V1. Giữ chặn root ổ đĩa, app-data, liên kết và kho đang thuộc bản cài khác. Không xóa hoặc tải đè bản cũ.

## Điện thoại cùng Wi-Fi

Chỉ cần launcher Windows ở trên. Mở **Mobile LAN** trong menu Windows:

1. Chọn IP mạng hiện tại, bấm **Tạo chứng chỉ HTTPS**.
2. Tạo tài khoản chủ shop (mật khẩu 14+ ký tự có chữ và số); thêm vai trò nếu cần.
3. Xác nhận mạng riêng và bấm **Bật Mobile LAN**. Giao diện hiện URL HTTPS để copy.
4. Bấm **Mở tải CA trong 10 phút**, mở URL tải CA trên Safari; cài và bật tin cậy đầy đủ cho CA. Xem [hướng dẫn iPhone/Firewall](STAGE6_MOBILE_LAN_SETUP.md).
5. Mở URL HTTPS trên điện thoại và đăng nhập. Giữ Windows chạy. Không mở router port forwarding ra Internet.

Không cần mkcert, lệnh tạo khóa, SETUP_LAN_USERS.bat hoặc START_SHOP_LAN.bat cho quy trình thông thường. START_SHOP_LAN.bat nay là alias mở cùng bản Windows và hướng dẫn dùng UI.

## Checklist nghiệm thu kho tự tạo

- Windows nhập COPY, scan/import, tồn/ảnh, nháp/contact/ship/PNG nhiều trang/SOLD, thu/cọc/hoàn, công nợ, báo cáo/CSV, kiểm kê và backup/phục hồi thử.
- iPhone tin cậy CA và mở HTTPS; owner/cashier/inventory/viewer có đúng quyền và menu; không truy cập chọn ổ đĩa/backup/restore/duyệt ảnh qua LAN.
- Hai thiết bị thấy thay đổi sau khoảng 4 giây. Cùng bán một ảnh: chỉ một SOLD; đơn thất bại không tự trừ thêm tồn.
- Ngắt Wi-Fi giữa thao tác: không báo thành công khi chưa được Windows xác nhận; đọc lại/tiếp tục cùng mã yêu cầu, tránh tạo yêu cầu mới khi kết quả còn chưa rõ.
- Gửi ảnh từ iPhone → hộp chờ Windows → duyệt bản sao → chuyển Nhập hàng và xác nhận. Nhận/duyệt ảnh chưa tăng tồn.
- Đổi/khóa tài khoản qua Windows: phiên điện thoại hết hiệu lực ngay. Tắt LAN ngắt điện thoại nhưng Windows vẫn dùng; mở lại ứng dụng LAN mặc định tắt.
- Sáng/tối, khối màu/biểu mẫu rõ và iPhone không tràn ngang. Nghiệm thu CA/Firewall/camera/chia sẻ trên thiết bị thật riêng với CI.

[Tổng hợp nền tảng](MAIN_CHECKPOINT_STAGE6_2026-10-11.md) · [Bằng chứng và giới hạn](STAGE6_TEST_REPORT.md).
