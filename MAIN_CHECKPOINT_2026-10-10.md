> Checkpoint chặng2 lịch sử. Trạng thái hiện tại: [main chặng4](MAIN_CHECKPOINT_STAGE4_2026-10-10.md).

> Checkpoint dưới đây lưu baseline chặng 2. Bản mới 3.1.0-stage3 đã triển khai theo yêu cầu tiếp của chủ shop; trạng thái hiện tại đọc PROJECT_STATE.md và STAGE3_PAYMENTS_AFTERCARE.md. Các dòng “chặng 3 chưa triển khai” bên dưới chỉ đúng tại baseline 099386a.

# Nền tảng main — Shop Mẹ CaCao Web — 10/10/2026

Bản hiện tại: **3.0.1-stage2**. Chặng 1 và chặng 2 đã được tích hợp trên `main`, gồm source, UI, API, launcher, kiểm thử và tài liệu. Đây là bản phát triển đầy đủ chức năng đã triển khai đến hiện tại; chặng 3 trở đi chưa được coi là hoàn thành.

| Mốc | Bằng chứng |
|---|---|
| Mã chạy đã kiểm chứng | [`099386ad48cef9babb525eb2d43e63fe22099449`](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/commit/099386ad48cef9babb525eb2d43e63fe22099449) |
| CI của mã chạy | [Actions 38042560022](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/runs/38042560022): Linux, Windows Node 22, Windows Node 24 và deploy đều SUCCESS |
| Bản Windows | [Tải main mới nhất](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/archive/refs/heads/main.zip); giải nén vào thư mục mới, chạy `START_SHOP.bat` |
| Bản chính xác đã kiểm chứng | [ZIP của commit 099386a](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/archive/099386ad48cef9babb525eb2d43e63fe22099449.zip) |
| Nghiệm thu trên máy chủ shop | Chưa có xác nhận cho bản 3.0.1-stage2; CI Windows không thay thế nghiệm thu này |

Các cập nhật tài liệu sau commit trên không tự thay phiên bản runtime. Khi mã chạy thay đổi, phải cập nhật baseline và bằng chứng mới. Phiên bản hiển thị lấy từ `freshDevelopment.ts`; các version 0.1.x trong workspace package.json hiện là metadata gói, không phải số bản phát hành cho chủ shop.

## Chức năng hiện có

Tất cả nhóm sau có trong mã main. Các giới hạn vận hành và kiểm thử được ghi riêng bên dưới.

| Nhóm | Chức năng đã triển khai | Quy tắc và giới hạn |
|---|---|---|
| Khởi chạy Windows | Một launcher chính; lần đầu cài thư viện/build; tự mở trình duyệt; kiểm tra health; khóa server trùng | Node.js 22.13+ hoặc 24; giữ cửa sổ chạy ứng dụng; `START_SHOP_CHANG_2.bat` gọi cùng launcher |
| Chọn kho | Chọn thư mục kho trên giao diện; lưu cấu hình; tự restart; hoặc dùng kho mặc định | Chọn trước khi có sản phẩm/đơn/khách/giao dịch; không tự đổi kho đã có dữ liệu; kho chọn dùng trực tiếp |
| Tổng quan | Dashboard tồn theo ảnh, mẫu, Size/SKU, hết hàng, lệch sổ; sản phẩm tồn nhiều; biểu đồ tồn và thao tác nhanh | Có thể thu gọn; dữ liệu DEMO được đánh dấu minh họa |
| Danh mục sản phẩm | Thêm mẫu; mã Product/SKU gợi ý; Size, giá nhập/giá bán; tìm kiếm/gợi ý, lọc/sắp xếp; xem chi tiết; ngưng/kích hoạt sản phẩm | Danh mục và tồn kho có vai trò riêng; Product/Size/SKU liên kết với ảnh đăng ký |
| Nhập hàng | Mẫu hoàn toàn mới; Size mới của mẫu có sẵn; bổ sung Size có sẵn; chọn thư mục nguồn, kiểm tra ảnh/số lượng/giá, COPY vào kho | Không MOVE hoặc sửa ảnh nguồn; có kiểm tra trùng nội dung, journal và phục hồi gián đoạn |
| Quét / Import kho | Duyệt thư mục Mẫu → Size → ảnh; xem trước ảnh; nhận diện đã đăng ký/chờ duyệt/thiếu; áp giá; duyệt lô và đăng ký hàng loạt | Quét không tự ghi nhập; ảnh đã đăng ký không cộng trùng; lỗi dừng lô, kết quả từng mẫu được giữ |
| Theo dõi kho | Cấu hình quét khi mở/định kỳ, thông báo thay đổi, xem và đánh dấu thông báo | Chỉ quét khi được bật; không tự duyệt nhập hoặc bán |
| Đổi tên ảnh | Xem trước kế hoạch đổi tên; duyệt các ảnh; kiểm tra file/hash; nhật ký và recovery | Thao tác trong kho đã cấu hình; không đổi ảnh nguồn nhập ngoài kho hoặc ảnh đã bán |
| Tồn kho | Cây Mẫu → Size → ảnh; tìm/gợi ý, lọc; số tồn thực tế, ledger và lệch đối soát; chọn nhiều ảnh, xem lớn/chuyển ảnh | Một ảnh canonical đăng ký còn hiện hữu = một bộ còn tồn; chọn ảnh chưa giữ hoặc trừ hàng |
| Sổ đối soát | Ghi sổ nhập, cộng/trừ đối soát; giá theo Size; lịch sử giao dịch | Ghi ledger không tạo/xóa ảnh và không tự thay số tồn vật lý |
| Gửi ảnh khách | Windows native clipboard CF_HDROP bằng cầu nối C#; nhóm ảnh còn tồn; JPEG chia sẻ và Web Share nếu thiết bị hỗ trợ | Chủ shop tự Ctrl+V/gửi và kiểm tra người nhận; không tự gửi; chưa chứng minh tương thích mọi phiên bản Zalo/Messenger |
| Khách hàng | Thêm/tìm/sửa tên, điện thoại, địa chỉ, ghi chú; chuẩn hóa số điện thoại +84/0; cảnh báo trùng, lựa chọn dùng khách cũ hoặc tạo riêng | Kiểm tra version khi sửa; không âm thầm gộp khách |
| Đơn nháp | Chọn ảnh tồn để tạo nháp hoặc thêm vào nháp; mở/sửa/lưu/hủy; giá từng bộ, giảm giá, ghi chú; danh sách lọc theo trạng thái | Nháp không giữ hàng/trừ tồn; cùng bộ trong nháp khác phải có cảnh báo và lựa chọn; chống tạo trùng khi retry |
| Giao hàng / Ship | Chọn khách; snapshot người nhận, điện thoại, địa chỉ; chỉnh thông tin riêng theo đơn; phí ship hoặc miễn ship; tổng thanh toán | Sửa khách không tự sửa snapshot đơn; thêm ảnh giữ contact đã lưu; ship không âm và tổng không overflow |
| Kiểm tra trước bán | Kiểm tra cả đơn, ảnh tồn/hash, version, giá 0, giá vốn chưa biết, ảnh liên quan nháp khác; xem trước ảnh nhẹ | Báo cáo cũ mất hiệu lực khi thay đổi đơn; cần duyệt trước khi xác nhận bán |
| Xác nhận bán | Giao dịch toàn đơn; chống bán cùng bộ hai lần; request key, kiểm tra version/token; ledger SALE, bằng chứng bất biến và phục hồi gián đoạn | SOLD khóa sửa; ảnh gốc đã bán được giữ trong vùng nội bộ; SOLD không có nghĩa đã thu tiền |
| Lịch sử bán | Mở đơn SOLD, thông tin hàng/giá đã chốt, xem ảnh nhẹ đã lưu và bằng chứng giao dịch | Dùng snapshot và archive, không phụ thuộc danh mục/ảnh tồn hiện tại để dựng lại lịch sử |
| Phiếu chốt PNG | Thương hiệu Shop Mẹ CaCao / Since 2023; ảnh, mẫu, Size, giá, khách/giao hàng, giảm giá/ship/tổng; xem trước/tải/tạo lại | Từ đơn đã lưu; rộng 1080px, tối đa 8 bộ/trang; tổng toàn đơn ở trang cuối; nháp có thể sửa rồi xuất lại; SOLD xuất được nhưng không sửa |
| Cài đặt / Backup | Ngưỡng tồn thấp; backup SQLite; backup ảnh nén; backup đầy đủ DB + ảnh gốc + bằng chứng bán, kiểm tra SHA/integrity | SQLite riêng không gồm ảnh; ảnh nén không thay thế full backup |
| Phục hồi thử | Restore full backup vào vùng mới; remap đường dẫn; kiểm tra rows/IDs/hash/integrity trước READY; giữ nguồn đang dùng | Không âm thầm thay DB/kho đang hoạt động; đã kiểm thử layout mặc định và DIRECT |
| Tiến độ tác vụ | Worker riêng, SSE/polling; quét, nhập hàng, duyệt đăng ký lô, backup đầy đủ; lịch sử 30 tác vụ; nối lại sau reload | Cùng key/payload trả tác vụ cũ; task bị gián đoạn cần đối soát; chưa có hủy cưỡng bức |
| Giao diện | Menu chức năng, logo; Gọn/Thoải mái; sáng/tối; dashboard thu gọn; loading/rỗng/lỗi; khối xanh/cam/tím, chữ/viền tăng tương phản; desktop/mobile | Responsive/PWA shell không có nghĩa đã mở LAN hoặc đồng bộ kho lên điện thoại |
| Phiên bản / Tiến độ chặng | Hiển thị 3.0.1-stage2, MAIN, nội dung chặng 2 và chặng 3 chưa triển khai; kho đang dùng | Không hiển thị phần trăm hoàn thành giả |

## Những nguyên tắc phải giữ khi phát triển tiếp

1. Kế thừa đầy đủ chức năng và mã đã hoàn thành. Mỗi bản cài phát triển mới có DB mới, không bắt migration dữ liệu thử của bản trước. Restart cùng bản giữ dữ liệu; không tự reset, xóa kho hoặc ghi đè bản cũ.
2. Chỉ kiểm thử bằng dữ liệu giả lập/thư mục tạm. Kho trên máy chủ shop do chủ shop tự chọn để nghiệm thu; không giả định đã truy cập hoặc xác nhận kho thật.
3. Nhập ảnh từ nguồn khác bằng COPY. Kho chọn trực tiếp là đích ứng dụng thao tác khi nhập, đổi tên và bán; đây không phải thư mục nguồn chỉ đọc.
4. Số tồn theo ảnh vật lý còn đăng ký và hiện hữu; ledger phục vụ lịch sử/đối soát. Nháp, chia sẻ ảnh và tạo PNG không thực hiện bán hàng.
5. Cùng một image ID là cùng bộ hàng. Hai ảnh khác ID cùng mẫu/Size là hai bộ khác nhau. Cảnh báo nháp trùng có lựa chọn của chủ shop; transaction phải kiểm tra lại trước ghi.
6. Tiền VND nguyên không âm; giảm giá không vượt subtotal. `total = subtotal - discount`; `payableTotal = total + shippingFee`. Trường `total` và snapshot xác nhận bán hiện không gồm ship. Chặng sau không được âm thầm đổi nghĩa các trường này.
7. Contact và chi tiết hàng là snapshot. Đơn SOLD và bằng chứng bán bất biến; ảnh gốc đã bán vẫn giữ. Thanh toán/đổi trả phải thiết kế chứng từ riêng thay vì sửa ngược lịch sử SOLD.
8. Giữ transaction, idempotency, journal/hash, locking, recovery, backup/restore và các giới hạn đường dẫn/origin. Không bỏ cơ chế bảo vệ chỉ vì không cần kế thừa dữ liệu thử.
9. Hoàn thiện DB → service → API → UI → các module liên quan → kiểm thử cùng nhau. Không coi API hoạt động là đã xong chức năng. Giữ giao diện rõ, gọn, có trạng thái thật và không tràn ngang.
10. Phân biệt đã triển khai, CI PASS, chủ shop Windows PASS và STABLE. Ý tưởng mới ngoài phạm vi đã duyệt cần đề xuất riêng; không hỏi lại quyền đưa phần đã được duyệt lên main.

## Kiến trúc và điểm bắt đầu sửa mã

Ứng dụng LOCAL chạy Express trên 127.0.0.1:3000 và phục vụ bản build React. SQLite và ảnh nằm trên máy Windows. GitHub lưu mã, chạy CI và host DEMO; không lưu DB/kho nghiệp vụ đang chạy. Node workspace quản lý API và web; TypeScript, React 18, Vite/PWA, Express 4, SQLite `node:sqlite`, sharp/SVG và cầu nối clipboard C# là nền tảng hiện tại.

| Thành phần | Nơi đọc/sửa trước |
|---|---|
| Khởi chạy, bản phát hành, kho chọn, giới hạn LOCAL | `START_SHOP.bat`, `scripts/start-stage2.mjs`, `apps/api/src/freshDevelopment.ts`, `db.ts`, `server.ts`, `localRuntime.ts` |
| Dữ liệu nền và số tồn | `schema.ts`, `products.ts`, `physicalInventory.ts`, `inventoryQuery.ts`, `inventory.ts` |
| Nhập / quét / đổi tên | `goodsReceipt.ts`, `receiptRecovery.ts`, `storeScanner.ts`, `storeImport.ts`, `warehouseWatch.ts`, `imageRename.ts` |
| Chia sẻ / clipboard | `inventoryShare.ts`, `apps/api/native/ClipboardFiles.cs`, `InventorySharing.tsx` |
| Nháp / khách / giao hàng | `salesSchema.ts`, `salesDrafts.ts`, `customers.ts`, `salesRoutes.ts`, `CustomersView.tsx`, `CustomerContact.tsx`, `SalesDraftView.tsx` |
| Kiểm tra / ảnh nhẹ / bán / lịch sử | `salesPreflight.ts`, `salesPreview.ts`, `salesArchive.ts`, `salesExecution.ts`, `soldSource.ts`, các panel Sales trên web |
| PNG | `orderSlip.ts`, `OrderSlip.tsx` |
| Backup / Restore | `backup.ts`, `salesBackup.ts`, `losslessVerify.ts`, `losslessRestore.ts`, `restoreRoutes.ts`, `SettingsView.tsx`, `RestoreTestPanel.tsx` |
| Worker / tiến độ / lịch sử task | `tasks.ts`, `taskWorker.ts`, `taskActivity.ts`, `taskClient.ts`, `TaskProgress.tsx` |
| Dashboard / giao diện / phiên bản | `App.tsx`, `ReleaseStatus.tsx`, `styles.css`, `desktopExperience.css`, `lightContrast.css`, các CSS chức năng |
| CI / kiểm thử | `.github/workflows/pages.yml`, `package.json`, `*SelfTest.ts`, các `scripts/*e2e.mjs`, `main-browser-smoke.mjs` |

Tên file không có tiền tố nằm trong `apps/api/src/` hoặc `apps/web/src/` theo chức năng. DB runtime của bản main có schema 130; `shop_customers`/`order_contacts` được bootstrap idempotent. Các schema110/120 và công cụ lab/chuyển V1→V2 vẫn có trong source để kiểm thử/tương thích; chúng không phải quy trình chạy chính.

| Dữ liệu / File | Vai trò |
|---|---|
| `products`, `product_variants`, `product_images` | Danh mục, Size/SKU, ảnh canonical đăng ký |
| `inventory_transactions` | Ledger nhập và đối soát |
| `sales_orders`, `sales_order_images` | Đơn nháp, version, snapshot từng bộ |
| `shop_customers`, `order_contacts` | Danh mục khách và contact/ship snapshot theo đơn |
| `sales_operations`, `sales_confirmations`, `sales_units`, `sales_ledger` | Idempotency, bằng chứng xác nhận bán, bộ đã bán, ledger SALE |
| `data/stage2/database/shop-stage2.db` | DB riêng của thư mục cài; không đóng gói dữ liệu thử vào ZIP mã nguồn |
| `data/stage2/warehouse-config.json` | Kho bên ngoài được chọn qua UI; không phải DB kế thừa |
| `data/stage2/warehouse/` | Kho mặc định khi chưa chọn thư mục riêng |
| `operation-tasks` cạnh DB | Metadata/kết quả task bền vững, không thay thế ledger |
| Các vùng `.mecacao-v2-*` nội bộ | Archive/journal/recovery; scanner và chia sẻ loại các vùng này khỏi hàng tồn |

## Bằng chứng kiểm thử và phần chưa kiểm chứng

- `npm run test:gate`: typecheck, schema, kho/nhập/giá/chia sẻ, nháp/trùng ảnh, preflight/preview/archive/staging/commit/confirm/bán, restore, tasks, chặng 2, production build và 31 kiểm tra source UI đều PASS.
- `npm run test:stage2`: 26 kiểm tra khách trùng/version, snapshot, ship/miễn ship, overflow/idempotency, PNG nhiều trang, SOLD khóa sửa, restart và restore — PASS.
- `scripts/stage2-e2e.mjs`: 35 kiểm tra bản cài tạm, dữ liệu rỗng, chọn kho riêng, scan/import, khóa hai server, COPY nguồn, khách/đơn/PNG, origin, restart, bán, backup DIRECT và restore READY — PASS.
- CI chạy API thực và các hồi quy tương thích V1/V2 trong kho giả lập. Chromium kiểm tra chọn ảnh/đơn/bán/lịch sử/restore, launcher main, chọn kho và tự restart; screenshot 1366px/390px sáng/tối đã kiểm tra. Windows Node 22/24 cùng SUCCESS.
- Không có lỗi chặn ở các gate đã chạy. Chưa có nghiệm thu bản này trên máy chủ shop, clipboard Ctrl+V vào ứng dụng nhắn tin thực tế của chủ shop hoặc toàn bộ trải nghiệm iPhone. Các kết quả Windows chủ shop ở checkpoint cũ chỉ áp dụng cho bản/phạm vi cũ.

## Chưa triển khai và nền tảng chặng tiếp

| Phạm vi | Trạng thái đến checkpoint này |
|---|---|
| COD/chuyển khoản, đã thu/còn lại, nhiều lần thu, công nợ | Chưa triển khai; nội dung chặng 3 cần đặc tả và duyệt trước khi viết mã |
| Đổi/hoàn hàng, hoàn tiền, hậu mãi | Chưa triển khai; phải nối với bộ hàng và chứng từ bán/thu, không sửa bằng chứng SOLD |
| Báo cáo doanh thu đã thu/lợi nhuận, công nợ, kiểm kê chính thức | Chưa triển khai; dashboard tồn/nhập hiện có không phải báo cáo tài chính đầy đủ |
| Điện thoại truy cập kho LOCAL qua LAN | Chưa triển khai; responsive/PWA đã có nhưng server nghiệp vụ vẫn loopback |
| Đồng bộ/cloud, dùng từ xa khi laptop tắt | Chưa triển khai; GitHub Pages hiện chỉ là DEMO |
| Xóa tự động ảnh gốc đã bán, hủy cưỡng bức task | Chưa triển khai |

Chặng 3 nên bắt đầu bằng đặc tả các trạng thái bán/giao/thu độc lập; chứng từ thu/hoàn tiền có idempotency và ledger riêng; cách phân bổ ship/giảm giá và tính còn lại; quy tắc chỉnh chứng từ và đổi trả. Đây là các điểm thiết kế đề xuất, chưa phải chức năng đã làm hoặc quyết định nghiệp vụ đã duyệt.

Mỗi chặng tiếp: đề xuất phạm vi và tình huống cụ thể → chủ shop duyệt → triển khai xuyên suốt/UI → test fixture và CI Windows/Linux/browser phù hợp → cập nhật checkpoint/roadmap/test report → tích hợp đầy đủ lên main → chủ shop nghiệm thu bản cài mới. Không tạo yêu cầu chuyển DB thử cũ như điều kiện phát triển.

## Bàn giao sang cuộc trò chuyện mới

Dùng repo `anphanguyen191-cell/SHOP_MECACAO_WEB`, nhánh main. Đọc theo thứ tự `PROJECT_STATE.md` → tài liệu này → `DEVELOPMENT_PRINCIPLES.md` → `ROADMAP.md` → đặc tả chặng liên quan. Lấy commit/CI mới nhất thực tế nếu khác baseline trong bảng; không suy ra trạng thái hiện tại từ checkpoint lịch sử.

Định hướng đã chốt: bản mới đầy đủ chức năng, dữ liệu phát triển mới, một launcher, chọn/import kho trên UI, kiểm thử bằng dữ liệu giả lập, màu/chữ dễ đọc, hiển thị phiên bản/tiến độ. Chặng 1 và 2 đã có; chặng 3 tiếp theo chưa triển khai. Không phục dựng dự án Python/EXE cũ hoặc mở LAN/cloud ngoài phạm vi duyệt.
