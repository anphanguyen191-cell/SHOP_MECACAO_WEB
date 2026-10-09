# V2 — Đặc tả logic bán hàng / đơn hàng

Ngày: 2026-10-10. Trạng thái: **PROPOSED — chuẩn bị theo yêu cầu chủ shop; chưa triển khai**.

Nền: V1 source `f35375835757457bc7011f127a32f96d3856a060`, SQLite schema 110, Node/Express, React/TypeScript, tồn thực tế theo ảnh canonical đã đăng ký còn tồn tại. Kết quả Windows mới: `V1_ACCEPTANCE_CHECKPOINT_2026-10-10.md`.

## 1. Phạm vi và quyết định

| Nội dung | Logic đề xuất | Mức chốt |
|---|---|---|
| Đơn vị hàng | Mỗi image ID canonical hợp lệ = một bộ; số lượng dòng bằng số image ID riêng biệt | Nguyên tắc đã chốt |
| Gửi ảnh | Copy/chia sẻ ảnh không giữ hàng, không tạo đơn, không trừ tồn | Đã chốt / V1 triển khai |
| Đơn nháp | Lưu/mở/sửa/hủy; chưa giữ hàng hoặc loại ảnh khỏi tồn | Đề xuất V2 cần duyệt |
| Xác nhận bán | Kiểm tra lại từng ảnh; thành công toàn đơn hoặc không bán bộ nào | Đề xuất V2 cần duyệt |
| Đã bán | Khóa sửa trực tiếp; không xóa đơn/ledger; mở lại để xem lịch sử | Đề xuất V2 cần duyệt |
| Ảnh sau bán | Chủ shop muốn bỏ ảnh gốc của bộ đã bán, chỉ giữ bản tối ưu nhẹ | Yêu cầu chủ shop; cơ chế xóa/khôi phục cần duyệt |
| Đơn nháp hủy | Không tác động kho | Đề xuất V2 cần duyệt |
| Hủy đơn đã bán / hoàn hàng | Không thêm nút thao tác ghi trong V2 trước khi quy tắc được duyệt; không sửa ngược ledger âm thầm | Theo phạm vi chi tiết V3 đã bàn giao |
| Giảm giá | Đề xuất V2 giảm tiền VND trên toàn đơn; không vượt tiền hàng | Đề xuất cần duyệt |

V3 giữ khách hàng, COD/chuyển khoản, công nợ, phí vận chuyển/phiếu PNG và quy tắc hoàn/hủy chi tiết. V4 giữ báo cáo doanh thu/lợi nhuận quản trị. V5/V6 giữ LAN/cloud/sync. V2 không tự mở mạng, không phụ thuộc EXE/Python cũ.

## 2. Luồng chủ shop

1. Tồn kho: chọn ảnh còn hàng bằng các thao tác đã có → **Đưa vào đơn nháp**. Chọn/gửi ảnh vẫn độc lập với tạo đơn.
2. Kiểm tra từng Product, Size, SKU, ảnh, giá; số lượng tự lấy từ ảnh đã chọn. Có thể bỏ/thêm ảnh thực tế, không gõ số lượng vượt ảnh.
3. Lưu nháp, mở lại, sửa. Hai đơn nháp có thể cùng tham chiếu một ảnh; giao diện ghi **“Nháp chưa giữ hàng”**.
4. Bấm Xem trước bán: tổng tiền, giảm giá, số bộ, ảnh nhẹ dự kiến, dung lượng trước/sau và quy tắc bỏ ảnh gốc đã bán.
5. **Xác nhận bán**: server kiểm tra lại nguồn ảnh, phiên bản đơn và quyền sở hữu từng image ID; không tin số tiền/số tồn do client gửi.
6. Thành công: mã đơn duy nhất, số bộ đã bán, tiền hàng sau giảm; dashboard/tồn cập nhật. Xem lại lịch sử bằng ảnh nhẹ.

Nút V2 **Xác nhận bán** khác với V1 **COPY X ẢNH**. Không bán khi chỉ chọn ảnh, copy, xem trước, lưu nháp hay mở lại đơn.

## 3. Trạng thái đơn và sự cố

| Trạng thái | Thao tác cho phép | Ảnh/tồn |
|---|---|---|
| DRAFT | Thêm/bỏ ảnh, sửa giá/giảm giá, lưu, hủy nháp | Tồn giữ nguyên; khi mở lại phải kiểm tra còn hàng |
| CANCELLED_DRAFT | Xem lịch sử; tạo đơn nháp mới nếu cần | Tồn giữ nguyên |
| CONFIRMING (kỹ thuật) | Chờ / kiểm tra trạng thái operation ID; không sửa hoặc xác nhận lần nữa | Hệ thống đang khóa mutation liên quan |
| SOLD | Xem; không sửa/xóa trực tiếp | Ảnh không còn canonical trong kho đang bán; ảnh nhẹ thuộc lịch sử |
| RECOVERY_REQUIRED (kỹ thuật) | Kiểm tra và phục hồi có nhật ký | Không báo thành công, không tự xóa file nghi ngờ |

Trạng thái cleanup ảnh gốc được theo dõi riêng: `PENDING / COMPLETE / REVIEW_REQUIRED`. Nếu DB đã commit SOLD mà cleanup chưa xong, đơn vẫn đã bán; không cho người dùng bán lại hoặc rollback đơn bằng cách xóa metadata.

## 4. Tính tiền và lưu lịch sử

- Mỗi dòng ứng với Product + Size/SKU + đơn giá; tách dòng nếu cùng Size nhưng khác đơn giá.
- `quantity = số image ID riêng trên dòng`; một image ID không xuất hiện ở hai dòng cùng đơn.
- `subtotal = tổng(quantity × unit_sale_price)`; `total = subtotal - order_discount`.
- Giá/giảm giá là VND nguyên, không âm; kiểm tra safe integer và overflow ở server. Giảm giá không vượt subtotal.
- Giá bán gợi ý theo Size nhưng có thể sửa trong nháp. Giá 0 cần xác nhận rõ trước bán.
- Lưu snapshot tên, mã, Size, SKU, đơn giá và giá vốn tại thời điểm bán; đổi tên/giá Product sau đó không sửa đơn cũ. Giá vốn chưa có phải có dấu “chưa xác định”, không tự coi là 0 để tính lợi nhuận.
- Chưa gắn SOLD với “đã thanh toán”; thanh toán thuộc V3. V2 không trình bày giá trị đơn bán như tiền đã thu.

## 5. Nguồn tồn và dữ liệu cần bổ sung

**Tồn vẫn từ ảnh vật lý:** ảnh được đăng ký, ở đường dẫn canonical đang bán, còn tồn tại và đủ điều kiện AVAILABLE. Trạng thái metadata là điều kiện lọc, không tạo hàng nếu file không có. Ảnh lịch sử SOLD tồn tại không được cộng vào kho. Ledger chỉ ghi SALE, kiểm toán/đối soát.

Ví dụ tồn ảnh 5, ledger 8: bán đúng 2 ảnh → tồn thực tế 3, ledger 6, lệch vẫn 3. Không bán 8 bộ, không dùng SALE để tự sửa chênh lệch cũ.

Mô hình dự kiến (tên/schema chính thức chốt lúc thiết kế migration):

- `sales_orders`: mã, DRAFT/SOLD/cancelled draft, version, tiền, timestamps, operation ID.
- `sales_order_lines`: Product/variant, quantity và snapshots/giá.
- `sales_order_images`: image ID ổn định, dòng hàng, hash nguồn, đường dẫn/hash/size bản nhẹ; không tạo image ID hàng mới cho ảnh nhẹ.
- Claim UNIQUE trên image ID đã bán/đang xác nhận, chống bán một bộ hai lần. Không đặt UNIQUE toàn cục trên ảnh nháp khiến nháp trở thành giữ hàng.
- `sale_operations` + journal file durable: request key, payload hash, giai đoạn, nguồn/staging/archive và checksum.
- Metadata AVAILABLE/SOLD cho ảnh; giữ ID cũ và lịch sử, không tái sử dụng ID.
- Ledger bổ sung nghiệp vụ **SALE** với liên kết đơn/dòng hàng và ràng buộc chống ghi hai lần. Schema 110 hiện chưa có SALE; không giả dạng SALE thành ADJUST_MINUS. Migration thay constraint/view phải giữ toàn bộ ID/lịch sử đã tồn tại.

Không viết migration lên database thật khi chưa có backup, dry-run và rollback trên bản sao được kiểm chứng. V1 phải từ chối mở DB schema V2, không giả định quay lại executable V1 là rollback an toàn sau khi đã bán.

## 6. Xác nhận bán và cạnh tranh

- Một khóa phối hợp filesystem/DB cho các nghiệp vụ làm đổi ảnh: bán, nhập, rename, commit import, phục hồi và backup. Không để scanner/backup thấy trạng thái nửa giao dịch.
- Kiểm tra version của đơn và hash payload; idempotency key duy nhất. Retry cùng key/cùng payload trả lại đúng kết quả đã lưu; key giống/payload khác trả 409.
- Đọc lại tất cả ảnh: active Product/Size, AVAILABLE, đường dẫn hợp lệ, ảnh thật đọc được, checksum phù hợp preview, không thiếu/đổi nội dung/đã claim.
- DB `BEGIN IMMEDIATE` + UNIQUE claim chống hai cửa sổ bán cùng image ID. Một bên thắng; bên còn lại báo ảnh xung đột, không bán một phần của đơn.
- Khóa phải áp dụng cả ở service, không chỉ nút disabled của UI. Giữ khóa tới khi quyết định DB/FS rõ ràng; đọc tồn nhất quán hoặc báo tạm bận, không trả số nửa chừng.

## 7. Ảnh đã bán: bản nhẹ và xóa có kiểm chứng

Đề xuất ban đầu để chủ shop xem chất lượng: JPEG đúng hướng, cạnh dài tối đa 1280px, quality 82, không phóng lớn/cắt/méo ảnh. Đây là cấu hình **chưa duyệt**, không cam kết kích thước KB cố định. HEIC/PNG/WebP phải giải mã được; không xử lý được thì từ chối bán trước khi thay đổi kho. Giữ checksum ảnh gốc và checksum riêng bản nhẹ (hai giá trị không bằng nhau vì ảnh đã nén).

1. Chuẩn bị bản nhẹ vào archive **ngoài vùng scanner**, tên theo order/image ID tránh trùng, ghi durable, đọc giải mã lại và đối chiếu checksum.
2. Ghi durable journal trước khi động vào đường dẫn canonical. Ghi kế hoạch cho toàn bộ đơn, không journal sau thao tác.
3. Đưa ảnh canonical sang staging phục hồi **ngoài vùng quét, cùng volume**, rename không ghi đè. Kiểm chứng cùng volume và quyền trước; không fallback MOVE qua volume hoặc thay cấu trúc Product/Size âm thầm.
4. Commit đơn, claims, SOLD metadata và ledger SALE trong một SQLite transaction.
5. Sau commit, kiểm chứng DB liên kết đúng archive và toàn bộ ảnh nhẹ đọc được. Khi không còn thao tác backup/mutation xung đột, xóa các ảnh gốc staging **đúng hash được journal ghi**; giữ log cleanup.
6. Nếu chưa commit: trả ảnh từ staging về đúng canonical path, giữ nguyên bytes. Nếu path đích bị chiếm, hash đổi, DB/journal không rõ: dừng để review, không ghi đè/xóa.
7. Nếu đã commit: hoàn tất cleanup có kiểm chứng; không đưa ảnh về tồn hoặc ghi SALE thêm lần nữa.

Ảnh nguồn ngoài kho đã dùng lúc nhập luôn giữ nguyên. Chỉ xóa ảnh gốc **của bộ đã bán trong kho quản lý**, theo chính sách được duyệt. Không xóa ảnh gốc khi mới COPY/gửi, nháp, preview hoặc bản nhẹ lỗi. Lúc mới chạy nên có chế độ giữ staging để đối chiếu sandbox; trước áp dụng thật cần duyệt xóa sau commit và chất lượng ảnh.

Ảnh nhẹ không thể khôi phục bytes/chất lượng gốc sau xóa. Hoàn hàng sau này cần kiểm tra bộ hàng thực tế, ảnh mới và giao dịch hoàn có kiểm toán; không tự cộng tồn từ ảnh nhẹ. Không tự chặn một giao dịch hoàn hợp lệ chỉ vì hash của ảnh gốc đã bán tồn tại.

## 8. Đồng bộ module và backup

- Tổng quan, Danh mục, Tồn kho, chi tiết và gợi ý chỉ tính ảnh AVAILABLE thật; lịch sử bán vẫn hiển thị ảnh nhẹ SOLD.
- Scanner/autowatch không quét archive/staging và không đề xuất đăng ký lại ảnh đã bán. Nhập nguồn có hash trùng hàng đã bán phải báo rõ để review, không tạo tồn mới âm thầm.
- Rename/copy-gửi chỉ thao tác ảnh AVAILABLE; nhận lại danh sách đã chọn cũ phải revalidate.
- Backup V2 bao gồm DB, ảnh gốc AVAILABLE, bản nhẹ SOLD và checksum/manifest đúng vai trò. Nếu recovery/cleanup chưa rõ, dừng backup “hoàn chỉnh” hoặc bao phủ cả staging/journal để restore nhất quán; không bỏ sót originals chưa giải quyết.
- Restore thử vào vị trí mới: ánh xạ đường dẫn, verify DB/integrity/FK, file counts/hashes, AVAILABLE stock, SOLD archive và không bán lại ảnh SOLD. Không ghi đè kho đích có dữ liệu.
- Không xóa backup V1/cũ để tiết kiệm dung lượng nếu chưa có chính sách retention riêng được duyệt. Ghi rõ backup sau bán có ảnh nhẹ, không thể hoàn nguyên ảnh SOLD gốc đã xóa.

## 9. API/UI dự kiến và tiêu chí hoàn thành

API dự kiến: tạo/đọc/sửa nháp (version), hủy nháp, preview, confirm có idempotency key, tra operation status, danh sách/chi tiết lịch sử. Các endpoint confirm vẫn loopback/sandbox và kiểm tra origin như thao tác ghi phù hợp; không mở LAN.

UI mới: Bán hàng với danh sách đơn + form/giỏ hàng + preview. Giữ Gọn/Thoải mái, pastel, responsive, dashboard trên đầu thu gọn được; KPI bấm lọc đúng dữ liệu. Khi request mất kết nối, hiển thị trạng thái “đang xác minh”, hỏi server bằng operation key; không suy luận thất bại rồi tự POST giao dịch mới.

Các bước triển khai và test cụ thể ở `V2_IMPLEMENTATION_CHECKLIST.md`. Trước triển khai cần duyệt các dòng PROPOSED trên, chất lượng ảnh nhẹ và quy tắc cleanup, đồng thời khóa gate V1 theo checklist đã có.
