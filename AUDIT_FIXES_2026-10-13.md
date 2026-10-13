# Rà soát và sửa lỗi V7.2.0 — 13/10/2026

Phạm vi: LOCAL/Windows, Cloud và mobile; triển khai tuần tự theo yêu cầu chủ shop. Baseline `6b33dfb63d6d8ef6f18991f3d91ad8b5847e0d7f`. Đây là bản có kiểm thử tự động, không thay thế nghiệm thu laptop/iPhone thật.

| Mã | Kết quả xử lý |
|---|---|
| F01 | Gia hạn URL ảnh riêng tư theo thời gian, mở lại trang và có mạng, kể cả snapshot không đổi. |
| F02 | Đọc dữ liệu Cloud độc lập với đối soát chỉ dành chủ shop; cashier/inventory/viewer không gọi API giá dành owner. |
| F03 | Lưu JPEG chứng từ riêng tư ≤40KB từ archive Windows đã xác minh, kiểm SHA-256 trước đăng ký; bắt buộc có chứng từ trước xóa ảnh Cloud gốc. Phục hồi chứng từ SOLD cũ từ archive còn nguyên. |
| F04 | Khách hàng có chặn chuyển màn và cảnh báo đóng/reload khi chưa lưu, xác nhận bỏ thay đổi. |
| F05 | Tự đồng bộ chạy xuyên màn LOCAL, lưu lựa chọn tại thiết bị, giới hạn đúng tài khoản chủ shop. |
| F06 | Xung đột ảnh ở đơn nháp khác có ảnh/đơn để kiểm tra và xác nhận rõ; không trừ tồn hay tự giữ hàng. |
| F07 | Kiểm sự hiện hữu ảnh Windows; ảnh nguồn thiếu tạm rút khỏi lựa chọn bán, giữ file Cloud và lịch sử. Chốt SOLD bị chặn ở database. Lỗi quyền đọc ổ đĩa không tự rút hàng. |
| F08 | Sổ tồn lấy từ giao dịch thật trừ SOLD, hiện Size lệch sổ/ảnh; không giả lập sổ bằng số ảnh, không nói Windows đã khớp khi chỉ đọc Cloud. |
| F09 | LOCAL và Cloud dùng chung model/bố cục phiếu được duyệt, banner đúng tỷ lệ, STT xuyên trang và đủ thông tin/tiền/lời cảm ơn. |
| F10 | Lấy danh mục và ánh xạ category_id đúng. |
| F11 | Báo cáo nhận thông báo dữ liệu Cloud thay đổi và tự tổng hợp lại. |
| F12 | Không coi giá/phí/giảm trống là 0; từ chối số lẻ, âm và quá giới hạn số nguyên; áp dụng nhập hàng, giá và đơn. |
| F13 | Bảo vệ thông tin đang nhập ở giá, nháp, kiểm kê, nhập hàng, thanh toán; không remount thanh toán vì phiên bản thay đổi hoặc do màn đơn đọc lại phía sau. Có cách bỏ thay đổi/đọc lại. |
| F14 | Chi tiết sản phẩm, nhập hàng và trình cập nhật hiện lỗi đọc và cách thử lại; cập nhật kiểm HTTP status. |
| F15 | PROJECT_STATE/ROADMAP phản ánh Cloud đang hoạt động, các giới hạn và hướng tiếp theo. |
| F16 | V7.2.0 hiện mã build từ git hoặc dấu vân tay mã nguồn của gói ZIP không có Git; Windows giữ mã bản cài trong trình cập nhật. Giao diện có mở bản mới và bảo vệ nội dung chưa lưu. |
| F17 | Nâng fflate lên 0.8.3; kiểm lại tải ZIP, traversal, phục hồi khi cập nhật lỗi. |
| F18 | Cloud trên Windows đọc khả năng restore LOCAL và hiện panel phù hợp, không mở tính năng Windows trên mobile. |
| F19 | Điện thoại dùng tel/autocomplete; địa chỉ khách/đơn dùng textarea. |
| F20 | Drawer khóa cuộn nền, giữ focus, Escape đóng và trả focus; nút và ô nhập mobile dễ chạm. |
| F21 | Thông báo lỗi Cloud, sổ tồn, quyền và trạng thái hộp ảnh dùng tiếng Việt dễ hiểu. |
| F22 | Chuẩn bị chia sẻ hiện số ảnh, có dừng, hủy fetch khi rời màn/đổi lựa chọn; vẫn chia sẻ bằng thao tác người dùng. |
| F23 | Tồn kho lập chỉ mục tuyến tính; đơn, khách, ảnh SOLD, báo cáo có phân trang hiển thị; hộp ảnh có preview riêng tư và tiến độ. Snapshot vẫn đọc theo trang RPC khi dữ liệu đổi, chưa có incremental/offline queue. |

## Kiểm chứng

`npm run test:gate`, `npm run test:cloud`, typecheck và kiểm UI được chạy trên dữ liệu/thư mục giả lập. Test mới kiểm hết hạn URL không có thay đổi, các quyền đọc trên localhost, khách chưa lưu, xác nhận xung đột nháp, tiền trống/không hợp lệ, danh mục/sổ lệch, dung lượng/hash chứng từ, phục hồi chứng từ cũ và từ chối xóa khi chưa giữ chứng từ. CI còn kiểm Chromium 390px/desktop sáng tối, HTTPS LAN hai thiết bị đồng thời SOLD, cập nhật Windows Node22/24, khởi động/backup/recovery/restore. Kết quả cuối cùng phải đối chiếu Actions đúng commit; không lấy CI của baseline làm chứng cứ.

Phiếu 4 ảnh được render và kiểm tra trực quan từ renderer thật: banner không ép méo, STT 1–4, các dòng tiền và ba câu cuối đủ. Chứng từ Cloud có kiểm hash khi tạo lại phiếu SOLD từ bản nhỏ.

## Điều kiện sử dụng và giới hạn

- Cập nhật Windows qua Cài đặt → Kiểm tra & cập nhật Shop để có endpoint chứng từ và kiểm ảnh nguồn. Laptop cũ không có endpoint: phần mềm giữ ảnh Cloud và báo đang chờ, không xóa bừa.
- Đồng bộ tồn nguồn chỉ thực hiện khi Windows mở, đăng nhập owner và có mạng; chu kỳ tự động 5 phút hoặc sau nhập hàng. Cloud không thể biết ổ đĩa đã đổi khi laptop tắt. Thiếu ảnh và khôi phục ảnh dùng cùng một cờ hiện hữu, không thay ledger.
- SOLD cũ chỉ phục hồi chứng từ nếu archive Windows còn nguyên và xác minh được. Không tái tạo một ảnh đã mất cả Cloud và archive. Mỗi chứng từ là file riêng tư tối đa 40KB; không tự xóa chứng từ/lịch sử.
- Nguyên bản Windows, đơn/SOLD/tiền và idempotency/version/hash/lock/recovery giữ nguyên. Migration thêm cột/hàm/chính sách; không reset kho, không xóa dữ liệu shop.
- Các kiểm thử tự động không nghiệm thu iPhone Safari thật, màn hình bàn phím, share sheet iOS hay ổ đĩa Windows của shop. Vẫn cần kiểm thử thiết bị thật; không gọi bản này STABLE chỉ vì CI đạt.

Database đã áp dụng migration bổ sung; 3.100 bản ghi ảnh trước/sau giữ nguyên, không đổi SOLD hay dữ liệu nghiệp vụ. Kiểm quyền anon bị từ chối, hàm mới giới hạn owner; EXPLAIN chính sách Storage và lời gọi không có phiên đã được kiểm tra, lỗi truy vấn chính sách đệ quy đã sửa trước phát hành. Security advisor còn báo `Leaked Password Protection Disabled` ở cấu hình Supabase Auth; công cụ hiện có không hỗ trợ thay cấu hình Auth này. [Hướng dẫn bật bảo vệ mật khẩu bị lộ](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Đây là việc cấu hình còn lại, không được tính là đã sửa.
