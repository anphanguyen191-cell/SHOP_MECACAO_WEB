# V2 — Atomic commit và phục hồi theo quyết định SQLite (2026-10-10)

Chủ shop yêu cầu tiếp tục V2. Đợt này chuyển nền staging prototype từ **quyết định giả lập do test đưa vào** sang **bằng chứng transaction trong SQLite thật**, chỉ trên database/ảnh bản sao. Đây là nền kỹ thuật đợt4, **chưa phải tính năng bán vận hành có UI/API**. Default LOCAL vẫn110, sandbox nháp vẫn120. V1 restore owner acceptance/STABLE và V2 release chưa khóa.

## Phạm vi đã triển khai

- `salesCommitLab.ts`: không được import/mount bởi server. Chỉ nhận database file thật nằm trong `.mecacao-v2-recovery-lab`, từ chối DB nguồn bên ngoài/memory/symlink; schema thử129 không được launcher V1/V2/restore chấp nhận.
- Migration120→129 chỉ trên bản sao: backup `pre-v129.bak` trước transaction, verify integrity/FK/schema120; giữ nguyên IDs, đơn nháp, giá, tồn ảnh, ledger cũ. Không thay CHECK/view nghiệp vụ110/120 để giả dạng SALE thành ADJUST_MINUS.
- Bảng lab riêng: durable PREPARED operation với request key/payload hash/journal hash; SOLD order snapshot, từng image snapshot, UNIQUE image claim và ledger SALE một bộ/mỗi image ID. Các bảng bán/claim/ledger và payload được bảo vệ khỏi UPDATE/DELETE bằng trigger.
- Toàn bộ đơn bán, claims, snapshots, SALE và trạng thái operation SOLD commit trong **một BEGIN IMMEDIATE**. Bất kỳ lỗi sau dòng đầu tiên cũng rollback toàn transaction. UNIQUE order và image claim chống lặp/bán hai lần; hai tiến trình riêng cùng tranh hàng chỉ một đơn thắng, không có partial sale.
- Snapshot giá bán/giảm giá/ghi chú từ nháp đã lưu; **giá vốn hiện tại của Size** được lấy ở prepare và revalidate trước commit. Cost0 theo mô hình hiện tại là chưa xác định, giữ NULL; không giả lợi nhuận. Đơn có giá0 yêu cầu acknowledgement rõ. Thay cost/đơn/status/relation/ảnh/archive sau prepare phải kiểm tra lại.
- Retry cùng operation/key/payload trả lại đúng kết quả, không ghi SALE/claim mới. Key/operation cũ với payload khác bị409. Service có status và payload hash cho host orchestration; status đọc DB/journal, trả RECOVERY_REQUIRED nếu bằng chứng không đủ, không báo thành công từ một cờ SOLD đơn lẻ. Chưa có HTTP operation status hoặc xử lý mạng trong UI.
- Staging journal phải khớp SHA và các canonical paths/image IDs của DB clone; canonical không còn chiếm đường dẫn, staged bytes cùng SHA; archive JPEG≤1280 được decode và SHA lại trước commit. Input là **evidence do trusted host tạo**, không phải API nhận kế hoạch archive/path do người dùng gửi; liên kết source→derivative phải được orchestrator tạo/kiểm chứng trước khi nối vận hành.
- `decision` đọc integrity/FK + payload hash + SOLD order/claim/image/ledger đầy đủ. PREPARED không có commit evidence → UNCOMMITTED. SOLD đầy đủ → COMMITTED. Thiếu DB row, journal sai, partial/tampered evidence hoặc đơn khác đã claim hàng → AMBIGUOUS.
- `recover` lấy hash **journal đang có thật**, tự hỏi DB rồi gọi staging recovery; caller không được tự đưa COMMITTED/UNCOMMITTED. Chưa commit thì trả clone về canonical đúng SHA, không ghi đè. Đã commit thì **giữ staging**, không đưa lại vào tồn hoặc SALE lần nữa. Mơ hồ dừng review, không đụng file.
- `lab_reconciled_ledger` là view đối soát thử riêng, không thay nguồn tồn: fixture2ảnh/ledger8 → bán2 thì canonical0, ledger thử6, ledger nguồn vẫn8. Không coi6 là số hàng thực tế.

## Kiểm thử / mức xác minh

`npm run test:sales-commit-lab` vào gate Linux/Windows22/24. Test tạo DB120 và ảnh nguồn riêng, VACUUM/copy sang lab; giữ hash DB/ảnh nguồn trong toàn bộ ca. Bao gồm backup/migration preserving rows, stale/cancelled snapshot, zero-price acknowledgement, archive checksum, rollback khi ném lỗi giữa transaction, immutability, repeat recovery/idempotency, wrong key/hash/journal và damaged commit evidence.

**11 hard-process-exit points**: PREPARED; linked/staged ảnh0 và1; trước transaction; sau sale row; sau image0/1; trước COMMIT; sau COMMIT. Restart đọc SQLite thực để quyết định phục hồi. **Hai tiến trình thật** cùng chờ barrier trước BEGIN IMMEDIATE, commit khác đơn/keys nhưng cùng hai image IDs: đúng một SOLD/2claims/2SALE; loser không được phục hồi ảnh đã thuộc winner.

Không coi process-exit/fsync tests là bảo đảm khi hỏng ổ/cúp điện thật. Không phải migration rollback sau khi đã bán. Bản129 chỉ cho lab, backup trước129 cho kiểm chứng quay lại schema120 trước sale. Xác minh CI trên exact commit mới; baseline bd4b9b6 có Actions38016377754 all SUCCESS, không dùng baseline thay CI mới.

## UI và phần chưa hoàn tất

Không bổ sung nút bán chưa đủ điều kiện. Theo DEVELOPMENT_PRINCIPLES, tính năng xác nhận bán vẫn **CHƯA HOÀN TẤT** cho đến database→service→API→UI→các tab→backup/restore được nối và nghiệm thu. Đợt này không cần chủ shop lặp lại Windows test nháp.

Bước tiếp: promotion schema chính thức trên backup clone; khóa mutation/đọc tồn xuyên import/rename/scan/share/backup; orchestrator tạo ảnh nhẹ+journal+stage; atomic confirm/idempotency/operation status; UI trạng thái mạng+SOLD history; đồng bộ eligibility ở mọi tab và manifest/restore SOLD. Cleanup/xóa staging và chất lượng ảnh nhẹ cần duyệt trước dùng thật. Không tự mở LAN hoặc ghi/xóa kho kinh doanh.
