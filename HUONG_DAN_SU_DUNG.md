# Shop Mẹ CaCao V7.3.0

## Cài lần đầu

1. Tải main.zip tại https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/archive/refs/heads/main.zip.
2. Giải nén một lần vào thư mục cố định. Mở thư mục có START_SHOP.bat; không lồng thêm thư mục bản cài mỗi lần mở.
3. Cài Node.js 22.13+ hoặc 24 nếu chưa có. Chạy START_SHOP.bat và giữ cửa sổ đó mở.
4. Trong trang localhost/127.0.0.1 vừa mở, chọn kho trên máy. Đăng nhập Cloud không phải điều kiện để quét/import kho local.
5. Import kho → CHỌN THƯ MỤC → chọn kho gốc có Mẫu/Product → Size → ảnh → QUÉT KHO → duyệt giá và kết quả → xác nhận lưu. Hoặc Nhập hàng để nhập ảnh mới.
6. Cài đặt → Cloud → nhập email và mật khẩu Cloud → Đăng nhập → Đồng bộ / Tiếp tục. Mật khẩu Cloud riêng với tài khoản LAN. Nếu chưa biết mật khẩu Cloud: mở Xác nhận email để thiết lập mật khẩu Cloud, xác nhận email một lần, rồi nhập hai ô mật khẩu mới và Lưu mật khẩu Cloud. Không cần đăng nhập Dashboard. Mở giao diện nghiệp vụ Cloud trên máy này.
7. iPhone hoặc máy khác: mở https://anphanguyen191-cell.github.io/SHOP_MECACAO_WEB/?cloud=1, đăng nhập cùng tài khoản shop. Trang Internet không quét ổ đĩa laptop. Ảnh đã đồng bộ và dữ liệu Cloud dùng được khi laptop tắt.

## Mở trực tiếp trên Windows

- Sau khi đặt bản cài tại thư mục cố định và có Node.js, nhấp đúp MO_SHOP.vbs một lần. Ứng dụng tạo biểu tượng Shop Me CaCao trên Desktop và mở giao diện; bộ chạy hoạt động ẩn.
- Lần sau nhấp biểu tượng Desktop. Nếu bản cài đang chạy, chỉ mở lại giao diện. Nếu mã chưa đổi, dùng bản build đã chuẩn bị, không build lại mỗi lần.
- Sau cập nhật source, lần mở kế tiếp tự chuẩn bị build mới. Giữ nguyên thư mục cài/data/kho; không xóa database.
- Nếu Windows chặn VBS hoặc không mở được, dùng START_SHOP.bat để xem lỗi; thông báo lỗi của launcher chỉ dẫn data/launcher.log. Biểu tượng phụ thuộc đường dẫn bản cài, nên không di chuyển thư mục sau khi tạo.
- Đóng tab trình duyệt không dừng bộ chạy ẩn. Khởi động lại Windows sẽ dừng; đây chưa phải ứng dụng EXE có khay hệ thống.

## Dùng hằng ngày

Windows nhập kho và đối soát tại bản localhost chạy bằng START_SHOP.bat. Cloud là nguồn tồn/giá/đơn/tiền dùng chung sau khi kích hoạt. Bán hàng trên giao diện Cloud ở cả Windows và iPhone. Cloud cần Internet để ghi. Nháp và PNG không trừ tồn; SOLD ghi giao dịch. Ảnh nguồn laptop giữ nguyên; Cloud dùng một JPEG ≤150000 bytes. Hộp ảnh iPhone chưa tăng tồn cho tới khi Windows duyệt/nhập và đồng bộ. Ảnh SOLD tự dọn khỏi Supabase khi laptop mở giao diện localhost và đăng nhập Cloud bằng tài khoản chủ shop, sau khi ảnh lưu local được xác minh. Tự kiểm tra khi mở ứng dụng, khi có sự kiện Cloud và mỗi 30 giây; tab bị trình duyệt cho ngủ sẽ tiếp tục khi hoạt động lại. Nếu laptop tắt, mất mạng hoặc ảnh local sai checksum thì ảnh Cloud vẫn giữ, tự tiếp tục khi đủ điều kiện. Không cần bấm dọn; chức năng dọn thủ công vẫn có trong Ảnh SOLD. Lịch sử đơn và tiền giữ nguyên.

## Cập nhật một nút và dữ liệu cố định

Khuyến nghị dùng gói bàn giao có `CAI_DU_LIEU_CO_DINH.bat` để thiết lập một lần. Sau đó cập nhật ngay trong Cài đặt, không chép đè thủ công. Xem [hướng dẫn dữ liệu cố định](WINDOWS_CAP_NHAT_MOT_NUT.md). Kho ảnh giữ nguyên, database/config nằm tại vùng dữ liệu cố định của tài khoản Windows. Gói chuyển yêu cầu kho main schema 130 đã chọn thư mục kho riêng. Không tự chuyển database phiên bản khác.

## Cập nhật thủ công khi chưa thiết lập dữ liệu cố định

1. Dừng ứng dụng đang chạy và dùng chức năng sao lưu hiện có trước khi thay mã.
2. Giải nén ZIP mới vào nơi tạm. Chép nội dung thư mục chứa START_SHOP.bat vào đúng thư mục cài đang dùng, thay các file mã nguồn khi được hỏi.
3. Giữ nguyên thư mục data, ảnh nguồn, cấu hình và database hiện có. ZIP source không chứa kho của bạn; không xóa thư mục data hoặc chạy SQL reset.
4. Chạy START_SHOP.bat từ thư mục cài cũ. Kiểm tra Kho đang dùng trước khi nhập hoặc bán tiếp. Tải lại trang Cloud để thấy V7.3.0.

Dữ liệu nằm trong bản cài hiện tại; giải nén riêng thành một bản cài khác sẽ có database riêng. Vì Cloud gắn một instance Windows, không đổi sang bản cài/database mới khi muốn tiếp tục cùng shop. Luôn cập nhật bản cài đang dùng.

## Bổ sung giá từ Excel và lưu khách trong nháp

Xem [hướng dẫn V7.3.0](EXCEL_GIA_VA_KHACH_V7.3.0.md): Tồn kho → Excel tồn kho & bổ sung giá → Xuất → điền G/H → Nhập → xem trước → Xác nhận. Khách nhập trực tiếp có lựa chọn lưu vào danh sách khi lưu nháp.

## Khi gặp lỗi

Giữ cửa sổ chương trình mở, chụp thông báo lỗi và địa chỉ trang. Không gửi mã đăng nhập, liên kết email hoặc Secret Key. Phát hành V7.1.3 thay nhãn/khởi động và giữ dữ liệu; lỗi đăng nhập Cloud trên laptop đã được báo nhưng chưa có thông báo cụ thể để xác minh. Không tự xóa kho hoặc reset Cloud để thử đăng nhập.
