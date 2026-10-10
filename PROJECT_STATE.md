# Checkpoint hiện tại — Chặng 4 — 3.2.0-stage4

Main giữ toàn bộ chức năng chặng 1/2/3; thêm báo cáo bán hàng/dòng tiền/lãi gộp và phiên kiểm kê lưu số đếm/chênh lệch/lý do. Nguồn trạng thái hiện tại: [checkpoint main đầy đủ](MAIN_CHECKPOINT_STAGE4_2026-10-10.md), [đặc tả chặng4](STAGE4_REPORTS_STOCKTAKE.md), [test report](STAGE4_TEST_REPORT.md).

Một START_SHOP.bat, chọn kho qua UI; bản cài mới dùng data/stage4/database/shop-stage4.db. Không tự mở DB test stage2/3. Kiểm thử chỉ giả lập. Local gate PASS, service78/HTTP77; CI main Windows22/24/Linux/browser cần đối chiếu đúng commit. Chưa nghiệm thu trên máy chủ shop/chưa STABLE.

Báo cáo tách doanh số, dòng tiền trong kỳ và công nợ hiện tại; thiếu giá vốn không báo lãi đầy đủ. Kiểm kê không tự đổi tồn ảnh/ledger; SOLD không trở lại tồn. Bước tiếp là nghiệm thu/sửa phản hồi, rồi đề xuất riêng LAN/đồng bộ; không tự triển khai backlog.

---

## Checkpoint chặng3 lịch sử

# Checkpoint hiện tại — Chặng 3 — 3.1.0-stage3

Chủ shop đã yêu cầu triển khai chặng tiếp. Main mới kế thừa đầy đủ chặng 1/2 và thêm thu/cọc/hoàn/điều chỉnh, COD/chuyển khoản/tiền mặt, giao hàng/vận đơn, Công nợ theo khách/đơn, hậu mãi và số đã thu/còn lại trên PNG. Xem [STAGE3_PAYMENTS_AFTERCARE.md](STAGE3_PAYMENTS_AFTERCARE.md) và [STAGE3_TEST_REPORT.md](STAGE3_TEST_REPORT.md).

`START_SHOP.bat` vẫn là launcher chính. Bản mới dùng DB phát triển riêng `data/stage3/database/shop-stage3.db`, không tự nối dữ liệu stage2. Chọn kho trước khi có dữ liệu qua UI; mở lại cùng bản giữ dữ liệu. Không thao tác kho thật khi kiểm thử.

SOLD và chứng từ tiền bất biến. Thu/giao/bán độc lập; hậu mãi lưu yêu cầu/kết quả, điều chỉnh/hoàn qua chứng từ riêng. Hàng trả thực nhận cần ảnh mới/nhập có duyệt, hàng đổi xuất qua đơn mới; không tự nhập lại ảnh SOLD. Local service/HTTP/gate PASS; CI Windows/Linux/browser theo đúng commit mới cần đối chiếu Actions. Chưa có nghiệm thu bản 3.1.0-stage3 trên máy chủ shop, chưa gắn STABLE.

Bước tiếp sau nghiệm thu: đề xuất báo cáo/kiểm kê. Không tự triển khai LAN/cloud hoặc chuyển khoản/ngân hàng tự động. Checkpoint chặng 2 bên dưới là baseline lịch sử, không phải trạng thái hiện tại.

---

# Trạng thái hiện tại — Shop Mẹ CaCao Web

Checkpoint 10/10/2026: **main đã tích hợp đầy đủ chặng 1 + chặng 2, runtime 3.0.1-stage2**. Windows dùng cùng mã main qua `START_SHOP.bat`; alias chặng 2 gọi cùng launcher. Không có bước chọn DB V1 hoặc migration dữ liệu thử cũ bắt buộc.

Nguồn tổng hợp chức năng, kiến trúc, quyết định và bước tiếp: [MAIN_CHECKPOINT_2026-10-10.md](MAIN_CHECKPOINT_2026-10-10.md). Khi tiếp tục phát triển, đọc tài liệu này cùng [DEVELOPMENT_PRINCIPLES.md](DEVELOPMENT_PRINCIPLES.md) và [ROADMAP.md](ROADMAP.md).

| Mục | Trạng thái |
|---|---|
| Baseline mã chạy | `099386ad48cef9babb525eb2d43e63fe22099449` trên main |
| Bằng chứng | [Actions 38042560022](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/runs/38042560022): Linux, Windows 22/24, browser và deploy SUCCESS |
| Chặng 1 | Kho theo ảnh, danh mục, nhập/COPY, quét/import/rename, chia sẻ, nháp/bán/lịch sử, backup/restore và tiến độ tác vụ đã tích hợp |
| Chặng 2 | Khách hàng, contact snapshot, ship/miễn ship, tổng thanh toán, PNG nhiều trang/tạo lại/SOLD đã tích hợp |
| Tối ưu mới nhất | Giao diện sáng tăng tương phản; chọn kho trên UI, tự restart; hiển thị phiên bản/main/chặng hiện tại |
| Dữ liệu | DB mới theo thư mục cài mới; mở lại cùng bản giữ dữ liệu; chọn kho trước khi có dữ liệu, quét/import sau bước duyệt |
| Phát hành hiện tại | Bản phát triển đầy đủ chức năng đã triển khai; chưa gắn STABLE nghiệm thu máy chủ shop |
| Bước tiếp | Đặc tả chặng 3 thu tiền/công nợ/hậu mãi, trình chủ shop duyệt trước khi triển khai |

CI chỉ dùng fixture/thư mục tạm. Không truy cập kho thật của chủ shop. Chủ shop chưa xác nhận nghiệm thu Windows của bản 3.0.1-stage2; không lấy báo cáo cũ thay cho bản mới. Các cập nhật tài liệu không thay phiên bản runtime; nếu mã chạy đổi, cập nhật baseline/CI mới.

## Quy tắc ưu tiên

- Kế thừa chức năng và mã; không bắt kế thừa dữ liệu thử. Bản tải mới giải nén vào thư mục mới, không ghi đè/xóa bản cũ.
- Một ảnh đăng ký còn trong kho = một bộ còn tồn. Ledger là lịch sử/đối soát. Nháp/PNG/chọn/chia sẻ không trừ hàng.
- Snapshot khách/hàng đã lưu không tự đổi theo danh mục; SOLD bất biến, chưa đồng nghĩa đã thu tiền.
- Giữ transaction, request key/version, journal/hash, locking, recovery và full backup/restore. Tối ưu UI cùng chức năng.
- Ý tưởng mới ngoài phần duyệt cần đề xuất riêng. Quyền tích hợp các phần đã duyệt lên GitHub main và chạy Windows CI đã được cấp.

## Lịch sử

[Nhật ký trạng thái trước checkpoint tổng hợp](docs/history/PROJECT_STATE_BEFORE_MAIN_CHECKPOINT_2026-10-10.md) được giữ nguyên để truy vết. Các dòng “default V1”, “V3 BACKLOG”, “không có bán”, “progress không live” hoặc gate chuyển DB trong checkpoint cũ chỉ mô tả các bản cũ; không thay thế trạng thái hiện tại ở đây.
