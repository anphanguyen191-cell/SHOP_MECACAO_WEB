# Báo cáo kiểm thử chặng 3 — 3.1.0-stage3

10/10/2026: kiểm thử hoàn toàn trên dữ liệu giả lập/thư mục tạm; không truy cập kho kinh doanh của chủ shop.

| Kiểm tra | Kết quả local |
|---|---|
| Typecheck + production build | PASS |
| Full regression gate | PASS, gồm chặng 1/2/3 và các lớp recovery/restore/tasks |
| Service chặng 3 | PASS 53 kiểm tra |
| HTTP bản main mới | PASS 56 kiểm tra, gồm chọn kho, tiền, công nợ, hậu mãi, PNG, nhập sau bán và restore |
| Hồi quy kho sau sửa reserved path | Core và warehouse được chạy lại; xem CI main để đối chiếu đúng bản |
| Browser / Windows | Do CI main chạy; xem [Actions](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/workflows/pages.yml) của commit 3.1.0-stage3 |

Browser mới kiểm tra ghi cọc 10.000 ở nháp có ship → bán → hậu mãi → Công nợ → reload/SOLD → backup/restore. Có screenshot panel thanh toán ở desktop/mobile sáng/tối. Test service kiểm tra sửa SQL chứng từ/SOLD/kết quả hậu mãi bị chặn, tab cũ không ghi được, retry không nhân chứng từ, tổng thu/hoàn/credit, tiền còn lại sau restore giống nguồn và revision PNG cũ bị từ chối.

CI của chặng 2 không được dùng thay cho mã chặng 3. Không suy ra nghiệm thu trên máy chủ shop, Ctrl+V vào ứng dụng nhắn tin thực tế hoặc STABLE chỉ từ CI. Phạm vi/giới hạn xem [STAGE3_PAYMENTS_AFTERCARE.md](STAGE3_PAYMENTS_AFTERCARE.md).
