# CaCao Customer Catalog V1 — đối chiếu mẫu khách hàng

Ngày 18/10/2026. Tham chiếu: ảnh 10 khung khách hàng chủ Shop gửi trong cuộc trò chuyện. Ảnh 16 khung trước đó là Admin Mobile, không phải giao diện khách.

| Khung mẫu | Triển khai thực tế |
|---|---|
| 1. Trang chủ | Banner Mobile riêng có sẵn, thương hiệu Since 2023, mời tra Size, tìm mẫu, bốn mục Trang chủ / Sản phẩm / Bảng Size / Giỏ lựa. |
| 2. Danh sách | Grid responsive, ảnh kho thật, giá, tồn từng Size, tìm tên/mã, lọc Size/còn hàng, sắp giá trên toàn tập và phân trang. Trang danh sách tách khỏi hero trang chủ. |
| 3. Chi tiết | Ảnh lớn, thumbnail, vuốt, phóng to, mã mẫu, giá, tồn Size, thời gian nguồn, chọn nhanh hoặc từng ảnh. |
| 4. Từng ảnh thật | Giữ ID ảnh chính xác, kết hợp số lượng Shop chọn, tổng không vượt tồn từng Size hoặc 100 bộ/yêu cầu. Không đổi ảnh khách chỉ định. |
| 5. Tra Size | Cân nặng/chiều cao, nút gợi ý, thẻ Size khớp và khoảng số đo; 24 kg/112 cm trả Size 11. Khoảng trống/biên mơ hồ giữ đúng bảng, không nội suy hoặc tự khuyên tăng Size. |
| 6. Bảng Size đầy đủ | Ảnh SVG sẵn từ đúng 12 dòng đã khóa; xem ảnh lớn và bảng chữ. Không phải ảnh scan trang trí trong hình minh họa. |
| 7. Giỏ | Ảnh, tên/Size, giá, ID ảnh đã chọn, tăng/giảm phần Shop chọn sau khi đọc lại tồn, bỏ ảnh/dòng, sửa lựa chọn; tạm tính và nút tiếp tục trên thanh riêng không đè điều hướng. |
| 8. Gửi yêu cầu | Bước liên hệ riêng sau kiểm tra tồn/giá; tên, liên hệ, ghi chú, đồng ý; xem danh sách, quay lại sửa. Không bắt đăng nhập. |
| 9. Thành công | Xác nhận, mã yêu cầu có thể sao chép, mở kênh liên hệ khi đã cấu hình, tiếp tục lựa hàng. Mất phản hồi dùng cùng token để không gửi trùng; giỏ mới không hiển thị mã cũ. |
| 10. Hộp Admin | Lọc trạng thái, tìm mã/tên/liên hệ trong trang đang tải, số bộ, thời gian Việt Nam, xem và phân bổ ảnh rồi tạo đúng một nháp CORE. Không tự xác nhận bán. |

## Điểm khác có chủ đích / chưa có trong V1

- Banner và ảnh bảng Size là tài nguyên đã đóng gói từ thương hiệu/dữ liệu Shop; không dùng ảnh hàng minh họa thay cho hàng thật. Bố cục và hình trang trí không cam kết trùng từng pixel ảnh tham khảo.
- Bé trai/Bé gái, lọc khoảng giá và yêu thích chưa nằm trong hợp đồng công khai hiện tại. Không gắn nhãn phân loại suy đoán hoặc làm nút bấm giả. Tìm kiếm, lọc Size/còn hàng và sắp giá đã hoạt động.
- Zalo/Messenger chỉ hiện khi có link chính thức đã cấu hình. Hộp yêu cầu Admin nhận trực tiếp, không phụ thuộc hai kênh này. Không tự xác nhận số điện thoại là tài khoản Zalo.
- Tạo yêu cầu, giỏ, ảnh chọn và nháp không giữ hàng, không trừ tồn. CORE xác nhận bán mới trừ tồn.

## Kiểm tra

Build/TypeScript; PostgreSQL WASM chạy migration thật; model; owner/non-owner và nháp CORE bằng DOM; tìm yêu cầu; cấu hình sẵn. Chromium chạy sáu kích thước 360/375/390/430/768/1024, tải preset thật từ bundle qua transport test, kiểm tra điều hướng/Size/giỏ/form/receipt, phục hồi mất phản hồi, giỏ mới sau receipt, không tràn ngang và thanh thao tác không che thanh điều hướng. Transport giả lập không gửi yêu cầu test vào kho thật.

Bài kiểm tra thông báo kho hiện có được sửa để chờ PATCH đánh dấu đã xem tới server trước khi so sánh, vì điều hướng có thể vẽ trước HTTP. Giữ nguyên kiểm tra trạng thái phải là seen; không thay nghiệp vụ thông báo.

CI và phát hành theo commit cần kiểm tra tại GitHub Actions. Nghiệm thu iPhone thật do chủ Shop thực hiện.
