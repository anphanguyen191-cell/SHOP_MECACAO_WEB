# Roadmap hiện tại — Shop Mẹ CaCao Web

Dùng cùng [checkpoint main hiện tại](MAIN_CHECKPOINT_STAGE4_2026-10-10.md) và [nguyên tắc](DEVELOPMENT_PRINCIPLES.md). Mốc mã đã kiểm chứng: `099386a`, runtime baseline **3.0.1-stage2**; hiện đã triển khai bản **3.2.0-stage4**; [CI 38042560022](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/runs/38042560022) SUCCESS trên Linux/Windows 22/24/browser/deploy.

| Chặng / Nhóm | Nội dung | Trạng thái |
|---|---|---|
| Nền tảng | LOCAL + giao diện web, SQLite, GitHub CI/DEMO | Đã tích hợp main |
| Chặng 1 | Kho theo ảnh, nhập/scan/import/rename, chia sẻ, nháp/bán/lịch sử, backup/restore, tiến độ tác vụ | Đã tích hợp main; CI PASS |
| Chặng 2 | Khách hàng, giao hàng snapshot, phí ship, tổng thanh toán, PNG từ nháp/SOLD | Đã tích hợp main; CI PASS |
| Tối ưu hiện tại | Contrast sáng/tối, launcher main, chọn kho trên UI/tự restart, phiên bản/tiến độ | Đã tích hợp main; CI PASS |
| Chặng 3 | Thu tiền, COD/chuyển khoản, đã thu/còn lại, công nợ và hậu mãi | Đã triển khai thu/cọc/hoàn/điều chỉnh, giao hàng/vận đơn, Công nợ và hậu mãi theo yêu cầu mới; CI theo commit 3.1.0-stage3 |
| Chặng 4 — Báo cáo / Kiểm kê | Doanh số, thu/hoàn/giảm trong kỳ, lãi gộp snapshot/thiếu vốn, công nợ hiện tại, CSV và phiên kiểm kê | Đã triển khai 3.2.0-stage4; kiểm kê không tự chỉnh tồn ảnh; lợi nhuận ròng/chi phí còn backlog |
| Mobile LAN | Điện thoại truy cập dữ liệu LOCAL trong mạng nội bộ | Backlog; responsive/PWA shell hiện có không tương đương LAN |
| Đồng bộ / Cloud | Đồng bộ local-first, nhiều thiết bị, dùng từ xa | Backlog |

Các nhãn lịch sử V1/V2 là lớp kho/bán; V3 là khách/PNG, nay đã có trong runtime 3.0.1-stage2/chặng 2. Không coi “V3 BACKLOG” trong tài liệu cũ là trạng thái hiện tại. Không tự đánh đồng số chặng với schema DB hoặc metadata package.json. Chủ shop chưa nghiệm thu bản 3.1.0-stage3 trên máy của mình; trạng thái CI PASS không đổi thành STABLE tự động.

## Trình tự cho chặng tiếp

1. Đề xuất phạm vi nghiệp vụ/UI và tình huống cần giải quyết; xác định dữ liệu, trạng thái và công thức tiền.
2. Chủ shop duyệt phần mới. Nếu phần đã được duyệt trong phiên làm việc thì tiếp tục trong phạm vi, không hỏi lại.
3. Làm DB → service → API → UI → các module liên quan và cơ chế recovery/backup cùng nhau.
4. Kiểm thử trên fixture, chạy các gate phù hợp và CI Windows/Linux/browser của mã mới; ghi rõ giới hạn kiểm chứng.
5. Tích hợp bản đầy đủ lên main; cập nhật PROJECT_STATE, checkpoint, CHANGELOG, đặc tả và test report nhất quán.
6. Chủ shop nghiệm thu bản cài mới. Lỗi chặn được xử lý trước khi mở rộng sang phần liên quan; không suy ra nghiệm thu từ CI.

Trong giai đoạn phát triển, dữ liệu thử cũ không phải điều kiện bắt đầu chặng mới. Mỗi bản cài mới có DB mới; import qua UI nếu cần; không xóa/ghi đè dữ liệu cũ. Các công cụ chuyển V1→V2 là tương thích tùy chọn, không phải bước khởi chạy chính.

Chi tiết chặng 3: [STAGE3_PAYMENTS_AFTERCARE.md](STAGE3_PAYMENTS_AFTERCARE.md), [STAGE3_TEST_REPORT.md](STAGE3_TEST_REPORT.md). Bù trừ đổi hàng/nhập trả tự động, ngân hàng/đơn vị vận chuyển tự động vẫn backlog.

Chặng4 đã được chủ shop duyệt: [đặc tả](STAGE4_REPORTS_STOCKTAKE.md). Baseline chặng3 2a90a29, CI38045120776 PASS cả Windows22/24/Linux/browser. Chưa nghiệm thu bản mới trên máy chủ shop.
