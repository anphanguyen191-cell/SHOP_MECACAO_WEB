# V2 — Cảnh báo cùng bộ trong nhiều nháp và hoàn thiện UI

Ngày 2026-10-10. Người dùng đã test tạo/thêm nháp OK và yêu cầu cảnh báo/lựa chọn khi cùng bộ ở nhiều nháp, đồng thời yêu cầu mỗi chức năng được hoàn thiện giao diện đi kèm. Baseline 5f027e1961c3dcb3d29d5fb9525b0d8757c3ead4. Ghi nhận Windows draft create/add USER-REPORTED PASS; không suy ra bán/restore/V2 STABLE.

- Backend phát hiện cùng image ID trong DRAFT khác. Create hoặc thêm ảnh mới vào update trả 409 DRAFT_IMAGE_CONFLICT với Product/Size, image ID, mã nháp và token trước khi ghi. Token đối chiếu lại dưới BEGIN IMMEDIATE với tập đơn/version hiện tại; token cũ không bỏ qua xung đột mới. Không thêm bảng hoặc migration.
- UI hộp thoại có ảnh, các mã đơn liên quan; Quay lại chọn hàng giữ nguyên ảnh/đơn hoặc Vẫn thêm vào đơn nháp. Tiếp tục dùng cùng idempotency key/payload; token chỉ là xác nhận cảnh báo, không giữ hàng/trừ tồn.
- Hai bộ khác nhau cùng mẫu/Size vẫn hợp lệ. Nháp đã hủy/chính đơn đang sửa không gây cảnh báo. Sửa giá/ghi chú không hỏi trùng lại; mở lại hiển thị chỉ báo bộ/nháp liên quan.
- Nút chính hồng, thêm ảnh mint, bỏ ảnh hồng nhạt, hủy phụ tím nhạt; select, focus/hover/disabled, dark mode và kích thước mobile cùng được hoàn thiện. Dialog có focus trap, Escape, default quay lại và restore focus; không tự focus search.
- Nguyên tắc bắt buộc mới: DEVELOPMENT_PRINCIPLES.md, liên kết từ README/PROJECT_STATE/ROADMAP. Không coi chỉ backend hoạt động là chức năng hoàn tất.

Kiểm chứng: service/schema 50 assertions PASS local; typecheck/build và UI source regression được chạy. Real HTTP/Chromium bổ sung cảnh báo, từ chối không ghi thêm, xác nhận tiếp tục, badge và màu nút/overflow sáng-tối ở 1366/390px; chạy trên CI Linux/Windows Node22/24. Xem Actions của commit mới cho kết quả chính xác, không dùng CI baseline thay bằng chứng thay đổi này. Local thiếu Chromium nên không ghi local browser PASS.

Giới hạn: sandbox schema120; chưa xác nhận bán, chưa SALE/ảnh nhẹ/cleanup hoặc full restore; không có stock reservation. Test Windows mới: chọn lại cùng ảnh tạo nháp khác phải mở hộp thoại; quay lại thì số đơn giữ nguyên; đồng ý thì có nháp mới; chọn bộ khác cùng Size không bị cảnh báo trùng. Mở lại thấy mã các nháp liên quan; hủy nháp đối chiếu rồi mở lại để kiểm tra hết cảnh báo.
