# V2 — Xem trước ảnh nhẹ (2026-10-10)

Tiếp tục theo yêu cầu chủ shop. Đợt 3 bắt đầu bằng prototype **chỉ đọc / sandbox**. Không xác nhận bán, ghi SALE, tạo archive/staging/journal, xóa ảnh hoặc đổi schema.

## Đã triển khai

- Đơn nháp đã lưu có nút Xem trước ảnh nhẹ; chọn từng ảnh để so sánh gốc / JPEG thử nghiệm, không tải file thủ công.
- JPEG đúng hướng, cạnh dài tối đa 1280px, quality82, không phóng lớn/cắt/méo; nền trong suốt thành trắng. Cấu hình đề xuất để chủ shop duyệt chất lượng, chưa là chính sách lưu/xóa ảnh đã bán.
- Tổng dung lượng thật trước/sau, số bộ, giá trị nháp; không hứa luôn nhỏ hơn ảnh gốc. Nhắc hàng ở nháp khác/giá0.
- Toàn bộ đơn phải hợp lệ; kiểm tra phiên bản/status, ảnh vật lý/active, đường dẫn realpath trong sandbox, checksum trước/sau xử lý và lại ở cuối batch. File hỏng/tối đa32MB/40 triệu pixels/đơn đã sửa đều từ chối an toàn. JPEG output được giải mã kiểm tra.
- Bản nhẹ chỉ ở bộ nhớ, xử lý tuần tự và chặn request trùng; không có cache/ghi filesystem/DB. Endpoint ảnh xác minh hash nguồn theo lần xem trước, phản hồi no-store.
- Giao diện pastel, so sánh hai cột gọn, chọn ảnh, loading/lỗi, sáng/tối/mobile. Sửa chưa lưu phải lưu trước; kết quả preview reset khi đổi đơn/version/dirty.

## Kiểm thử

Local: test:gate PASS (typecheck, schema/core/performance/warehouse/share, draft50, preview16, build/UI); HTTP34 PASS. Chromium local không có; browser thật bắt buộc trong Linux CI. Windows Node22/24 CI chạy gate + HTTP, không thay nghiệm thu chất lượng ảnh trên máy chủ shop. Kiểm tra Actions của commit chứa checkpoint này; không lấy CI cũ làm bằng chứng.

Preview16 bao gồm dữ liệu/bytes giữ nguyên, dimensions, JPEG đọc được, version stale, ID không thuộc đơn, hash sai, corrupt source, parallel request, sửa đơn/đổi file khi encode, mất file và nháp hủy. HTTP test dùng server thật gồm preview/ảnh JPEG/Cache-Control, stale và origin. Chromium mở preview từ nháp thật, đợi JPEG đọc được và kiểm tra desktop/mobile không tràn.

## Bro test Windows

RUN_WINDOWS_V2_DRAFT_TEST.bat → tạo nháp với ảnh sandbox → lưu giá/giảm giá → Xem trước ảnh nhẹ. So sánh màu/họa tiết/chữ/chi tiết, đổi ảnh bằng danh sách; xem số KB/MB. Thử ảnh nhỏ (không phóng lớn), ảnh lớn, sáng/tối, Gọn/Thoải mái. Preview không giữ hàng, không bán hay xóa ảnh. Báo chất lượng chấp nhận được hay cần giữ nét hơn; không suy ra duyệt xóa originals từ việc preview hoạt động.

## Còn lại

Staging/journal/crash recovery, confirm toàn đơn/claim/SALE, lịch sử SOLD, đồng bộ eligibility, full backup/restore và nghiệm thu Windows. V1 user-reported PASS giữ nguyên; full operational restore/STABLE gate chưa hoàn tất. LOCAL V1 vẫn schema110, V2 thử schema120 sandbox. Không áp dụng prototype lên kho thật.
