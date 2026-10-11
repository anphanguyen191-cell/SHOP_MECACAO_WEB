# V7 Core Final — kế hoạch hoàn thiện Cloud

Chốt thiết kế ngày 11/10/2026, tham khảo màn hình kết nối core Python cũ do chủ shop cung cấp. Đây là đặc tả triển khai; các mục chưa làm không được coi là tính năng đã có. V7 là Cloud cho SHOP_MECACAO_WEB, kế thừa đầy đủ chức năng main, dùng Supabase hiện có và một bản ảnh nhẹ. Không kế thừa dữ liệu thử nghiệm của core cũ.

## 1. Baseline và tiến độ thật

- Main ứng dụng: 3.5.0-stage6-main-test; schema core 130. CI trước đó PASS không thay thế nghiệm thu Windows/iPhone.
- Project ShopMeCaCao-Cloud: eyckwoewpomssjjggslr. Bucket shop-mobile-images, private, JPEG.
- Đã reset ngày 11/10: ảnh Cloud 0, dữ liệu nghiệp vụ 0; giữ danh tính Auth và membership owner. Đã tạo 20 bảng core + 5 bảng hỗ trợ Cloud, RLS toàn bộ, publication Realtime 11 bảng, thêm 11 index khóa ngoại. Test transaction giả lập SOLD/finance/stock/size/RLS PASS và rollback toàn bộ.
- Cập nhật triển khai: RPC V7, adapter Windows/mobile, nén/upload, nghiệp vụ và giao diện đã có trong mã V7.1.0-cloud-main-test. Cloud RPC_READY; chuyển CLOUD_TEST_READY sau lần đồng bộ/activate của chủ shop. Xem V7_TEST_GUIDE.md để kiểm thử.
- Giới hạn bucket hiện 2 MiB; metadata ảnh mới có CHECK <=150000 bytes. Phải kiểm tra kích thước file thực tế khi upload; CHECK metadata không tự kiểm chứng nội dung Storage.
- SQL reset là thao tác một lần đã hoàn tất, không chạy tự động mỗi lần mở app/cập nhật. Mỗi bản phát triển cho phép tạo kho test mới từ giao diện; giữ cơ chế bảo vệ dữ liệu local sẵn có.

## 2. Tham khảo core cũ và thay đổi cần thiết

| Màn hình cũ | Thiết kế V7 |
|---|---|
| Core/API/schema và chữ TƯƠNG THÍCH | Phiên bản app, hợp đồng Cloud, trạng thái tương thích sau kiểm tra thực tế |
| Project URL, bucket, Secret Key, URL Mobile | Project/bucket điền sẵn; đăng nhập tài khoản shop; public key cấu hình theo build, không yêu cầu dán Secret Key trên mobile |
| Cloud Authority Live | Bật đồng bộ Cloud, chỉ cho bật sau kiểm tra quyền và tương thích |
| Auto reconcile mỗi 300 giây | Realtime + đồng bộ ngay sau nhập hàng/import; đối soát nhẹ định kỳ/reconnect, không quét và upload toàn kho liên tục |
| Smart Sync / Resume | Đồng bộ ngay / Tiếp tục, giữ tiến độ khi mất mạng hoặc đóng app |
| Dừng an toàn | Tạm dừng sau tác vụ đang xử lý; không mất hàng đợi |
| Mở Mobile | Mở link hoặc quét QR; không nhập IP LAN/chứng chỉ |
| Nhật ký kỹ thuật dài | Trạng thái tiếng Việt + mục Chi tiết lỗi thu gọn, che thông tin nhạy cảm |

Ảnh tham khảo báo PGRST202/404 vì không tìm thấy shop_v14_sync_core_metadata(p_rows). RPC này thuộc hệ cũ và đã được loại bỏ khi reset; không sửa bằng cách phục hồi RPC cũ. Phải viết adapter/RPC V7 có kiểm tra phiên bản. Nhãn Core V12/API 1/Schema 9 trên ảnh không chứng minh tương thích schema 130 của web mới. Tắt đồng bộ core cũ trước khi đưa dữ liệu V7 lên project.

## 3. Trải nghiệm kết nối

Cài đặt → Cloud có bốn khối rõ màu:

1. Kết nối: tên shop/project, đăng nhập/đăng xuất, Kiểm tra kết nối. Project và bucket nằm trong phần Nâng cao. Phân biệt tài khoản Dashboard Supabase với tài khoản đăng nhập ứng dụng; đăng nhập Google Dashboard không tự cấp phiên ứng dụng. Tài khoản app phải ánh xạ cloud_members đúng người/quyền.
2. Đồng bộ: công tắc bật/tắt, Đồng bộ ngay, Tạm dừng/Tiếp tục; số mặt hàng, bộ ảnh, ảnh đang upload, dữ liệu chờ, thành công/thất bại, lần đối soát gần nhất. Trạng thái riêng dữ liệu và ảnh; không báo “Đã đồng bộ” khi ảnh còn lỗi.
3. Mobile: link HTTPS, QR, Mở Mobile, giải thích laptop tắt vẫn xem/bán hàng đã đồng bộ. Link triển khai xác minh từ main; không dùng mặc định site core cũ gregarious-moonbeam.
4. Tiến độ: V7.x, version app/Cloud, lỗi cần xử lý và nhật ký gọn. Tương thích Nhỏ/Vừa/Lớn, sáng/tối, safe area và panel góc phải đã có.

Các trạng thái: Chưa cấu hình / Đang kiểm tra / Đang đồng bộ / Đã đồng bộ / Tạm dừng / Mất Internet / Hết phiên đăng nhập / Cần cập nhật / Có lỗi. Mỗi lỗi có hành động phù hợp. Chỉ bật màu xanh sau khi quyền, hợp đồng dữ liệu và kết nối đều đạt.

Khởi chạy Windows bằng START_SHOP.bat của main. Chưa bổ sung tự khởi động cùng Windows; không hiển thị checkbox chưa có cơ chế thực thi. Mở lại app tự tiếp tục đồng bộ khi trước đó đã bật, không yêu cầu cấu hình lại.

## 4. Ảnh — một bản nhẹ trên Cloud

- Ảnh gốc giữ nguyên laptop; COPY/import không sửa/xóa nguồn. Cloud chỉ một JPEG tối ưu cho mỗi ảnh canonical, không thêm bộ original/thumbnail/share riêng.
- Mục tiêu file <=150000 bytes. Khởi điểm cạnh dài 1080px, giữ tỷ lệ/EXIF orientation, chuyển màu sRGB; không phóng lớn ảnh nhỏ. Giảm quality rồi kích thước có giới hạn; ảnh không đạt chất lượng phải báo lỗi cho người dùng, không tải file lớn hoặc nén mờ âm thầm.
- Có xem trước một ảnh tối ưu và dung lượng trong cấu hình. Không bắt người dùng chọn nhiều preset khó hiểu.
- Tên object dựa trên ID ảnh ổn định; SHA-256 và revision phát hiện thay đổi. Không upload lại ảnh không đổi. Mỗi ảnh không tạo thêm đơn vị tồn khi nén/upload/retry.
- Upload xong kiểm chứng kích thước/hash, sau đó đánh dấu ready. Ảnh upload dở không hiện như ảnh đã sẵn sàng. Thay ảnh thất bại không làm mất bản đang dùng; dọn object tạm nếu có, không giữ nhiều biến thể dài hạn.
- Nén local, hàng đợi giới hạn concurrency, retry có backoff; tải từng trang/lazy load và cache theo revision. Cache/signed URL có hạn, làm mới khi hết hạn, không đổi bucket sang public.
- Kiểm tra URL ảnh lớn trên iPhone, chia sẻ và PNG; mobile chia sẻ ảnh nhẹ, Windows COPY nhanh tiếp tục dùng nguồn local khi hiện hữu.
- Ảnh SOLD vẫn theo chức năng lưu trữ/xóa có kiểm soát của core. Không tự xóa SOLD để né quota; chứng từ/lịch sử bất biến. Không tạo quy trình backup Cloud nhiều loại ảnh.

## 5. Đồng bộ và quyền quyết định giao dịch

Local-first vẫn áp dụng cho nguồn ảnh, import, hoạt động local khi chưa bật Cloud. Khi kho đã bật Cloud, mọi xác nhận bán/thu tiền/đổi trạng thái chung đi qua một transaction Cloud. SQLite là bản local được đối soát; không cho laptop và mobile bán độc lập cùng một bộ.

- Dữ liệu lần đầu: người dùng chọn kho trong UI, kiểm tra ảnh/ID/giá/size, xuất dữ liệu + JPEG nhẹ lên Cloud. Không import lại dữ liệu core cũ tự động.
- Thay đổi laptop: adapter ghi hàng đợi bền vững rồi gọi RPC, cập nhật local theo kết quả. Thay đổi mobile dùng cùng RPC/hợp đồng. Không để browser ghi rời rạc tồn, đơn và tiền.
- RPC có auth.uid, membership/role, request_key, input_hash và expected_version; transaction/row lock theo thứ tự ổn định. Retry cùng yêu cầu trả cùng kết quả; cùng key khác nội dung bị từ chối. Hai người bán cùng bộ chỉ một người thành công.
- Cloud sync event/cursor dùng để đọc phần thiếu. Realtime chỉ đánh thức/refetch; không dùng thông báo Realtime như bằng chứng đã nhận đủ mọi thay đổi. Reconnect đối soát rồi cập nhật cursor sau local commit.
- Không đẩy snapshot local cũ lên ghi đè SOLD/finance mới. Khi timeout phải tra kết quả request trước retry/xác nhận; không tự kết luận thất bại hay thành công.
- Laptop tắt: mobile xem và thực hiện nghiệp vụ đã có RPC độc lập; laptop mở lại áp dụng phần thiếu đúng một lần. Có SOLD từ mobile thì chặn dùng ảnh đó bán local ngay từ bước xác nhận, kể cả đang chờ hoàn tất archive local.
- Mất mạng: hiển thị dữ liệu cũ, cho xem và soạn nháp có nhãn chưa gửi; không xác nhận SOLD/thu tiền thành công. Không tự merge giao dịch tài chính offline trong V7 đầu. Kho local chưa bật Cloud giữ hành vi hiện tại.
- Backup/restore local hiện hữu phải nhận biết kho Cloud: restore snapshot cũ không phục hồi tồn SOLD hay ghi đè ledger Cloud; bắt đối soát trước tiếp tục thao tác.
- Service-role/secret không nằm bundle React, localStorage, QR, nhật ký hoặc GitHub. Dùng session người dùng cho adapter; nếu cần tác vụ admin chạy phía tin cậy có phạm vi hẹp. RPC nhạy cảm kiểm quyền rõ, grants tối thiểu. Không tạo endpoint xóa không xác thực.

## 6. Ma trận chức năng phải giữ đầy đủ

| Chức năng | Windows | Mobile Cloud | Điều kiện hoàn thành |
|---|---|---|---|
| Dashboard/tồn/danh mục/Product/Size/giá | Đủ chức năng hiện tại | Đọc cập nhật và sửa theo quyền | Cùng số tồn theo ảnh canonical |
| Nhập hàng/import folder/import kho | Chọn nguồn, COPY, nén và upload | Xem kết quả; không chọn đường dẫn Windows | Retry/import không trùng ảnh/bộ |
| Khách hàng/liên hệ giao hàng | Tạo/sửa/tìm | Tạo/sửa/tìm theo quyền | Version conflict và dữ liệu chung |
| Chọn ảnh/nháp/PNG/chia sẻ | Đầy đủ | Đầy đủ, mobile layout | Không trừ tồn, banner shop và số tiền đúng |
| Xác nhận bán/SOLD | RPC chung + archive nguồn local | RPC chung, chạy khi laptop tắt | Race/retry chỉ một giao dịch, bằng chứng bất biến |
| Ship/COD/thanh toán/thu chi/công nợ | Đầy đủ nghiệp vụ main | Đầy đủ phần thao tác hợp lệ theo quyền | Ledger bất biến, điều chỉnh bằng bút toán hợp lệ |
| Báo cáo/lợi nhuận/đối soát | Đủ | Đọc/bộ lọc/export được hỗ trợ | Số liệu khớp cùng mốc dữ liệu |
| Kiểm kê | Mở/đếm/chốt | Đếm/chốt theo quyền | Không chốt snapshot lỗi thời; không tự phục hồi SOLD |
| Ảnh SOLD/lưu trữ/xóa có kiểm soát | Theo core | Xem/trạng thái và thao tác được cấp quyền | Không mất bằng chứng; nguồn local xử lý khi laptop online |
| Ảnh iPhone/inbox | Duyệt nhập khi cần nguồn laptop | Upload nhẹ/chờ duyệt | Chờ duyệt chưa tăng tồn; chỉ sau đăng ký canonical |
| Cài đặt/quyền/phiên bản | Đủ + Cloud | Đủ phần phù hợp quyền | Không lộ secret; cỡ hiển thị lưu theo thiết bị |
| COPY nhanh/đường dẫn/backup/restore | Tiếp tục native/local | Chia sẻ ảnh, không thao tác đường dẫn laptop | Mobile giải thích thao tác cần laptop rõ ràng |

Tồn vật lý là ảnh canonical hiện hữu chưa SOLD; inventory_stock chỉ phục vụ ledger. Upload JPEG và dữ liệu không tự đổi quy tắc tồn. Khi nguồn không hiện hữu trên laptop phải ghi tình trạng và xử lý theo quy tắc core, không âm thầm tạo lại tồn từ JPEG Cloud.

## 7. Checkpoint triển khai theo thứ tự

| Mốc | Công việc | Đầu ra/điều kiện PASS | Hiện tại |
|---|---|---|---|
| 7.0 | Reset Cloud, schema nền, RLS, Realtime, index | Data rỗng; test giả lập rollback; lưu migration | Đã kiểm tra rollback |
| 7.1 | Hợp đồng API/Cloud, RPC quyền/idempotency/version, role matrix; bootstrap metadata/cursors | Health RPC kiểm đúng version/quyền; ghi trái quyền bị chặn | Đã triển khai; chờ nghiệm thu |
| 7.2 | Trang kết nối Windows/mobile; đăng nhập app, trạng thái, lưu config; link/QR đúng deployment | Một lần cấu hình, mở lại dùng được; không secret trên mobile | Đã triển khai; chờ nghiệm thu |
| 7.3 | Bộ nén/upload/verify + hàng đợi bền vững + lần đầu đẩy kho fake | <=150KB, source hash không đổi; ngắt upload/resume không trùng | Đã triển khai; chờ nghiệm thu |
| 7.4 | Adapter đọc/realtime/cursor, reconnect, laptop tắt, preview ảnh private | Tồn/giá/size/ảnh đồng bộ, đọc bù sự kiện thiếu | Đã triển khai; chờ nghiệm thu |
| 7.5 | Nháp/khách/PNG/bán/SOLD hai chiều + archive local reconciliation | Bán cạnh tranh/retry đúng; laptop tắt mobile bán được | Đã triển khai; chờ nghiệm thu |
| 7.6 | Finance/COD/ship/nợ/báo cáo/kiểm kê + quyền | Ma trận toàn nghiệp vụ khớp core và Cloud | Đã triển khai; chờ nghiệm thu |
| 7.7 | Ảnh iPhone/SOLD, quản lý dung lượng, restore-aware, tối ưu UI/hiệu năng | Không tăng tồn từ inbox; không stale restore; UI iPhone đạt | Đã triển khai; chờ nghiệm thu |
| 7.8 | Gate tổng, build/deploy main và Windows package, tài liệu/nghiệm thu | Linux + Windows CI và Windows/iPhone test thực tế; bàn giao | Đã triển khai; chờ nghiệm thu |

Mỗi mốc cập nhật trạng thái làm được/chưa làm/lỗi, migration và hướng dẫn test. Không gắn STABLE chỉ vì CI xanh. Trình tự 7.1 phải có RPC đọc/ghi nền cần thiết cho 7.3–7.4; mở rộng nghiệp vụ đầy đủ ở 7.5–7.6.

## 8. Kiểm thử và phát hành

Chỉ dùng kho/ảnh giả lập cho kiểm thử tự động. Test compression trên ảnh tạo giả lập có hoa văn/chữ/màu/EXIF, ảnh lớn/nhỏ/hỏng; hash nguồn trước/sau. Chủ shop tự nghiệm thu chất lượng ảnh thật nếu muốn, không dùng kho thật làm fixture tự động.

Bắt buộc: duplicate request, key khác hash, bán hai thiết bị cùng bộ, version stale, mất mạng trước/sau Cloud commit, upload gián đoạn, crash/restart, expired session, thiếu Realtime event, laptop tắt/mở lại, stale local restore, lỗi archive, quota/upload rejection, role escalation, RLS/Storage/RPC unauthorized. Không để fixture sót trên project đang dùng.

Kiểm toàn bộ gate core hiện hữu để không mất chức năng. Thêm test adapter contract và fake Cloud E2E. Deploy mobile từ main, Windows tải cùng commit/app version; hiển thị cả version, tiến độ V7.x và trạng thái nghiệm thu. Kho test mới tạo/import trong giao diện; không bắt nối đường dẫn V1 hay phục hồi dữ liệu test cũ. Lưu cấu hình thiết bị và kho người dùng có chủ đích, không tự xóa khi cập nhật.

Nghiệm thu thực tế: Windows nhập kho tự tạo → sync → iPhone khác mạng xem/chọn/nháp/PNG → bán/thu tiền → Windows nhận → tắt laptop thao tác mobile → bật lại đối soát → kiểm số tồn/nợ/báo cáo/ảnh. Toàn bộ dùng kho test do chủ shop chủ động tạo, có thể mới hoàn toàn.

V7 hoàn thiện khi ma trận chức năng đạt, không lỗi nghiêm trọng tồn/tiền/ảnh/quyền, build chính thức từ main, và chủ shop nghiệm thu Windows/iPhone. Version stable cuối theo quy ước repo; không đổi nhãn thành 7.0.0 STABLE trước các điều kiện này.

## 9. Giữ thiết kế đơn giản và tận dụng Free

Chỉ Supabase Auth/Postgres/Storage/Realtime và hosting web static hiện có. Không bổ sung R2/Railway/backup ảnh nhiều bản trong phạm vi này. Theo dõi usage thực tế bằng màn hình shop; không cam kết quota unlimited. 1000 ảnh x150KB khoảng150MB; 3000 khoảng450MB; SOLD cũng chiếm dung lượng. Pagination/cache giảm tải dữ liệu. Cảnh báo gần quota có cách xử lý rõ, không ép nâng gói mặc định.

Bucket giữ private; quyết định trần upload phù hợp inbox trước thay đổi: tối ưu laptop trước upload, mobile phải nén trước upload; không dùng trần bucket như bộ nén. Nếu đặt trần <=150KB thì mọi luồng ảnh, kể cả inbox, phải tuân thủ. Không yêu cầu chủ shop thêm bước kỹ thuật mỗi lần sử dụng.

Tài liệu này thay toàn bộ kế hoạch V7 cũ và trạng thái “chưa reset”. Báo cáo reset chi tiết: CLOUD_RESET_STATUS_2026-10-11.md. Các cấu hình cũ chỉ là tham khảo UI, không phải code có thể tái dùng nguyên trạng.
