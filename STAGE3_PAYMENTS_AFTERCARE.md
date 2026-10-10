# Chặng 3 — Thu tiền, công nợ, giao hàng và hậu mãi

Bản main **3.1.0-stage3** kế thừa toàn bộ chức năng chặng 1 và 2. Chủ shop đã yêu cầu triển khai chặng tiếp ngày 10/10/2026. Bản cài mới dùng dữ liệu phát triển mới, không yêu cầu chuyển DB của bản thử trước. `START_SHOP.bat` vẫn là launcher duy nhất cần dùng.

## Luồng sử dụng

1. Tạo/mở đơn nháp, chọn khách và hàng, lưu giá/giảm giá/ship như chặng 2.
2. Trong **Thanh toán & giao hàng**, chọn hình thức dự kiến COD/chuyển khoản/tiền mặt. Nháp chỉ có trạng thái Chưa giao; có thể ghi tiền cọc.
3. **Ghi chứng từ**: chọn thu tiền/hoàn tiền, số đồng nguyên dương, hình thức thực tế và nội dung. Ghi nhiều lần được; số đã thu/còn lại cập nhật từ chứng từ đã lưu.
4. Xác nhận bán theo quy trình hiện có. SOLD chỉ xác nhận bán, chưa tự đánh dấu đã giao hoặc đã thu. Sau bán có thể lưu Đang giao/Đã giao/Giao thất bại và mã vận đơn.
5. Khi cần hỗ trợ giảm tiền sau bán, ghi **Điều chỉnh giảm** kèm nội dung. Chứng từ này giảm giá trị phải thanh toán; nếu khách trả nhiều hơn giá trị mới, app hiển thị **Cần hoàn khách**. Chỉ ghi hoàn tiền khi đã thực hiện hoàn; app không chuyển tiền ngân hàng.
6. **Hậu mãi**: tạo yêu cầu trả/đổi/hỗ trợ, ghi kết quả rồi hoàn tất. Giữ nguyên nội dung yêu cầu và kết quả sau khi đóng. Khoản giảm/hoàn ghi trong sổ thanh toán cùng đơn và có nội dung giải thích.
7. Hàng thực nhận lại cần chụp ảnh mới, duyệt qua **Nhập hàng**; hàng đổi xuất bằng đơn mới. Phiếu hậu mãi không tự tăng tồn hoặc mở lại ảnh SOLD. Ảnh gốc đã bán không được tự dùng lại như hàng mới.
8. **Công nợ** tổng hợp đơn đã bán còn phải thu/cần hoàn, theo khách; tìm khách/điện thoại/mã đơn và mở lại đơn để ghi chứng từ. Tiền cọc nháp được xem trong đơn, không cộng vào công nợ đã bán.
9. Tạo lại **PNG** sau khi ghi tiền. Phiếu có COD/chuyển khoản/tiền mặt, điều chỉnh hậu mãi, giá trị sau điều chỉnh, đã thu sau hoàn, còn phải thu và cần hoàn khách. PNG dùng số đã lưu, không dùng nội dung nhập chưa ghi.

## Công thức và trạng thái

- Giữ `total = subtotal - discount` và `payableTotal = total + shippingFee` của chặng 2.
- `adjustedTotal = payableTotal - tổng điều chỉnh giảm`.
- `netCollected = tổng thu - tổng hoàn`.
- `due = max(0, adjustedTotal - netCollected)`.
- `refundDue = max(0, netCollected - adjustedTotal)`.
- Không thu vượt due; không hoàn vượt netCollected; không điều chỉnh giảm vượt adjustedTotal. Số tiền phải nguyên, dương, trong giới hạn số nguyên an toàn; tổng dùng BigInt để kiểm tra trước khi chuyển về number.
- Nháp có tiền cọc không được hủy khi shop còn giữ tiền. Hoàn cọc trước khi hủy. Không sửa nháp làm giá trị mới nhỏ hơn tiền đang giữ; hoàn phần cần thiết trước rồi sửa.
- Bán, giao và thu tiền là ba trạng thái riêng. Không dùng thay đổi trạng thái giao để tự ghi thanh toán hoặc tự đổi tồn.

## Kiến trúc và bảo vệ

| Thành phần | Vai trò |
|---|---|
| `orderFinance.ts` | Bootstrap bảng, tính số dư, cấu hình, thu/hoàn/giảm, công nợ, hậu mãi, validation và giao dịch SQLite |
| `order_finance` | Revision tài chính riêng với version đơn, hình thức dự kiến, giao hàng, vận đơn |
| `finance_entries` | Chứng từ thu/hoàn/giảm bất biến, sequence theo đơn, request key, payload/hash, tiền/hình thức/nội dung |
| `aftercare_cases` | Yêu cầu hậu mãi theo đơn, version, kết quả xử lý; request/terminal history có trigger chống sửa/xóa |
| `OrderFinance.tsx` | Panel tiền/giao/hậu mãi, lịch sử, pending request bền vững trong trình duyệt, Công nợ theo khách/đơn |
| `orderSlip.ts`, `OrderSlip.tsx` | PNG thêm các dòng thanh toán, kiểm tra revision tài chính trước/sau dựng ảnh |
| `salesBackup.ts` | Validate chứng từ/hash, copy đầy đủ các bảng và công bố counts sau restore |
| `goodsReceipt.ts` | Giữ tên/đường dẫn của mọi ảnh đăng ký để tránh tái sử dụng canonical của bộ đã bán |

API dưới `/api/sales/drafts`: `GET /finance/debts`, `GET/PUT /:id/finance`, `POST /:id/finance/entries`, `POST /:id/aftercare`, `PUT /:id/aftercare/:caseId`. Giữ giới hạn loopback/origin, khóa task/sale và transaction hiện có.

Mọi ghi tiền kiểm tra revision đơn + revision tài chính trong `BEGIN IMMEDIATE`; key/payload trùng trả chứng từ cũ, key với payload khác bị chặn. Pending intent được lưu trước gửi; lỗi mạng/reload không tự tạo chứng từ mới, có nút tiếp tục cùng key. Nếu server trả lỗi 4xx chắc chắn không nhận giao dịch, intent được giải phóng để sửa. Chứng từ không có thao tác sửa/xóa; kết quả hậu mãi đã đóng không ghi đè. SOLD/contact/SALE ledger vẫn bất biến.

Schema nghiệp vụ giữ 130; các bảng chặng 3 được bootstrap idempotent cùng service nháp. Bản main mới dùng `data/stage3/database/shop-stage3.db`; kho/cấu hình phát triển riêng trong `data/stage3/`. Không mở `data/stage2/` tự động, không viết migration dữ liệu thử cũ. Restore mang nguyên sổ tiền và hậu mãi theo DB, không tự kích hoạt kho phục hồi thành kho đang chạy.

## Kiểm thử và phạm vi

- `npm run test:stage3`: 53 kiểm tra tiền cọc/thu nhiều lần/hoàn/giảm, công nợ, version/tab cũ, replay, chứng từ/SOLD/hậu mãi bất biến, PNG revision, restart và full restore.
- `scripts/stage2-e2e.mjs`: mở bản main mới trong thư mục tạm; 56 kiểm tra HTTP, gồm thu tiền/replay/stale request, công nợ, hậu mãi, PNG tiền, đường dẫn ảnh SOLD không được tái sử dụng khi nhập hoặc đổi tên, backup/restore các bảng mới. Tên script giữ để chạy hồi quy chặng 2 cùng chặng 3.
- Full gate gồm chặng 3; CI Windows Node 22/24 + Linux. Chromium chạy luồng ghi cọc/nháp/bán/hậu mãi/công nợ/restore và screenshot panel tài chính 1366/390px sáng/tối.
- Kết quả CI của đúng commit: [Actions main](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/workflows/pages.yml). Chỉ ghi PASS khi job đó hoàn thành; chủ shop nghiệm thu Windows tách riêng.

Chưa có đối soát tự động ngân hàng/hãng vận chuyển, chuyển khoản tự động, nhập lại hàng trả tự động, bù trừ tự động giữa các đơn đổi hàng, báo cáo tài chính đầy đủ, kiểm kê, LAN/cloud hoặc xóa gốc đã bán. Hậu mãi hiện có luồng ghi yêu cầu/kết quả và tiền, phối hợp nhập hàng/đơn mới có duyệt. Không coi những backlog này là chức năng đã triển khai.
