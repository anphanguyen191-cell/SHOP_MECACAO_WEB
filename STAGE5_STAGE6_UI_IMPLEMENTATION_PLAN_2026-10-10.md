# CHECKPOINT THIẾT KẾ — Stage 5 + Stage 6 Mobile LAN + Global UI Refresh
Ngày: 2026-10-10. Nền khóa: `3.2.0-stage4` / `68d7ff1853c2b20e021c02c8acba84f4c7737b3c`.
Phạm vi được chủ shop duyệt: Stage 5, đồng bộ UI desktop/mobile, ưu tiên Stage 6 Mobile LAN cùng Wi-Fi, KHÔNG mở Internet, KHÔNG thao tác trên kho thật.

## Chia checkpoint và thứ tự an toàn
- **5A (đang triển khai trong nhánh này)**: đọc danh sách SOLD; kiểm chứng hiện diện ảnh, hash, decode ảnh gốc + preview; UI báo tình trạng có chứng từ/thiếu chứng từ. Không đổi database, ảnh, số tồn.
- **UI-A**: hệ thống token chung cho card, input, select, nút, đường viền/bo góc/bóng đổ; hỗ trợ hai theme, 390px mobile và 1366px Windows. Không xóa đặc thù các luồng chức năng.
- **6A**: thiết kế/bằng chứng bộ xác thực, vai trò, kiểm soát nguồn, TLS, nhật ký phiên, kiểm soát quyền chức năng trước khi mở bind LAN. Không gỡ chặn loopback trong lúc chưa có lớp bảo vệ.
- **6B**: triển khai server TLS bind vào IP LAN được chủ shop chọn (KHÔNG 0.0.0.0, KHÔNG cloud, KHÔNG mở port router); triển khai user management, CSRF/session, log sự kiện, kiểm soát tuyến và role; kết nối cùng SQLite/same warehouse; thử trên môi trường Windows và iPhone giả lập thực tế.
- **6C**: UI mobile đầy đủ nghiệp vụ bản LOCAL, giao dịch có khóa idempotency/version theo image ID; hai thiết bị cùng bán chỉ có một SOLD; lost response phải tra trạng thái server; UI bắt buộc hiển thị chờ/thất bại, không tự nhận thành công.
- **5B**: nghiên cứu lưu trữ ảnh gốc khi có điều kiện; cần bằng chứng backup + restore + hậu mãi + kiểm soát crash; hiện chưa mở thao tác chuyển/xóa.
- **5C**: xóa ảnh SOLD chỉ sau quyết định chính sách xóa riêng: retention, phạm vi, điều kiện, sự đồng ý theo từng lô, phục hồi. **Hiện không có quyền bật xóa tự động**.

## Mô hình an ninh LAN tối thiểu cho 6B
1. Windows là server duy nhất, duy nhất nguồn sự thật. Thiết bị có cùng UI React không đồng nghĩa có quyền API.
2. HTTPS với chứng chỉ có thể xác minh trên thiết bị; không truyền mật khẩu/token qua HTTP thuần. Server chỉ bind IPv4 riêng thuộc adapter LAN được duyệt; firewall giới hạn Wi-Fi nhà/shop. Không mở port WAN.
3. Tài khoản riêng từng nhân viên, mật khẩu lưu salted password-hash, login có throttling/lockout, session opaque cookie HttpOnly+Secure+SameSite, có expiry/revoke; CSRF và Origin bảo vệ thao tác ghi.
4. Role: owner, cashier, inventory, viewer. Mỗi API phải có policy rõ; API thư mục máy, restore, admin và thao tác nhạy cảm không mặc nhiên cấp quyền cho mobile.
5. Ghi audit user, client IP, action, image ID/order ID, request key, outcome; không ghi mật khẩu/token/số điện thoại vào log.
6. Không hiển thị DONE khi server chưa xác nhận; retry dùng idempotency key; phiên giao dịch cũ stale báo 409 để chọn refresh/retry.
7. Đảm bảo ảnh cùng image ID chỉ bán một lần qua unique DB + transaction; giữ sold snapshot bất biến.
8. Logout, đứt mạng, restart server, hai trình duyệt cùng bấm, thay kho, khôi phục backup, CSRF sai, session hết hạn phải có regression test.

## Ranh giới kỹ thuật hiện tại
- `App.tsx` ẩn nhóm nghiệp vụ trong DEMO; GitHub Pages không có DB.
- `scripts/start-stage2.mjs` và `server.ts` đang bind `127.0.0.1`; `salesRoutes.ts` chặn thiết bị khác theo IP và Origin. **Đây là lớp bảo vệ hiện hành cần giữ nguyên cho đến khi 6B hoàn chỉnh**.
- Không được để `isDemo` thành dấu hiệu xác thực. Bản PWA dùng dữ liệu thật phải login server.
- Windows chọn thư mục, clipboard CF_HDROP và các tiện ích hệ điều hành cần UX riêng; không tuyên bố iPhone có native Windows clipboard.
- Cloud, kết nối ngoài Wi-Fi và offline queue ghi giao dịch thuộc Stage 7, không đưa vào 6B/6C.

## Điều kiện nghiệm thu và bàn giao
- CI: typecheck, build, stage1–4 regression, stage5 fixture (thiếu ảnh/ảnh hỏng/checksum), HTTP API scope, Chromium 390px/1366px sáng/tối, Windows Node 22/24.
- Gate Mobile LAN mới: deny unauthorized, TLS/auth/CSRF/role/expiry, replay, đồng thời, restart, mất mạng và backup/restore. Không test trên kho kinh doanh.
- Nghiệm thu: chủ shop test Windows + iPhone trong cùng Wi-Fi, lần lượt đăng nhập, xem/chọn ảnh, tạo nháp/PNG, SOLD, thu tiền, công nợ, kiểm kê, báo cáo; xác nhận hiển thị đúng trên cả hai.
- PASS CI khác Windows PASS; không gọi STABLE khi chưa nhận nghiệm thu Windows.
