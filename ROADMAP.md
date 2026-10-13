# Roadmap — V7.2.0

Trạng thái hiện tại tại [PROJECT_STATE](PROJECT_STATE.md); phạm vi sửa lỗi tại [AUDIT_FIXES](AUDIT_FIXES_2026-10-13.md).

| Phạm vi | Tiến độ |
|---|---|
| Kho ảnh, nhập/scan/import, nháp/SOLD, khách/phiếu, thu/cọc/hoàn/giảm/công nợ, giao hàng | Tích hợp main |
| Backup/recovery/restore, cập nhật Windows giữ dữ liệu và phục hồi khi lỗi | Tích hợp main |
| Báo cáo/CSV, kiểm kê không tự chỉnh tồn, giữ archive SOLD | Tích hợp main |
| LAN HTTPS, quyền, tài khoản, cập nhật hai thiết bị, ảnh iPhone chờ duyệt | Tích hợp main; chờ thiết bị shop thật |
| Cloud ngoài LAN, Storage riêng tư, snapshot/realtime, sổ đối soát, đồng bộ Windows | Tích hợp main; cần laptop owner mở để kiểm nguồn/archive |
| Mobile, bảo vệ nội dung đang nhập, phiếu chung, gia hạn ảnh và chứng từ SOLD | Đợt tối ưu V7.2.0 |
| Nghiệm thu laptop/iPhone của shop | Chưa thể thay thế bằng CI |
| Offline queue và snapshot incremental | Chưa triển khai |
| Ngân hàng/vận chuyển tự động, chi phí/thuế, nhập trả tự động, xóa archive Windows | Ngoài phạm vi hiện tại |

Ưu tiên tiếp theo: nghiệm thu thiết bị thật và dữ liệu shop; đo tải với quy mô kho thực trước khi thiết kế incremental/offline. Không coi CI PASS là STABLE. Không tự chỉnh tồn để khớp sổ và không tự xóa lịch sử.
