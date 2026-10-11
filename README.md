# SHOP MẸ CACAO WEB — main mới nhất

**3.5.0-stage6-main-test · chặng 6 · chưa STABLE nghiệm thu thiết bị thật.** Giữ đầy đủ chặng 1–4 và Stage5A; hoàn thiện Mobile LAN HTTPS, tài khoản/phân quyền, cập nhật giữa Windows/điện thoại và hộp ảnh iPhone. Thiết lập HTTPS/tài khoản/bật tắt LAN ngay trên giao diện Windows, không cần lệnh tạo cert hoặc đường dẫn DB V1.

[Tải main.zip cho Windows](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/archive/refs/heads/main.zip) → giải nén **thư mục mới** → Node.js 22.13+ hoặc 24 → **START_SHOP.bat**. Chọn kho tự tạo qua UI trước khi nhập dữ liệu; quét/import có duyệt hoặc nhập COPY. Bản cài mới có DB mới, mở lại cùng bản giữ dữ liệu. Không cần marker fixture hoặc nối DB thử cũ.

- [Cách chạy Windows và checklist nghiệm thu](MAIN_TEST_STAGE6_RELEASE.md)
- [Thiết lập iPhone cùng Wi-Fi](STAGE6_MOBILE_LAN_SETUP.md)
- [Tổng hợp chức năng/nền tảng phát triển tiếp](MAIN_CHECKPOINT_STAGE6_2026-10-11.md)
- [Trạng thái](PROJECT_STATE.md), [roadmap](ROADMAP.md), [nguyên tắc](DEVELOPMENT_PRINCIPLES.md), [changelog](CHANGELOG.md)
- [Kiểm thử và giới hạn](STAGE6_TEST_REPORT.md), [CI đúng main](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/workflows/pages.yml)

| Phần mềm trên main | Phạm vi |
|---|---|
| Kho/bán/khách | Tồn theo ảnh, nhập COPY, scan/import/rename/share, nháp/preflight/SOLD/lịch sử, khách/contact snapshot, ship và PNG nhiều trang |
| Tiền/giao/hậu mãi | Thu/cọc/hoàn/giảm, COD/chuyển khoản/tiền mặt, công nợ, vận đơn, yêu cầu/kết quả hậu mãi |
| Báo cáo/kiểm kê | Doanh số/dòng tiền/lãi gộp/thiếu vốn/CSV, snapshot/đếm/chênh/lý do/chốt, không tự chỉnh tồn |
| SOLD | Stage5A kiểm chứng ảnh/hash chỉ đọc, chưa move archive/delete |
| Mobile LAN | HTTPS, 4 vai trò, session/audit, polling gần 4 giây, ảnh chờ→Windows duyệt COPY→Nhập hàng |
| Vận hành/UI | Transaction/journal/hash/lock/recovery, backup/restore thử, tiến độ tác vụ, sáng/tối màu rõ/responsive/phiên bản |

LAN mặc định tắt sau mở lại ứng dụng. Mở **Mobile LAN** trên Windows để tạo HTTPS/tài khoản/bật kết nối, tải CA công khai tạm 10 phút và xem URL điện thoại. Safari cần cài và bật tin cậy đầy đủ cho CA, Windows phải chạy cùng Wi-Fi. Không mở cổng ra Internet. Chủ shop được thao tác kho tự tạo như kho thật; kiểm thử Codex/CI chỉ dữ liệu giả lập.

GitHub Pages là **DEMO**, không kết nối DB/kho shop. Stage7 cloud/ngoài LAN/offline queue, Stage5B/5C xóa/lưu trữ di chuyển, lợi nhuận ròng/chi phí/thuế, tự chỉnh tồn/ngân hàng/vận chuyển vẫn chưa triển khai.

UI Checkpoint 6.1–6.6: panel chọn ảnh góc phải có thu gọn/mở rộng, nav gọn, phiếu PNG theo banner shop và cỡ Nhỏ/Vừa/Lớn trên toàn giao diện. Mặc định Vừa, lưu theo thiết bị; đổi trong Cài đặt giao diện hoặc menu ☰. [Checkpoint UI](UI_CHECKPOINT6_2026-10-11.md).

## Phục hồi và tài liệu nền

Cài đặt → Backup đầy đủ → Phục hồi thử sang vùng mới → kiểm tra READY. Không thay DB/kho đang chạy. LAN keys/tài khoản không được coi là đã di chuyển bởi backup nghiệp vụ; bản cài mới thiết lập qua UI.

Đặc tả các chặng: [khách/PNG](STAGE2_CUSTOMERS_PNG.md), [thu tiền/hậu mãi](STAGE3_PAYMENTS_AFTERCARE.md), [báo cáo/kiểm kê](STAGE4_REPORTS_STOCKTAKE.md). Checkpoint V1/V2/Stage1–5 và launcher migration trong source là lịch sử/công cụ tương thích tùy chọn, không phải bước khởi chạy bản mới.
