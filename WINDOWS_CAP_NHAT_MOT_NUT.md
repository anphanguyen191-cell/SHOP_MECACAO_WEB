# Windows: dữ liệu cố định và cập nhật Shop

Chức năng mới dành cho bản main schema 130 đang dùng kho ảnh riêng đã chọn trên giao diện. Đây là checkpoint cần nghiệm thu Windows thực tế; CI không thay thế nghiệm thu laptop của shop.

## Thiết lập một lần

1. Sao lưu đầy đủ trong Shop theo quy trình hiện có. Nếu đang có tác vụ/giao dịch cần phục hồi, xử lý xong trước.
2. Dừng Shop. Khi Shop chạy ẩn và không rõ cách dừng, khởi động lại Windows rồi chưa mở Shop.
3. Giải nén gói Windows mới vào một thư mục tạm, không chép đè bản cũ.
4. Chạy `CAI_DU_LIEU_CO_DINH.bat`. Hộp chọn thư mục yêu cầu chọn thư mục Shop CŨ đang dùng, nơi có `START_SHOP.bat` và `data`.
5. Công cụ nhận diện đúng database `data/stage6-main-test/database/shop-stage6-main-test.db`, kiểm tra schema/integrity/lịch sử và mã kho Cloud, sao chép toàn bộ data theo SHA-256, rồi kiểm thử bản mới trên bản sao.
6. Chỉ khi kiểm tra đạt, công cụ nối các launcher cũ sang nơi mới và tạo lại biểu tượng Shop trên Desktop. Database gốc và kho ảnh không bị xóa. Không chạy database gốc và mới luân phiên.
Nếu lần chuyển thất bại do tải/build, có thể chạy lại công cụ. Bản chuyển thất bại được giữ riêng để kiểm tra; lần thử lại lấy dữ liệu từ bản cài gốc đang dùng, không lấy bản đích dở dang.

7. Kiểm tra Kho đang dùng, tồn, lịch sử bán và kết nối Cloud. Chênh lệch 18 bộ đang được đối soát riêng; công cụ cập nhật không sửa số tồn để ép khớp Cloud.

Mặc định vùng cố định nằm tại `%LOCALAPPDATA%\ShopMeCaCao\Managed` của tài khoản Windows hiện tại:

| Vùng | Vai trò |
| --- | --- |
| `data` | Database, cấu hình, lịch sử, LAN và trạng thái của kho |
| `releases/<commit>` | Chương trình riêng cho từng phiên bản |
| `backups` | Snapshot trước cập nhật, hồ sơ chuyển dữ liệu và backup nghiệp vụ |
| `staging` | Vùng tải/chuẩn bị/kiểm thử bản sao |
| `runner.mjs`, `MO_SHOP.vbs` | Điểm mở Shop cố định |

Kho ảnh tiếp tục ở đường dẫn đang dùng. Những đường dẫn lịch sử trong database được giữ nguyên; không tự đổi đường dẫn ảnh/archive, không tạo lại cloud-instance. Vì bản gốc có thể chứa đường dẫn lịch sử, chưa tự xóa thư mục cài cũ.

Công cụ không tự chuyển database V1/Local V2 riêng, không tự tạo database mới khi nhận diện thất bại, không hỗ trợ di chuyển kho mặc định chưa có `warehouse-config.json`. Khi gặp trường hợp này công cụ dừng và giữ bản cũ.

## Cập nhật các lần sau

Mở Shop → Cài đặt → Cập nhật Shop trên Windows → **Kiểm tra & cập nhật Shop**.

- Chỉ tải commit `main` đã PASS workflow bắt buộc của repo chính. Nếu CI chưa PASS, giữ bản đang dùng.
- Tải theo commit cố định vào vùng tạm; chặn ZIP vượt thư mục/trùng tên và giới hạn kích thước.
- Cài dependency/build trong vùng chương trình mới; Shop hiện tại tiếp tục dùng được trong bước này.
- Trước chuyển phiên bản: chặn ghi mới, đợi tác vụ đang chạy kết thúc, từ chối khi có giao dịch cần phục hồi, đóng tiến trình bằng IPC rồi checkpoint SQLite.
- Sao lưu database và cấu hình/data nội bộ, kiểm thử khởi động trên bản sao riêng, mở candidate với ghi dữ liệu bị chặn, xác nhận database/lịch sử/mã Cloud khớp rồi mới bật ghi và đổi phiên bản đang dùng.
- Nếu candidate khởi động lỗi: phục hồi snapshot dữ liệu đã kiểm tra, mở lại bản trước. Lỗi tải/build không thay bản đang dùng. Có thể bấm thử lại sau khi khắc phục mạng/build; từng lần dùng vùng tạm mới.
- Khi thành công, bấm **Mở giao diện mới**. Địa chỉ localhost vẫn giữ, phiên Cloud dùng cùng trình duyệt được giữ theo cơ chế Auth hiện có.

Snapshot trước cập nhật không tự sao chép toàn bộ ảnh nằm ngoài vùng `data`: ảnh nguồn giữ nguyên ở kho. Muốn backup phòng hỏng ổ đĩa, vẫn dùng **BACKUP ĐẦY ĐỦ DB + ẢNH GỐC** và chép backup sang ổ khác.

Updater hiện chỉ tự xử lý schema 130. Bản nâng schema phải có quy trình migration/restore được kiểm thử riêng; không cho dùng schema không khớp.

## Kiểm thử

`npm run build` rồi `npm run test:windows-update`.

Test dùng kho giả lập có giao dịch SOLD thật: chuyển giữ nguyên dữ liệu/mã Cloud/ảnh; từ chối chuyển lần hai; lỗi chuẩn bị ban đầu giữ launcher gốc; HTTP từ origin khác bị chặn; candidate khởi động bị chặn ghi; snapshot phục hồi khi candidate đổi dữ liệu rồi lỗi; đổi release thành công; coordinator nhận thao tác qua HTTP, từ chối CI, lỗi tải/build và thử lại thành công. Không bán/xóa sản phẩm thật của shop.
