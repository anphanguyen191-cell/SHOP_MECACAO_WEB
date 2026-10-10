# V1/V2 — Backup đầy đủ và kho phục hồi mới (2026-10-10)

Chủ shop cho tiếp tục phát triển V2. Đợt này bổ sung full restore **schema110/120 vào vị trí mới**, vận hành bằng server riêng, và backup đầy đủ các bộ ảnh nhẹ prototype đã hoàn tất. **Chưa xác nhận bán/SALE/SOLD/xóa gốc. V1 STABLE vẫn cần chủ shop nghiệm thu restore Windows của bản này.**

## Đã triển khai

- `createLosslessBackup` giữ byte-exact registered originals + SQLite như trước. Với sandbox schema120, thêm mọi file của các trial archive READY: kế hoạch, JPEG và dấu hoàn tất. Pending/corrupt/unknown archive hoặc archive đang xử lý chặn backup đầy đủ; không âm thầm bỏ sót. DB-only/nén vẫn là phương án riêng có nhãn hạn chế.
- Manifest version1 cũ tiếp tục đọc; version2 có danh sách file archive và checksum. Verify DB integrity/FK, ID/path coverage của originals, từng archive file, plan/ready/JPEG checksum và liên kết archive với snapshot order/image ID. Xử lý lần lượt, không gom toàn bộ JPEG vào RAM.
- Restore chỉ ghi vào thư mục **mới**, tách khỏi bundle và kho gốc, không ghi đè đích có sẵn/symlink. Giữ Product/Size/tên ảnh, IDs, giá, ledger, ảnh và snapshots nháp. Kiểm tra schema110/120, không migration âm thầm.
- Journal `restore-plan.json` trước copy; COPYFILE_EXCL, fsync writable handles, SHA trước/sau. SQLite sửa đường dẫn images trong transaction; schema, counts, integrity/FK và các checksum được kiểm tra trước `restore-ready.json`.
- Chỉ thay đường dẫn ảnh/cấu hình trong DB mới. Tắt startup/periodic/autoRename của watcher tại bản restore; xóa cached scan/notices chứa path cũ. Giá, đơn nháp, ledger và cấu hình nguồn giữ nguyên.
- Bản dở được giữ để review, không có READY và không được launcher tự mở. Retry tạo UUID mới; không tự xóa hoặc tiếp tục ghi đè bản dở. Generic service restore được khi kho nguồn đã mất, dùng nguyên backup và mapping đường dẫn cũ; GUI hiện chỉ thử trong sandbox còn chạy, không phải công cụ tự động thay thế DB thật sau thảm họa.
- GUI Cài đặt: tạo backup đầy đủ → chọn kho gốc trong backup → checkbox tạo bản thử mới → Phục hồi & kiểm chứng → báo thư mục/số ảnh/schema. Loading/error/pastel/responsive/sáng-tối, khóa backup/settings trong lúc restore.
- `RUN_WINDOWS_RESTORED_SANDBOX_TEST.bat`: chọn 1 V2 / 2 V1, mở kho READY mới nhất tại LOCALAPPDATA sandbox tương ứng. `run-restored-sandbox.mjs` kiểm tra marker/path/schema/integrity, từ chối cổng bận, chạy loopback3016, đợi health trước mở browser. Bản đang dùng ở3005/3006 giữ nguyên.

## Bằng chứng

Local test:gate PASS trước các guard bổ sung; sau đó restore50 + typecheck/build + HTTP57 PASS (bao gồm launcher3016 thật). CI của commit chứa checkpoint này phải xác minh lại toàn bộ gate/Linux Chromium/Windows22/24; không lấy run cũ. Không có Chromium local, không báo browser local PASS.

Restore50: V1/V2, byte/ID/giá/ledger/nháp/archive, watcher mapping, kho nguồn mất, đích tồn tại/overlap/mapping sai, file/manifest corruption, pending/in-flight archive, và **7 hard-exit points** (plan, image, archives, copy DB, trước/sau commit, ready). Bản dở không READY; source/bundle giữ nguyên. HTTP57: tạo backup/restore qua server thật, origin/confirmation guards, khởi động server bằng DB/kho mới, đọc tồn/nháp/JPEG/hash, kiểm chứng archive, launcher3016 thật rồi quay lại source. Chromium mở Cài đặt→backup→chọn kho→xác nhận restore→READY và kiểm tra desktop/mobile sáng/tối; ảnh bằng chứng thuộc Actions artifacts.

Directory fsync không được Node hỗ trợ trên một số Windows filesystem; file/SQLite flush và process-crash tests không thay thế thử cúp điện/hỏng ổ thực tế. Không coi CI là chủ shop nghiệm thu restore Windows.

## Nghiệm thu Windows mới (không cần lặp lại các ca đã PASS)

1. Giải nén source mới; chạy RUN_WINDOWS_V2_DRAFT_TEST.bat (hoặc V1 SAFE TEST để thử bản110).
2. Có ảnh kho đã import/nháp/bộ ảnh nhẹ thử. Vào Cài đặt → BACKUP ĐẦY ĐỦ. Chờ báo checksum đạt, có số file ảnh nhẹ.
3. Chọn kho gốc `warehouse` của sandbox trong phần Phục hồi thử. Đánh dấu tạo kho mới → Phục hồi & kiểm chứng. Chờ READY.
4. Mở RUN_WINDOWS_RESTORED_SANDBOX_TEST.bat, chọn1(V2) hoặc2(V1). Tự mở http://127.0.0.1:3016.
5. Đối chiếu Tổng quan/Tồn kho/Danh mục, ảnh gốc, ledger lệch nếu có; V2 mở đúng nháp, giá/giảm giá/ghi chú và Kiểm chứng lại bộ ảnh nhẹ.
6. Ctrl+C server3016, chạy lại launcher: dữ liệu bản restore còn nguyên. Kiểm tra bản nguồn3005/3006 không đổi.
7. Báo kết quả bản restore Windows; cập nhật checkpoint gate. Không test restore ghi đè D:\1-Me CaCao Store hoặc DB kinh doanh thật.

## Còn lại V2

Từ nền preview/archive/staging lab/restore này, tiếp theo mới nối quyết định commit thật, migration SALE/SOLD/UNIQUE claim, atomic confirm/idempotency/operation status, khóa mutation + đọc tồn/backup, ảnh nhẹ lịch sử và cleanup được duyệt. Backup version2 hiện bao phủ **AVAILABLE originals + trial archive**, chưa phải hợp đồng backup cho dữ liệu SOLD chưa tồn tại. Mobile LAN/cloud và công nợ/phiếu PNG vẫn thuộc các phiên bản đã chốt.
