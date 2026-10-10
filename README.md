# SHOP MẸ CACAO WEB — bản mới nhất trên main

## Bản 3.2.0-stage4: Báo cáo và kiểm kê

Giữ đầy đủ chặng 1/2/3; thêm báo cáo bán hàng/dòng tiền/công nợ hiện tại, lãi gộp snapshot và thiếu vốn, sản phẩm đã bán, CSV; phiên kiểm kê Mẫu/Size có số đếm/chênh lệch/lý do/lịch sử, bảo vệ tab cũ và kho thay đổi. Kiểm kê không tự thay tồn ảnh.

- [Chức năng và cách dùng chặng 4](STAGE4_REPORTS_STOCKTAKE.md)
- [Kiểm thử chặng 4](STAGE4_TEST_REPORT.md)
- [Checkpoint main đầy đủ làm nền tảng chặng tiếp](MAIN_CHECKPOINT_STAGE4_2026-10-10.md)

### Nền tảng chặng 3: Thu tiền, công nợ, giao hàng và hậu mãi

Giữ đầy đủ chặng 1/2; thêm COD/chuyển khoản/tiền mặt, tiền cọc và thu nhiều lần, hoàn/điều chỉnh, đã thu/còn lại trên PNG, trạng thái giao/vận đơn, Công nợ theo khách và yêu cầu hậu mãi. Hàng trả được duyệt nhập bằng ảnh mới, hàng đổi xuất bằng đơn mới; không tự mở lại ảnh SOLD.

- [Chức năng và cách dùng chặng 3](STAGE3_PAYMENTS_AFTERCARE.md)
- [Kiểm thử chặng 3](STAGE3_TEST_REPORT.md)

### Nền tảng chặng 2: Khách hàng, phí ship và phiếu chốt đơn PNG

Bản đầy đủ kế thừa chức năng kho/nhập/chọn ảnh/bán hàng/backup/restore và tiến độ tác vụ chặng 1, bổ sung khách hàng, thông tin giao hàng, phí ship/miễn ship và phiếu PNG thương hiệu từ đơn đã lưu.

**Cách chạy Windows:** giải nén vào thư mục mới → chạy **START_SHOP.bat** → giao diện tự mở tại http://127.0.0.1:3000. Máy cần Node.js 22.13+ hoặc 24; lần đầu cần mạng để cài thư viện.

**Dữ liệu mới:** mỗi thư mục cài mới có DB mới, không tự nối dữ liệu thử cũ. Bấm **CHỌN KHO TRÊN MÁY** trước khi nhập dữ liệu để chọn kho mình tạo (`Kho/Mẫu/Size/ảnh`), rồi **QUÉT / IMPORT KHO** để duyệt và đăng ký. Hoặc giữ kho mặc định và dùng **Nhập hàng** COPY ảnh từ thư mục nguồn. Mở lại cùng bản cài giữ dữ liệu.

**v3.2.0-stage4:** giao diện sáng phân biệt nhóm chức năng bằng màu/viền rõ, chữ đậm. Thanh phiên bản hiển thị main, chặng 4 hiện tại và LAN/đồng bộ chưa triển khai. Windows dùng cùng mã main và đầy đủ chức năng LOCAL; `START_SHOP_CHANG_2.bat` gọi cùng launcher chính.

[Tải mã main mới nhất cho Windows](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/archive/refs/heads/main.zip) — giải nén vào thư mục mới, không tải đè bản cũ.

Không yêu cầu DB V1, backup V1 hoặc các launcher PREPARE/ACTIVATE để chạy bản phát triển này. Các tài liệu chuyển kho cũ là lịch sử và công cụ tương thích tùy chọn.

- [Tổng hợp chức năng main, kiến trúc và nền tảng chặng tiếp](MAIN_CHECKPOINT_2026-10-10.md)
- [Bắt đầu chặng 2](BAT_DAU_CHANG_2.txt)
- [Chức năng, kiến trúc và quy tắc chặng 2](STAGE2_CUSTOMERS_PNG.md)
- [Bằng chứng kiểm thử và giới hạn](STAGE2_TEST_REPORT.md)
- [CI của đúng bản main](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/workflows/pages.yml)

Ứng dụng nghiệp vụ chạy LOCAL trên máy. GitHub Pages là DEMO/PREVIEW; không kết nối DB/kho của shop. Lợi nhuận ròng/chi phí/thuế, điều chỉnh tồn tự động sau kiểm kê, ngân hàng/vận chuyển tự động, LAN và cloud chưa triển khai.

## Project governance
- `DEVELOPMENT_PRINCIPLES.md`: nguyên tắc bắt buộc về an toàn dữ liệu và hoàn thiện chức năng/giao diện cùng nhau.
- `PROJECT_STATE.md`: source of truth.
- `CHANGELOG.md`: lịch sử baseline/fix.
- `ROADMAP.md`: roadmap và gate.

### Phục hồi thử trên bản main

Cài đặt → Backup đầy đủ → Phục hồi thử sang vùng mới → kiểm tra READY. Luồng này không thay DB/kho đang chạy. Các launcher sandbox/V1→V2 riêng còn trong source để tương thích và kiểm thử; không phải bước cài bản main. Xem [checkpoint main](MAIN_CHECKPOINT_2026-10-10.md) để biết phạm vi hiện tại và các giới hạn.
