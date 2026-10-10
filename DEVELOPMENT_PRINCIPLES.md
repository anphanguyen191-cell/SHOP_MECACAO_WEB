# Quy tắc cập nhật do chủ shop duyệt — 2026-10-10

Trong giai đoạn phát triển, mỗi phiên bản là bộ phần mềm đầy đủ kế thừa chức năng/mã nguồn, nhưng khởi tạo dữ liệu mới trong thư mục cài mới. Dữ liệu thử trước đó không cần migration/kế thừa; nhập dữ liệu cần dùng qua giao diện. Không xóa hoặc ghi đè kho/thư mục cũ. Kiểm thử dùng dữ liệu giả lập. Một launcher là luồng khởi chạy chính; không bắt chọn DB V1 hoặc gói chuyển kho. Restart cùng bản cài không reset dữ liệu. Quy tắc này thay thế yêu cầu chuyển dữ liệu bắt buộc của các checkpoint lịch sử trong giai đoạn hiện tại.

Chủ shop đã cho phép đưa toàn bộ chặng 2 lên main của anphanguyen191-cell/SHOP_MECACAO_WEB và chạy CI Windows, Linux, browser. Ý tưởng mới ngoài phạm vi đã duyệt vẫn phải đề xuất riêng.

# Nguyên tắc phát triển Shop Mẹ CaCao Web

Bổ sung theo yêu cầu chủ shop ngày 2026-10-10. Áp dụng cho mọi chức năng mới và các thay đổi tiếp theo; đọc cùng PROJECT_STATE.md, ROADMAP.md và đặc tả nghiệp vụ hiện hành.

## Chức năng và giao diện phải được hoàn thiện cùng nhau

**Khi xây chức năng phải đồng thời tối ưu luồng thao tác và giao diện. Không coi chức năng hoàn tất chỉ vì API hoạt động hoặc dữ liệu lưu được.**

- Làm xuyên suốt database → service → API → giao diện → module liên quan → kiểm thử. Hiển thị trạng thái loading, rỗng, lỗi, thành công đúng kết quả thật.
- Luồng dễ hiểu: chọn hàng, thêm/bỏ, lưu, quay lại và cảnh báo đúng lúc; hạn chế nhập lại và thao tác dư. Thao tác chưa lưu, xung đột hoặc lặp lại phải được giải thích để người dùng lựa chọn.
- Nút có vai trò và màu nhất quán: hành động chính hồng đậm, các nhóm chức năng xanh/cam/tím dễ phân biệt, quay lại/hủy phụ rõ ràng, cảnh báo cam/vàng có chữ đậm. Ưu tiên tương phản đủ đọc, không dùng nền pastel quá nhạt làm các chức năng lẫn nhau. Có chữ rõ; không chỉ dùng màu để phân biệt. Không để nút/select mặc định thô trong chức năng mới.
- Đồng bộ chữ, khoảng cách, bo góc, ảnh đúng tỷ lệ, hover/focus/disabled/busy; gọn trên Windows, dễ chạm trên điện thoại. Phải kiểm tra Gọn/Thoải mái, sáng/tối, không tràn ngang; desktop không kéo dài vô ích.
- Dialog nêu rõ nguyên nhân, hàng/đơn bị ảnh hưởng và lựa chọn tiếp tục hoặc quay lại; hỗ trợ bàn phím, Escape, quản lý focus; không tự xác nhận thay người dùng.
- Rà các tab liên quan sau thay đổi. Kiểm thử luồng thật từ chọn hàng đến kết quả, bao gồm cảnh báo và nhánh hủy; không chỉ kiểm tra nút có xuất hiện. CI PASS chưa thay thế nghiệm thu Windows của chủ shop.

## Quy tắc ảnh trùng giữa các đơn nháp

- Một ảnh canonical/image ID = một bộ hàng. **Cùng ảnh/bộ đã ở nháp khác** phải cảnh báo trước khi tạo nháp mới hoặc thêm vào nháp có sẵn; nêu các mã đơn liên quan và cho chọn tiếp tục hay quay lại chọn hàng.
- Hai bộ khác image ID cùng mẫu/Size không bị coi là trùng. Không dùng tên Product/SKU để chặn mọi bộ của cùng mẫu.
- Chỉ tính đơn DRAFT khác; loại nháp đã hủy và chính đơn đang sửa. Sửa giá/ghi chú của ảnh đã có trong đơn không ép xác nhận trùng lặp lại; mở lại vẫn có chỉ báo nháp trùng.
- Chủ shop có thể chủ động đồng ý cùng bộ ở nhiều nháp. Nháp vẫn không giữ hàng/trừ tồn. Kiểm tra lại xung đột trong transaction; nếu danh sách đơn liên quan thay đổi sau hộp thoại, yêu cầu lựa chọn lại.
- Không tạo/sửa đơn khi người dùng chưa chọn tiếp tục. Retry tạo đơn thành công phải trả lại cùng đơn, không tạo thêm hoặc hỏi lại một giao dịch đã hoàn tất.

## An toàn dữ liệu và checkpoint

Giữ tồn thực tế theo ảnh đã đăng ký còn hiện hữu; ledger chỉ lịch sử/đối soát. Giữ ảnh nguồn, transaction/rollback/recovery, backup và restore đã kiểm chứng. Không thay schema, cấu trúc kho, số tồn hoặc xóa file âm thầm. Tách đã triển khai, CI PASS, Windows user PASS và STABLE. Main hiện đã có bán hàng/restore trong bản phát triển 3.0.1-stage2; các gate chuyển DB V1 lịch sử không phải điều kiện khởi chạy bản phát triển mới. Không coi CI là nghiệm thu trên máy chủ shop.

## Baseline để tiếp tục

Đọc `PROJECT_STATE.md` và `MAIN_CHECKPOINT_2026-10-10.md` trước checkpoint lịch sử. `START_SHOP.bat` là launcher chính. Quyền đưa phần đã duyệt lên main và chạy CI đã có; ý tưởng mới ngoài phạm vi cần đề xuất riêng. Không phát triển tự động chặng 3 chỉ từ yêu cầu tổng hợp nền tảng.

## Chủ shop duyệt chặng 3 — 10/10/2026

Yêu cầu “triển khai chặng tiếp theo” đã cấp quyền triển khai thu tiền/công nợ/hậu mãi trên nền main chặng 2 và tích hợp bản mới đầy đủ lên main. Giữ số nghĩa `total`/`payableTotal`, SOLD/contact/SALE ledger bất biến; chứng từ thu/hoàn/giảm riêng; không đồng nhất bán, giao và thu. Đổi trả vật lý không tự hoàn nguyên ảnh SOLD. Những backlog ngoài phạm vi vẫn đề xuất riêng.

## Chủ shop duyệt chặng4 — 10/10/2026

Sau khi hoàn tất chặng3, chủ shop yêu cầu “Triển khai chặng tiếp theo đi bro”: triển khai báo cáo/kiểm kê và đưa bản đầy đủ lên main. Báo cáo tách doanh số với dòng tiền; thiếu vốn không giả định0. Kiểm kê lưu đếm/chênh/lý do, không tự sửa tồn ảnh. Checkpoint hiện tại là MAIN_CHECKPOINT_STAGE4_2026-10-10.md. Ngoài phạm vi này vẫn đề xuất riêng.

## Cập nhật quyền chọn kho — 11/10/2026

Chủ shop yêu cầu “Mình muốn test kho mình tự tạo trên lap luôn nhé, để thao tác như kho thật luôn”. Bỏ ràng buộc marker fixture khi chọn kho trên main. Chủ shop chọn thư mục vật lý của mình trong UI trước khi có dữ liệu và sử dụng nghiệp vụ bình thường. Không yêu cầu script tạo kho/DB hay nối dữ liệu cũ. Codex/CI vẫn chỉ kiểm thử ảnh/SQLite giả lập; API/transaction/recovery/backup và kiểm soát LAN giữ nguyên. Đây là MAIN TEST chưa STABLE, không mở tự xóa ảnh SOLD hoặc cloud.
