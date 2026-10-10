# Test V2 bán hàng trên Windows — sandbox riêng

Không chạy thao tác thử trên `D:\1-Me CaCao Store`. Không chép database thật vào sandbox để thử bán. Bản3007 riêng với bản nháp3006 và V1. Gốc sau bán chưa xóa; vẫn ở staging để đối chiếu.

1. Giải nén ZIP source mới vào thư mục mới. Chạy `RUN_WINDOWS_V2_SALES_TEST.bat`. Lần đầu cài Node22.13+ nếu cần. Chờ mở `http://127.0.0.1:3007`; phải có nhãn TEST SANDBOX.
2. Vào Import kho, chọn `%LOCALAPPDATA%\ShopMeCaCao\V2SalesSandbox\warehouse`. Quét/xem trước → duyệt các mẫu. Sau đó Tồn kho phải có3 bộ từ3 ảnh giả lập, Product/Size đúng. Có thể COPY/gửi thử; không làm giảm tồn.
3. Trong Tồn kho chọn1 hoặc nhiều ảnh → TẠO ĐƠN NHÁP. Sửa giá/giảm giá → lưu. Lưu/mở nháp không trừ tồn. Thử thêm cùng ảnh vào nháp khác: phải cảnh báo và cho chọn; nháp không giữ hàng.
4. Mở nháp → Kiểm tra toàn đơn → đối chiếu từng ảnh/Size/giá/tổng. Nút Xác nhận bán sandbox chỉ mở sau checkbox. Hàng giá0 cần checkbox riêng. Bấm1 lần, chờ ĐÃ BÁN.
5. Đối chiếu tồn giảm đúng số ảnh, không mất hàng khác. Vào Tổng quan/Danh mục/Tồn kho/chi tiết thấy cùng số. File canonical đã bán ra khỏi Product/Size; ảnh nguồn trong `incoming` giữ nguyên. Gốc đã bán ở `.mecacao-v2-sales\<operation>\staged`, JPEG ở `archive`. Không tự sửa các thư mục này.
6. Bán hàng → lọc Đã bán → mở đơn: đúng ảnh nhẹ/số bộ/giá/giảm giá; không sửa/bỏ/hủy trực tiếp. Đơn nháp khác tham chiếu ảnh đã bán phải báo ảnh không còn bán được; không cho confirm. SOLD chưa đồng nghĩa đã thanh toán.
7. Restart: đóng cửa sổ server test (Ctrl+C, nếu hỏi Terminate batch chọnY), đóng tab rồi chạy lại BAT3007. **Không xóa DB/sandbox.** Tồn/ĐÃ BÁN/ảnh nhẹ giữ nguyên; fixture không tạo lại ảnh đã bán. Mở lại ảnh đã bán không được copy như hàng tồn.
8. Cài đặt → Backup đầy đủ DB+ảnh gốc → phải Verified. Backup sau bán bao phủ cả AVAILABLE originals + SOLD JPEG + retained originals/journals. Chọn đường dẫn backup vừa tạo → Phục hồi thử sang kho mới → READY. Chạy `RUN_WINDOWS_RESTORED_V2_SALES_TEST.bat`, chọn1. Mở3016: đúng tồn và đơn SOLD/ảnh nhẹ; SOLD không trở lại tồn. Thử backup đầy đủ lại ở kho restore.
9. Nếu server/HTTP bị dừng giữa bán: restart, vào Bán hàng → Kiểm tra/phục hồi giao dịch bị gián đoạn. Chưa commit trả hàng về nháp; đã commit giữ SOLD, không SALE lần2. Nếu báo thiếu nhật ký/checksum/manual review, giữ nguyên file và báo lỗi; không xóa/ghi đè để ép chạy. Sau rollback kiểm tra lại đơn rồi chọn Tạo mã bán mới. Không đổi mã khi chưa biết kết quả cũ.
10. Thử Windows màn hình thường và trình duyệt giả lập390px; Gọn/Thoải mái, sáng/tối. Nút/ảnh/tiền phải đọc được, không tràn ngang. Test nhập bổ sung ảnh khác nội dung, rename ảnh AVAILABLE và quét lại: không đề xuất ảnh archive/staging thành tồn.

Ghi kết quả: commit ZIP, phiên bảnNode, bước đạt/lỗi, số tồn trước/sau, mã đơn và ảnh màn hình. CI PASS không thay owner Windows PASS. Chỉ nghiệm thu sandbox ở đợt này; chưa khóa STABLE/chưa bật bán kho thật/chưa xóa gốc.
