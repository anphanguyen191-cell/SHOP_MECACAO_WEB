# Nền tảng main — Chặng 4 — 10/10/2026

Runtime **3.2.0-stage4**, mã Windows tải từ main. Dùng checkpoint này làm trạng thái hiện tại; checkpoint stage2/stage3 là lịch sử. Chủ shop đã duyệt triển khai báo cáo/kiểm kê bằng yêu cầu “Triển khai chặng tiếp theo đi bro”. Quyền tích hợp mã đã duyệt lên main và kiểm thử CI đã có.

## Toàn bộ chức năng hiện có

| Nhóm | Chức năng trên main |
|---|---|
| LOCAL | API Node/SQLite + giao diện React; một START_SHOP.bat; tự mở trình duyệt, chọn kho qua UI/tự restart; hiển thị main/phiên bản/chặng |
| Danh mục | Sản phẩm, mã, Size/SKU, trạng thái, giá vốn/bán, ảnh, tìm/lọc/sắp xếp/dashboard |
| Kho theo ảnh | Một ảnh đăng ký còn hiện hữu = một bộ; chỉ số tồn thực/sổ/chênh lệch; xem/chọn ảnh; ảnh SOLD không tính tồn |
| Nhập hàng | COPY từ nguồn, duyệt Mẫu/Size/giá, nhập nhiều bộ; transaction/rollback/recovery; nguồn giữ nguyên |
| Quét / Import | Chọn kho Mẫu/Size/ảnh, quét/tóm tắt/cảnh báo, đăng ký hàng loạt có duyệt, theo dõi kho, đổi tên an toàn; không tái dùng đường dẫn đã SOLD |
| Chia sẻ | Chuẩn bị ảnh JPEG, tải/copy nhanh qua bridge clipboard Windows; kiểm tra tồn khi thao tác |
| Nháp / Bán | Chọn ảnh tồn → nháp; sửa giá/giảm; cảnh báo ảnh trùng nháp; preview/preflight/duyệt bán; lưu SOLD/ảnh lưu trữ/lịch sử bất biến |
| Khách hàng | Thêm/tìm/sửa; liên hệ giao hàng snapshot, phí ship/miễn ship; chỉnh nháp, SOLD giữ chứng từ gốc |
| PNG | Phiếu thương hiệu 1080px nhiều trang, ảnh/chứng từ/contact/ship; tạo lại nháp/SOLD; hình thức dự kiến, đã thu/còn lại/cần hoàn và revision tiền |
| Thu tiền / Giao hàng | COD/chuyển khoản/tiền mặt; cọc/thu nhiều lần/hoàn/giảm trừ; chứng từ không sửa/xóa, retry/version; trạng thái giao và mã vận đơn độc lập |
| Công nợ / Hậu mãi | Phải thu/cần hoàn theo khách/đơn SOLD; yêu cầu trả/đổi/hỗ trợ, kết quả bất biến; trả thực nhận ảnh mới, đổi xuất đơn mới |
| Báo cáo (chặng4) | Lọc ngày VN, đơn/bộ/tiền hàng/ship, tiền thu/hoàn/giảm trong kỳ, lãi gộp snapshot và thiếu vốn, công nợ hiện tại, sản phẩm bán, CSV |
| Kiểm kê (chặng4) | Phiên đếm Mẫu/Size, snapshot tồn sổ/ảnh/thiếu/SOLD, số đếm/chênh/lý do, version/kho thay đổi, hoàn tất/hủy/lịch sử/CSV; không tự chỉnh tồn |
| Backup / Restore | DB + ảnh gốc + archive + SHA, phục hồi thử vào vùng riêng/READY, giữ khách/tiền/hậu mãi/kiểm kê; không tự kích hoạt hoặc thay kho đang chạy |
| Giao diện / Tác vụ | Dashboard trên đầu có thu gọn, gọn/thoải mái, sáng/tối tương phản rõ, responsive, trạng thái rỗng/lỗi/busy, task worker và fence/review/recovery |

## Quyết định đã chốt

- Mỗi bản tải mới giải nén thư mục mới, đầy đủ chức năng/mã nguồn nhưng DB phát triển mới. Không ép kế thừa/migration DB test trước; import qua UI nếu cần. Không tải đè/xóa kho cũ. Restart cùng bản giữ dữ liệu.
- Chọn kho qua UI trước khi nhập; đường dẫn DB không phải thao tác người dùng. Kho đã chọn là nơi phần mềm thao tác nhập/rename/bán khi người dùng duyệt.
- Mọi kiểm thử dùng ảnh/DB giả lập, thư mục tạm. Không test trên kho thật của chủ shop.
- Ledger là lịch sử; tồn dựa ảnh đã đăng ký còn hiện hữu; nháp/PNG/chia sẻ/kiểm kê không trừ hàng.
- `total` = tiền hàng sau giảm; `payableTotal` = total + ship. Thu tiền, bán, giao hàng và điều chỉnh/hậu mãi độc lập. Chứng từ SOLD/contact/SALE/finance và kết quả hậu mãi/kiểm kê giữ nguyên.
- Không giả định giá vốn thiếu là0/lợi nhuận đầy đủ. Lãi gộp không phải lợi nhuận ròng. Công nợ hiện tại không phải số dư cuối kỳ.
- Hoàn tất phải gồm DB/service/API/UI/module liên quan/recovery/tests/checkpoint. CI PASS, nghiệm thu Windows của chủ shop và STABLE là các trạng thái riêng.

## Kiến trúc và khôi phục

React/Vite giao tiếp Express LOCAL cùng máy; SQLite schema130, WAL/FULL, image IDs ổn định. `salesExecution` chuyển canonical sang vùng sales, archive giữ ảnh nhẹ và original retained; worker giữ task/recovery fences. Các bảng khách/finance/hậu mãi/kiểm kê bootstrap idempotent; bản stage4 dùng DB mới `data/stage4/database/shop-stage4.db`. Báo cáo đọc snapshot và BigInt trong read transaction. Kiểm kê lưu snapshot/hash/version, không ghi image/ledger. Full backup validation bảo toàn bảng và ảnh; restore không remap snapshot kiểm kê vì không chứa đường dẫn tuyệt đối.

Chi tiết: [chặng4](STAGE4_REPORTS_STOCKTAKE.md), [chặng3](STAGE3_PAYMENTS_AFTERCARE.md), [chặng2](STAGE2_CUSTOMERS_PNG.md), [nguyên tắc](DEVELOPMENT_PRINCIPLES.md).

## Bằng chứng / giới hạn / bước tiếp

Local gate PASS; service chặng4 78 kiểm tra, HTTP main77; CI Windows22/24/Linux/browser trên mã mới đối chiếu [Actions](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/workflows/pages.yml) và [test report](STAGE4_TEST_REPORT.md). Baseline stage3 `2a90a29` đã PASS [CI38045120776](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/runs/38045120776). Chưa có nghiệm thu stage4 trên máy chủ shop; không tự gắn STABLE.

Báo cáo chưa có lợi nhuận ròng/chi phí/thuế hoặc số dư công nợ tại mốc quá khứ. Kiểm kê ghi nhận chênh lệch, không tự điều chỉnh tồn ảnh. LAN/cloud/ngân hàng/vận chuyển tự động chưa triển khai. Không tự mở rộng phạm vi này.

Bước tiếp: chủ shop chạy bản main mới, ưu tiên sửa lỗi nghiệp vụ/UI được phản hồi; sau đó đề xuất riêng phạm vi Mobile LAN hoặc đồng bộ. Không lấy yêu cầu triển khai chặng4 làm quyền triển khai tự động các chặng sau.
