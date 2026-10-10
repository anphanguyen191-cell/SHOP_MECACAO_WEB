# Chặng 1 — Tiến độ trực tiếp và tác vụ bền vững

## Đã triển khai

- Quét kho thủ công và quét startup/định kỳ đã bật: worker riêng, tiến độ Product/Size/ảnh và thư mục đang xử lý. Quét nền lưu kết quả thống kê gọn; không tự đăng ký ảnh hoặc tạo giao dịch nhập.
- Nhập hàng: tiến độ kiểm tra, copy, xác minh, ghi DB, integrity và kết quả cuối theo mã tác vụ. Giữ nguyên ba luồng nhập; COPY nguồn, journal/rollback giữ nguyên.
- Duyệt đăng ký kho hàng loạt: một tác vụ ở backend, xử lý từng Product có transaction. Lỗi đầu tiên dừng lô; giữ kết quả đã lưu, báo ERROR/UNPROCESSED. Không rollback các Product đã thành công.
- Backup đầy đủ: tiến độ copy và kiểm chứng, chỉ công bố hoàn tất sau kiểm tra checksum/integrity và worker đã kết thúc. Không thay thế full backup bằng bản ảnh nén.
- SSE trực tiếp và polling dự phòng. Mất kết nối/reload không hủy công việc hoặc tự tạo lô khác. Mã idempotency được ghi trước khi gửi; cùng mã và payload trả lại tác vụ cũ, khác payload bị chặn.
- Tiến độ & lịch sử tác vụ dưới header: 30 tác vụ gần nhất, mở kết quả đã lưu, theo dõi tác vụ đang chạy và xác nhận kết quả cũ để gỡ yêu cầu chờ trên trình duyệt.
- Metadata/results ở `operation-tasks` cạnh DB; không thêm schema/migration. Trạng thái được ghi qua file tạm + fsync + rename; không xóa dữ liệu kinh doanh.
- Một worker tại một thời điểm, chặn thao tác kho/bán/backup khác và các đọc tồn trong khi xử lý để không trình bày trạng thái copy dở như đã hoàn tất.

## Khi bị gián đoạn

1. Nếu mất tab/kết nối: mở lại cùng ứng dụng → **Tiến độ & lịch sử tác vụ**. Xem tác vụ cũ; không lập lô khác để thử.
2. RUNNING/QUEUED: đợi; tiến độ có thể kết nối lại. Nếu worker cũ còn sống khi mở server lại, server dừng an toàn; không tự phá khóa hoặc chạy worker thứ hai.
3. REVIEW_REQUIRED: kiểm tra tồn, lịch sử nhập và journal. Quy trình phục hồi ảnh có sẵn vẫn được áp dụng; bất thường/hash không khớp dừng để kiểm tra thủ công.
4. Chỉ sau khi kiểm tra, chọn **Đã kiểm tra kho & nhật ký — đóng cảnh báo**. Tác vụ cũ chuyển thành đã đóng có lỗi, không chạy lại. Nút gỡ yêu cầu chờ trình duyệt chỉ gỡ mã của đúng tác vụ đã có kết quả cuối.
5. FAILED: xem lỗi/kết quả đã lưu. Với lô đăng ký có mục lỗi, đọc từng Product đã lưu/lỗi/chưa xử lý trước khi chọn lại phần cần xử lý.

Chưa có nút hủy cưỡng bức từ giao diện; không thêm nút dừng thiếu checkpoint an toàn. Tiến độ không dùng bộ đếm giả; giai đoạn chưa biết tổng hiển thị đang xác minh, không cam kết ETA.

## Kiểm tra Windows trên bản sao

1. Khởi chạy sandbox hoặc bản sao LOCAL đã duyệt bằng launcher phù hợp, không bán/nhập thử trên kho kinh doanh.
2. Quét kho có nhiều Product/Size; theo dõi đếm mẫu/Size/ảnh và mã tác vụ. Đổi tab/reload, mở lịch sử để xem tác vụ cũ.
3. Nhập ảnh nguồn mới vào Size có sẵn; theo dõi copy → DB → kiểm chứng. Kiểm tra ảnh nguồn còn nguyên, tồn/ledger/giao dịch không bị nhân đôi khi mở lại kết quả.
4. Duyệt nhiều Product; kiểm tra kết quả từng mẫu. Lô lỗi không được trình bày như mọi mục đều đã lưu.
5. Tạo full backup qua Cài đặt, theo dõi copy/verify, sau đó restore thử theo hướng dẫn LOCAL hiện hành.
6. Restart sau hoàn tất: lịch sử và kết quả còn. Kịch bản dừng giữa giao dịch chỉ thực hiện trên sandbox/bản sao, không dùng kho thật để fault-test.

Kiểm thử tự động: `npm --workspace apps/api run test:tasks`, nằm trong `npm run test:gate`; thử API/worker/SSE, replay sau restart, giới hạn đường dẫn/origin, receipt/batch/backup, worker hard-kill và review không tự replay. Bổ sung worker scan/backup trên cấu hình LOCAL DIRECT trong test chuẩn bị V2; browser fixture được cập nhật theo protocol tác vụ mới.

Giới hạn: live progress hiện áp dụng quét kho, nhập ảnh vật lý, duyệt đăng ký kho và **backup đầy đủ**. Backup SQLite riêng, ảnh nén và restore vẫn có trạng thái xử lý/kết quả hiện hữu, chưa chuyển thành task streaming. Lịch sử tác vụ không phải ledger và không thay bằng chứng giao dịch trong DB/journal.
