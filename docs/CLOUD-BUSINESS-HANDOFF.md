# Đồng bộ hồ sơ laptop – Cloud

## Lỗi đã xác định

Cloud có 3.106 ảnh sẵn sàng nhưng không có khách, đơn, SOLD và sổ tiền. Luồng cũ chỉ gửi danh mục/ảnh/nhập kho. Sau khi laptop bán 4 bộ, mobile vẫn thấy 3.106 vì lịch sử bán chưa được gửi; đồng bộ tự động lại chờ cờ kích hoạt mà lịch sử SOLD độc lập đang chặn.

## Cơ chế

- Trước kích hoạt: laptop gửi khách, đơn nháp/hủy, người nhận, SOLD, giá bán/giá vốn lịch sử, chứng từ thu/hoàn/giảm trừ, hậu mãi và phiên kiểm kê. Một RPC có giao dịch nguyên khối; khóa cùng các lệnh Cloud. Mã định danh, số tiền và ngày lịch sử được giữ nguyên.
- Chứng từ SOLD được đối chiếu checksum ảnh lưu trên laptop trước khi gửi. Payload Cloud không chứa đường dẫn máy. Lịch sử bất biến được đối chiếu khi gửi lại; sai khác dừng giao dịch.
- Hash yêu cầu và kết quả được lưu bền trên Cloud. Mất phản hồi sau commit được gửi lại cùng mã, không thêm SALE hoặc thu tiền lần hai.
- Laptop so sánh lại toàn bộ mốc dữ liệu trước khi cho kích hoạt. Nếu có thay đổi trong lúc tải ảnh, đồng bộ chạy lại. Trước khi xong, mobile hiển thị dữ liệu chưa được xác nhận và chưa mở thao tác bán.
- Sau kích hoạt: launcher đang có sẵn tự mở giao diện nghiệp vụ Cloud dùng chung trên laptop và mobile. Các lệnh bán được ghi một lần vào Cloud, dùng phiên bản để chặn thao tác cũ. Laptop tiếp tục đối soát ảnh SOLD và nhận khách/đơn nháp/sổ tiền/hậu mãi về database hiện tại; không tạo database kinh doanh thứ hai.
- Việc kích hoạt dùng cơ chế Cloud-authority hiện hành: thao tác bán cần mạng. Khi mất mạng giao diện không xác nhận đã bán. Đây không phải cơ chế cho hai database cùng bán độc lập khi offline.

## Cập nhật tồn

- Theo dõi thay đổi nghiệp vụ thành công riêng với theo dõi folder. Thay đổi khách/đơn/thu tiền được nhận biết trong lượt kiểm tra 1 giây, kể cả trước khi kích hoạt; lỗi mạng được thử lại tuần tự.
- Mobile nhận INSERT `sales_units`, bỏ ngay ảnh khỏi tồn và lựa chọn; đọc lại snapshot cùng mốc `cloud_sync_events`.
- Khi mất kênh realtime, tab đang mở kiểm tra phiên bản mỗi 5 giây và chỉ tải lại dữ liệu khi có thay đổi. Thời gian thực tế vẫn phụ thuộc mạng/thiết bị; không tuyên bố đồng bộ khi laptop tắt hoặc mất mạng.

## Kiểm chứng

### Sửa lỗi tự khóa HTTP ngày 19/10/2026

Middleware toàn cục trước đây tính chính POST gửi hồ sơ là một reader, khiến `readLocalBusiness` từ chối ngay khi không có giao dịch khác. Cùng lỗi ảnh hưởng `/business/pull` và `/activate`. Ba coordinator này không giữ reader lease của chính mình nữa; kiểm tra giao dịch đang chạy, file phục hồi bán/nhận lại và bản ghi PREPARED vẫn thực hiện trước khi gọi Cloud. Các coordinator vẫn kiểm tra hoạt động thực, snapshot/hash sau I/O và dùng khóa bán/lưu trữ khi replay SOLD. Không tắt khóa an toàn, không xóa marker phục hồi hoặc dữ liệu.

Regression chạy HTTP localhost qua đúng `salesRequestGuard` và `cloudRouter` dùng trong server, chỉ thay transport Cloud bằng PostgreSQL cô lập. Kiểm tra upload → activate → pull, cập nhật khách/tiền, draft mobile thành SOLD và archive thật, retry không trùng; đồng thời kiểm tra busy, PREPARED và file phục hồi vẫn chặn cả ba route, reader khác vẫn chặn và lease được trả khi kết thúc HTTP. Bộ test này chạy trong `test:cloud` trên Linux/Windows trước phát hành. Test fixture không chứng minh laptop thật đã đồng bộ.

`scripts/business-sync-selftest.mts` chạy nghiệp vụ LOCAL thật (ảnh gốc, preflight, SOLD, thu tiền, kiểm kê) sang PostgreSQL WASM với schema/trigger thật, rồi áp dụng migration mới. Kiểm tra 3.106 → 3.102 trên phép chiếu tồn dùng thật của mobile; bảo toàn doanh thu, công nợ, mất phản hồi, gửi lại, sai kho/quyền, chứng từ thiếu/sai, nhận sửa khách/thu tiền/hậu mãi từ mobile về LOCAL.

Các bộ test folder, nhận lại hàng, Cloud image/replay, UI và typecheck tiếp tục được chạy. CI Windows Node 22/24 và gói EXE kiểm tra riêng trước phát hành.

## Triển khai dữ liệu thật

Migration chỉ thêm chức năng và kênh sự kiện; không tạo khách/đơn/SOLD giả, không sửa số tồn bằng tay. Sau khi cập nhật laptop, phiên đăng nhập Cloud trên laptop gửi database thật qua Kết nối Cloud → Đồng bộ / Tiếp tục (hoặc tự tiếp tục nếu đã bật). Chỉ sau bước này mới có thể đối soát số khách, số đơn, tồn và tiền thực tế. CI không chứng minh laptop của chủ shop đã gửi dữ liệu.
