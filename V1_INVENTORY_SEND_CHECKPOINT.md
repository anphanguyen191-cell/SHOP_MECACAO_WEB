# V1 — Chọn ảnh tồn và gửi nhanh cho khách

Ngày: 2026-10-09. Chủ shop duyệt triển khai: chọn nhiều ảnh trực tiếp trong Tồn kho, ưu tiên COPY một lần rồi Ctrl+V vào Zalo/Messenger; thanh cố định cuối màn hình như ảnh tham khảo, mỗi ảnh riêng, không lấy tải ZIP làm luồng chính.

## Đã triển khai

- Chọn/bỏ từng ảnh; chọn nhóm Size, toàn bộ Product kể cả khi đang lọc Size, kết quả lọc; Shift + click chọn dải trong cùng Size.
- Giữ lựa chọn trong tab khi đổi bộ lọc; đếm ảnh nằm ngoài kết quả hiện tại. Không giữ lựa chọn sau reload/chuyển module.
- Viền và dấu chọn rõ; xem ảnh lớn bằng nút riêng, trước/sau, Escape, focus trong dialog.
- Thanh cuối màn hình: số ảnh/bộ, số nhóm Product/Size, COPY X ẢNH hoặc chuẩn bị/chia sẻ, BỎ CHỌN, trạng thái. Có khoảng trống cuối trang; desktop/mobile, hai theme, Gọn/Thoải mái.
- Windows LOCAL: POST chỉ nhận ID ảnh, kiểm tra ảnh đăng ký còn tồn, Product/Size active và sandbox. Cầu nối C# nguồn đầy đủ, tự build bằng .NET Framework csc của Windows vào cache tạm; dùng Win32 CF_HDROP + Preferred DropEffect COPY; kiểm tra số file/thứ tự. Không PowerShell/Python, không Visual Studio Build Tools, không thay schema.
- Endpoint thay clipboard chỉ chấp nhận browser loopback HTTP đúng port trên cùng máy. Request ngoài origin hoặc không Origin bị từ chối. Không nhận đường dẫn file/command tùy ý từ client; không mở LAN.
- Mobile: kiểm tra ảnh, tạo JPEG nhẹ trong RAM (không thay ảnh kho), sau đó chạm CHIA SẺ từ một user gesture mới. Chỉ hoạt động nếu browser/OS có Web Share files và app nhận file; không mở mạng trong V1.

## Giới hạn và trạng thái đúng

Batch hiện giới hạn kỹ thuật **100 ảnh**, nhằm chặn request/bộ nhớ không giới hạn, không phải tuyên bố Zalo/Messenger nhận được 100 ảnh. Mobile tối đa 32 MiB dữ liệu chuẩn bị; quá giới hạn phải chọn ít hơn. Thứ tự đưa vào clipboard/share giữ theo thứ tự chọn; ứng dụng nhận có thể sắp xếp lại, phải kiểm chứng.

Windows copy native đặt nhóm **file ảnh gốc** vào clipboard. Ctrl+V vào Zalo desktop, Zalo web, Messenger web hay app phụ thuộc ứng dụng nhận. **Chưa nghiệm thu các ứng dụng này**, không coi browser mock/Windows CI là PASS dán hoặc gửi thực tế. HEIC hoặc định dạng mà ứng dụng nhận không hỗ trợ cũng cần kiểm tra riêng. Không tự gửi tin, chọn người nhận, giữ hàng, tạo đơn hoặc trừ tồn.

Clipboard là danh sách đường dẫn như COPY file của Explorer: file phải còn tồn tại tại đường dẫn đó khi dán. Không rename/di chuyển ảnh giữa copy và paste. Ảnh tối ưu phục vụ Web Share/xem lớn không được đăng ký thành hàng mới.

V1 vẫn **NOT STABLE** cho đến full Windows acceptance/restore. Không triển khai V2, không áp dụng chính sách xóa ảnh đã bán trong đợt này.

## Bằng chứng

- `npm run test:gate`: TypeScript/build, schema, SQLite/core, performance, crash/recovery kho, share integration và 31 UI source regressions.
- `test:share`: ID active/existing, duplicate/invalid/missing/inactive/denied, thứ tự, JPEG thật, metadata/ledger/tồn/checksum ảnh gốc không đổi. Windows CI bổ sung compile helper, kiểm tra CF_HDROP Unicode hai file/count/order trong RAM, ghi clipboard runner bằng ảnh fixture rồi đọc lại từ tiến trình mới sau khi helper ghi đã thoát. Không truy cập clipboard của chủ shop.
- HTTP server thật: **49 assertions**, gồm prepare/image JPEG, batch invalid, copy bị từ chối thiếu Origin/cross-origin, không đổi tồn/ảnh; các luồng nhập, scan, backup/restart vẫn chạy.
- Chromium: sáu module desktop 1366×768/1920×1080 cả density/theme; mock LOCAL thêm chọn riêng/Shift/nhóm/filtered Product, hidden selection, viewer focus/Escape, copy error/retry/order/double-click, Web Share nhiều file riêng. Thanh gửi kiểm tra 320/390/768/1366px sáng/tối không che ảnh cuối và không tràn ngang.
- Xem Actions đúng commit được giao; artifact `mobile-smoke-<SHA>`. Các kết quả ứng dụng bên ngoài và mobile thật vẫn UNVERIFIED.

## Quy trình Windows để chủ shop nghiệm thu

1. Đóng server TEST cũ, giải nén bản mới vào folder source mới, giữ sandbox và chạy `RUN_WINDOWS_V1_SAFE_TEST.bat`. Kiểm tra TEST SANDBOX tại `http://127.0.0.1:3005`.
2. Tồn kho → mở Product → mở Size có ảnh đã import. Thử chọn riêng, CHỌN NHÓM SIZE, CHỌN TOÀN BỘ MẪU, CHỌN KẾT QUẢ ĐANG LỌC và Shift + click. Đổi Size lọc phải giữ lựa chọn và báo ảnh ngoài bộ lọc. Xem lớn rồi đóng phải giữ lựa chọn.
3. Bấm COPY X ẢNH. Lần đầu có thể chờ build helper; đợi báo đúng số ảnh. Nếu lỗi phải báo rõ, giữ lựa chọn; không chạy Administrator hoặc tắt bảo vệ Windows để né lỗi.
4. Mở một cuộc chat thử do chủ shop chọn, Ctrl+V. Kiểm tra **đủ số ảnh riêng, đúng bộ và thứ tự**, rồi chủ shop quyết định gửi. Thử 1, 2, 5, 10, 20 ảnh; tăng tiếp nếu các mức trước đạt.
5. Ghi kết quả riêng từng ứng dụng đang dùng: Zalo desktop/web, Messenger web/app, browser và phiên bản. Nếu app không nhận file clipboard, báo lại tên app/phiên bản và trạng thái dán; không ghi PASS chỉ vì thông báo Copy thành công.
6. Kiểm tra copy lại, bấm nhanh hai lần, ảnh nguồn missing, Bỏ chọn; tổng tồn, ledger, hash và số ảnh gốc phải giữ nguyên.
7. Mobile thật chỉ test khi có môi trường kết nối được backend phù hợp; V1 chưa mở LAN nên browser mô phỏng không chứng minh chia sẻ iPhone/Android thật. Khi đủ điều kiện: Chuẩn bị chia sẻ → CHIA SẺ X ẢNH → chọn app; hủy vẫn giữ lựa chọn.
