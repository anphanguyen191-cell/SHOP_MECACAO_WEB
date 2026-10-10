# Stage 6 — Mobile LAN HTTPS (checkpoint thử nghiệm, chưa STABLE)

**Phạm vi phê duyệt:** cùng Wi-Fi, iPhone dùng chung React/Express/SQLite với Windows. Không cloud, không NAT/port forwarding, không mở Internet. Windows LOCAL tiếp tục ở `http://127.0.0.1:3000`; listener LAN, khi chủ shop tự bật, chạy tại `https://IP-WINDOWS:3443`.

**TRẠNG THÁI:** mã có cổng HTTPS opt-in, tài khoản, session, chính sách quyền và giao diện đăng nhập. Chưa có nghiệm thu iPhone và kiểm thử E2E LAN hoàn chỉnh. CHỈ dùng kho giả lập; không nhập kho kinh doanh vào bản thử LAN. Nếu test không đạt, không chạy START_SHOP_LAN.bat.

## Điều kiện bắt buộc trước khi có thể bật LAN
1. Windows cài Node.js 22.13+ hoặc Node.js 24, máy và điện thoại chung Wi-Fi tin cậy; Windows không có cổng chuyển tiếp (port forwarding) ra Internet.
2. Địa chỉ IPv4 của adapter Windows là mạng riêng `10.x.x.x`, `172.16–31.x.x` hoặc `192.168.x.x`; không chọn IP công cộng, loopback, IP của máy khác, hoặc `0.0.0.0`.
3. Có chứng chỉ TLS `data/stage4/lan/cert.pem`, khóa `data/stage4/lan/key.pem` với Subject Alternative Name IP đúng địa chỉ Windows và đang trong hạn sử dụng. Chứng chỉ/CA phải được tin cậy trên iPhone; không bỏ qua cảnh báo HTTPS.
4. Windows Firewall chỉ cho phép TCP 3443 từ subnet LAN tin cậy; không mở 3000 ra ngoài. Không cấu hình router để forward TCP 3443.
5. Tạo tài khoản bằng `SETUP_LAN_USERS.bat`. Lần đầu cấp quyền `owner`; các lần sau có thể thêm `cashier`, `inventory`, `viewer`. Mật khẩu phải có ít nhất 14 ký tự, chữ và số; script hỏi không hiện mật khẩu, chỉ ghi salt + password hash.
6. Chỉ khi đủ các điều kiện trên mới mở `START_SHOP_LAN.bat`, nhập IP Windows đã đăng ký certificate. Script gọi cùng `START_SHOP.bat`; không tạo server/database thứ hai.

## Cấu hình chứng chỉ (thử nghiệm, KHÔNG dùng kho thật)
Có thể dùng tiện ích `mkcert` do chủ shop tự cài từ nguồn tin cậy trên Windows. Tạo và tin cậy CA theo hướng dẫn của mkcert; sau đó trong thư mục `data/stage4/lan`, tạo cặp cert/key riêng cho IP Windows:

```text
mkcert -cert-file cert.pem -key-file key.pem 192.168.1.100
```

Thay `192.168.1.100` bằng **IP thật trên Windows**. Cài chứng chỉ CA vào kho tin cậy của iPhone theo cơ chế iOS quản lý chứng chỉ (phải tin cậy CA đầy đủ), không bao giờ đưa private key `key.pem` lên điện thoại hoặc GitHub. Nếu IP đổi, tạo lại chứng chỉ và kiểm tra trust. Không gửi file users.json/key.pem qua Messenger/Zalo.

## Luồng dùng thử
1. Trên Windows mở `START_SHOP_LAN.bat`; xác nhận cửa sổ in ra `LAN HTTPS: https://IP:3443`.
2. Trên Safari iPhone cùng Wi-Fi nhập đúng `https://IP:3443`; màn đăng nhập phải xuất hiện. Đăng nhập bằng tài khoản Windows đã tạo.
3. Xem Tổng quan, Danh mục, Tồn kho; thử tạo nháp, mở phiếu PNG, xác nhận SOLD thử, thu tiền, Công nợ, Báo cáo, Kiểm kê. Kiểm tra thao tác trên Windows cùng lúc. Tài khoản viewer chỉ được đọc.
4. Tắt Wi-Fi hoặc ngắt server: tác vụ không được báo DONE khi server chưa xác nhận. Khi thao tác bị 409, cần làm mới trạng thái trước khi thử lại; idempotency key được giữ theo nghiệp vụ sẵn có.
5. Đăng xuất từ iPhone. Restart server => phiên cũ phải hết hiệu lực.

## Những phần bị khóa trên iPhone trong checkpoint này
- Chọn thư mục ổ đĩa Windows, Import kho trực tiếp qua file system, đổi tên ảnh vật lý, native Windows clipboard, backup/restore, phục hồi giao dịch bằng lệnh đặc quyền, dọn ảnh SOLD.
- Để nhập ảnh bằng iPhone cần một luồng upload/staging riêng, có checksum, phê duyệt và kiểm tra lặp; chưa triển khai nên không quảng cáo là đã đầy đủ 100% nghiệp vụ.
- Cloud/offline queue ghi giao dịch và truy cập ngoài Wi-Fi thuộc Stage 7.

## Quyền API bước đầu
- owner: xem và thao tác bán/khách/tiền/kiểm kê qua API có allowlist; vẫn không được mở endpoint file system/restore từ mobile.
- cashier: đơn nháp/SOLD, thanh toán, khách hàng, hậu mãi.
- inventory: kiểm kê và xem tồn.
- viewer: chỉ đọc dữ liệu được cho phép; không ghi.
- Mọi API không liệt kê được từ chối (403); điều kiện login/TLS và Origin kiểm tra ở máy chủ, không chỉ dựa menu.
- Phiên giữ trong bộ nhớ, timeout sau 8 giờ, hết hiệu lực khi server restart. Cookie HttpOnly+Secure+SameSite=Strict; hành động ghi kiểm Origin HTTPS nội bộ và Content-Type JSON.

## Gate chưa đạt (phải làm trước nghiệm thu)
- CI Windows Node 22/24, Linux typecheck + full regression + Stage5 + Stage6 security;
- LAN HTTP/TLS service integration test: 401/403/role/Origin/session/restart/multiple simultaneous confirm;
- Chromium/Safari real 390px + Windows đồng thời, PNG, share, stocktake, backup/restore trên fixture;
- Kiểm thử chứng chỉ và firewall theo cấu hình Windows thực tế.

**CI PASS không đồng nghĩa Windows PASS hoặc STABLE. Mặc định START_SHOP.bat vẫn không mở LAN; chỉ bật qua biến môi trường opt-in và config TLS/credentials.**

## Quản trị tài khoản và audit (cập nhật checkpoint)
- Mở `SETUP_LAN_USERS.bat` trên Windows. Nếu đã có chủ shop, chọn **1 — Thêm**, **2 — Đổi mật khẩu**, hoặc **3 — Khóa tài khoản**. Phải xác thực bằng tên và mật khẩu owner hiện hành. Không cho khóa owner cuối cùng.
- **Luôn dừng và mở lại `START_SHOP_LAN.bat`** sau khi thêm/đổi/khóa tài khoản, vì server nạp tài khoản khi khởi động; restart cũng thu hồi toàn bộ phiên đăng nhập đã cấp.
- Nhật ký kiểm toán nằm ở `data/stage4/lan/audit.jsonl` (hash-chain, không có mật khẩu/token hoặc nội dung request). Đừng xóa/sửa tay; nếu lỗi integrity, server sẽ từ chối bật LAN cho đến khi đối soát. Chưa có xoay vòng archive được xác nhận.
- Vai trò viewer xem thông tin tồn chung; cashier xem và ghi đơn/tiền/khách, không kiểm kê; inventory quản lý phiên kiểm kê, không bán; owner truy cập các tác vụ nghiệp vụ trên LAN **trừ những tác vụ bắt buộc Windows như backup/FS/recovery**.
- Dữ liệu stage4/lan thuộc thư mục ứng dụng thử riêng. Không đưa key.pem, users.json hoặc audit.jsonl lên GitHub.
