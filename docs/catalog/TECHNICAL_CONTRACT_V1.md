# Customer Catalog V1 — hợp đồng kỹ thuật triển khai

Chủ Shop cho phép làm rõ và triển khai ngày 18/10/2026. Kế thừa UI MASTER FINAL và checklist; một nhánh main, không reset Cloud/kho.

- Website khách: `?catalog=1`, tách entry/CSS khỏi Admin. Backend Edge Function công khai có API giới hạn; bảng CORE không cấp quyền anonymous.
- Công khai: metadata riêng, mặc định ẩn mọi Product; chỉ owner bật/tắt và cấu hình. Công tắc toàn Catalog. Không thay schema hoặc luồng đồng bộ Product của CORE.
- Tồn: ảnh distinct, Product/variant active, asset ready/source present, không cleanup/deleted/SOLD. `stock_as_of` là thời điểm kiểm tra nguồn cũ nhất trong tập tồn, không phải giờ trả API. Trên 15 phút hiện cảnh báo cần Shop kiểm tra; không có bằng chứng thì ghi chưa xác định. Có thể gửi danh sách tư vấn khi khách đồng ý không giữ hàng; server không kiểm tra được Cloud thì từ chối ghi, không nhận bằng cache.
- Laptop tắt: xem Cloud và gửi yêu cầu; owner xử lý trên Cloud Admin, tạo nháp bằng CORE RPC đang có. Không hứa kiểm tra folder đang offline. CORE xác nhận SOLD là thẩm quyền duy nhất.
- Yêu cầu không giữ hàng. Ảnh trong yêu cầu khác không bị khóa. Ảnh trùng nháp cảnh báo theo CORE, Shop quyết định. Không tự thay ảnh đích danh. Shop phải tự chọn đủ ảnh cho số lượng nhanh.
- Chuyển nháp: kiểm tra version, giá/tồn mới, tập ảnh đúng từng variant; khóa giao dịch cùng CORE. Một inquiry liên kết tối đa một order. Retry trả order cũ. Gọi CORE trong cùng transaction, không ghi nháp thủ công.
- Giá chưa công bố: null / Liên hệ Shop; yêu cầu giữ null, không biến thành giá 0. Khi chuyển nháp, Shop phải xác nhận giá variant trước.
- Ảnh public qua proxy kiểm tra lại quyền mỗi lần; no-store, không cấp signed URL dài hạn, không mở bucket. Ẩn dừng truy cập mới; ảnh đã tải/screenshot trên máy khách không thu hồi được.
- API phân trang 20 sản phẩm, 40 ảnh; giới hạn 100 bộ/yêu cầu. Giỏ lưu device-local, không lưu liên hệ lâu dài. Khi submit server đối chiếu giá từng variant; giá đổi thì yêu cầu xác nhận lại, không tự gửi giá mới.
- Retry: token ngẫu nhiên 256 bit, chỉ lưu hash trong DB; cùng token khác payload bị từ chối. Tra kết quả chỉ trả mã/trạng thái, không liên hệ/dòng hàng. Token không đưa vào URL. Gửi trùng không tạo inquiry thứ hai.
- Chống lạm dụng: body giới hạn, honeypot, rate limit giao dịch bền vững theo hash IP và hash liên hệ, giới hạn tổng theo giờ. Không ghi IP gốc. Không xem CORS là bảo mật.
- Liên hệ: chỉ link Zalo/Messenger được owner nhập; có sao chép danh sách. Không tự gửi tin. Hero mobile bằng nhận diện/chữ, banner ảnh tùy chọn phải preview và owner lưu trước khi công khai.
- Size: đúng 12 dòng đã duyệt; không nội suy khoảng hở; không lưu số đo backend. Config version và publish nguyên tử dữ liệu+ảnh; ảnh tùy chọn chỉ URL https công khai đã duyệt.
- Privacy: contact/note giữ tối đa 90 ngày, dọn khi API xử lý; owner cũng có thể xóa thông tin liên hệ sớm. Audit giữ ID/trạng thái không chứa PII. Inquiry đóng vẫn không được public đọc.
- Phát hành: Catalog mặc định OFF và Product hidden; bản Windows cũ hoạt động với migration bổ sung độc lập. Nghiệm thu thiết bị thật và banner cuối cùng vẫn là điều kiện công khai, không đánh đồng CI với STABLE.
