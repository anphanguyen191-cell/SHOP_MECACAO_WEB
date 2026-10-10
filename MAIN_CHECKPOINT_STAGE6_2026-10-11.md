# Checkpoint main — hoàn thiện chặng 6

Runtime **3.4.0-stage6-main-test**. Yêu cầu chủ shop: hoàn thiện chặng 6, mọi chức năng hiện có thành bản main đầy đủ; Windows tải main, chọn kho tự tạo bằng UI, bản cài mới có DB mới, không bắt nối dữ liệu thử. Baseline trước thay đổi: `5ab31e27925f67089d6593841ed51fb45b393763` (3.3.1).

## Nền tảng đã có

| Nhóm | Chức năng giữ trên main |
|---|---|
| Kho | Canonical ảnh = bộ hàng; mẫu/Size/SKU/giá, danh mục/tồn, nhập COPY giữ nguồn, scan/import có duyệt/rename, chia sẻ ảnh |
| Bán/khách/PNG | Nháp không giữ tồn, cảnh báo ảnh cùng nháp, khách/contact snapshot, ship/miễn ship, PNG nhiều trang từ nháp/SOLD, preflight/version/request key, SOLD bất biến/lịch sử |
| Tiền/hậu mãi | Thu/cọc/hoàn/giảm, COD/chuyển khoản/tiền mặt, công nợ, giao/vận đơn độc lập SOLD, yêu cầu/kết quả hậu mãi |
| Báo cáo | Doanh số/ship, dòng tiền theo kỳ VN, công nợ hiện tại, lãi gộp snapshot/thiếu vốn, CSV; chưa lợi nhuận ròng |
| Kiểm kê | Snapshot tồn ảnh/sổ, đếm/chênh/lý do, version/hash/chốt/hủy/CSV; không tự sửa tồn |
| Stage5A | Kiểm chứng ảnh SOLD và hash chỉ đọc; chưa move archive/delete |
| Vận hành | Task/progress/cancel, lock, transaction/journal/hash/recovery, full backup và restore thử sang vùng mới, một launcher, phiên bản/chặng rõ |

## Chặng 6 đã hoàn thiện phần mềm

- Windows menu Mobile LAN: IP hiện tại/cổng, tạo HTTPS nội bộ, vân tay CA/tải công khai, tài khoản owner/cashier/inventory/viewer, bật/tắt, URL copy, hướng dẫn tin cậy iPhone và lỗi mạng/Firewall. Không cần công cụ cấp cert/CLI ngoài ứng dụng.
- TLS 1.2+ chỉ bind IP private đang có; LOCAL cùng server/SQLite vẫn loopback. Tắt LAN đóng mọi kết nối TLS/CA nhưng không dừng LOCAL. Cổng bận không làm mất LOCAL; restart LAN mặc định tắt.
- Bundle cert/key/CA được kiểm tra trước khi atomic pointer chuyển, CA private key không lưu. Cert 90 ngày/CA 1 năm; tạo lại cần trust CA mới. Public CA bootstrap chỉ `/ca.cer`, 10 phút, không API/secret/kho.
- Tài khoản scrypt; xác nhận owner sau owner đầu tiên; không khóa owner cuối. GUI đổi tài khoản atomically và lập session manager mới, thu hồi mọi phiên. Opaque cookie/8 giờ/rate limit/Host/Origin/allowlist/audit hash-chain; unknown-name saturation không chặn vĩnh viễn owner.
- Dùng chung UI responsive, quyền theo server, hết phiên/đổi tài khoản xóa dữ liệu màn cũ rồi tải lại. Polling gần 4 giây/online/focus, báo offline và yêu cầu đối chiếu biểu mẫu; không offline write queue.
- Ảnh iPhone inbox kiểm hash/giải mã/trùng/SOLD; Windows duyệt COPY rồi Nhập hàng xác nhận, chưa tự cộng tồn.

Không thay schema/cơ chế bất biến của SOLD/tiền. DB vẫn stage6-main-test; bản cài mới rỗng, mở lại cùng bản giữ dữ liệu. Không tự chuyển DB lịch sử, xóa ảnh SOLD hoặc mở Internet. GitHub Pages vẫn DEMO, không chạm kho của shop. LAN config/keys giữ riêng trong bản cài, không đưa vào repo hoặc tuyên bố full backup nghiệp vụ chuyển cả LAN identity.

## Bằng chứng và bước tiếp

[Xem test report](STAGE6_TEST_REPORT.md) và CI đúng commit trong Actions. Kiểm thử tự động đều giả lập; TLS Node xác minh CA thật trong fixture, browser CI bỏ qua trust cert fixture riêng để test UI, **không chứng minh Safari đã cài/tin cậy CA**.

Nghiệm thu [Windows/kho tự tạo/iPhone](MAIN_TEST_STAGE6_RELEASE.md) còn cần thực hiện: CA/Firewall/mạng thực, camera HEIC/chia sẻ, tất cả luồng nghiệp vụ và mất Wi-Fi. CI PASS không đổi thành STABLE tự động. Sau nghiệm thu/sửa phản hồi, thiết kế Stage7 cloud/ngoài LAN riêng; Stage5B/5C vẫn cần phạm vi và duyệt riêng.
