# Roadmap — main chặng 6

Đọc [checkpoint hiện tại](MAIN_CHECKPOINT_STAGE6_2026-10-11.md) và [nguyên tắc](DEVELOPMENT_PRINCIPLES.md). Bản hiện tại `3.5.0-stage6-main-test`, chưa STABLE.

| Chặng | Phạm vi | Tiến độ |
|---|---|---|
| 1 | Kho theo ảnh, nhập/scan/import/rename/chia sẻ, nháp/SOLD/lịch sử, backup/restore | Đã tích hợp main |
| 2 | Khách/contact snapshot, ship/tổng tiền, PNG nháp/SOLD | Đã tích hợp main |
| 3 | Thu/cọc/hoàn/giảm, công nợ, giao hàng, hậu mãi | Đã tích hợp main |
| 4 | Báo cáo và kiểm kê, CSV | Đã tích hợp main; không tự chỉnh tồn |
| 5A | Kiểm chứng ảnh SOLD chỉ đọc | Đã tích hợp main |
| 5B/5C | Lưu trữ di chuyển và xóa ảnh SOLD | Chưa triển khai; cần phạm vi/duyệt riêng |
| 6 | Windows + điện thoại chung LAN: HTTPS, quyền, cập nhật, ảnh chờ và thiết lập UI | Hoàn thiện phần mềm; chờ nghiệm thu thiết bị thật |
| UI 6.1–6.6 | Chọn ảnh/panel/nav/PNG/banner, ba mức hiển thị toàn bộ màn hình, safe area/sáng tối | Đã tích hợp main; kiểm thử giả lập, chờ iPhone vật lý |
| 7 | Cloud, dùng ngoài Wi-Fi, đồng bộ/offline queue | Chưa triển khai; cần thiết kế và duyệt riêng |

Bước hiện tại là nghiệm thu bản cài mới trên laptop/kho tự tạo và iPhone cùng Wi-Fi theo [checklist](MAIN_TEST_STAGE6_RELEASE.md). Sửa lỗi thực tế trước khi mở rộng Stage7; không coi CI là STABLE.

Các bản phát triển kế thừa mã/chức năng, không bắt kế thừa DB thử. Giải nén thư mục mới, chọn kho qua UI; import khi cần. Mở lại cùng bản giữ dữ liệu. Không tự xóa/ghi đè bản cũ. Một launcher START_SHOP.bat cho Windows; GitHub Pages chỉ DEMO.

Mỗi chặng hoàn thiện DB → service → API → UI → backup/recovery và kiểm thử phù hợp. Đưa phần đã duyệt lên main, đối chiếu CI đúng commit, cập nhật checkpoint/test report. Dữ liệu kiểm thử tự động chỉ giả lập. Lợi nhuận ròng/chi phí/thuế, nhập trả tự động, ngân hàng/vận chuyển tự động vẫn ngoài phạm vi hiện tại.
