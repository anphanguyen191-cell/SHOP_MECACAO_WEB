# V2 — Bán hàng trọn luồng trong sandbox (10/10/2026)

Chủ shop yêu cầu tiếp tục hoàn thiện để test Windows. Đợt này có **xác nhận bán thật trong kho test riêng**, không còn chỉ rehearsal theo từng đơn. Default LOCAL vẫn110, launcher nháp cũ vẫn120; launcher mới opt-in schema130. Không mở kho kinh doanh, LAN/cloud, hoàn/hủy đơn đã bán hoặc xóa gốc. Chưa khóa V2 STABLE.

## Luồng đã triển khai

- Nháp → kiểm tra toàn đơn/checksum → checkbox xác nhận → bán toàn đơn. Giá0 cần xác nhận thêm. Mỗi image ID =1 bộ.
- Gốc canonical trong sandbox được hard-link/unlink vào staging cùng volume, không ghi đè; nguồn ảnh ngoài kho không đổi. Ảnh JPEG1280/82 được tạo từ bytes kiểm chứng, giải mã lại, giữ riêng khỏi quét/import. Gốc đã bán **giữ lại** để nghiệm thu chất lượng và phục hồi; chưa tiết kiệm toàn bộ dung lượng.
- Schema130: sales_operations PREPARED/SOLD/ROLLED_BACK; sales_confirmations, UNIQUE sales_units.image_id, sales_ledger SALE1/bộ. Xác nhận/claim/snapshot/ledger trong BEGIN IMMEDIATE duy nhất. Ledger cũ/IDs không bị sửa; inventory_stock cộng ledger nhập và trừ sales_ledger. Tồn vẫn từ ảnh AVAILABLE có thật, không từ ledger.
- sales_orders của schema120 vẫn giữ trạng thái nháp nguồn; **trạng thái công khai SOLD được suy ra từ sales_confirmations**. Trigger khóa sửa/xóa đơn và items sau bán. Đọc chi tiết dùng snapshot đã bán, gồm giá vốn tại xác nhận; giá vốn0 hiển thị chưa xác định.
- Request key + input hash chống ghi trùng; retry cùng mã trả đúng operation. UI lưu mã trước POST, không tự tạo mã mới khi chưa rõ kết quả; tải lại/mở lịch sử đã bán có ảnh nhẹ. Danh sách tối đa200 đơn có bộ lọc SOLD, không trình bày tổng giá trị như tiền đã thu.
- Khóa file durable trước async prepare; middleware phối hợp mọi request đọc/ghi API với sale, watcher tạm ngừng. Process khác không được phục hồi khi PID chủ khóa còn chạy. Pending/thiếu journal/bằng chứng sai dừng an toàn; không báo backup đầy đủ hay số tồn nửa chừng.
- Nút Kiểm tra/phục hồi: chưa commit trả đúng canonical bằng hardlink không overwrite, checksum; đã commit kiểm chứng SOLD/archive và giữ gốc staging. Crash PREPARED DB trước journal là tình huống **manual review**, không suy diễn/xóa file. Sau commit/mất response hỏi status bằng mã cũ.
- Các tab stock/dashboard/catalog/explorer/suggestions cùng nguồn physical; SOLD không copy-gửi/rename/tạo nháp/bán lại. Import nội dung trùng hash SOLD bị từ chối để review hoàn hàng. Watch không coi canonical của SOLD là ảnh thiếu. Cover lấy ảnh còn tồn.
- API chỉ loopback + same-Origin. Cài đặt full backup schema130 dùng manifest3: DB, AVAILABLE originals, SOLD JPEG, staging originals, journals và prototype archives đã hoàn chỉnh. Kiểm chứng vai trò, snapshots, claims, ledger, ID/count/hash. Restore vào thư mục mới, remap canonical, giữ relative evidence và trạng tháiSOLD; không tự kích hoạt/ghi đè kho đang dùng. Backup thiếu ảnh/chưa rõ giao dịch/tamper bị từ chối.

## File test Windows

`RUN_WINDOWS_V2_SALES_TEST.bat`: port3007, `%LOCALAPPDATA%\ShopMeCaCao\V2SalesSandbox`, DB `database\shop-v2-sales.db`. Dùng source mới; sandbox cũ3006 độc lập. Restart fixture không tái tạo ảnh canonical đã bán. `RUN_WINDOWS_RESTORED_V2_SALES_TEST.bat` chọn1 mở kho restore V2Sales ở3016; chọn2 V1. Chi tiết `WINDOWS_V2_SALES_TEST.md`.

## Kiểm thử và giới hạn

`test:sales-execution`: local216 assertions; 15 subprocess hard-exit tại lock/archive/prepare/journal/link/stage/rows/commit/release; trước commit phục hồi toàn đơn, sau commit không bán lần hai. Riêng mất journal phải dừng manual review. Có thêm6 restore hard-exit, hai tiến trình thật tranh cùng hàng, retry, stale/false-checkbox, cross-order conflict, immutable records, current-cost snapshot, SHA tamper, canonical reappearance, retained original, portable backup/restore/backup lại và re-confirm sau rollback. Tất cả chạy kho giả lập.

`scripts/v2-sales-e2e.mjs`: server thật/import/nháp/confirm/stock/history/share/rename/scan/restart/backup/restore, default/V1/draft release gate; Chromium thật checkbox→sale→SOLD image→F5/lọc lịch sử + desktop1366/mobile390 sáng/tối. Mandatory cùng testgate và V1/V2 regressions trên Linux + Windows Node22/24. **Số assertion và CI cuối phải lấy từ run của đúng commit**, không lấy baseline làm bằng chứng mới.

Owner Windows vẫn cần chạy trọn checklist. Chất lượng1280/82 chưa nghiệm thu; cleanup/xóa staging chưa triển khai và chưa áp dụng thật. Schema130 là sandbox opt-in, không migration DB kinh doanh. Cần owner full restore/Windows acceptance, duyệt chính sách ảnh nhẹ/xóa gốc và release checklist trước STABLE/kho thật. Hoàn hàng, payment/COD/khách/PNG giữ phạm viV3; doanh thu/lợi nhuận báo cáo giữV4.
