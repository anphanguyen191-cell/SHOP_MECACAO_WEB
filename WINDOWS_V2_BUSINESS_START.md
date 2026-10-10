# Chuyển sang LOCAL V2 dùng kho kinh doanh

Bộ công cụ này dùng kho hiện hữu `1-Me CaCao Store / Product / Size / ảnh`, giữ DB V1 nguyên trạng và tạo DB V2 riêng. Không dùng các BAT SANDBOX với kho thật. Không tự chuyển schema khi khởi chạy. Chỉ truy cập trên máy Windows, không mở LAN/cloud.

## 1. Chuẩn bị và duyệt

1. Trong V1, kiểm tra đúng đường dẫn kho, duyệt đăng ký toàn bộ ảnh còn tồn; xử lý ảnh hỏng/thiếu trước. Tạo **backup đầy đủ DB + ảnh gốc** trong Cài đặt. Copy backup đó sang ổ đĩa khác để bảo vệ khi ổ kho hỏng; backup cùng ổ không chống được hỏng ổ.
2. Ghi lại đường dẫn **database V1 thực sự đang dùng**. Không chọn DB Python cũ hoặc database sandbox. Công cụ chỉ nhận schema110 của Web V1 đã được backup.
3. Dừng toàn bộ Shop V1, bản review, server test và Python/EXE cũ. Không mở lại hoặc sửa file kho trong suốt quá trình chuyển.
4. Giải nén source mới vào thư mục riêng; chạy `PREPARE_WINDOWS_V2_LOCAL_COPY.bat`. Chọn backup mới và đường dẫn kho hiện hữu. Gói mới nằm trong `%LOCALAPPDATA%\ShopMeCaCao\LocalV2Preparation` (xem đường dẫn công cụ in).
5. Chạy `RUN_WINDOWS_V2_LOCAL_REVIEW.bat`; đối chiếu mẫu, Size/SKU, giá, ảnh, tồn và lịch sử nhập. **Gói định chuyển không được tạo đơn nháp, bán thử, nhập, rename hoặc sửa giá.** Nếu đã thao tác thử, tạo một gói sạch mới từ cùng backup rồi kiểm tra lại.
6. Dừng review. Chạy `CHECK_WINDOWS_V2_LOCAL_RELEASE.bat`, chọn gói sạch và backup V1 cuối. Mọi mục phải đạt. Nếu V1 thay đổi, tạo backup và gói mới; không xóa đơn để ép đạt.

## 2. Kích hoạt một lần

1. Chạy `ACTIVATE_WINDOWS_V2_LOCAL.bat`.
2. Dán đường dẫn **thư mục gói sạch đã duyệt** và **file DB V1 đang dùng**.
3. Chỉ sau khi đã duyệt và dừng V1, nhập đúng `TOI DA DUYET BAN SAO VA DUNG V1`.
4. Công cụ kiểm tra V1 hiện tại và SHA ảnh, tạo DB V2 riêng, backup đầy đủ V2, phục hồi thử và đối chiếu trước khi ghi marker kích hoạt. Ảnh kho không bị đổi tên/di chuyển; ảnh chưa đăng ký khiến chuyển đổi bị chặn.
5. Ghi lại các đường dẫn được in. DB V2 ở `%LOCALAPPDATA%\ShopMeCaCao\LocalV2\stores\<id>\database\shop-business.db`. Kho vẫn ở vị trí cũ. Nguồn nhập mới ở `...\stores\<id>\incoming`.

Nếu báo lỗi: giữ nguyên thư mục dở và marker, không xóa/đổi tên để thử ép chạy. Chụp toàn bộ lỗi và gửi hỗ trợ. Dừng trước marker không kích hoạt kho. Nếu bị tắt sau marker nhưng trước ghi cấu hình ghi nhớ, `START_SHOP_V2_LOCAL.bat` sẽ hỏi đường dẫn `local-v2-config.json`; chỉ file có marker khớp mới mở được.

## 3. Kiểm tra trước đơn kinh doanh đầu tiên

1. Chạy `START_SHOP_V2_LOCAL.bat`, mở `http://127.0.0.1:3000`. Banner phải là **LOCAL V2 · KHO KINH DOANH**, đúng kho/DB/nguồn nhập. Không phải TEST SANDBOX.
2. Đối chiếu tổng mẫu, Size, tồn ảnh, giá và lịch sử. Ledger lệch ảnh phải hiển thị chênh lệch, không biến thành tồn thực tế.
3. Restart: tại cửa sổ server bấm `Ctrl+C`, chờ dừng, chạy lại `START_SHOP_V2_LOCAL.bat`. Đối chiếu dữ liệu vẫn đúng. Không chạy hai cửa sổ cùng kho.
4. Trong Cài đặt, tạo backup đầy đủ mới, bấm **Phục hồi & kiểm chứng** với đúng kho hiện tại. Sau READY, dừng server kinh doanh, chạy `RUN_WINDOWS_RESTORED_LOCAL_V2_TEST.bat`, dán file `restore-ready.json` được in; mở `http://127.0.0.1:3016`. Đây là kho **phục hồi thử**, không phải kho kinh doanh. Đối chiếu rồi dừng và mở lại LOCAL kinh doanh.
5. Chỉ khi kiểm tra đạt mới lập đơn kinh doanh. Nháp chưa giữ hàng/trừ tồn; xác nhận bán sẽ đưa ảnh khỏi tồn và lưu SOLD. SOLD chưa đồng nghĩa đã thanh toán; công nợ/COD/khách hàng thuộc V3.

## 4. Nhập và bán hằng ngày

- Copy ảnh hàng mới vào thư mục `incoming` hiển thị trên banner (có thể chia Product/Size). Vào Nhập hàng, chọn Product/Size có sẵn hoặc tạo mới, chọn ảnh nguồn, kiểm tra số ảnh và giá rồi xác nhận. Ảnh nguồn được COPY, không bị xóa.
- Quét kho hiện hữu và quét định kỳ chỉ phát hiện thay đổi/chờ duyệt, không tự tạo giao dịch nhập. Không đưa ảnh đã bán từ vùng lưu giữ trở lại kho còn bán.
- Lập nháp từ ảnh tồn; kiểm tra cảnh báo ảnh đang nằm trong nháp khác, giá/giảm giá trước khi xác nhận. Khi kết quả chưa rõ, dùng **Kiểm tra trạng thái bán** trước khi gửi lại; không lập giao dịch khác để thử.
- Nếu bị gián đoạn bán, khởi động lại rồi vào Bán hàng → **Kiểm tra / phục hồi giao dịch bị gián đoạn**. Tình trạng không rõ sẽ dừng, không tự xóa ảnh nghi ngờ.
- Ảnh đã bán được giữ nguyên tại `.mecacao-v2-sales` trong kho và có JPEG nhẹ cho lịch sử. **Chưa tự xóa ảnh gốc đã bán.** Chính sách giải phóng dung lượng phải được duyệt và kiểm chứng riêng.
- Backup đầy đủ cuối ngày, giữ bản ở ổ khác; kiểm chứng restore định kỳ. Không chỉ dùng backup SQLite hoặc ảnh nén thay backup đầy đủ.

## 5. Quay lui và giới hạn

Chưa có đơn/giao dịch hoặc thay đổi nghiệp vụ V2: dừng server, chạy `ROLLBACK_UNUSED_WINDOWS_V2_LOCAL.bat`, dán file cấu hình và nhập `QUAY LAI V1 CHUA PHAT SINH DU LIEU`. Công cụ chỉ gỡ marker đã xác minh, giữ mọi DB/backup/ảnh. Sau đó dùng V1 với DB cũ. Nếu bị tắt cưỡng bức còn khóa, khởi chạy lại LOCAL rồi Ctrl+C để đóng sạch; không tự xóa khóa.

Đã có bất kỳ đơn/nhập/sửa/rename V2: công cụ **chặn quay về snapshot V1**. Dùng backup V2 phục hồi vào thư mục mới, giữ toàn bộ dữ liệu hiện tại để đối soát; chưa có thao tác tự ghi đè/kích hoạt kho phục hồi thay kho kinh doanh.

CI/test giả lập không thay nghiệm thu kho thực tế trên máy chủ shop. Chưa khóa LOCAL STABLE chỉ từ lần PASS sandbox trước. Không mở lại V1/Python cũ trên cùng kho; marker chỉ bảo vệ phiên bản Web đã có guard, không điều khiển được EXE hoặc mã nguồn cũ không có guard.
