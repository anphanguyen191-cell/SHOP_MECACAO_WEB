# Kiểm thử chặng 4 — 3.2.0-stage4

Ngày 10/10/2026. Chỉ dùng ảnh giả lập, DB và thư mục tạm; không truy cập kho thật shop.

| Kiểm tra | Kết quả |
|---|---|
| Typecheck / build | PASS |
| Full `npm run test:gate` | PASS: schema/core/performance/warehouse/share, sales/recovery/restore/tasks, chặng2/3/4, build và31 source UI assertions |
| `npm run test:stage4` | PASS78: ngày VN và ranh giới SQL, BigInt lớn, SOLD snapshot, tiền cọc khác doanh số, thiếu vốn, công nợ hiện tại, CSV injection/Unicode, count/stale/retry/immutability, không chỉnh tồn, restart/restore |
| `node scripts/stage2-e2e.mjs` | PASS77 HTTP: fresh main, chọn kho UI, nhập/rename/bán/PNG/finance/hậu mãi, báo cáo/CSV, kiểm kê/lưu/chốt/tab cũ/origin, full backup/restore số bảng mới |
| Windows22/24 và Chromium | CI main chạy trên mã mới; xem [Actions](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/workflows/pages.yml) |

Browser acceptance bổ sung thao tác **Báo cáo → Kiểm kê → tạo phiên → số đếm lệch + lý do → lưu → kết luận → chốt → tồn ảnh vẫn0 → mở lại**, chụp1366/390px sáng/tối; giữ hồi quy cọc/aftercare/debts/PNG/SOLD/backuprestore. Browser chạy trong CI, không dùng kho thật. CI PASS không phải nghiệm thu trên máy Windows của chủ shop, chưa đánh dấu STABLE.

Giới hạn: kiểm kê không tự sửa file/tồn, ảnh bị thay đổi khi đếm cần hủy/làm lại. Lãi gộp chưa bao gồm chi phí/ship/giảm trừ hậu mãi; thiếu vốn phải bổ sung từ dữ liệu nghiệp vụ mới, không sửa snapshot bán cũ. Công nợ hiện tại toàn bộ SOLD không phải số dư cuối kỳ.
