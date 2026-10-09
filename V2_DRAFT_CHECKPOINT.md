# V2 — Đợt 1: nền dữ liệu và đơn nháp sandbox

Ngày 2026-10-10 (Việt Nam). Chủ shop: “triển khai tiếp đi bro”. Triển khai theo đặc tả V2 đã trình bày, **chỉ thử nghiệm đơn nháp**, chưa release V2 bán hàng và chưa khóa V1 STABLE.

## Đã triển khai

- Schema sandbox 120: sales_orders + sales_order_images; SQLite transaction, FK, snapshot Product/Size/SKU/giá trên từng image ID. Chưa có SALE ledger, SOLD state hay migration nghiệp vụ xác nhận bán.
- Migration 110 → 120 tạo snapshot `.pre-v120-*.bak`, kiểm tra integrity/schema trước DDL; DDL failure rollback. Bảo toàn ID/giá/ảnh/ledger V1. V1 từ chối DB mới hơn 110.
- CRUD nháp: tạo, danh sách có bộ lọc (tối đa 200), mở, sửa giá/giảm giá/ghi chú, thêm/bỏ ảnh, hủy giữ lịch sử. Quantity = image IDs; nháp không claim/giữ hàng, không thay file/tồn/ledger.
- Retry tạo đơn cùng key/payload không tạo trùng; key dùng lại với payload khác bị 409. Version ngăn hai cửa sổ ghi đè đơn nhau; update/hủy version cũ bị 409. Lưu lỗi rollback cả order/items.
- Giá VND nguyên không âm, tổng safe integer, discount không vượt subtotal; tối đa 100 ảnh khác ID. Giá vốn 0 của V1 được trình bày “chưa xác định”, không suy ra lợi nhuận.
- Mở lại giữ giá đã lưu; kiểm tra file tồn, Product/Size active, realpath sandbox. Ảnh mất/ngừng hoạt động được cảnh báo và không lưu cập nhật như hàng sẵn có.
- API chỉ mount khi SHOP_ENABLE_V2_DRAFTS=1 + sandbox; opt-in không có sandbox dừng trước mở DB. Việc ghi nháp yêu cầu loopback và Origin LOCAL cùng port.
- UI Bán hàng chỉ xuất hiện khi backend sandbox báo tính năng bật; thanh chọn ảnh có TẠO ĐƠN NHÁP/THÊM VÀO ĐƠN NHÁP. Copy/gửi vẫn riêng. Giá trị nháp ghi rõ chưa phải doanh thu.
- Launcher `RUN_WINDOWS_V2_DRAFT_TEST.bat`: port 3006, `%LOCALAPPDATA%\ShopMeCaCao\V2DraftSandbox`, DB `database\shop-v2-drafts.db`; không dùng kho hoặc DB V1 đã nghiệm thu. Launcher V1 chủ động tắt cờ V2.

## Kiểm chứng

- V2 service/schema: **39 assertions PASS local**: migration backup/bảo toàn business rows, DDL rollback, retry/key conflict, tiền, ảnh invalid/missing/inactive/outside, stale version, fault-injected save rollback, restart và invariant file/stock/ledger.
- Real V2 HTTP: **23 assertions PASS local**: create/read/update/cancel/restart, Origin rejection, sandbox gate trước mở DB, V1 newer-schema refusal, unchanged stock/ledger.
- V1 schema/core/performance/warehouse/share, build và source UI regression được chạy lại. Browser mới bắt buộc chạy ở Linux CI qua `scripts/v2-drafts-e2e.mjs`; máy local không có Chromium, tải runtime browser không thành công nên local chạy HTTP bằng V2_SKIP_BROWSER=1 và **không ghi local browser PASS**.
- GitHub Actions thêm V2 service vào gate Linux/Windows Node 22/24, V2 HTTP trên cả hai OS, real API + Chromium flow/light-dark/1366-390px ở Linux và ảnh chụp artifacts. Trạng thái chính xác phải đọc run gắn commit này; chưa coi cấu hình workflow là bằng chứng PASS.
- Windows chủ shop với launcher V2 mới: **CHƯA NGHIỆM THU**. Restore đầy đủ V1/V2: chưa được triển khai/khóa đạt trong đợt này.

## Giới hạn và bước tiếp

Đợt này không có nút Xác nhận bán, SALE, archive ảnh nhẹ, cleanup/xóa ảnh hoặc hoàn hàng. Decode/hash ảnh và canonical warehouse eligibility tại thời điểm bán, điều phối mutation/backup, journal crash recovery, backup/restore nhất quán vẫn phải hoàn thành ở đợt tiếp theo trước khi expose bán. Không gọi schema 120 đợt nháp là schema bán hàng hoàn chỉnh.

Giữ V1 LOCAL mặc định schema 110. Chỉ mở schema 120 bằng launcher V2 riêng. Quay lui đợt nháp: đóng server V2, giữ nguyên toàn bộ sandbox V2 để đối chiếu, chạy launcher V1 với DB V1 riêng; không đưa DB120 vào V1, không downgrade metadata. Nếu cần kiểm chứng pre-migration backup, dùng bản sao `.bak` ở thư mục sandbox mới, không ghi đè DB đang dùng. Đơn tạo sau migration không nằm trong backup trước migration.
