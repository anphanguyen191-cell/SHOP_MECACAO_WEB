# V2 — Lưu ảnh nhẹ và nền phục hồi (2026-10-10)

Chủ shop cho phát triển tiếp để hoàn thiện cấu phần V2. Đợt này hoàn thiện prototype lưu ảnh nhẹ bền vững, luồng kiểm chứng/phục hồi bộ thử và lab staging trên bản sao. **Chưa là V2 bán hàng hoàn chỉnh; chưa có confirm/SALE/SOLD hoặc xóa ảnh gốc.**

## Chủ shop sử dụng được trong sandbox

Đơn nháp → Xem trước ảnh nhẹ → Lưu bộ ảnh thử → Kiểm chứng lại. Mở lại đơn vẫn thấy các bộ thử. Bộ cũ có phiên bản riêng, không tự dùng cho nháp đã sửa. Danh sách tối đa 50 bộ gần nhất: kiểm tra metadata/kích thước và dấu hoàn tất để tải gọn; nhãn **kiểm chứng lúc lưu** không phải xác minh SHA hiện tại. Nút Kiểm chứng lại chạy SHA-256 + giải mã đầy đủ tại thời điểm bấm.

- Server kiểm tra phiên bản nháp và checksum từng ảnh khớp lần preview. Nháp, source, ledger và tồn giữ nguyên.
- Ảnh nhẹ nằm riêng tại `<sandbox>/.mecacao-v2-archive/<hash request key>/`. `plan.json` được flush trước ghi JPEG, ghi file exclusive, flush file/directory (directory fsync không có trên Windows Node), verify checksum/decode toàn bộ trước `ready.json`.
- Retry cùng key/nội dung trả đúng bộ cũ. Key đổi nội dung bị 409. Bộ incomplete có journal hợp lệ có thể bấm Phục hồi bộ thử; thiếu journal, JSON hỏng, file đổi/hash sai đều dừng an toàn, giữ file để review. Không đoán rồi ghi đè/xóa.
- Archive bảo toàn ảnh đã lưu theo phiên bản; nháp/source thay đổi ngăn hoàn tất bộ pending. Bộ READY có thể kiểm chứng độc lập với giá/ghi chú nháp hiện tại.
- Scanner bỏ qua archive; chọn archive làm kho/import hoặc ảnh nguồn qua API sandbox bị từ chối, kể cả canonical symlink. Tồn không được tăng vì có bản JPEG thử.
- Giao diện pastel, responsive, loading/lỗi/trạng thái riêng; backend không đủ để coi tính năng hoàn tất.

## Lab staging/recovery (chưa nối API bán)

`salesStagingLab.ts` chỉ chấp nhận file clone trong `<sandbox>/.mecacao-v2-recovery-lab/warehouse`. Journal trước chuyển file. Kiểm tra cùng volume; hard-link + unlink tạo chuyển cùng volume không ghi đè đích. Kiểm tra inode/dev nhận biết crash giữa link/unlink; không xóa một bản sao khác dù có cùng bytes. Hỗ trợ trả clone về vị trí cũ khi quyết định UNCOMMITTED; nếu COMMITTED giữ nguyên staged clone, chưa cleanup. Quyết định AMBIGUOUS/unknown, thiếu file, hash đổi hoặc đích bị chiếm đều preflight toàn bộ rồi dừng, không rollback một phần.

Đây là **contract prototype**: quyết định commit trong test do harness cung cấp, chưa đọc trạng thái giao dịch SALE/claim từ database thật. Không coi COMMITTED_RETAINED của lab là đơn đã bán. Directory fsync Windows và full operational restore vẫn cần nghiệm thu thực tế. Lab không kết nối UI để di chuyển hàng thật.

## Bằng chứng

Local test:gate PASS: V1 regressions + draft50 + preview16 + archive52 + staging47 + typecheck/build/UI31. Sau tối ưu danh sách: archive52, typecheck/build và HTTP43 PASS. Browser local chưa có Chromium; Linux CI bắt buộc browser thật. Check Actions của commit chứa checkpoint cho Windows Node22/24 và Chromium; không sử dụng run cũ.

- Archive52: 6 điểm hard-exit (thư mục, plan, mỗi JPEG, trước/sau ready), process mới đọc/recover/retry; JSON hỏng, derivative/source thay đổi, key mismatch, originals/business rows giữ nguyên.
- Staging47: 9 điểm hard-exit staging/recovery; phục hồi lặp lại, giữ committed clones, toàn bộ preflight, ambiguity/tamper/collision/outside lab.
- HTTP43: save/retry/list/verify từ server thật, origin guard, archive scan bị chặn, restart và tồn/ledger/source invariants. Chromium thao tác lưu/kiểm chứng thật trong đơn mới và layout desktop/mobile.

## Windows test

1. Tải source mới, giải nén riêng; RUN_WINDOWS_V2_DRAFT_TEST.bat.
2. Import kho giả lập → chọn ảnh tồn → tạo nháp → lưu giá.
3. Xem trước ảnh nhẹ → Lưu bộ ảnh thử. Thấy nhãn Đã lưu · kiểm chứng lúc lưu.
4. Bấm Kiểm chứng lại: chỉ báo checksum/giải mã đạt sau API trả thành công.
5. Dừng cửa sổ server Ctrl+C; mở lại .bat, mở cùng nháp: bộ thử vẫn có; bấm kiểm chứng lại.
6. Sửa/lưu nháp: bộ cũ được ghi rõ phiên bản cũ. Xem trước/lưu bộ cho phiên bản mới.
7. Đối chiếu tồn/ảnh/ledger không đổi. Test Gọn/Thoải mái/sáng/tối; không thao tác trên kho D: thật.

Các ca kill/decode/collision tự động đã chạy không thay cho chủ shop nghiệm thu Windows/restore. Bộ thử phát sinh dung lượng có chủ ý; chưa có chính sách xóa bộ thử tự động.

## Còn phải hoàn thiện trước V2 STABLE

- Full restore V1 vận hành sang kho mới và checkpoint release.
- Duyệt bằng mắt chất lượng JPEG/policy xóa gốc sau commit; prototype luôn giữ originals.
- Gắn staging/journal với transaction SALE/UNIQUE image claims, idempotent confirm và operation-status.
- Khóa phối hợp mutation/read/backup và xử lý ngắt kết nối khi DB đã commit.
- Lịch sử SOLD/ảnh nhẹ, toàn bộ module lọc đúng AVAILABLE; chặn đăng ký lại hàng SOLD.
- Backup/restore bao phủ AVAILABLE + SOLD/staging/journal, không suy ra bundle V1 đã chứa archive thử.
- Windows nghiệp vụ cuối, phân biệt CI/Windows/STABLE. Mobile dùng dữ liệu LOCAL qua LAN vẫn thuộc kết nối/phân quyền chưa triển khai.
