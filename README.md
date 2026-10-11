# SHOP MẸ CACAO WEB — main mới nhất

**V7.1.2 — bản phát hành Windows và Cloud.** Schema 130. Giao diện chung trên laptop và iPhone; phiên bản/kho đang dùng hiển thị gọn, không đưa tiến độ phát triển vào màn hình nghiệp vụ.

[Hướng dẫn sử dụng và cập nhật](HUONG_DAN_SU_DUNG.md) · [Mở web Cloud](https://anphanguyen191-cell.github.io/SHOP_MECACAO_WEB/?cloud=1) · [Tải Windows từ main](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/archive/refs/heads/main.zip).

Windows: Node.js 22.13+ hoặc 24 → **START_SHOP.bat** → chọn kho trên giao diện → nhập/quét kho → Cài đặt Cloud → đăng nhập → Đồng bộ / Tiếp tục. Internet: mở web Cloud và đăng nhập cùng tài khoản shop. Cài lần đầu vào một thư mục cố định; khi cập nhật thay mã trong thư mục đó và giữ nguyên thư mục `data`, cấu hình, database, ảnh. Không giải nén thành bản cài rỗng mới nếu muốn tiếp tục kho hiện có. Đường dẫn dữ liệu nội bộ cũ giữ nguyên để không làm mất liên kết kho.

Các tài liệu chặng bên dưới là lịch sử phát triển; hướng dẫn vận hành hiện tại ở HUONG_DAN_SU_DUNG.md.

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
| SOLD | Core archive nguyên tử; đối soát SOLD Cloud; dọn ảnh Cloud qua Storage API sau xác minh archive Windows, giữ đơn và bút toán |
| Mobile LAN | HTTPS, 4 vai trò, session/audit, polling gần 4 giây, ảnh chờ→Windows duyệt COPY→Nhập hàng |
| Vận hành/UI | Transaction/journal/hash/lock/recovery, backup/restore thử, tiến độ tác vụ, sáng/tối màu rõ/responsive/phiên bản |

LAN mặc định tắt sau mở lại ứng dụng. Mở **Mobile LAN** trên Windows để tạo HTTPS/tài khoản/bật kết nối, tải CA công khai tạm 10 phút và xem URL điện thoại. Safari cần cài và bật tin cậy đầy đủ cho CA, Windows phải chạy cùng Wi-Fi. Không mở cổng ra Internet. Chủ shop được thao tác kho tự tạo như kho thật; kiểm thử Codex/CI chỉ dữ liệu giả lập.

GitHub Pages mặc định mở **Cloud V7**; đăng nhập tài khoản shop để xem dữ liệu đã đồng bộ ngay cả khi laptop tắt. Demo cũ chỉ mở khi thêm `?demo=1`. Cloud cần Internet để ghi; chưa hỗ trợ bán offline, lợi nhuận ròng/chi phí/thuế, tự chỉnh tồn hoặc tích hợp ngân hàng/vận chuyển. Luồng Cloud không cần Wi-Fi chung hay chứng chỉ CA; hướng dẫn LAN bên trên chỉ dành cho module LAN cũ.

UI Checkpoint 6.1–6.6: panel chọn ảnh góc phải có thu gọn/mở rộng, nav gọn, phiếu PNG theo banner shop và cỡ Nhỏ/Vừa/Lớn trên toàn giao diện. Mặc định Vừa, lưu theo thiết bị; đổi trong Cài đặt giao diện hoặc menu ☰. [Checkpoint UI](UI_CHECKPOINT6_2026-10-11.md).

## Phục hồi và tài liệu nền local

Cài đặt → Backup đầy đủ → Phục hồi thử sang vùng mới → kiểm tra READY. Không thay DB/kho đang chạy. LAN keys/tài khoản không được coi là đã di chuyển bởi backup nghiệp vụ; bản cài mới thiết lập qua UI.

Đặc tả các chặng: [khách/PNG](STAGE2_CUSTOMERS_PNG.md), [thu tiền/hậu mãi](STAGE3_PAYMENTS_AFTERCARE.md), [báo cáo/kiểm kê](STAGE4_REPORTS_STOCKTAKE.md). Checkpoint V1/V2/Stage1–5 và launcher migration trong source là lịch sử/công cụ tương thích tùy chọn, không phải bước khởi chạy bản mới.

Lịch sử 23 migration V7 trong source đã khớp phiên bản thực tế trên Supabase; chỉ đổi tên file để khớp history, không chạy lại reset.
