# CHECKPOINT DEV — SHOP MẸ CACAO WEB: STAGE 5A + STAGE 6A/B + GLOBAL UI REFRESH
**Ngày:** 10/10/2026
**Repository:** anphanguyen191-cell/SHOP_MECACAO_WEB
**Nhánh:** dev/stage5-stage6-ui-checkpoint-20261010
**PR:** https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/pull/1
**Baseline main:** 3.2.0-stage4 / 68d7ff1853c2b20e021c02c8acba84f4c7737b3c

## Quy tắc phát hành
Đây là một **nhánh triển khai chưa phát hành**, không phải bản main mới hoặc bản STABLE. Không được dùng kho kinh doanh thật trong thử nghiệm. Mặc định launcher cũ giữ `127.0.0.1:3000`, không mở API LAN. Không bật Internet, cloud, mở cổng router hoặc xóa ảnh gốc.

## Chức năng đã viết và có mã trong nhánh
- **Stage 5A:** danh sách SOLD gắn image ID/order ID, kiểm tra có file gốc/preview; endpoint kiểm chứng SHA-256 và decode, báo thiếu/hỏng để đối soát, không thay đổi ảnh/ledger/stock. Chính sách mặc định RETAIN_ORIGINALS; không có API xóa/di chuyển.
- **UI Refresh:** shared `uiRefresh.css` áp dụng cho card, nút, input, select, filter, dashboard, hàng tồn, danh mục, giao diện mobile, dark/light; vẫn cần shop nghiệm thu trên máy thật về thẩm mỹ và thao tác.
- **Stage 6:** HTTPS listener trên **đúng một IP LAN private** được cấu hình rõ và cổng 3443; xác nhận cert/trust khi khởi động, không bind 0.0.0.0, không dùng LAN khi thiếu users/cert/key.
- Mật khẩu: scrypt+salt, tài khoản owner/cashier/inventory/viewer, session token ngẫu nhiên HttpOnly/Secure/SameSite, hết hạn sau 8 giờ và khi restart; chống dò mật khẩu theo tài khoản, giới hạn số phiên/username thất bại.
- API deny-by-default theo role; ngăn FS/backup/restore/clipboard Windows, privileged recovery trên LAN; ghi audit hash-chain cho đăng nhập, từ chối và mọi lệnh ghi. Audit hỏng thì ngừng cấp quyền thao tác.
- Mobile React dùng menu theo vai trò, có login/logout, thông báo đang dùng bản thử LAN; vẫn dùng cùng service/SQLite gốc trên Windows.
- `SETUP_LAN_USERS.bat`: chủ shop cấp/đổi mật khẩu/khóa tài khoản cục bộ, các lần thay đổi sau lần đầu cần xác thực owner; thay đổi có hiệu lực sau restart LAN.
- `START_SHOP_LAN.bat`: launcher tách biệt, chỉ bật khi chủ shop cấu hình, không ảnh hưởng `START_SHOP.bat`.

## Kiểm thử
- Unit Stage 5: chứng từ đủ/thiếu/hỏng, checksum, không thay đổi ảnh.
- Unit Stage 6: mật khẩu/session/role/unknown-route, tài khoản thêm/đổi/khóa và owner bắt buộc.
- Audit self-test: append/checksum-chain, phát hiện sửa tay, record ghi dở.
- HTTPS integration: login/logout, 401/403, origin, role, ghi audit, không ghi mật khẩu/token vào log.
- HTTPS **real-sale concurrency**: hai tài khoản owner/cashier cùng submit SOLD cho **một image ID**, dự kiến chỉ một thành công; tồn ảnh, immutable ledger, retry idempotent đối chiếu DB thật trên fixture.
- Regression toàn Stage 0–4, Linux, Windows Node 22/24, browser desktop 1366 + mobile 390 sáng/tối.
- Kết quả mới nhất phải tra CI PR; không tuyên bố PASS nếu workflow chưa thực sự kết thúc thành công.

## Phạm vi chưa hoàn thành, không tự nhận full mobile/STABLE
- Chưa nghiệm thu Windows + iPhone Safari **thực tế** cùng Wi-Fi, TLS/CA trên thiết bị thật, firewall đúng subnet.
- Chưa có upload/camera từ iPhone để tạo hàng mới an toàn. Nhập hàng theo thư mục Windows, quét ổ đĩa, native clipboard, backup/restore và recovery chỉ dành cho Windows.
- Chưa có hệ thống thông báo cập nhật tức thời cho màn bán/tồn hoặc offline queue (không được hiển thị ghi nhận thành công khi mạng mất).
- Chưa chạy đủ ma trận iPhone thử mất Wi-Fi, khởi động lại Windows, phiên hết hạn, nhiều người thao tác cùng lúc, chặn sai vai trò.
- Stage 5B (di chuyển lưu trữ có xác nhận) và 5C (xóa theo thời hạn được chủ shop duyệt) vẫn chưa triển khai, vì cần chốt chính sách lưu giữ và nghiệm thu restore/hậu mãi.

## Danh sách nghiệm thu bắt buộc trước STABLE
1. Tải nhánh riêng, giải nén thư mục **mới**, kho ảnh/DB fixture mới; không dùng thư mục MAIN đang phục vụ kinh doanh.
2. `START_SHOP.bat` giữ localhost Windows. Không tự bật listener LAN hoặc mở port.
3. `SETUP_LAN_USERS.bat` tạo owner; tạo/cập nhật staff chỉ với xác thực chủ shop; khóa user + restart thì session cũ không còn.
4. Chứng chỉ HTTPS đúng IP và được iPhone tin cậy; không bỏ qua cảnh báo, không đưa key.pem lên iPhone.
5. Bật LAN thủ công: browser iPhone login, xem danh mục/tồn, chọn nhiều ảnh, tạo nháp, xuất phiếu PNG, thử SOLD; Windows phải thấy cùng giao dịch và tồn.
6. Hai người cùng xác nhận một image ID => chỉ một giao dịch thành công; ID khác cùng mẫu/Size không bị chặn nhầm.
7. Thanh toán/công nợ/hậu mãi, quyền theo vai trò và kiểm kê không ghi đè phiên stale; lịch sử SOLD bất biến.
8. Mất Wi-Fi, timeout, retry, restart không tạo giao dịch trùng; UI chỉ báo thành công khi API xác nhận.
9. Kiểm tra dark/light, dashboard/cards/filter, menu iPhone 390px, bàn phím không tự mở, không tràn ngang; feedback của shop phải xử lý.
10. Backup/restore ở khu vực riêng và hậu mãi ảnh SOLD; không tự xóa/move ảnh gốc hoặc nguồn.

**Kết luận:** Chỉ nâng bản main khi gate CI PASS, chỉnh đủ luồng và hồ sơ; sau đó chủ shop nghiệm thu Windows/iPhone trước khi xét STABLE.
