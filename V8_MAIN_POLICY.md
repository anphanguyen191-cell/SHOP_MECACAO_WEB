# Shop Mẹ CaCao — Quy trình một main duy nhất
Ngày chốt: 2026-10-14

- **Nguồn chính thức:** nhánh `main` của `anphanguyen191-cell/SHOP_MECACAO_WEB`. Không duy trì nhánh phát triển hoặc release song song.
- **Bộ cài:** GitHub Actions tự động kiểm tra, đóng gói EXE và phát hành GitHub Release STABLE mỗi lần `main` được cập nhật và đạt tất cả gate. Release có tag `v8.0.<số run>-stable`.
- **Bản sửa lỗi:** cùng cơ chế với cập nhật tính năng. Người dùng chỉ có **một nút “Kiểm tra & cập nhật”** trong Cài đặt. Không có tính năng tự chẩn đoán/tự viết mã sửa lỗi.
- **Cài mới:** `D:\ShopMeCaCao` (app, runtime, phiên bản, dữ liệu, cache, cập nhật). Kho ảnh tại `D:\Me CaCao Store` hoặc thư mục khác trên D: do người dùng chọn ngay ở Import kho.
- **Một database máy chính:** `D:\ShopMeCaCao\data\shop-v8\database\shop-v8.db`. Các thư mục releases chỉ chứa mã thực thi, không chứa database thứ hai. Supabase là bản đồng bộ Cloud của cửa hàng, không phải database local thứ hai.
- **Không nhập dữ liệu test cũ:** cài V8 sạch. Kho ảnh hiện hữu không tự xóa. Không thao tác reset Cloud bằng cập nhật phần mềm.
- **Lưu ý vận hành:** CI Windows PASS chưa thay thế nghiệm thu thực tế trên laptop và iPhone; quy trình Cloud phải đồng nhất và không được gộp nhầm kho test.
- **An toàn cập nhật:** chỉ tải STABLE Releases sau SHA-256, chặn tác vụ đang chạy, kiểm tra database, rollback khi candidate lỗi. Snapshot phục hồi là dữ liệu tạm trong quá trình đổi phiên bản, không phải chuyển dữ liệu test.
- **Không tái tạo nhánh thử:** sửa source → kiểm thử → push `main` → GitHub phát hành → Windows bấm cập nhật.
