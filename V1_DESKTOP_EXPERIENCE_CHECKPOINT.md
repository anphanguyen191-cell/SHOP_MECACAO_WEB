# V1 — Trải nghiệm desktop gọn và dễ thao tác

Ngày: 2026-10-09. Phạm vi được chủ shop duyệt: tối ưu đồng bộ giao diện V1, tham khảo bố cục dashboard trong video gửi, giảm cuộn trên Windows và giữ thao tác thuận tiện trên mobile.

## Thay đổi

- Chế độ **Gọn / Thoải mái**, nhớ trong trình duyệt. Gọn mặc định; chỉ nén bố cục từ 1000px trở lên. Điện thoại giữ kích thước thao tác; đổi lựa chọn trong Cài đặt → Không gian làm việc.
- Header/menu/banner nhỏ hơn; dashboard, KPI, biểu đồ và thẻ sản phẩm tận dụng chiều ngang. Sáu tab cùng một nhịp khoảng cách, cỡ chữ và trạng thái focus.
- Tổng quan có năm KPI cùng hàng, ba khối phân tích; thẻ sản phẩm ngang và bộ lọc gọn. Import có mười KPI chia hai hàng; bảng Size và vùng xác nhận gọn, không nổi che nội dung trên desktop Gọn.
- Nhập hàng có nút Đến form nhập; nhãn phân biệt kho đích với ảnh nguồn ngoài kho. Tại desktop đủ rộng, Size/SKU/nguồn/số ảnh/giá nằm cùng hàng; đường dẫn đầy đủ có tooltip.
- Dark mode tăng tương phản chữ phụ, placeholder. Tôn trọng tùy chọn giảm chuyển động của thiết bị; ảnh giữ tỷ lệ.

## Bằng chứng kiểm thử

- `npm run test:gate`: TypeScript, SQLite schema/core, performance, crash/recovery kho, production build và 31 kiểm tra UI nguồn.
- Chromium: 1366×768 và 1920×1080, sáu tab × hai chế độ × sáng/tối, 48 ảnh desktop. Kiểm tra không tràn ngang/chồng header, KPI nhập hàng cùng hàng và lựa chọn được nhớ sau reload.
- Các module Tổng quan/Nhập hàng/Tồn kho/Import trên fixture DEMO có chiều cao nội dung Gọn thấp hơn Thoải mái ít nhất 15%. Đây là số đo fixture tự động, không phải cam kết giảm cuộn cho mọi dữ liệu shop.
- Mobile 320/390/430/768px; LOCAL API giả lập: nhập Size có sẵn, double-submit, refresh dashboard, lỗi/retry, quét KPI, duyệt lô, kết quả import, rename và thông báo. Form LOCAL 1366px kiểm tra cả hai chế độ; đổi mật độ không tạo giao dịch.
- Ảnh kiểm thử được lưu trong artifact `mobile-smoke-<commit>` của Actions. Xem run đúng commit; không dùng run cũ chứng minh bản mới.

## Giới hạn nghiệm thu

Đợt này chỉ thay frontend, kiểm thử giao diện và tài liệu; không đổi backend/schema/quy tắc tồn ảnh hay ghi lên kho kinh doanh thật. Không triển khai live streaming tiến độ.

Chủ shop đã báo bản Windows trước tối ưu giao diện chạy ổn; chưa có xác nhận đủ checklist restart, rename và full restore. Giao diện mới cần test lại Windows. **V1 NOT STABLE; full Windows acceptance/full restore chưa nghiệm thu; V2 chưa được mở.** Windows CI Node 22/24 là kiểm thử tự động trên kho tạm, không thay thế nghiệm thu của shop.

## Nhận bản và test

1. Đóng cửa sổ server TEST cũ, tải ZIP của commit mới đã CI PASS và giải nén vào thư mục source mới.
2. Giữ sandbox cũ; chạy `RUN_WINDOWS_V1_SAFE_TEST.bat`, mở `http://127.0.0.1:3005`, kiểm tra TEST SANDBOX.
3. Chrome/Edge zoom 100%: chọn Gọn rồi Thoải mái; xem sáu tab ở màn hình laptop, thử sáng/tối và reload. Đối chiếu tồn không đổi khi đổi giao diện.
4. Nhập hàng → Đến form nhập → Product đã có → Size đã có → ảnh mới từ `incoming`, không lấy ảnh nguồn trong kho đích. Xác nhận một lần và đối chiếu ảnh/tồn.
5. Import → quét `warehouse` → kiểm tra mười KPI → duyệt lô → lưu → đối chiếu Danh mục/Tồn kho. Tiếp tục checklist đầy đủ trong `WINDOWS_V1_ACCEPTANCE_TEST.md`.
