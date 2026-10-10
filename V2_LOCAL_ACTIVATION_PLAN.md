# LOCAL V2 — kiểm tra và kế hoạch kích hoạt

Ngày10/10/2026. Chủ shop đã PASS10 bước sandbox Windows; bản chuẩn bị e5d086d có CI38031750870 Linux/Windows22/24/deploy SUCCESS. Chủ shop yêu cầu tiếp tục; **chưa có báo cáo nghiệm thu dữ liệu V1 chuyển sang bản sao**. Không tự ghi nhận PASS cho bước đó.

## Công cụ kiểm tra đã triển khai

Chạy **`CHECK_WINDOWS_V2_LOCAL_RELEASE.bat`** trong source mới; chọn số gói đã chuẩn bị, rồi dán thư mục **backup đầy đủ V1 cuối** để đối chiếu. Có thể Enter bỏ trống để nhận báo cáo phần còn thiếu.

Công cụ chỉ đọc database/ảnh. Kiểm tra backup nguồn110, bản sao130, kho phục hồi130, kho quay lui110, backup đầy đủ130 và backup V1 cuối. Đối chiếu toàn bộ dữ liệu nghiệp vụ/ID/Size/giá/lịch sử/cấu hình, checksum ảnh và path/schema các bản sao. Đơn nháp, nháp đã hủy, đơn đã bán, SALE hoặc nhật ký operation trong gói chuyển đổi đều làm gói **CHƯA ĐẠT**. Tạo gói mới từ backup V1 cuối nếu đã thử bán/nhập/sửa trên bản sao; không xóa đơn hay chỉnh ledger để ép đạt.

Báo cáo dễ đọc `.txt` và bản máy đọc `.json` được tạo mới trong `release-reports` của gói đã chọn. Không ghi đè báo cáo cũ, không sửa database/ảnh, không khởi chạy/chuyển ứng dụng. `TECHNICALLY_READY_FOR_REVIEW` chỉ nói các phép kiểm tra đã đạt tại thời điểm kiểm tra; `businessActivationAllowed=false` luôn giữ nguyên. `BLOCKED` nêu từng mục chưa đạt. Backup V1 được chọn có thể vẫn cũ; công cụ không khẳng định đã dừng ghi V1 hoặc đã lấy backup đúng thời điểm chuyển.

## Kế hoạch kích hoạt LOCAL kinh doanh — chưa triển khai

1. Chủ shop đối chiếu và nghiệm thu mẫu/Size/SKU/giá/tồn của bản sao. Giữ riêng các đơn test, không đưa chúng vào đơn kinh doanh.
2. Chốt đặc tả cấu hình LOCAL: tiếp tục React/Node/node:sqlite, loopback, giữ nguyên `1-Me CaCao Store / Product / Size / ảnh`, cho biết chính xác DB/kho/archive nào đang dùng. Không đổi tên/di chuyển kho gốc để thỏa cấu trúc sandbox. Mặc định V1 và scripts test cũ giữ độc lập; không auto-migration khi mở ứng dụng.
3. Triển khai và kiểm chứng cấu hình đó trên bản sao với đường dẫn kiểu kho thật, DB và archive được khai báo rõ. **Mã hiện tại còn yêu cầu DB trong sandbox và backup130 có tiền tố `warehouse`; phải xử lý các giả định này trong thiết kế LOCAL trước khi kích hoạt.** Không bỏ guard rồi dùng sandbox launcher cho kho thật. Archive/staging phải cùng volume với ảnh để giữ cơ chế chống ghi đè; backup/restore phải hỗ trợ đúng cấu hình và giữ lịch sử.
4. Trước khi chuyển, dừng ghi V1/review, tạo backup mới đầy đủ, tạo gói chuyển đổi sạch và chạy lại đối chiếu cuối. Sau khi có cấu hình và gói cụ thể đạt yêu cầu, chủ shop duyệt việc kích hoạt; đây không phải quyền tự xóa/ghi đè dữ liệu kinh doanh.
5. Khởi chạy LOCAL V2 đã được duyệt, hiển thị đúng kho/DB và đối chiếu lần cuối trước đơn kinh doanh đầu tiên. Chỉ một ứng dụng được ghi vào kho; không chạy V1/V2 bán song song trên cùng dữ liệu.
6. Nếu chưa phát sinh đơn kinh doanh V2, quay về V1 theo bản phục hồi đã kiểm chứng và không ghi đè âm thầm. Nếu đã có đơn kinh doanh V2, không thay DB130 bằng snapshot110 cũ; giữ dữ liệu và dùng kế hoạch phục hồi V2, tránh mất giao dịch.

Chỉ khóa V2 LOCAL STABLE sau khi cấu hình kinh doanh, cutover và nghiệm thu cuối đạt. Chính sách chất lượng ảnh nhẹ/xóa gốc phải được chốt và triển khai riêng; hiện giữ ảnh gốc đã bán. V3 khách/thanh toán/COD/phiếuPNG chưa thuộc đợt này.
