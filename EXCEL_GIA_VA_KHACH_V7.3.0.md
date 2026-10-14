# Shop Mẹ CaCao V7.3.0 — Excel giá và khách trong nháp

## Excel tồn kho và bổ sung giá

Sau khi quét và duyệt kho trên Windows, mở **Tồn kho → Excel tồn kho & bổ sung giá**. Dùng được bất kỳ lúc nào sau nhập hàng. Chọn xuất tất cả hàng còn tồn hoặc chỉ size thiếu giá.

1. Bấm **Xuất tồn kho Excel**. Sheet `TonKho` có một dòng mỗi Product/Size: mã, tên, SKU, size, tồn ảnh tại thời điểm xuất, đơn giá vốn/bán và tổng ước tính. Sheet `ThongTin` có ngày, mã kho, nguồn LOCAL/Cloud, số size thiếu giá, tổng tồn và hướng dẫn.
2. Chỉ điền cột vàng **G — Giá vốn/bộ** và **H — Giá bán/bộ** bằng số đồng nguyên (ví dụ `50000`). Giữ mã/size/phiên bản và tên sheet/cột. Excel định dạng phân cách hàng nghìn được hỗ trợ; không nhập chuỗi `50.000 đ` hoặc công thức vào ô giá.
3. Lưu `.xlsx`, chọn **Nhập Excel bổ sung giá**. Phần mềm chỉ xem trước, chưa ghi giá.
4. Đọc số vốn/bán sẽ bổ sung, từng dòng giữ nguyên/bỏ qua và tải bảng xem trước nếu cần. Bấm **Xác nhận bổ sung giá**.
5. Xem kết quả thực tế, tải CSV kết quả hoặc xem 20 lần nhập gần nhất. Lịch sử tải chi tiết theo từng lần, không nạp toàn bộ các bảng cũ vào màn hình.

### Quy tắc bảo vệ

- Chỉ bổ sung **từng giá còn thiếu**, không ghi đè giá đã thiết lập. Có vốn, thiếu bán: chỉ bổ sung bán và ngược lại.
- Ô trống bỏ qua. Nhập số `0` là xác nhận giá 0; sau đó không coi là thiếu. Giá 0 cũ chưa xác nhận được xuất trống với trạng thái rõ ràng; cần chủ shop kiểm tra trước khi điền. Giá dương cũ được giữ nguyên.
- Tồn, tên và tổng tiền trong file là báo cáo; import không điều chỉnh tồn, không tạo Product/Size mới, không sửa ledger, giá nhập lịch sử hay đơn/SOLD cũ. Tổng vốn/bán là ước tính theo giá hiện tại; các dòng thiếu giá chưa được tính đầy đủ.
- File sai nguồn LOCAL/Cloud, sai kho, mã/size không khớp, trùng mã hoặc giá sai bị từ chối. File chứa công thức ở mã/giá không được dùng để ghi giá. Hàng hết tồn: xuất lại file mới.
- Phiên bản giá thay đổi sau xuất: bỏ qua dòng và báo rõ. Khi xác nhận, máy chủ kiểm lại dữ liệu; kết quả thực tế có thể khác bảng xem trước. Xuất lại để xử lý những dòng bị bỏ qua.
- Một lần xác nhận có mã riêng; thử lại sau mất mạng dùng cùng lần nhập. Giá/nhật ký được ghi cùng giao dịch. Các dòng không hợp lệ khiến lần nhập không được ghi.
- Tối đa 5MB / 5.000 size, định dạng `.xlsx` theo mẫu xuất của Shop. Không nhận `.xls`, `.xlsm`, CSV hoặc workbook tự tạo khác cấu trúc. Hỗ trợ cả inline strings và shared strings khi Excel lưu lại.
- Chủ shop/quản lý kho được dùng luồng này. Khi Windows đã kích hoạt Cloud, cập nhật giá tại giao diện Cloud — không nhập file LOCAL vào Cloud hoặc ghi giá độc lập trên LOCAL. Windows lấy giá và trạng thái đã thiết lập về từ Cloud.
- Giá vốn 0 được xác nhận được giữ thành vốn biết ở đơn/SOLD mới. Việc bổ sung giá không sửa lại lợi nhuận/giá vốn đã chốt của đơn cũ. Đơn nháp đã lưu giá bán vẫn giữ giá; muốn sửa giá bán nháp phải sửa và lưu đơn riêng.

## Khách nhập trực tiếp trong đơn nháp

Nhập tên người nhận/điện thoại/địa chỉ, giữ chọn **Lưu vào danh sách khách hàng khi lưu nháp**, rồi bấm **Lưu thay đổi**.

- Nếu chưa chọn khách và thông tin hợp lệ: khách mới được tạo, gắn với đơn trong cùng giao dịch. Lưu đơn thất bại không tạo khách thừa. Chỉ gõ chưa tạo khách.
- Nếu số điện thoại đã có (kể cả `+84` và `0`): chọn đúng khách cũ; địa chỉ/người nhận đang nhập vẫn lưu riêng trong đơn, không ghi đè danh mục khách.
- Cloud hiển thị các khách trùng để chọn, hoặc tùy chọn tạo khách riêng và xác nhận. LOCAL có Tìm khách / Tạo khách → Lưu khách & chọn; khi trùng sẽ gợi ý dùng khách cũ.
- Khách không có SĐT cần xác nhận riêng. Không tự ghép theo tên.
- Tắt lựa chọn: chỉ lưu thông tin giao hàng trong đơn, không tạo khách. Chọn khách đã lưu vẫn gắn với đơn nhưng không cập nhật danh mục.
- Đơn/SOLD cũ không đổi khi chỉnh thông tin danh mục khách.

## Cập nhật và kiểm chứng

Windows: **Cài đặt → Kiểm tra & cập nhật Shop** nếu đã thiết lập dữ liệu cố định; nếu chưa, dùng gói có `WINDOWS_RELEASE.json` và hướng dẫn `WINDOWS_CAP_NHAT_MOT_NUT.md`. Giữ database/kho ảnh hiện có. Không chạy SQL migration/reset thủ công: Cloud được nâng cấp bổ sung qua migration đã kiểm chứng, không reset kho.

Kiểm thử: `npm run test:cloud` chạy kiểm tra XLSX thật/blank/zero/shared strings/formulas/sai kho/trùng/stale/replay, SQLite giá/khách và React payload/preview/unsaved/duplicate/opt-out. `npm run test:gate` kiểm toàn bộ core/archive/recovery/backup/restore/Windows updater và UI. `scripts/price-cloud-rollback.sql` đã chạy trên fixture trong BEGIN/ROLLBACK cùng migration thử, gồm xác nhận vốn 0 khi SOLD; không giữ bản ghi thử trong shop. CI đúng commit phải đạt Linux và Windows Node22/24 trước triển khai.

Chưa nghiệm thu Excel desktop của shop, iPhone Safari và kho Windows thật; CI không tương đương STABLE. Supabase Auth vẫn có cảnh báo bảo vệ mật khẩu bị lộ chưa bật; [hướng dẫn cấu hình](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Không coi việc cấu hình này là đã khắc phục.
