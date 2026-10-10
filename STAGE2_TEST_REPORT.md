## Cập nhật v3.0.1-stage2 — 2026-10-10

Giao diện sáng tăng tương phản và tách màu nhóm chức năng. `START_SHOP.bat` là launcher main thống nhất; alias chặng 2 gọi cùng launcher. Trước khi có dữ liệu, chọn thư mục kho trên UI; app tự restart, dùng kho đó trực tiếp theo layout DIRECT. DB vẫn riêng cho bản cài, không đọc/di chuyển DB cũ. Chọn kho không đăng ký hoặc thay đổi ảnh; quét/import có bước duyệt riêng. Đã có dữ liệu thì không đổi kho để tránh trộn đường dẫn. Thanh phiên bản ghi v3.0.1-stage2, main, chặng 2; chặng 3 chưa triển khai. Kiểm thử HTTP chọn kho/import/restart/bán/PNG/backup trên fixture; CI Linux và Windows 22/24 xác nhận cùng mã main.

# Báo cáo bàn giao chặng 2

Mã nguồn được phát triển từ baseline chặng 1 `aa304bc`. Tất cả dữ liệu kiểm thử là giả lập/bản cài tạm; không truy cập kho kinh doanh trên máy chủ shop.

## Phạm vi hoàn thành

Khách hàng; cảnh báo điện thoại trùng; tìm/sửa khách; snapshot giao hàng trong đơn; phí ship/miễn ship; tổng thanh toán; lưu/mở/sửa nháp; PNG thương hiệu từ đơn đã lưu; phiếu nhiều trang; tạo lại PNG; xuất từ lịch sử SOLD; bản cài dữ liệu mới và launcher một bước. Toàn bộ source và chức năng baseline được giữ.

## Bằng chứng trên môi trường Linux Node 24

- TypeScript + production build: PASS.
- Kiểm thử chặng 2: PASS 26 kiểm tra nghiệp vụ, PNG, restart và restore.
- HTTP bản cài mới: PASS 19 kiểm tra kho rỗng, khóa server thứ hai, COPY nguồn ngoài, chống origin khác, khách/đơn/PNG, restart, bán và backup.
- Hồi quy `npm run test:gate`: PASS (schema, core, performance, warehouse, sharing, drafts, preflight, preview, archive, staging, commit, confirmation, sales execution, restore, tasks, chặng 2, build, source UI).
- Hồi quy HTTP đơn nháp: PASS 77 kiểm tra; HTTP bán hàng: PASS 56 kiểm tra. Browser được bỏ qua có chủ đích trên host hiện tại.
- Kiểm tra trực quan phiếu PNG mẫu: tiếng Việt có dấu, ảnh/tên/Size/giá/ship/tổng rõ ràng.

## Giới hạn kiểm chứng

CI trên nhánh `main` chạy Linux Node 22, Windows Node 22/24 và Chromium desktop/mobile. Kết quả của đúng commit xem tại [GitHub Actions](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/workflows/pages.yml). Chỉ kết luận PASS khi toàn bộ job của commit đó thành công; không dùng kết quả baseline thay cho bản mới.

Môi trường phát triển local không có Chromium; kiểm tra UI tại local gồm typecheck/source và phiếu PNG. Browser acceptance được thực hiện qua CI Linux. GitHub Pages chỉ deploy sau khi cả Linux và Windows đạt.

Bản ZIP dùng để chạy thử chặng 2. Chưa gắn nhãn STABLE nghiệm thu trên Windows. COD/thu tiền/công nợ và hậu mãi vẫn thuộc chặng 3.
