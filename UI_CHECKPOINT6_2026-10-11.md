# UI Checkpoint 6.1–6.6 — 3.5.0-stage6-main-test

Spec chủ shop ngày 11/10/2026. Baseline main 501752df (3.4.0). UI checkpoint này khác phần Stage6 LAN đã có. Mọi kiểm thử tự động dùng SQLite/ảnh/kho tạm giả lập.

| Mục | Thực hiện |
|---|---|
| 6.1 | Tên sản phẩm/Size xuống dòng, min-width đúng, gallery theo cỡ; panel đo chiều cao, chừa phần cuối danh sách |
| 6.2 | Floating panel phải dưới, chừa nav/safe area; bo tròn; thu gọn/mở rộng; số ảnh/bộ, nhóm Product/Size; tạo đơn, chia sẻ/COPY, bỏ chọn; giữ luồng request idempotency và lựa chọn qua lỗi/lọc |
| 6.3 | Nav tối đa 4 mục: tổng quan, tồn, bán hoặc kiểm kê theo quyền, Thêm; menu giữ đầy đủ chức năng; màu sáng/tối rõ |
| 6.4 | Banner JPG shop được nhúng trong PNG, tiêu đề thương hiệu và tổng tiền nổi bật; phân trang/khách/ship/finance/version/hash/SOLD giữ nguyên; asset đi cùng API build |
| 6.5 | Nhỏ/Vừa/Lớn, default Vừa; lưu mecacao-ui-display-size tại localStorage của thiết bị/trình duyệt; không sync account; mọi vai trò đổi được trong drawer |
| 6.6 | Safe area iPhone trái/phải/dưới, dock được đo thực tế, panel không đè dock; mobile form chữ ≥16px để hạn chế autozoom, vùng chạm ≥44px; light/dark và desktop |

Phạm vi: Dashboard, danh mục, nhập hàng, import kho, tồn, khách, bán hàng, nợ, báo cáo, kiểm kê, SOLD, iPhone inbox, Cài đặt và Mobile LAN. Dùng token cỡ chữ/khoảng cách/control/card/table/thumbnail/popup/nav, không scale viewport. Nhỏ vẫn đủ vùng chạm; Lớn hiển thị ít hơn. Preference cũ compact-mode không quyết định default của bản mới.

Kiểm chứng: full local gate PASS; Stage2 27 checks bao gồm pixel banner chính xác, PNG nhiều trang, version guards, SOLD và restore; PNG giả lập đã render/đối chiếu. Linux CI mở rộng mobile browser ba cỡ trên 320/390/768/1366, sáu fixture modules tại 1366/1920 và toàn bộ menu main tại 390/1366 sáng/tối; kiểm selection/clipboard/panel/nav/persistence và viewer preference không nâng quyền. Windows Node22/24 chạy gate + HTTP/PNG/launcher. Xem Actions đúng commit bản 3.5 trước tải.

Chưa nghiệm thu Safari/iPhone vật lý hoặc Windows của shop. CI Chrome mobile emulation không chứng minh trust CA/safe area/keyboard/Web Share trên iPhone thật. Tải main.zip, giải nén thư mục mới, START_SHOP.bat; chọn kho qua UI/import khi cần. Bản cài mới DB mới, không tự xóa hay nối DB test cũ. Mở lại cùng bản vẫn giữ dữ liệu. Không có Stage5B/5C, cloud hoặc offline writes.
