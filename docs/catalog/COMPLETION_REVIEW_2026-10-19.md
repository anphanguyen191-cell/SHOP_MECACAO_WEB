# Customer Catalog — rà soát hoàn thiện 19/10/2026

Tiếp nối bản UI tham chiếu V1.1. Thay đổi chỉ nằm trong module khách và kiểm thử; không sửa giao dịch CORE, schema, quyền Cloud hay trạng thái Product công khai.

| Tình huống | Trước sửa | Sau sửa và bằng chứng |
|---|---|---|
| Mẫu yêu thích ở ngoài trang đầu | Bộ lọc chỉ tìm trong các Product đã tải | Đọc đúng từng ID công khai đã lưu, tối đa 4 yêu cầu đồng thời; kiểm thử lưu ID 22 ngoài trang đầu 20 mẫu |
| Tự cập nhật sau khi tải thêm | Danh sách quay về 20 mẫu | Đọc lại đủ số trang đã mở; kiểm thử vẫn đủ 22 mẫu sau chu kỳ cập nhật |
| Lỗi tải ảnh | Nút thử lại chỉ tải lại danh mục | Thử lại đúng gallery, giữ Product và Size đang xem; phản hồi cũ không ghi đè gallery mới |
| Sắp giá giảm dần | Giá chưa xác định có thể đứng trước giá thật | Giữ thứ tự backend; yêu thích xếp giá cần liên hệ sau giá xác định ở cả hai chiều |
| Phục hồi sau tải lại trang | Nội dung xác nhận phụ thuộc giỏ hiện tại | Lưu bản tóm tắt cùng token trước khi gửi; phục hồi mã và ID ảnh đã gửi dù giỏ hiện tại trống; không gửi thêm inquiry khi đã có receipt |
| Trình duyệt chặn localStorage | Có thể lỗi ngay khi mở Catalog | Vẫn duyệt mẫu được; chỉ gửi khi có thể lưu mã phục hồi an toàn, hiện lý do cụ thể nếu không lưu được |

`scripts/customer-catalog-recovery-dom.mjs` gắn component khách thật với transport cô lập để tái hiện các tình huống trên. Nó là một phần của `npm run test:catalog`, cùng kiểm tra model, SQL/RLS và Admin chuyển nháp. Không gửi inquiry thử vào dữ liệu Shop thật.

Bộ kiểm tra Chromium hiện có tiếp tục chạy 360/375/390/430/768/1024 và luồng tra Size, chọn ảnh + số lượng, giỏ, form, mất phản hồi và mã thành công. Kết quả của commit phát hành nằm ở GitHub Actions; bản kiểm tra trên thiết bị iPhone/Windows của chủ Shop vẫn là bước nghiệm thu thực tế.

Các khác biệt còn lại với ảnh concept: banner/bảng Size dùng tài nguyên đã đóng gói; không tự suy đoán nhãn Bé trai/Bé gái, không có lọc khoảng giá; Zalo/Messenger cần link chính thức. Tìm kiếm, yêu thích, lọc Size/còn hàng, sắp giá và hộp Admin là các chức năng hoạt động.
