# V7.1 — bản main để kiểm thử Windows và iPhone

Đây là bản Cloud main-test, chưa gắn STABLE trước khi chủ shop nghiệm thu. Core local vẫn schema 130. Không cần kế thừa dữ liệu các bản test cũ.

## Bắt đầu

1. Tải main tại https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/archive/refs/heads/main.zip, giải nén vào thư mục mới.
2. Chạy START_SHOP.bat. Tạo/chọn kho test riêng trên giao diện như bản local. Không trỏ tới kho chứa dữ liệu cần giữ khi thử xóa/sửa.
3. Nhập hàng hoặc Import kho từ giao diện. Mỗi ảnh là một bộ; kiểm tra giá và size.
4. Cài đặt → Cloud: đăng nhập email tài khoản ứng dụng đã được cấp quyền owner. Tài khoản Google đăng nhập Dashboard Supabase không tự đăng nhập phần mềm. Mở liên kết xác nhận email; nếu email có mã thì nhập mã. Nếu liên kết mở sai trang, dùng phần hỗ trợ liên kết email tại màn hình đăng nhập, dán liên kết xác nhận chưa mở. Không cần Secret Key.
5. Đồng bộ ngay trên Windows. Chỉ bật Cloud sau khi dữ liệu và ảnh upload/verify hoàn tất. Ảnh gốc không bị nén lại trên nguồn; Cloud giữ một JPEG ≤150000 bytes. Khi mất mạng, tiếp tục bằng nút đồng bộ; không tạo ảnh trùng.
6. Mở QR/link chính thức: https://anphanguyen191-cell.github.io/SHOP_MECACAO_WEB/?cloud=1 trên iPhone, đăng nhập cùng tài khoản shop. Không nhập IP LAN, không cài CA cho luồng Cloud.

## Nghiệm thu trên kho tự tạo

- Tồn kho: giá/size/ảnh đúng trên Windows và iPhone; thử Nhỏ/Vừa/Lớn, sáng/tối, thanh chọn góc phải và bottom nav.
- Chọn ảnh → tạo nháp, sửa nháp, xuất PNG banner shop, chia sẻ; nháp chưa trừ tồn.
- Thu cọc → chốt SOLD → ghi thu tiền/giảm trừ/hoàn tiền. Xem công nợ, COD/giao hàng, báo cáo và hậu mãi. Bán từ iPhone khi laptop tắt; mở Windows lại để đối soát ảnh gốc bằng cơ chế archive core.
- Hai thiết bị cùng chọn một ảnh: chỉ một lần SOLD thành công; thiết bị còn lại đọc lại tồn. Khi kết quả thao tác chưa rõ do mất mạng, bấm Kiểm tra thao tác trước; không gửi yêu cầu mới.
- Kiểm kê: nhập số đếm/lý do, chốt phiên; không tự sửa số tồn.
- Ảnh iPhone → hộp chờ Cloud → nhận trên Windows → duyệt → nhập hàng → đồng bộ. Hộp chờ chưa tăng tồn.
- SOLD Cloud: chỉ dọn ảnh trên Windows sau khi đối soát và xác minh archive. Dữ liệu đơn/bút toán vẫn giữ. Không xóa ảnh chưa bán để giảm dung lượng.
- Giá/trạng thái sửa trên Cloud là giá trị chuẩn sau khi bật Cloud; đồng bộ Windows không ghi đè bằng giá cũ.

## Phạm vi và tiến độ

7.0–7.7 đã triển khai trong mã: hợp đồng/quyền, đăng nhập, đồng bộ ảnh, realtime/đọc bù, bán hàng/PNG, tiền/nợ/báo cáo/kiểm kê, inbox/SOLD/UI. 7.8 gồm gate Linux/Windows, trình duyệt mô phỏng Cloud và deploy main; xem Actions của commit tải xuống để xác nhận kết quả.

Kiểm thử tự động chỉ dùng kho/file giả lập và transaction SQL rollback. Test trình duyệt dùng transport Supabase giả lập; không thay thế đăng nhập email, upload Storage và nghiệm thu trên thiết bị thật. Đã có kiểm tra source hash, idempotency, xung đột phiên bản, giới hạn tiền, RLS và archive core. Bucket private JPEG hiện có giới hạn upload 2 MiB; app và RPC kiểm tra file thực tế ≤150000 bytes trước công nhận ảnh sẵn sàng.

Kho Cloud gắn một instance kho Windows để tránh gộp nhầm dữ liệu. Nếu cần đổi sang kho test hoàn toàn khác, phải reset Cloud có chủ đích; app không tự xóa Cloud mỗi lần mở/cập nhật. Luồng Cloud cần Internet để ghi; mất mạng chỉ đọc dữ liệu đã tải, không bán offline. Nút bật Cloud chặn ghi đơn/tiền local độc lập để tránh hai nguồn tồn/tiền.
