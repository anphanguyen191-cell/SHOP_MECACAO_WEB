# Shop Mẹ CaCao — Customer Catalog UI Reference V1.1
Ngày triển khai: 18/10/2026. Nguồn so sánh: ảnh tham chiếu 10 màn hình của chủ Shop.
Trạng thái: Đang kiểm thử. Không tự công nhận STABLE nếu chưa nghiệm thu iPhone/Windows thật.

## Phạm vi và các quy tắc không được thay đổi

- Một `main`, giữ nguyên Windows, Mobile Admin, kho thật, phân quyền, Cloud Auth, chế độ SOLD và việc chuyển đơn nháp qua CORE RPC.
- Khách chỉ gửi yêu cầu lựa hàng, không giữ hàng hoặc trừ tồn.
- Kết hợp đúng ID ảnh khách chọn và số lượng nhanh; tổng không vượt tồn Size.
- Không tự thêm nhãn giới tính/danh mục nếu nguồn sản phẩm chưa có metadata. Không tạo ảnh sản phẩm AI thay ảnh thật.
- Không tự mở thêm Product hoặc tự thêm URL Zalo/Messenger. Không reset database, không xóa Cloud.

## Checklist 10 màn hình (đã sửa trong source)

| Mã | Màn hình | Hạng mục chính | Kiểm tra |
|---|---|---|---|
| CC-01 | Trang chủ | Banner mới phong cách em bé, logo hồng, Since 2023; thẻ tra Size có minh họa + hai hành động; icon tìm kiếm và giỏ | Banner đúng tỉ lệ trên iPhone; không lộ số tài khoản |
| CC-02 | Danh sách | Product thật; lưới hai cột, ảnh trọn vẹn; tim Yêu thích lưu trên thiết bị; chip chức năng; tồn Size rõ; phân trang/tìm/sắp xếp cũ còn nguyên | Thao tác tim và bộ lọc không làm thay đổi tồn |
| CC-03 | Chi tiết | Ảnh lớn contain, thumbnail, giá nổi bật, Size/tồn dạng card; gợi ý Size có hai nút; tim yêu thích | Gallery vuốt/phóng to; Size disabled khi hết hàng |
| CC-04 | Chọn ảnh | Ảnh đúng kho, checkbox lớn, trạng thái đã chọn rõ; giữ hai tab chọn nhanh/chọn ảnh | 2 ảnh + 3 nhanh = 5, vượt tồn bị chặn |
| CC-05 | Tra Size | Giữ 12 khoảng dữ liệu gốc và vùng kết quả rõ; thông báo khi mâu thuẫn hoặc khoảng hở | 24 kg / 112 cm => Size 11 |
| CC-06 | Bảng Size | Poster SVG mới với bé và bảng 12 dòng; bảng chữ truy cập được | Không sai Size 4–L, không cắt cuối bảng |
| CC-07 | Giỏ | Card/thumbnail, tăng giảm, tổng tạm tính, lựa chọn chính xác giữ nguyên | Không mất ảnh chọn; tồn/giá được kiểm tra lại |
| CC-08 | Form liên hệ | Tiêu đề và hướng dẫn thân thiện, field lớn, nút gửi rõ; giữ validation/idempotency | Mất phản hồi không tạo yêu cầu kép |
| CC-09 | Thành công | Minh họa em bé/trái tim, mã yêu cầu, danh sách sao chép đầy đủ sau khi xóa giỏ | Mã và các mục hàng vẫn sao chép được |
| CC-10 | Admin inbox | Header, KPI, trạng thái màu, ưu tiên tạo nháp; giữ phân bổ ảnh/cảnh báo | Owner only; không tự SOLD; không tạo nháp trùng |

## Giới hạn có chủ đích so với concept AI

- Chưa hiển thị chip Bé trai/Bé gái và lọc khoảng giá vì hợp đồng công khai chưa có metadata giới tính/giá lọc backend; không được đoán từ tên/ảnh. Sắp xếp giá tăng/giảm đã có.
- Màn hình mẫu có nhiều Product và request minh họa. Hệ thống thật chỉ hiện Product đã được chủ Shop bật và yêu cầu thật, không chèn dữ liệu giả.
- Zalo/Messenger chỉ xuất hiện khi chủ Shop cấu hình URL chính thức; UI không đoán tài khoản từ số điện thoại.
- Poster và banner là SVG thiết kế từ dữ liệu thương hiệu, không sao chép 1:1 bố cục ảnh concept.
- Dấu thời gian kiểm tra ảnh vật lý có thể chưa có; UI tiếp tục cảnh báo cần Shop kiểm tra và không hứa giữ hàng.

## Gate trước mời nghiệm thu

- [ ] `npm run build` + `npm run typecheck`.
- [ ] `npm run test:gate`, `npm run test:catalog`, `npm run test:cloud`.
- [ ] `npm run test:catalog:browser` tại 360/375/390/430/768/1024; ảnh screenshot artefacts.
- [ ] Admin DOM và kiểm tra CORE nháp/inquiry không tạo SOLD.
- [ ] Workflow Pages + Windows release success cùng một commit.
- [ ] Kiểm tra public URL `?catalog=1`, banner/bảng Size mới, CSS loaded đúng.
- [ ] Chủ Shop nghiệm thu trên iPhone thực tế; mới được dán nhãn STABLE.

Không sửa migration hay Edge Function trừ khi gate xác minh phát hiện lỗi có thể tái hiện.
