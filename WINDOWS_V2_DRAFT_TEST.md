# Thử V2 đơn nháp trên Windows — đợt 1

Bản này chỉ chuẩn bị đơn nháp, chưa bán/trừ tồn/xóa ảnh. V1 đang dùng giữ DB và sandbox riêng. Cần Node 22.13+.

1. Tải source commit mới, giải nén vào thư mục riêng. Chạy **RUN_WINDOWS_V2_DRAFT_TEST.bat**. Nếu chưa có dependencies, setup chạy trước; khi SETUP PASS bấm phím để tiếp tục. Đợi trang `http://127.0.0.1:3006` và nhãn TEST SANDBOX; tab Bán hàng phải xuất hiện.
2. Vào Import kho → CHỌN THƯ MỤC → chọn `%LOCALAPPDATA%\ShopMeCaCao\V2DraftSandbox\warehouse`. Quét, chọn các mẫu/Size có ảnh và duyệt import. Không chọn `D:\1-Me CaCao Store` thật. Fixture có 3 ảnh ở 2 mẫu, 3 Size; quét lại không nhập trùng.
3. Vào Tồn kho, mở mẫu → Size, chọn ảnh hoặc CHỌN NHÓM SIZE. Thanh dưới vẫn có COPY gửi khách và thêm **TẠO ĐƠN NHÁP**. Bấm tạo nháp → chuyển Bán hàng. Đối chiếu ảnh/Size/SKU, số bộ đúng số ảnh đã chọn; tồn và ledger giữ nguyên.
4. Nhập giá bán từng bộ (ảnh mẫu mặc định có thể 0), giảm giá toàn đơn và ghi chú. Bấm Lưu thay đổi. Thử giảm giá lớn hơn tổng tiền, giá âm/thập phân: không lưu. Giá 0 có nhắc kiểm tra; đợt này chưa bán.
5. Bấm **Thêm ảnh tồn** (lưu thay đổi trước nếu có). Chọn ảnh khác → THÊM VÀO ĐƠN NHÁP. Ảnh đã có trong đơn không thêm lần hai. Có thể Bỏ khỏi nháp rồi Lưu; số bộ/tổng tiền cập nhật.
6. Tạo nháp thứ hai tham chiếu cùng ảnh: phải hiện cảnh báo kèm mã nháp liên quan. Chọn Quay lại chọn hàng: không tạo thêm đơn; chọn Vẫn thêm vào đơn nháp: mới lưu nháp thứ hai. Mở lại thấy nhãn bộ cũng ở nháp khác. Hai ảnh khác nhau cùng mẫu/Size không bị cảnh báo; nháp đã hủy không tính. Copy/gửi ảnh không tạo thêm đơn hoặc trừ tồn.
7. Mở cùng một nháp ở hai cửa sổ trình duyệt. Cửa sổ A sửa/lưu; B sửa/lưu phải báo đơn đã thay đổi. Bấm Mở lại đơn ở B để xem bản mới, không ghi đè A âm thầm.
8. Restart: đóng cửa sổ server V2 (hoặc Ctrl+C → Y nếu được hỏi), chạy lại cùng BAT. Mở Bán hàng → chọn nháp; giá, ghi chú, ảnh và phiên bản vẫn có. Kiểm tra Tồn kho như trước.
9. Hủy nháp → xác nhận → lọc Đã hủy nháp. Đơn còn lịch sử, không chỉnh trực tiếp, ảnh vẫn ở kho và tồn không đổi.
10. Kiểm tra màn hình Windows ở chế độ Gọn/Thoải mái, sáng/tối; danh sách/form không tràn ngang. Báo bước bị lỗi và nội dung thông báo nếu có.

Để quay về V1, đóng server V2 và chạy RUN_WINDOWS_V1_SAFE_TEST.bat hoặc launcher LOCAL V1 đã dùng. Không chép DB V2 đè V1; không cần xóa sandbox V2. File `.pre-v120-*.bak` chỉ chứa dữ liệu trước migration, không có nháp tạo sau đó.

## Xem trước ảnh nhẹ (đợt tiếp theo)

Mở nháp đã lưu → Xem trước ảnh nhẹ → so sánh gốc/bản nhẹ và tổng dung lượng → đổi ảnh bằng danh sách. Thử cả sáng/tối, Gọn/Thoải mái. Ảnh gốc không thay đổi; bản nhẹ chưa được lưu lịch sử, chưa bán. Cấu hình 1280px/quality82 là đề xuất để duyệt bằng mắt, không tự coi là chính sách xóa gốc đã được duyệt. Ảnh hỏng, đơn sửa, file đổi/mất phải báo lỗi; xem trước lại sau khi sửa nguyên nhân.

## Lưu thử / restart / kiểm chứng

Sau Xem trước ảnh nhẹ → Lưu bộ ảnh thử → Kiểm chứng lại. Restart server bằng Ctrl+C rồi chạy lại .bat; mở cùng nháp để kiểm chứng bộ thử còn hiện hữu. Sửa nháp và lưu: bộ cũ có phiên bản cũ, không tự áp dụng cho phiên bản mới. Nếu có INCOMPLETE journal hợp lệ, dùng Phục hồi bộ thử; nếu REVIEW_REQUIRED phải giữ file để kiểm tra, không xóa/đổi thủ công. Chưa xác nhận bán/xóa gốc. Phạm vi và 99 kiểm tra archive/staging: V2_ARCHIVE_RECOVERY_CHECKPOINT.md.

## Backup/restore sang kho mới

Cài đặt → Backup đầy đủ → chọn kho gốc warehouse trong sandbox → checkbox tạo bản thử riêng → Phục hồi & kiểm chứng → READY. Chạy RUN_WINDOWS_RESTORED_SANDBOX_TEST.bat chọn1; mở3016 để kiểm tra tồn, ảnh, ledger, nháp và kiểm chứng ảnh nhẹ; restart3016 rồi đối chiếu source3006 không đổi. Chi tiết: V2_BACKUP_RESTORE_CHECKPOINT.md. Chưa thay DB/kho thật hoặc xác nhận bán.
