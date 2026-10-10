# V2 — Kiểm tra toàn đơn trước khi bán (2026-10-10)

Chủ shop yêu cầu tiếp tục hoàn thiện V2. Đợt này triển khai kiểm tra chỉ đọc ngay trong đơn nháp, chưa mở xác nhận bán. Nền source trước đợt này: a37320f69c647a4c37193293c819dbff27fd31f2; Actions 38015746092 verify/Windows22/24/deploy SUCCESS.

## Chức năng đã triển khai

- API sandbox `POST /api/sales/drafts/:id/preflight`, cùng loopback/origin gate với đơn nháp. Kiểm tra phiên bản/trạng thái DRAFT, ID/số lượng, VND nguyên an toàn và giảm giá.
- Đọc lại Product/Size active, đường dẫn ảnh đã đăng ký, file thật trong sandbox. Chặn reserved archive/recovery folder, symlink, file thiếu, ảnh trên32MB hoặc40MP, ảnh nhiều khung hình và ảnh không giải mã được. Không chỉ tin phần mở rộng/metadata.
- Giải mã tuần tự, không nén lại và không ghi file; sau toàn bộ kiểm tra, đọc lại SHA/path từng ảnh và snapshot toàn đơn/nháp trùng. Nếu ảnh/đơn/trạng thái thay đổi giữa chừng, trả409, không báo đạt.
- Báo cáo số mẫu, Size/SKU, bộ, giá trị đơn, lỗi từng ảnh, giá0, thiếu giá vốn và nháp cùng image ID. Giá trị đơn không phải doanh thu/tiền đã thu.
- Token SHA gắn snapshot và nội dung ảnh; gửi token cũ sẽ được kiểm tra lại toàn bộ, từ chối409 nếu thay đổi. Token **không phải claim/khóa/ủy quyền bán**, không thay thế validation trong transaction confirm tương lai. Server luôn trả canConfirmSale=false/reservesStock=false/readOnly=true.
- UI Bán hàng có bảng pastel gọn, nút kiểm tra lại, mở/thu gọn từng bộ; responsive/dark mode/loading/error. Thay đổi chưa lưu vô hiệu hóa kiểm tra; lưu đơn xóa báo cáo cũ. Sau60giây hoặc quay lại cửa sổ, đánh dấu kết quả cũ và nhắc kiểm tra lại. Không polling decode gây tải nền.

## Kiểm chứng

`test:sales-preflight` được đưa vào gate Linux/Windows; fixture kiểm tra missing/corrupt/inactive/reserved/symlink/oversized/decimal-money, stale version/token, thay file hoặc sửa nháp giữa decode, concurrency, overlap/zero/unknown-cost warnings, giữ nguyên bytes/rows/ledger. HTTP integration kiểm tra origin/version/token và báo cáo server thật. Chromium thao tác kiểm tra→chi tiết→sửa giảm giá→lưu→báo cáo cũ biến mất→kiểm tra lại tiền; desktop1366/mobile390 sáng/tối có báo cáo và ảnh chụp.

Chỉ ghi CI PASS sau khi xác minh exact commit; không lấy run baseline cho đợt mới. Chủ shop chưa nghiệm thu bảng mới trên Windows. Không đổi schema/migration, không claim, không SOLD/SALE, không chuyển/xóa ảnh.

## Chủ shop kiểm tra

1. Chạy RUN_WINDOWS_V2_DRAFT_TEST.bat; mở Bán hàng và chọn một nháp đã lưu.
2. Bấm **Kiểm tra toàn đơn**. Đối chiếu số mẫu, Size, bộ, giá trị và cảnh báo; mở **Xem kiểm tra từng bộ**.
3. Sửa giá/giảm giá: nút kiểm tra bị khóa tới khi lưu; lưu xong báo cáo cũ biến mất. Kiểm tra lại thấy tiền mới.
4. Với dữ liệu sandbox, thử một bộ giá0 hoặc cùng ảnh trong hai nháp đã xác nhận cảnh báo: bảng phải nhắc rõ. Kiểm tra không trừ tồn hoặc tạo bán.
5. Có thể đổi tên tạm một ảnh sandbox trong Explorer, bấm kiểm tra lại: báo lỗi đúng bộ; trả tên về ban đầu. Không thử trên kho kinh doanh.

## V2 còn phải hoàn thành

- Migration SALE/SOLD, immutable sold snapshots và UNIQUE image claim trên bản sao DB được kiểm chứng.
- Khóa phối hợp ghi/đọc kho; confirm atomic/idempotent toàn đơn và operation-status khi HTTP mất kết nối.
- Nối quyết định DB thật với staging/journal và kiểm thử kill trước/sau commit; chính sách cleanup/chất lượng cần chốt trước áp dụng thật.
- Danh sách/chi tiết đã bán, đồng bộ eligibility ở tất cả module và backup/restore SOLD archives.
- Nghiệm thu Windows luồng bán/restart/restore; gate V1 restore/STABLE và V2 STABLE chưa khóa.
