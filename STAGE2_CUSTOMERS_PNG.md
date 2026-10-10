## Cập nhật v3.0.1-stage2 — 2026-10-10

Giao diện sáng tăng tương phản và tách màu nhóm chức năng. `START_SHOP.bat` là launcher main thống nhất; alias chặng 2 gọi cùng launcher. Trước khi có dữ liệu, chọn thư mục kho trên UI; app tự restart, dùng kho đó trực tiếp theo layout DIRECT. DB vẫn riêng cho bản cài, không đọc/di chuyển DB cũ. Chọn kho không đăng ký hoặc thay đổi ảnh; quét/import có bước duyệt riêng. Đã có dữ liệu thì không đổi kho để tránh trộn đường dẫn. Thanh phiên bản ghi v3.0.1-stage2, main, chặng 2; chặng 3 chưa triển khai. Kiểm thử HTTP chọn kho/import/restart/bán/PNG/backup trên fixture; CI Linux và Windows 22/24 xác nhận cùng mã main.

# Chặng 2 — Khách hàng, giao hàng và phiếu chốt đơn PNG

Baseline chức năng: chặng 1 `aa304bc`. Đây là bản phát triển đầy đủ, khởi tạo dữ liệu riêng khi cài vào thư mục mới; không yêu cầu DB V1, gói chuyển kho hoặc dữ liệu thử của các bản trước.

## Chạy trên Windows

1. Giải nén bản ZIP vào **thư mục mới**. Máy cần Node.js 22.13+ (hoặc 24).
2. Chạy **START_SHOP.bat**. Lần đầu tự cài thư viện, build và mở http://127.0.0.1:3000. Giữ cửa sổ server khi sử dụng; đóng để dừng.
3. Trước khi nhập dữ liệu, bấm **CHỌN KHO TRÊN MÁY** để dùng thư mục kho mình tạo rồi **QUÉT / IMPORT KHO** để duyệt đăng ký ảnh; ứng dụng tự restart sau khi chọn. Hoặc giữ kho mặc định và vào **Nhập hàng**. Kho đích đã chọn sẵn. Chọn Mẫu mới / Size mới / Bổ sung Size, chọn thư mục ảnh nguồn trên giao diện, kiểm tra tên, Size, số ảnh và giá rồi xác nhận nhập.
4. Vào **Khách hàng** để thêm/tìm/sửa khách. Có cảnh báo số điện thoại trùng (chuẩn hóa +84 và 0).
5. Vào **Tồn kho**, chọn ảnh còn hàng → tạo đơn nháp. Trong **Bán hàng**, chọn khách, sửa người nhận/điện thoại/địa chỉ, giá, giảm giá và phí ship; nút Miễn ship đặt 0 đ. Bấm **Lưu thay đổi**.
6. Bấm **Xem trước / Tạo lại PNG**, xem phiếu, tải từng trang và tự gửi khách qua Zalo/Messenger. Có thể sửa đơn nháp, lưu và tạo lại phiếu.

Không cần chạy PREPARE / REVIEW / CHECK / ACTIVATE V1→V2 cho bản này. Các launcher cũ được giữ trong source để không làm mất chức năng cũ, nhưng **launcher của chặng 2 là START_SHOP.bat**.

## Quy tắc đã chốt

- Kế thừa chức năng/mã nguồn; dữ liệu thử của bản trước không phải điều kiện chạy.
- Dữ liệu bản cài ở `data/stage2/`, không đóng gói vào source/release. Mỗi thư mục giải nén mới bắt đầu rỗng. Restart cùng bản cài giữ dữ liệu đã nhập; không tự xóa mỗi lần mở.
- Nhập hàng COPY ảnh nguồn ngoài vào kho đã cấu hình; không MOVE hoặc đổi tên ảnh nguồn. Một ảnh còn trong kho = một bộ hàng.
- Nháp chưa giữ hàng/chưa trừ tồn. Tạo phiếu PNG không bán hàng.
- Thông tin giao hàng là snapshot trong đơn: sửa danh mục khách không đổi đơn đã lưu.
- Thêm ảnh vào đơn giữ thông tin khách và phí ship đang lưu.
- Tiền phải là số đồng nguyên không âm; giảm giá không vượt tiền hàng; tổng không vượt giới hạn số nguyên an toàn.
- Phiếu PNG 1080px, tối đa 8 bộ/trang, có ảnh, tên mẫu, Size, số lượng, giá; tổng toàn đơn trên trang cuối. Có thương hiệu Shop Mẹ CaCao / Since 2023.
- Xuất PNG từ dữ liệu đã lưu. Thay đổi phiên bản đơn trong lúc xuất làm yêu cầu thất bại, yêu cầu mở lại.
- Đơn SOLD không sửa giá/thông tin giao hàng. Phiếu sau bán dùng ảnh nhẹ đã lưu. SOLD chưa xác nhận thanh toán.
- Sổ bán hàng hiện ghi tiền hàng sau giảm; `payableTotal` trên đơn/phiếu gồm phí ship. Phí vận chuyển thực trả, thanh toán và công nợ thuộc chặng 3, chưa làm trong chặng 2.
- Cơ chế kiểm tra giao dịch, chống bán trùng, tiến độ tác vụ và backup/restore hiện có vẫn giữ; không có bước backup thủ công bắt buộc để mở bản mới.
- Chỉ chạy LOCAL trên máy; giao diện responsive không có nghĩa đã mở LAN/cloud.

## Kiến trúc và checkpoint

- SQLite schema nghiệp vụ V2 130 được giữ; thêm bảng `shop_customers` và `order_contacts` bằng bootstrap idempotent. `sales_orders`/`sales_order_images`, bằng chứng SOLD, ledger và cơ chế worker của chặng 1 được giữ.
- `customers.ts`: khách hàng, chuẩn hóa số điện thoại, duplicate warning, optimistic version, snapshot validation.
- `salesDrafts.ts`: lưu contact cùng transaction với items/version, kiểm tra tổng và chống tạo đơn trùng.
- `orderSlip.ts`: đọc đơn đã lưu, tạo PNG bằng sharp/SVG; phân trang và dùng archive khi SOLD.
- `freshDevelopment.ts`: chế độ dữ liệu riêng của bản mới; chọn kho đích trên UI trước khi có dữ liệu, dùng layout DIRECT nếu chọn ngoài thư mục cài; cho chọn ảnh nguồn khác để COPY.
- `CustomersView`, `CustomerContact`, `OrderSlip`: UI khách hàng, thông tin giao hàng, xem trước và tải PNG.
- `start-stage2.mjs`: chạy server và xác thực health đúng chế độ trước khi mở browser. Khóa PID ngăn hai server ghi cùng kho.

## Kiểm thử

`npm run test:stage2` kiểm tra khách trùng, version, snapshot khách, phí ship/miễn ship, overflow, idempotency, phiếu nhiều trang, khóa SOLD, restart và backup/restore giữ dữ liệu mới.

`node scripts/stage2-e2e.mjs` (sau build) tạo bản cài tạm riêng, kiểm tra HTTP kho rỗng, khóa server thứ hai, chặn ghi vào thư mục nguồn, COPY ảnh thật giả lập, khách/đơn/PNG, origin guard, restart, xác nhận bán và backup.

`npm run test:gate` chạy hồi quy toàn bộ schema/kho/nhập/chia sẻ/đơn/bán/restore/tác vụ, typecheck/build và kiểm tra source UI. CI chạy Linux và Windows Node 22/24; browser acceptance cũ chạy trong CI Linux.

Chưa triển khai COD/chuyển khoản, đã thu/còn lại/công nợ, hoàn hàng, báo cáo V4, dọn gốc tự động, LAN/cloud. Không coi kiểm thử tự động là bằng chứng đã thao tác trên máy hoặc kho thật của chủ shop.

Baseline runtime và CI đã xác nhận: xem [checkpoint main](MAIN_CHECKPOINT_2026-10-10.md). Chặng 2 đã có trên main, không còn BACKLOG.
