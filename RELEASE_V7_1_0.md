# Shop Mẹ CaCao Web — V7.1.0

Ngày phát hành bản phân phối: 11/10/2026. Chủ shop yêu cầu phát hành từ main. Commit mã ứng dụng: `746d300e4ad5302fcfaa46e6648f31f6d93291c5`. Nhánh `release/v7.1.0` giữ bản mã đã kiểm thử; main tiếp tục nhận bản sửa.

## Tải và chạy

- Main mới nhất: https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/archive/refs/heads/main.zip
- Bản mã cố định V7.1.0: https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/archive/746d300e4ad5302fcfaa46e6648f31f6d93291c5.zip
- Mobile: https://anphanguyen191-cell.github.io/SHOP_MECACAO_WEB/?cloud=1
- Hướng dẫn: [V7_TEST_GUIDE.md](V7_TEST_GUIDE.md)

Giải nén, chạy START_SHOP.bat với Node 22.13+; giữ cửa sổ chương trình mở. Quét kho tại trang localhost/127.0.0.1 do launcher mở, không quét ổ đĩa từ GitHub Pages. Import kho chọn thư mục gốc có Product → Size → ảnh. Cài đặt → Cloud → Gửi email đăng nhập → xác nhận → Đồng bộ / Tiếp tục. Sau đồng bộ, dùng giao diện nghiệp vụ Cloud trên Windows và iPhone.

## Chức năng trong bản mã

Bao gồm chức năng main đến chặng 6 và V7 Cloud: JPEG ≤150000 bytes; đăng nhập và phân quyền; đồng bộ Windows/Cloud, realtime và đọc bù; danh mục/tồn/giá; khách hàng/nháp/PNG/chia sẻ/SOLD; thu tiền/công nợ/COD/hậu mãi; báo cáo/kiểm kê; hộp chờ ảnh iPhone và đối soát/dọn ảnh SOLD có xác minh; giao diện sáng/tối và ba mật độ, popup góc phải. Ảnh nguồn không bị nén ghi đè. Cloud cần Internet để ghi; hộp chờ/nháp/PNG không tự trừ tồn. Không tự xóa kho khi cập nhật.

## Bằng chứng kiểm thử và tình trạng nghiệm thu

Actions https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/runs/38128315210: Linux, Windows Node 22, Windows Node 24 và triển khai Pages đều SUCCESS trên commit trên. Kiểm thử tự động dùng dữ liệu giả lập; SQL fixtures rollback. Trình duyệt Cloud dùng transport giả lập.

Chủ shop báo ngày 11/10/2026: chưa quét được kho và chưa đăng nhập Cloud trên laptop. Chưa nhận thông báo lỗi/ảnh màn hình nên chưa xác minh nguyên nhân hoặc xác nhận đã sửa. Đăng nhập email, upload Storage thực tế và vòng Windows → iPhone → SOLD/thu tiền → Windows đối soát chưa được nghiệm thu trên thiết bị của chủ shop. Bản phân phối đã phát hành theo yêu cầu; không tuyên bố STABLE hoặc xác nhận sẵn sàng vận hành kho thật cho tới khi các điểm này đạt. Nhãn main-test trong ứng dụng giữ nguyên để phản ánh đúng bằng chứng.

Đây là nhánh phân phối và tài liệu trong repository; chưa tạo GitHub Release/tag hay bộ cài EXE riêng. Không cần chạy lại SQL reset để cài/cập nhật ứng dụng.
