# Trạng thái hiện tại — V7.3.0

V7.3.0 bổ sung [Excel giá và lưu khách trong nháp](EXCEL_GIA_VA_KHACH_V7.3.0.md): xuất tồn theo Product/Size, xem trước và bổ sung từng giá còn thiếu, nhận biết giá 0 đã xác nhận, lịch sử/idempotency và chống ghi giá cũ. Khách trực tiếp được lưu cùng nháp khi chọn; trùng điện thoại gợi ý khách cũ, không tự ghi đè danh mục. SQLite thêm bảng trạng thái/nhật ký riêng, schema nghiệp vụ vẫn 130; Cloud thêm cột/hàm, không reset dữ liệu.

Main gồm kho theo ảnh trên Windows, Cloud dùng chung ngoài LAN, mobile, khách/nháp/SOLD, thu/cọc/hoàn/giảm/công nợ/giao hàng, báo cáo/CSV, kiểm kê, hộp ảnh iPhone, backup/restore và cập nhật Windows có phục hồi khi lỗi. Xem [đợt rà soát và sửa lỗi](AUDIT_FIXES_2026-10-13.md).

Một ảnh nguồn hiện hữu = một bộ tồn; sổ là dữ liệu đối soát riêng. Nháp chưa giữ/trừ hàng, SOLD bất biến. Cloud chỉ cho chọn ảnh đã đăng ký/sẵn sàng và chưa SOLD; Windows thiếu nguồn được tạm ngừng chọn bán khi đồng bộ, không xóa lịch sử. SOLD chỉ dọn ảnh Cloud sau archive Windows đã xác minh và chứng từ riêng tư ≤40KB đã giữ. Phiếu LOCAL/Cloud dùng chung bố cục đã duyệt.

DB Windows vẫn `data/stage6-main-test/database/shop-stage6-main-test.db`; bản managed giữ dữ liệu cố định ngoài thư mục chương trình. Cập nhật qua Cài đặt; không giải nén đè dữ liệu cũ. Một kho Windows nối một instance Cloud. Khi đã bật Cloud authority, bán hàng/giá dùng Cloud; Windows nhận lại giá và đối soát SOLD. LAN mặc định tắt khi khởi động, giữ tài khoản/chứng chỉ và thu hồi phiên theo quyền.

Kiểm thử chỉ dùng fixture/tạm; đối chiếu Actions đúng commit, không dùng kết quả baseline. Chưa STABLE: chưa nghiệm thu laptop/iPhone thật, CA/Firewall, share sheet và bàn phím Safari. Không có offline queue, snapshot incremental, tự chỉnh tồn, tích hợp ngân hàng/vận chuyển hay tự nhập trả. Cloud cần mạng; đối soát và đồng bộ nguồn cần laptop chủ shop mở.

Các checkpoint V1/V2/Stage1–6 là lịch sử. Không buộc kế thừa DB thử; không reset/xóa kho thật. Giữ request key/version/journal/hash/lock/recovery.
