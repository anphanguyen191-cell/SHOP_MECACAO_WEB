# Shop Mẹ CaCao Web V1 — Kiểm thử Windows an toàn

**Chỉ áp dụng cho giai đoạn nghiệm thu. Không ghi thử lên kho kinh doanh thật.**

## Chuẩn bị
1. Tải repository ZIP từ GitHub và giải nén trên Windows.
2. Cài **Node.js 22.13 trở lên** nếu máy chưa có. Lần đầu cần Internet để tải dependencies đã khóa bằng package-lock.json.
3. Nhấp đúp `RUN_WINDOWS_V1_SAFE_TEST.bat` ở thư mục gốc. Đợi dòng **TEST SANDBOX READY**.
4. Trình duyệt mở `http://127.0.0.1:3005`. Phải thấy cảnh báo vàng **CHẾ ĐỘ THỬ WINDOWS** và nhãn **TEST SANDBOX**. Nếu chỉ thấy `LOCAL` hoặc trang `localhost:3000`, dừng và kiểm tra lại.
5. Dùng **kho giả lập** nằm ở:
   - Kho đích / kho quét: `%LOCALAPPDATA%\ShopMeCaCao\V1AcceptanceSandbox\warehouse`
   - Ảnh nguồn nhập mới: `%LOCALAPPDATA%\ShopMeCaCao\V1AcceptanceSandbox\incoming`
   - Database nghiệm thu: `%LOCALAPPDATA%\ShopMeCaCao\V1AcceptanceSandbox\database\shop-acceptance.db`

**Tuyệt đối không chọn `D:\1-Me CaCao Store` làm thư mục để thực hiện giao dịch thử.** Backend sandbox hiện từ chối đường dẫn nằm ngoài vùng thử, kể cả liên kết thư mục ra ngoài. File `.bat` build lại source trước khi chạy, kiểm tra đúng app/database/sandbox qua API và dừng nếu port 3005 đang có server cũ. Không xóa sandbox cũ: dữ liệu test được giữ để kiểm tra restart.

## Checklist nghiệm thu
- [ ] **Tổng quan:** KPI đủ, thanh tồn theo từng sản phẩm hiển thị tên nằm ngang, nhấn KPI đi tới chức năng phù hợp; nút thu gọn/mở lại hoạt động.
- [ ] **Danh mục:** ban đầu không có dữ liệu; sau import thấy sản phẩm + Size; tìm theo tên, mã, SKU; lọc còn hàng/hết hàng và sắp xếp tồn nhiều–ít; theme tối chữ dễ đọc.
- [ ] **Import kho:** chọn `warehouse`, bấm quét; thấy hai mẫu ảnh giả lập và các Size; duyệt một mẫu rồi import; quét/import lại lần hai phải không nhân đôi số ảnh đã đăng ký.
- [ ] **Chọn thư mục:** có thể bấm duyệt hoặc dán đường dẫn rồi bấm MỞ. Chọn thư mục ngoài sandbox phải bị từ chối, không được ghi dữ liệu.
- [ ] **Nhập hàng — Size đã có:** chọn sản phẩm vừa import; chọn kho đích `warehouse`; chọn ảnh nguồn `incoming\Them Size 1`; quét và xác nhận; số tồn ảnh của đúng Size tăng **1**; ảnh nguồn còn nguyên.
- [ ] **Nhập hàng — Size mới:** chọn cùng sản phẩm, Size chưa có; ảnh nguồn `incoming\Them Size moi`; xác nhận; tạo đúng một Size và một ảnh mới.
- [ ] **Nhập hàng — mẫu mới:** tạo tên/mã mới không trùng, ảnh nguồn `incoming\Mau moi`; xác nhận; mẫu xuất hiện trong Danh mục và Tồn kho.
- [ ] **Sau nhập:** dashboard Nhập hàng cập nhật; ảnh nguồn đã chọn được xóa khỏi form (không xóa file nguồn); nút xác nhận bị khóa cho tới khi chọn ảnh mới để tránh bấm lặp.
- [ ] **Tồn kho:** tổng tồn bằng tổng ảnh vật lý còn tồn trong các thư mục Size đã đăng ký; bảng/biểu đồ/Dashboard/Danh mục đồng nhất; ledger chỉ là dữ liệu đối soát.
- [ ] **Lỗi nhập:** thử chọn nguồn trùng, Size đã ngưng hoặc thư mục ảnh trống; hệ thống phải báo rõ ràng, không cộng thêm tồn và không ghi đè ảnh.
- [ ] **Cài đặt & Backup:** bấm **BACKUP ĐẦY ĐỦ DB + ẢNH GỐC**; thông báo xác minh thành công và hiển thị đường dẫn; kiểm tra có `shop.db`, `lossless-manifest.json` và `lossless-images`.
- [ ] **Khởi động lại:** đóng cửa sổ server TEST, chạy lại `.bat`; phải giữ nguyên sản phẩm, tồn ảnh, Size, giao dịch và cài đặt.
- [ ] **Làm mới tồn:** khi cần đọc lại ảnh trên ổ đĩa, dùng LÀM MỚI TỒN ẢNH. Nếu API lỗi phải thấy thông báo và THỬ LẠI, không kết luận kho trống từ lỗi mạng.
- [ ] **Bảo vệ ảnh gốc:** đối chiếu ảnh tại `incoming` trước/sau thao tác; không bị xóa, đổi tên hoặc giảm số lượng.
- [ ] **Giao diện mobile:** thử dùng kích cỡ iPhone / truy cập trình duyệt cùng máy; menu mở không tự bật bàn phím, không tràn ngang, bộ lọc rõ ràng, Dashboard có thể thu gọn.
- [ ] **Giao diện desktop:** thử Chrome/Edge 100% zoom; nhãn Size/SKU/giá rõ, ảnh không bị cắt hoặc kéo méo. Sáng/tối và trạng thái dashboard phải được nhớ sau tải lại trang. Bản này chưa mở LAN: dùng giả lập mobile trên cùng máy, không đổi SHOP_HOST để mở mạng.

## Điều kiện PASS và giới hạn
- CI đã mô phỏng API thật trên Linux với kho ảnh cách ly, gồm ghi, đọc, kiểm tra backup và restart. **Chưa phải kiểm thử trên máy Windows của Shop.**
- Tiến độ nhập hàng hiện phản hồi sau khi máy chủ xử lý xong, chưa phải tiến độ truyền trực tiếp.
- Nhật ký phục hồi tự xử lý trường hợp giao dịch chưa commit với ảnh đầy đủ; trường hợp ảnh copy dở bị biến đổi sẽ **dừng an toàn và yêu cầu xem xét thủ công**, không tự xóa ảnh nghi ngờ.
- Backup đầy đủ là bản sao kiểm chứng theo SHA-256; **quy trình restore hoàn toàn vào thư mục Windows thật chưa được nghiệm thu**. Không ghi đè database hoặc ảnh kho thật bằng tay.
- Không gắn nhãn **V1 STABLE** cho đến khi checklist Windows trên bản sao đạt và phương án restore được xác minh.

Nếu test phát hiện lỗi, ghi lại tên chức năng, bước thao tác, thông báo lỗi, ảnh chụp màn hình và đường dẫn kho giả lập (không gửi dữ liệu khách thật).
