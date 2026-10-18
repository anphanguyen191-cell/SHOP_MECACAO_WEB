# CaCao Customer Catalog V1 — bàn giao triển khai

Ngày: 18/10/2026. Chủ Shop đã cho phép làm rõ và triển khai. Baseline: main `3633f6e7655760782041db05e0c089ee3d568fef`.

## Chức năng đã triển khai

- Entry khách `?catalog=1`, bundle/CSS riêng; entry Admin được chuyển nguyên sang `AdminRuntime.tsx`. Giữ `?cloud=1`, demo, Windows startup/auth và PWA Admin.
- Danh mục phân trang, tìm tên/mã, lọc Size/còn hàng và sắp giá toàn tập ở backend. Chỉ Product chủ Shop bật mới có dữ liệu công khai.
- Chi tiết Product, tồn mỗi Size, chọn số lượng nhanh và ID ảnh thật trong cùng giỏ; giới hạn 100 bộ; lưu giỏ trên thiết bị.
- Bảng Size 12 dòng, tra cân nặng/chiều cao không nội suy; modal focus/Escape; không gửi số đo backend.
- Kiểm tra lại tồn/giá, form khách tối giản, mã yêu cầu, token bí mật chống gửi trùng và phục hồi khi mất phản hồi.
- Hộp yêu cầu owner trên Cloud Admin và Windows; tự đọc lại mỗi 30 giây khi đang mở. Chọn đủ ảnh cho số lượng nhanh; giữ ảnh khách chỉ định; kiểm tra giá trước chuyển nháp.
- Một inquiry tối đa một nháp; tạo bằng CORE RPC trong cùng transaction. Trùng ảnh trong nháp khác dùng cảnh báo CORE hiện có. Không có SOLD shortcut.
- Owner bật/tắt từng Product, bật/tắt Catalog, preview/publish banner + bảng Size và liên hệ. Zalo/Messenger chỉ mở link chính thức owner nhập; sao chép nội dung làm fallback.
- Backend giới hạn input, chống spam bằng rate limit bền vững, RLS mặc định từ chối đọc bảng mới. Ảnh qua proxy kiểm tra quyền, no-store; không mở bucket và không cấp signed URL dài hạn cho khách.

## Trạng thái Cloud khi bàn giao

Migration bổ sung `customer_catalog_v1` và Edge Function `customer-catalog` đã triển khai. CORE và kho ảnh gốc không reset; dữ liệu test giao dịch đã rollback. Catalog mặc định OFF, 0 Product bật công khai, 0 inquiry/đơn test còn lại.

Trang khách: https://anphanguyen191-cell.github.io/SHOP_MECACAO_WEB/?catalog=1
Admin: https://anphanguyen191-cell.github.io/SHOP_MECACAO_WEB/?cloud=1

## Bằng chứng kiểm thử

- Baseline build/typecheck PASS trước sửa.
- Build/typecheck bản mới PASS.
- `npm run test:gate` PASS; `npm run test:cloud` PASS, gồm watch folder, hoàn trả, định giá tồn, nhập giá, khách, phiếu chốt, đồng bộ/SOLD.
- `npm run test:catalog`: PostgreSQL WASM chạy migration thật, giỏ/Size boundaries, default OFF/hidden, quyền owner, điều kiện ảnh tồn, unknown price, thay đổi tồn/giá, idempotency, phân bổ và bridge payload.
- `CHROME_BIN=... npm run test:catalog:browser`: Chromium 360/375/390/430/768/1024 không tràn ngang; bảng Size/Escape; 2 ảnh+3 bộ=5; chặn vượt tồn; kiểm tra giỏ; mất response sau ghi vẫn chỉ một inquiry; guest không gọi Auth/bảng Admin.
- `scripts/customer-catalog-production-rollback.sql`: kiểm chứng bằng CORE Cloud thật trên fixture trong một transaction ROLLBACK: 5 ảnh, inquiry retry, tạo một nháp, retry trả cùng order, tồn vẫn 5, không SOLD. Không chạy script này như migration.
- HTTP anonymous thực tế: config đọc được OFF; products/image bị chặn khi OFF; bảng inquiry/products và RPC admin/service không truy cập được bằng publishable key không phiên đăng nhập.
- Advisor: không có cảnh báo public SECURITY DEFINER mới cho authenticated. Các bảng Catalog có RLS/no policy là chủ đích deny-by-default; chỉ dispatcher giới hạn được cấp quyền. Các cảnh báo handoff/password protection có sẵn thuộc baseline, không sửa ngoài phạm vi. Tham khảo: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Cách chủ Shop mở Catalog

1. Cập nhật bản Windows hoặc mở Admin Cloud mới; đăng nhập tài khoản owner.
2. Vào **Catalog khách hàng → Banner & cấu hình**. Banner Mobile, ảnh bảng Size và dữ liệu tra 12 dòng đã cài sẵn, có xem trước ngay. Không cần nhập URL. Đổi ảnh riêng hoặc thêm link Zalo/Messenger chính thức trong phần tùy chọn nâng cao nếu muốn; hộp yêu cầu Admin hoạt động độc lập.
3. Vào **Công khai sản phẩm**, bật những Product muốn khách xem. Product chưa bật vẫn ẩn.
4. Bật **Mở website Catalog cho khách** rồi lưu/publish cấu hình. Mở link khách để nghiệm thu trên iPhone trước khi chia sẻ.
5. Xử lý yêu cầu trong hộp; phân bổ ảnh, chuyển nháp CORE; kiểm tra thông tin giao hàng/liên hệ trong đơn trước khi bán.

## Giới hạn và điều kiện nghiệm thu còn lại

- Laptop offline: dữ liệu khách là Cloud gần nhất; thời gian kiểm tra nguồn cũ hơn 15 phút hoặc chưa có sẽ hiện cảnh báo. Gửi chỉ là yêu cầu tư vấn, không giữ hàng hoặc cam kết tồn vật lý.
- Không đăng nhập khách, không thanh toán, không tự gửi tin Zalo/Messenger. Chỉ CORE xác nhận bán trừ tồn.
- Banner Mobile và ảnh bảng Size đóng gói sẵn cùng ứng dụng. Số hỗ trợ 0949 656 477 lấy từ banner Shop hiện có; không đưa thông tin ngân hàng ra Catalog. Chưa xác minh tài khoản Zalo/Messenger nên không tự tạo link hai kênh này. Chủ Shop cần kiểm tra hình ảnh trên iPhone trước khi mở công khai.
- Ảnh đã tải xuống/screenshot trên thiết bị khách không thu hồi được khi Shop ẩn Product.
- Thông tin liên hệ inquiry bị ẩn sau 90 ngày; dọn vật lý khi submit/lookup xử lý. Chứng từ CORE đã tạo theo chính sách lưu CORE riêng. Owner có nút xóa liên hệ inquiry sớm.
- CI, GitHub Pages và release theo commit phải được xem ở Actions; không đồng nghĩa nghiệm thu iPhone/Windows thật. Chỉ chủ Shop xác nhận mới nghiệm thu Catalog STABLE.

## Cập nhật cấu hình sẵn — 18/10/2026

- Banner Mobile riêng và ảnh bảng Size SVG kèm ứng dụng; khi Cloud chưa có URL, tự dùng bộ mặc định. Giữ cấu hình riêng hợp lệ của chủ Shop.
- Màn hình cấu hình có xem trước ảnh, bảng Size 12 dòng và nút lưu; các URL/JSON chuyển vào tùy chọn nâng cao.
- Không tự mở Catalog hoặc bật Product. Không yêu cầu Zalo/Messenger để tiếp nhận vào hộp Admin.
- Kiểm thử bổ sung: fallback từ cấu hình trống, giữ cấu hình riêng, lưu preset/version, URL mặc định thu gọn; Chromium tải đúng asset đóng gói và kiểm tra sáu kích thước.

## Đối chiếu giao diện khách

Xem `REFERENCE_REVIEW_V1.md` cho 10 màn hình, thay đổi luồng giỏ/liên hệ, bộ kiểm tra và các điểm khác ảnh minh họa.
