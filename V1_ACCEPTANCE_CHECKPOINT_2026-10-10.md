# V1 — Ghi nhận nghiệm thu do chủ shop báo

Ngày: 2026-10-10, Asia/Ho_Chi_Minh.

Chủ shop: **“v1 mình đã test ổn rồi bro. Chuẩn bị logic qua v2 đi bro”**.

- Ghi nhận **Windows V1 USER-REPORTED PASS** cho việc sử dụng bản đã giao. Không bắt chủ shop làm lại những thao tác đã xác nhận.
- Source baseline: `f35375835757457bc7011f127a32f96d3856a060` (bản gửi gần nhất; tin nhắn không nêu SHA trên máy).
- GitHub Actions run `37945599496`: SUCCESS, verify + Windows Node 22/24 + deploy; xác minh lại tại lần cập nhật này.
- CI gồm schema/core/warehouse/share integration, native Windows multi-file clipboard round-trip, 49 HTTP assertions và Chromium UI; không thay thế kiểm chứng từng ứng dụng Zalo/Messenger hoặc mobile thật.
- Tin nhắn nghiệm thu không liệt kê riêng restart, rename, full restore hay ứng dụng nhận clipboard. Không tự tạo bằng chứng PASS từng ca chưa được nêu.
- Source `createLosslessBackup` / `verifyLosslessBackup` kiểm chứng DB snapshot + original images; chưa có quy trình restore đầy đủ vận hành kho ở vị trí mới đã được nghiệm thu Windows.

**Phân biệt trạng thái:** Windows sử dụng V1 được chủ shop báo ổn; khóa release V1 STABLE vẫn cần hoàn tất checkpoint full restore theo nguyên tắc đã chốt. Có thể chuẩn bị đặc tả V2 ngay; chưa đổi schema, triển khai bán hàng hoặc xóa ảnh. Đây là ghi nhận đúng phạm vi, không phủ nhận kết quả Windows của chủ shop.

Xem `V2_SALES_LOGIC_SPEC.md` cho bản logic đề xuất và `V2_IMPLEMENTATION_CHECKLIST.md` cho thứ tự thực hiện. Không đọc các câu PRE-WINDOWS cũ như trạng thái Windows hiện tại.
