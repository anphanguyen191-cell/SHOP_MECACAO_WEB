# Chặng 4 — Báo cáo và kiểm kê — 3.2.0-stage4

Chủ shop đã duyệt triển khai chặng tiếp theo trên nền chặng 3 ngày 10/10/2026. Bản mới giữ toàn bộ chức năng chặng 1/2/3. Một launcher `START_SHOP.bat`, dữ liệu mới theo thư mục cài; chọn kho riêng qua UI trước khi nhập.

## Báo cáo

Mở **Báo cáo**, chọn từ ngày/đến ngày rồi **Xem báo cáo**. Mặc định từ đầu tháng đến hôm nay theo giờ Việt Nam; ngày cuối tính trọn ngày, không phụ thuộc timezone máy Windows. Bấm mã đơn để mở đơn và xem thanh toán. Xuất CSV đơn bán hoặc chứng từ; CSV có BOM UTF-8 và chống nội dung trở thành công thức Excel.

| Chỉ tiêu | Công thức / phạm vi |
|---|---|
| Tiền hàng trước giảm | Tổng subtotal của xác nhận SOLD trong kỳ |
| Tiền hàng sau giảm | Tổng subtotal − discount của SOLD; không bao gồm ship |
| Tổng đơn | Tiền hàng sau giảm + phí ship thu khách tại lúc bán |
| Số bộ / sản phẩm | Các sales_units đã bán, tên/Size/giá từ snapshot lúc bán |
| Tiền thu / hoàn | Chứng từ RECEIPT / REFUND ghi trong kỳ, gồm cả cọc ở nháp |
| Tiền thu ròng | Thu − hoàn trong kỳ; có thể âm; không đồng nghĩa doanh số |
| Điều chỉnh giảm | Chứng từ CREDIT ghi trong kỳ, báo riêng khỏi số bán gốc |
| Lãi gộp hàng tại lúc bán | Tiền hàng sau giảm − giá vốn snapshot; chưa trừ ship, chi phí vận hành hoặc hậu mãi |
| Thiếu giá vốn | Nếu bất kỳ bộ nào thiếu vốn, tổng lãi hiển thị “Chưa đủ giá vốn”; không coi vốn chưa nhập là 0 |
| Công nợ / cần hoàn hiện tại | Số dư hiện tại của tất cả đơn SOLD, kể cả đơn ngoài kỳ; không phải báo cáo số dư cuối kỳ |

Giá vốn hoặc tên sản phẩm thay đổi hôm nay không viết lại báo cáo bán cũ. Đơn nháp/hủy không tính doanh số. Không tự quy việc hoàn tiền thành trả hàng hoặc giảm doanh số: giảm trừ dùng CREDIT riêng. Chưa có lợi nhuận ròng, chi phí vận chuyển thực trả, kế toán thuế hoặc công nợ theo mốc lịch sử.

## Kiểm kê

1. Nhập hoặc quét/import hàng trước; mở **Kiểm kê**, đặt tên và **Mở phiên kiểm kê mới**. Chỉ có một phiên đang mở.
2. Phiên chụp mọi Mẫu/Size đã đăng ký, gồm trạng thái ngưng hoạt động; lưu tồn sổ, tồn ảnh hiện hữu, số ảnh thiếu và số ảnh SOLD. Ảnh SOLD/khu vực nội bộ không tính tồn.
3. Đếm hàng thực tế theo Size, nhập số đếm (0 được chấp nhận; trống = chưa đếm). Chênh lệch = số đếm − tồn ảnh tại đầu phiên. Ghi lý do cho từng Size lệch.
4. **Lưu số đếm**; có thể lọc mẫu/Size hoặc chỉ hàng lệch/chưa đếm. CSV chỉ xuất số đã lưu trên máy chủ. Đếm chưa lưu được báo rõ; trình duyệt cảnh báo khi đóng/reload.
5. Ghi kết luận, **Xác nhận hoàn tất kiểm kê**. Phải đếm đủ, lưu trước, có lý do các Size lệch. Kho thay đổi trong lúc đếm sẽ chặn chốt; hủy với lý do rồi tạo phiên mới.
6. Mở lại phiên hoàn tất/hủy để xem và xuất CSV. Không sửa/xóa lịch sử cuối cùng.

**Kiểm kê không tự tạo tồn hoặc tự xóa ảnh.** Hàng thực nhận nhập qua Nhập hàng; ảnh thiếu/dư phải kiểm tra và quét/import có duyệt. Ledger chỉ dùng đối soát. Số đếm thiếu không tự biến thành SALE; hàng đã SOLD không tự trở lại tồn. Đây là phiên kiểm kê và ghi nhận chênh lệch, chưa có điều chỉnh ảnh/tồn tự động sau kiểm kê.

Nếu mất phản hồi tạo phiên, cùng mã yêu cầu trả lại đúng phiên; UI giữ mã này qua reload. Lưu số đếm kiểm tra version: tab cũ không ghi đè. Chốt phiên có retry cùng version/kết luận an toàn. Kho được nhận diện bằng metadata/ảnh còn hiện hữu và dấu thời gian file; nếu ảnh đổi/di chuyển, ledger hoặc danh mục đổi thì phiên cũ cần làm lại. Sau restore, phiên OPEN có thể cần hủy/đếm lại vì file đã được copy mới; phiên CLOSED/CANCELLED giữ nguyên snapshot.

## Kiến trúc / dữ liệu

- `businessReports.ts`: range ngày VN, đọc snapshot/ledger trong read transaction; cộng tiền bằng BigInt, trả tổng tiền dạng chuỗi để không làm tròn khi tổng nhiều đơn vượt Number.MAX_SAFE_INTEGER.
- `stocktake.ts`: bootstrap 2 bảng `stocktake_sessions`, `stocktake_rows`, transaction, version, fingerprint kho và SHA snapshot; trigger chặn sửa/xóa snapshot và phiên đã kết thúc. Snapshot chỉ lưu mã/tên/số lượng, không mang đường dẫn tuyệt đối cần remap khi restore.
- API dưới `/api/sales/drafts/reports/...` và `/api/sales/drafts/stocktakes/...`; chỉ bật khi salesExecution có schema130, dùng cùng loopback/origin/task/sale fences.
- `BusinessReports.tsx`, `StocktakeView.tsx`, `stage4.css`: lọc, tổng hợp, bảng cuộn trong khối trên màn hình hẹp, loading/rỗng/lỗi, sáng/tối, xuất CSV.
- `salesBackup.ts`: validate SHA/snapshot/số đếm, copy toàn DB; restore giữ bảng kiểm kê và chứng từ; không tự kích hoạt bản phục hồi.
- Schema nghiệp vụ giữ130; bootstrap bảng mới trên DB của bản cài. **Bản phát triển mới dùng `data/stage4/database/shop-stage4.db`**, không mở stage2/3 tự động. Không yêu cầu chuyển dữ liệu thử cũ.

## Kiểm chứng

`npm run test:stage4`: 78 kiểm tra nghiệp vụ. HTTP fresh main: 77 kiểm tra xuyên chặng 2/3/4. Full gate đã PASS trên fixture Linux; CI main chạy thêm Windows Node22/24, Chromium desktop/mobile sáng/tối và backup/restore UI. Xem [test report](STAGE4_TEST_REPORT.md). CI không thay nghiệm thu trên máy chủ shop; chưa gắn STABLE.

Mobile LAN, đồng bộ/cloud, ngân hàng/vận chuyển tự động và bù trừ đổi hàng tự động chưa triển khai; cần duyệt phạm vi riêng.
