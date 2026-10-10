# Checkpoint mới — sandbox130

2026-10-10: owner USER-REPORTED PASS đủ10 bước Windows trong chat, bao gồm restart/rename/full restore. Source c6f73ea, Actions38029511584 all SUCCESS. Xem `V2_WINDOWS_ACCEPTANCE_2026-10-10.md`; không suy diễn các ca fault-injection/manual crash chưa được báo. Còn chuẩn bị release LOCAL/migration DB V1/rollback và duyệt ảnh nhẹ/cleanup; chưa V2 business STABLE. Các ghi chú chờ owner Windows bên dưới là lịch sử.

Bán toàn đơn và lịch sử, khóa xuyên API/watcher, backup/restore các vai trò đã nối trong sandbox riêng. `V2_SALES_SANDBOX_CHECKPOINT.md` và `WINDOWS_V2_SALES_TEST.md` thay trạng thái cũ cho scope này. Không đánh dấu owner Windows/kho thật/cleanup/STABLE PASS.

# V2 — Thứ tự triển khai và nghiệm thu

Ngày: 2026-10-10. **Đợt nháp sandbox đã triển khai; chưa có xác nhận bán/xóa ảnh.** Xem `V2_DRAFT_CHECKPOINT.md`. Đợt 1/2 có nền schema120 + CRUD/UI nháp; đợt 0 có automated full restore/launcher (`V2_BACKUP_RESTORE_CHECKPOINT.md`), Windows restore/STABLE vẫn là gate release, đợt 3 có prototype ảnh nhẹ chỉ đọc (`V2_IMAGE_PREVIEW_CHECKPOINT.md`); đợt 3 có lưu derivative bền vững + cloned-file staging lab (`V2_ARCHIVE_RECOVERY_CHECKPOINT.md`); backup/restore schema110/120 + trial archives có nền mới; kiểm tra toàn đơn chỉ đọc + UI có V2_PREFLIGHT_CHECKPOINT.md; nối SALE/claim/cleanup/SOLD backup và đợt 4–7 chưa hoàn tất.

| Đợt | Công việc | Bằng chứng cần có |
|---|---|---|
| 0 | Khóa baseline V1; ghi nhận Windows user PASS; hoàn tất checkpoint full restore; duyệt đặc tả V2 | Commit V1, checklist/restore trên sandbox, backup quay lui |
| 1 | Thiết kế schema, service contracts, states và idempotency; migration schema 110 → schema V2 được chốt | Bản sao DB V1; ID, ledger, giá, ảnh/checksum giữ nguyên; rollback trước ghi bán; V1 từ chối schema mới |
| 2 | CRUD đơn nháp và validation tiền/số lượng | Mở lại/sửa/hủy nháp không đổi ảnh/tồn/ledger; version stale bị 409 |
| 3 | Prototype tối ưu ảnh + staging/journal/recovery, chưa expose nút bán kho thật | Preview chất lượng/dung lượng được duyệt; fault injection trước/sau mỗi bước; không xóa ảnh chưa an toàn |
| 4 | Confirm toàn đơn, SALE ledger, claim ảnh, idempotency và recovery | Cùng ảnh hai cửa sổ chỉ bán một lần; retry không tạo đơn/ledger trùng; inventory reads/backup nhất quán |
| 5 | UI Bán hàng + Đưa vào đơn từ Tồn kho, preview, lịch sử ảnh nhẹ | Windows/mobile sáng/tối/density; copy-gửi độc lập; mất mạng hiển thị trạng thái đúng |
| 6 | Rà tất cả module và backup/restore V2 | Không cộng archive vào tồn, không import lại SOLD, rename/copy loại SOLD; restore sang kho mới giữ trạng thái |
| 7 | CI và Windows acceptance sandbox | Linux + Windows Node 22/24 + browser PASS; chủ shop nghiệm thu; cập nhật docs và khóa V2 STABLE |

## Nền transaction đợt4 — chưa release confirm

`V2_ATOMIC_COMMIT_CHECKPOINT.md`: trên DB/ảnh bản sao có migration129, atomic SOLD/claim/SALE, request-key idempotency và DB-derived recovery; kiểm thử hai tiến trình thật tranh cùng hàng, 11 hard-exit points. Không mount server/UI, không đánh dấu các ca bán vận hành bên dưới PASS. Còn promotion schema chính thức, khóa xuyên module, orchestration/confirm/API/UI và SOLD backup/restore.

## Rehearsal từ UI/API — chưa bán nguồn

`V2_CONFIRM_TRIAL_CHECKPOINT.md`: nút Thử xác nhận trên bản sao, snapshot DB/ảnh, trusted JPEG, stage/commit, persistent-key retry/status/recovery, resume sau reload; nguồn DRAFT/stock/ledger giữ nguyên. Bản thử không thuộc backup nguồn, không migration/source SALE. Không đánh dấu V2 operational acceptance bên dưới PASS từ rehearsal.

## Ca kiểm thử bắt buộc

- [ ] Một bộ, nhiều bộ cùng Size, nhiều Size/Product; số lượng đúng image IDs.
- [ ] Nháp không giữ hàng; hai nháp cùng ảnh, ảnh bị bán trước lúc mở lại, giá Product đổi sau lưu nháp.
- [ ] Giá/giảm giá âm, thập phân, overflow, discount > subtotal, 0 đồng có xác nhận; cost chưa biết không giả thành 0.
- [ ] ID trùng, không đăng ký, Product/Size inactive, file thiếu, đường dẫn ngoài sandbox/symlink escape, file đổi hash hoặc không giải mã được.
- [ ] Bán vượt số ảnh thật, chọn cùng ảnh ở hai cửa sổ, gửi hai lần, cùng idempotency key đổi payload; không partial sale.
- [ ] Disk full, quyền bị từ chối, lỗi decode/ghi bản nhẹ, staging khác volume, lỗi rename/commit/cleanup; nguyên trạng hoặc dừng an toàn có trạng thái rõ.
- [ ] Kill process sau journal, mỗi bước chuẩn bị/rename, trước và sau DB commit, giữa cleanup; restart không bán trùng hoặc xóa file nghi ngờ.
- [ ] Gốc ngoài kho giữ bytes; trước commit gốc kho phục hồi được; sau commit ảnh nhẹ đủ liên kết/hash, cleanup chỉ xóa staging được kiểm chứng.
- [ ] Ngắt HTTP sau commit; client hỏi lại operation, không POST key mới hay ghi ledger lần hai.
- [ ] Tổng quan/Danh mục/Tồn kho/chi tiết/scan/gợi ý cùng số; SOLD không xuất hiện trong copy/rename/import lại.
- [ ] Backup khi sale đang xử lý không thành “hoàn chỉnh” sai; restore DB + AVAILABLE originals + SOLD derivatives sang đường dẫn mới; FK/integrity/count/checksum PASS.
- [ ] V1 regressions toàn bộ: nhập ba luồng, duplicate, scan/watch, rename, clipboard groups, restart, backup, UI six tabs và performance fixture.
- [ ] Windows sandbox thực tế: chọn hàng → nháp → preview → bán → restart → kiểm tra kho/ảnh nhẹ → backup/restore. Không test giao dịch trên `D:\1-Me CaCao Store` thật.

## Checkpoint mỗi đợt

Source commit, thay đổi nghiệp vụ, schema/migration, tests đã chạy, Windows kiểm tra đến đâu, lỗi còn lại và rollback phải được ghi trong PROJECT_STATE/CHANGELOG. Không dùng một lần CI PASS hoặc commit để thay Windows PASS/STABLE. Không ghi PASS cho các ô chỉ mới chuẩn bị.
