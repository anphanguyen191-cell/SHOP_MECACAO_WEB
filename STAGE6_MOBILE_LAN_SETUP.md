# Chặng 6 — thiết lập Windows và iPhone bằng giao diện

Bản `3.4.0-stage6-main-test`, chưa STABLE. Windows LOCAL ở `http://127.0.0.1:3000`, điện thoại dùng HTTPS riêng (mặc định cổng 3443). Cùng React/Express/SQLite/kho với Windows, không có DB thứ hai. Chỉ mạng LAN riêng tin cậy, Windows phải chạy.

## Thiết lập lần đầu

1. Mở START_SHOP.bat, chọn kho tự tạo qua UI trước khi có dữ liệu; mở menu **Mobile LAN**.
2. Chọn IP Wi-Fi/Ethernet Windows hiện trong danh sách (10.x, 172.16–31.x, 192.168.x). Không nhập IP công cộng, 0.0.0.0, loopback hoặc IP máy khác.
3. Bấm **Tạo chứng chỉ HTTPS**. App tạo CA riêng và cert khớp IP; không cần cài mkcert/OpenSSL. Giao diện hiển thị ngày hết hạn và vân tay SHA-256 CA.
4. Tạo **owner** đầu tiên (tên tài khoản chữ thường, từ 3 ký tự; mật khẩu 14+ có chữ và số). Sau đó thêm/đổi/khóa tài khoản cần mật khẩu owner; không khóa owner cuối cùng. Đổi tài khoản qua UI thu hồi mọi phiên đang chạy ngay.
5. Xác nhận cùng mạng riêng và bấm **Bật Mobile LAN**. Sao chép URL HTTPS. Nếu cổng bận, chọn cổng khác; LOCAL vẫn chạy.
6. Bấm **Mở tải CA trong 10 phút** (mặc định cổng 3444), sao chép URL tải CA. Chỉ `/ca.cer` công khai được phục vụ; không có API, mật khẩu, khóa hoặc dữ liệu shop. Có nút tắt ngay, tự tắt sau 10 phút hoặc khi tắt LAN.
7. Safari iPhone mở URL tải CA → cho tải hồ sơ. Cài đặt → Hồ sơ đã tải về → cài CA Me CaCao; đối chiếu vân tay CA với Windows.
8. Cài đặt → Cài đặt chung → Giới thiệu → Cài đặt tin cậy chứng chỉ → bật **tin cậy đầy đủ** cho CA vừa cài. [Hướng dẫn Apple](https://support.apple.com/en-us/102390): cài hồ sơ thủ công chưa tự bật SSL trust.
9. Safari mở URL **HTTPS** và đăng nhập. Nếu báo lỗi chứng chỉ, kiểm tra CA/IP/ngày giờ; chưa gửi mật khẩu. Có thể thêm trang vào màn hình chính, vẫn cần Windows/mạng LAN hoạt động.

Nếu Firewall hỏi quyền Node.js, cho phép mạng **Private** của shop. Nếu cần tạo quy tắc riêng, giới hạn cổng HTTPS và cổng CA tạm trong subnet LAN tin cậy; không mở 3000, không tắt Firewall hoặc forward router. Mạng khách/AP isolation có thể chặn hai thiết bị liên lạc. App không tự thay Firewall.

## Các lần sau và đổi IP

Đóng/mở START_SHOP.bat: LAN mặc định **tắt**, tài khoản/chứng chỉ và dữ liệu vẫn giữ. Mở Mobile LAN, bật lại khi cần. IP đổi/chứng chỉ hết hạn: tắt LAN → chọn IP mới → tạo lại chứng chỉ → cài/tin cậy CA mới trên iPhone. CA có hạn 1 năm, cert máy chủ 90 ngày; khóa CA riêng không được lưu nên mỗi lần tạo lại là CA mới. Bundle cũ giữ để truy vết, không tự xóa.

Khóa TLS riêng chỉ lưu trên Windows; API/UI không trả khóa/salt/hash. Không gửi users.json/key.pem hoặc thư mục LAN lên GitHub. Tài khoản dùng scrypt, session opaque trong bộ nhớ, cookie Secure/HttpOnly/SameSite=Strict, timeout 8 giờ; restart/tắt LAN/đổi tài khoản thu hồi phiên. Login sai bị giới hạn; saturate tên giả không khóa vĩnh viễn chủ shop. Host/Origin/mạng riêng/allowlist được kiểm ở API.

## Quyền và màn hình

| Vai trò | Tác vụ LAN |
|---|---|
| owner | Tồn/khách/bán/PNG/tiền/công nợ/hậu mãi, báo cáo, kiểm kê, kiểm chứng SOLD, gửi ảnh |
| cashier | Tồn/khách/bán/PNG/tiền/công nợ/hậu mãi; không kiểm kê/báo cáo/SOLD audit |
| inventory | Tồn, kiểm kê và gửi ảnh; không bán/tiền/khách |
| viewer | Đọc tồn/danh mục; không ghi nghiệp vụ |

Chọn ổ đĩa/import vật lý/rename/clipboard native/backup/restore/recovery/duyệt ảnh/tài khoản đều trên Windows LOCAL, kể cả owner điện thoại không được phép. Route không nằm allowlist bị 403. Đổi quyền/phiên hết hạn xóa màn nghiệp vụ, về đăng nhập rồi tải lại theo quyền mới.

## Cập nhật và mất kết nối

`/api/lan/changes` chỉ trả epoch/revision/changedAt, không trả khách hàng. Kiểm tra khoảng 3,5 giây, khi online/quay lại tab. Revision tăng khi API ghi trả 2xx, không tăng khi thất bại/login/logout/thiết lập LAN; epoch đổi sau restart. Tồn/dashboard/danh mục/đơn/khách/công nợ/báo cáo/SOLD đọc lại; biểu mẫu đơn/kiểm kê chưa lưu được giữ và nhắc đối chiếu. Đây là polling, chưa bảo đảm tín hiệu cho mọi thay đổi ngoài API/watcher.

Mất mạng báo mất kết nối; không có offline queue ghi hoặc tự báo DONE. GET có thời hạn chờ 20 giây; ghi nghiệp vụ không tự hủy theo timeout. Khi chưa biết kết quả, đọc lại đơn/operation hoặc tiếp tục pending request cùng mã, không tạo giao dịch mới. Hai thiết bị bán cùng ảnh vẫn dùng transaction/version/request key hiện có, chỉ một SOLD.

## Ảnh iPhone

Owner/inventory mở **Ảnh iPhone**, chọn/chụp tối đa 12 ảnh/lượt. JPEG/PNG/WebP tối đa 4 MB/ảnh; HEIC/ảnh lớn có thể chuyển/nén JPEG trên trình duyệt, cần kiểm tra màu/họa tiết. Server giải mã/kiểm kích thước/hash, chặn trùng inbox/ảnh đăng ký/hash SOLD; hộp chờ giới hạn 200 ảnh.

Ảnh vào `data/stage6-main-test/lan/phone-pending/`, chưa thành tồn. Windows mở **Ảnh iPhone** → **Duyệt và sao chép nguồn** → **Chuyển sang Nhập hàng trên Windows**. Thư mục `phone-reviewed/<uuid>` tự điền vào Nhập hàng, chủ shop kiểm mẫu/Size/giá/số ảnh rồi **XÁC NHẬN NHẬP HÀNG**. Đổi Product/Size giữ nguồn ảnh đã duyệt; chọn nguồn khác thủ công sẽ thay nguồn đó. Duyệt không xóa gốc hoặc tăng tồn; chỉ nghiệp vụ Nhập hàng thành công mới tăng tồn. Inbox không tự dọn; không nhập lại ảnh SOLD thành tồn.

Nhật ký `data/stage6-main-test/lan/audit.jsonl` hash-chain, không ghi password/token/request body; integrity hỏng thì chặn LAN. Các endpoint mới quản trị start/stop/cert/account được audit. Full backup nghiệp vụ giữ DB/kho theo cơ chế hiện có; **không coi backup này là sao lưu/di chuyển khóa và tài khoản LAN**. Bản cài mới tạo lại LAN qua UI. Nghiệm thu thiết bị vật lý/CA/Firewall/camera/share chưa được thay bằng CI.
