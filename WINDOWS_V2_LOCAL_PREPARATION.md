# Chuẩn bị LOCAL V2 từ backup V1 — duyệt trên bản sao

V2 đã được chủ shop nghiệm thu 10 bước Windows trên sandbox. Bước này dùng **backup dữ liệu V1 của cửa hàng** để tạo gói riêng và kiểm chứng chuyển dữ liệu. Không đổi kho đang dùng, không tự kích hoạt bán kho thật, không xóa ảnh đã bán. Giữ `START_SHOP.bat` cho V1 hiện tại.

## Thực hiện

1. Mở V1 đang dùng → Cài đặt → **BACKUP ĐẦY ĐỦ DB + ẢNH GỐC**. Đợi kiểm chứng thành công; ghi lại thư mục backup chứa `lossless-manifest.json` và `shop.db`. Backup chỉ DB hoặc ảnh tối ưu không dùng được ở bước này. Đối chiếu ảnh đang quản lý trong V1 trước khi backup; ảnh chưa đăng ký không được tự tính là tồn.
2. Tải source mới, Extract All vào thư mục mới. Chạy **`PREPARE_WINDOWS_V2_LOCAL_COPY.bat`**. Node22.13+; lần đầu cần Internet cài dependencies. Bộ chuẩn bị build lại đúng source.
3. Khi được hỏi, dán **thư mục backup đầy đủ** (không phải đường dẫn `shop.db`), nhấn Enter. Tiếp theo dán **đường dẫn kho gốc đã dùng khi backup**, nhấn Enter; ví dụ `D:\1-Me CaCao Store`. Đường dẫn này chỉ để đối chiếu/remap metadata, không ghi lên kho gốc. Có thể Copy as path với dấu ngoặc kép.
4. Đợi `READY_FOR_REVIEW`. Gói mới tại `%LOCALAPPDATA%\ShopMeCaCao\V2LocalPreparation\prepare-<mã>`; không nhập dữ liệu vào các thư mục proof. Quá trình cần khoảng **4 lần dung lượng backup gốc + phần dự phòng** để có candidate, backup V2, restore thử V2 và quay lui thử V1. Có kiểm tra dung lượng trước khi tạo gói; lỗi giữa chừng giữ thư mục dở, không tự xóa.
5. Chạy **`RUN_WINDOWS_V2_LOCAL_REVIEW.bat`**, nhập số gói muốn mở. Trình duyệt mở **http://127.0.0.1:3017**. Phải thấy banner **LOCAL V2 — BẢN SAO ĐỂ DUYỆT**. Nhãn TEST SANDBOX vẫn cho biết đây là vùng tách riêng.
6. Đối chiếu mẫu, Size/SKU, giá và tồn với V1 tại thời điểm backup. Ledger lệch tồn ảnh vẫn được giữ để đối soát; không âm thầm chỉnh số. Có thể tạo/bán một đơn trên bản sao, restart rồi kiểm tra lịch sử; thao tác đó không phải đơn kinh doanh. Không nhập các đơn test này ngược về V1.

Không cần lặp lại bộ 10 bước V2 đã PASS. Lần này chỉ nghiệm thu **dữ liệu được chuyển sang bản sao và cách khởi chạy**. Kho thật tiếp tục chạy V1; mọi thay đổi V1 sau thời điểm backup chưa xuất hiện trong bản sao.

## Gói kiểm chứng và quay lui

`local-v2-ready.json` chứa SHA và số bản ghi nghiệp vụ, đường dẫn nguồn backup, candidate schema130, backup V2, `restore-proof-v2` và `rollback-proof-v1` schema110. So sánh đầy đủ categories/products/variants/images/ledger, các ID và sequence, giá, timestamps, cấu hình nghiệp vụ. Chỉ đường dẫn ảnh được remap; cache quét được bỏ, startup/periodic/autoRename ở bản sao tắt. Ảnh còn tồn được giải mã và đối chiếu checksum.

**Quay lui ở đây là phục hồi thử V1 sang kho riêng, đã được kiểm chứng; không phải nút ghi đè kho đang dùng.** Trước khi có đơn bán kinh doanh đầu tiên mới có thể chốt phương án quay về V1 bằng backup lúc chuyển. Sau khi có giao dịch kinh doanh V2, không thay DB130 bằng backup110 cũ vì sẽ mất lịch sử mới; cần kế hoạch riêng. Không tự kích hoạt `rollback-proof-v1` hay chuyển các thư mục candidate vào kho thật.

Gói đạt READY không có nghĩa bản LOCAL kinh doanh đã STABLE. Đợt kế tiếp cần đặc tả/kích hoạt được duyệt, backup mới tại thời điểm chuyển, kiểm chứng dữ liệu cuối và quy trình vận hành. Chính sách ảnh nhẹ/xóa gốc riêng; V3 thanh toán/COD/khách/PNG ngoài phạm vi này.
