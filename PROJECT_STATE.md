## Đợt V8.0.70 — giao diện kiểm tra trước đồng bộ (16/10/2026 theo kế hoạch)

- Bổ sung "Xem trước đối soát (không ghi)" để xem tên Product Windows/Cloud, số Size, ảnh thực hiện hữu, ảnh thiếu, số ảnh Cloud sẵn sàng và ảnh dự kiến cần tải lên. Nút chỉ đọc, không đăng ký hoặc xoá dữ liệu Cloud.
- Phát hiện cùng ID nhưng lệch tên tiếng Việt/mã Product, liên kết Product/Size/ảnh, hoặc Cloud gắn kho khác. Giữ nguyên cơ chế xác nhận tiếp nhận hiện có.
- Không đổi dữ liệu LOCAL/ảnh gốc, không chạy lại reset Supabase. Nghiệm thu thực tế vẫn chờ Windows/iPhone.

---
## Regression test: tên file ảnh không tái sử dụng
- Test thực tế trên thư mục tạm (không ảnh thật): đã cấp số, xóa file, đổi phần mở rộng, app khởi động lại, nhiều Size và file đã mất; số mới luôn tăng. Không cần DB riêng.

---
## Reset Cloud sạch và quy tắc đồng nhất tên / số thứ tự file — 15/10/2026

- Supabase hiện tại đã sạch: 0 sản phẩm, 0 Size, 0 ảnh, 0 Storage objects; giữ tài khoản/role owner và schema/RPC cùng bucket không công khai. Chưa có đồng bộ thực tế từ laptop sau reset.
- Tên sản phẩm Cloud lấy nguyên văn từ `products.name` trên Windows, giữ dấu tiếng Việt/mã Product/ID; chặn kích hoạt Cloud nếu tên hoặc mã khác (so sánh từng bản ghi).
- Ảnh mới trên V8 COPY vào kho được tự đặt tên `ShopMeCaCao_Tole_<Product>_Size_<Size>_<số tăng>.jpg`; không gán lại số đã cấp kể cả sau khi ảnh bị bán/xóa. Bộ đếm cao nhất lưu trong `app_metadata` của một database LOCAL V8, có nguồn đối chiếu bổ sung từ file kho và mọi đường dẫn ảnh đã đăng ký (kể cả file bị mất).
- Đặt số trước khi COPY/rename, không reset số khi rollback: có thể khuyết số nhưng tuyệt đối không tái sử dụng. Không thay đổi ảnh gốc hiện hữu chỉ bởi cập nhật phiên bản.
- Các lần chạy trên laptop cần test import 3 kiểu, rename, xóa ảnh, restart, then next filename, Cloud exact-name, mobile sau khi cập nhật.

---
## Cloud audit bổ sung — an toàn trước ghi, hiệu năng và xác nhận xóa (15/10/2026)

- Đọc và kiểm tra toàn bộ trang nguồn trước khi ghi Cloud; toàn bộ ảnh mất thì dừng trước mọi thay đổi tồn. Rút ảnh thiếu từng phần chỉ sau vòng quét lại xác nhận kho không thay đổi.
- Tải tối đa 2 ảnh đồng thời; lỗi/dừng không khởi chạy ảnh mới, chờ các yêu cầu đang chạy kết thúc trước khi cho phép lần đồng bộ sau.
- Mỗi yêu cầu vẫn đọc và SHA-256 nội dung ảnh gốc. Bộ nhớ đệm tối đa 10.000 cặp hash, không lưu bản sao ảnh; nếu nội dung và hash Cloud khớp, trả 204, tránh nén JPEG và truyền lại. Khởi động lại API cần làm nóng cache lại. Không dựa riêng vào tên/size/mtime.
- Dọn Storage chỉ cộng số file/dung lượng khi phản hồi xác nhận đủ đúng đường dẫn; kết quả rỗng/một phần/sai đường dẫn phải báo lỗi. Không có thao tác xóa Cloud thật trong đợt audit này.
- Đã PASS tại môi trường phát triển: typecheck, build, 16 bài cloud-sync-audit, toàn bộ test:cloud gồm React DOM cho mất toàn bộ nguồn/thay hash/khôi phục/cache 204, ảnh nguồn thay cùng mtime, ảnh bị xóa, queue lỗi và xóa không đầy đủ. Ảnh mẫu 202.201 byte: lần nén đầu ~0,54–0,63 giây, kiểm tra cache <1 ms (không đại diện cả kho).
- Windows Release/Pages phải kiểm tra đúng commit sau push. Cloud thật Windows/iPhone vẫn chưa nghiệm thu; chủ shop cập nhật STABLE và đồng bộ/đối chiếu số ảnh thực tế. Không tạo database LOCAL khác hoặc sửa ảnh gốc.

---
## Cloud kiểm thử sâu: file mất, thay đổi trong lúc đồng bộ, kích hoạt sớm

- Tồn vật lý = chỉ các ảnh Windows được xác nhận `present=true`; ảnh mất trên thư mục gốc được đánh dấu không bán được qua `mc_v7_presence`. Không chặn mọi đồng bộ nếu chỉ thiếu một vài file; nhưng không tự xóa sạch tồn khi toàn bộ ảnh Windows đột ngột mất.
- Trước khi bật Cloud: đọc lại một vòng toàn bộ danh mục Windows, kiểm tra ID ảnh/Product/Size không thay đổi trong lúc upload; đối chiếu từng Size; Supabase RPC `mc_v8_stock_integrity` kiểm tra Storage có vật lý đúng 1 file JPEG tối ưu/bộ tồn, không trùng đường dẫn, có SHA.
- Đồng bộ giá hai chiều trước khi kích hoạt để tránh bán khi giá Windows/Cloud chưa đối chiếu xong.
- Giữ lịch sử SOLD và ledger; không xóa thư mục ảnh gốc, không cập nhật nhánh phụ.

---
## Cloud sync deep-audit — 15/10/2026

- Kiểm thử bổ sung: số ảnh thực tế, ảnh đã SOLD vẫn phải ở lịch sử, thiếu file, sai Product/Size/SKU, trùng ID, ảnh Windows xóa khỏi ổ D, và đồng bộ lặp lại.
- Sửa bug Cloud đã phát hành trước: trước đây so tổng số bảng Cloud (bao gồm ảnh SOLD/lịch sử) với số ảnh Windows đang tồn. Khi bán/xóa ảnh, đồng bộ lại có thể báo sai dù dữ liệu đúng. Bây giờ kiểm theo từng ID bộ tồn, đối chiếu Product/Size/asset ready; ảnh SOLD giữ trong lịch sử, ảnh Windows đã xóa chỉ rút khỏi tồn Cloud (source_present=false), không xóa file ảnh gốc/hồ sơ.
- Chỉ kích hoạt sau khi tất cả ảnh tồn và Size được đối soát; không rút toàn kho nếu Windows tạm trả danh mục không có sản phẩm trong khi Cloud đã có hàng.
- Chưa nghiệm thu Cloud thực tế Windows/iPhone cho đến khi chủ shop chạy xác nhận trên máy. CI mô phỏng không thay thế nghiệm thu.

---
## Bảo vệ ảnh SOLD khi dùng lại file Cloud — 15/10/2026

- Đối chiếu SHA-256 để dùng lại file Cloud **chỉ khi file đó chưa được gán cho bộ tồn khác**, giữ nguyên quy tắc mỗi ảnh tồn là một bộ có nghiệp vụ SOLD độc lập.
- Thêm bảo vệ RLS không cho xóa một file Cloud vẫn phục vụ bộ hàng chưa SOLD, kể cả trường hợp logic dọn ảnh cũ/đơn bán có sai sót.
- Dọn ảnh test dư chỉ sau khi toàn bộ ảnh V8 khớp; những file Cloud còn được dùng vẫn giữ lại.

---
## Cập nhật đồng bộ Cloud theo SHA-256 — 15/10/2026

- Nguyên tắc mới: phát hành phiên bản Windows không được đổi kho Cloud. Đối chiếu ảnh theo SHA-256 JPEG đã tối ưu, không căn cứ phiên bản, tên ảnh hoặc ID.
- Tái sử dụng ảnh cũ trên Cloud khi hash trùng và Storage có file hợp lệ; nếu chưa có mới upload. Trùng nội dung giữa nhiều ID dùng chung một ảnh Cloud để tiết kiệm dung lượng.
- Supabase đã triển khai RPC `mc_v8_catalog_variants` sửa lỗi cũ Size 9 cột/7 giá trị; và `mc_v8_reuse_image` tái sử dụng ảnh mà không cần tải lại. Quét sau chỉ đăng ký ảnh chưa có và kiểm tra Product/Size.
- Hồ sơ Cloud test cũ được lưu trước khi tiếp nhận; 3.100 JPEG cũ chưa xóa. Chỉ xóa các bản ảnh cũ không còn được Cloud V8 sử dụng **sau** khi đối soát, kích hoạt Cloud và xác nhận của chủ shop.
- LOCAL V8 và ảnh gốc `D:\1-Me CaCao Store` giữ nguyên. Chưa nghiệm thu chạy thực tế qua Windows/iPhone; không suy diễn CI thành đồng bộ thành công.

---
# PROJECT_STATE — chốt nghiệm thu import kho thật ngày 15/10/2026

> **Trạng thái mới nhất (ưu tiên đọc trước hồ sơ bàn giao lịch sử bên dưới).**
> Ngày 15/10/2026, chủ shop đã trực tiếp **xác nhận import kho thật thành công trên laptop**. Đây là kết quả nghiệm thu do người dùng cung cấp, không phải suy luận từ CI. Không tiếp tục coi lỗi chặn chọn kho/import là lỗi P0 đang tái diễn nếu chưa có bằng chứng lỗi mới.

## Checkpoint đã chốt theo xác nhận chủ shop

- **P0/1 — Chọn và tiếp nhận kho `D:\1-Me CaCao Store`: ĐẠT theo xác nhận chủ shop** (việc import thành công chứng minh kho đã được tiếp nhận cho luồng đăng ký).
- **P0/2 — Import kho ảnh thật vào LOCAL V8: ĐẠT theo xác nhận trực tiếp của chủ shop ngày 15/10/2026.**
- Bản source/Release đã xác minh trước chốt: GitHub `main` `d48d5867692a778ab045161e942d82c7b6eceab4`, `v8.0.56-stable`, Windows workflow `38696788972` PASS, GitHub Pages workflow `38696788976` PASS. **Không khẳng định phiên bản chính xác đang chạy trên laptop nếu chưa có ảnh/API health xác nhận.**
- **Chưa có xác nhận riêng** rằng đã khởi động lại Windows và đối chiếu đầy đủ Product/Size/số ảnh sau lần chạy lại. Đây là mục kiểm tra bền vững dữ liệu sau import, không phủ nhận xác nhận import thành công.
- **Bước tiếp theo — P0/3, chưa nghiệm thu:** kiểm tra tồn vật lý sau thêm/xóa/khôi phục ảnh bằng Windows Explorer và quét/làm mới; 1 ảnh hợp lệ hiện hữu = 1 bộ; không sinh đơn/thu tiền giả; SOLD không quay lại tồn. Sau đó mới đến ba nghiệp vụ nhập, nghiệp vụ kinh doanh và Cloud.
- **Giữ nguyên kiến trúc:** một nhánh `main`, một SQLite LOCAL V8 tại `D:\ShopMeCaCao\data\shop-v8\database\shop-v8.db`, kho gốc `D:\1-Me CaCao Store`, không sửa/di chuyển/xóa ảnh gốc; cập nhật ứng dụng qua `Cài đặt → Kiểm tra & cập nhật` từ kênh STABLE.
- Ghi nhận này là **cập nhật hồ sơ trạng thái**, không thay đổi code nghiệp vụ, không reset dữ liệu và không tạo thêm database/nhánh.

---

# PROJECT_STATE — tiếp nhận và xử lý P0 ngày 15/10/2026

Hồ sơ đầy đủ của chủ shop được giữ bên dưới làm baseline. Mọi quy tắc V7 trước đây mâu thuẫn với hồ sơ này đều đã được thay thế.

## Đợt sửa P0 trước xác nhận của chủ shop (lưu lịch sử)

- Đã xác minh trước sửa: main `17f3289557fb261d93f57a5e71970fe6bc7d4f05`, Release `v8.0.54-stable`; Windows run 38680330286 và Pages run 38680330285 success.
- Dấu LOCAL lỗi/không khớp, BOM JSON, khóa mồ côi/PID tái sử dụng và marker của V8 đã ngừng dùng được đưa về luồng cảnh báo → chủ shop xác nhận tiếp nhận. Giữ bản gốc marker/lock trong data/shop-v8/warehouse-handoffs, gồm bytes base64; mỗi lần tiếp nhận có hồ sơ riêng.
- Không mở/chuyển database ghi trong marker cũ. Một database chính thức vẫn là D:\ShopMeCaCao\data\shop-v8\database\shop-v8.db. Không thay đổi ảnh gốc.
- Chặn tiến trình V8 khác khi runtime lock và command line hệ điều hành cùng xác nhận đúng bản cài đang chạy. PID sống đơn lẻ không chứng minh chủ kho cũ còn hoạt động. Giữ chặn đường dẫn không an toàn và việc đổi sang kho khác sau khi đã có dữ liệu nghiệp vụ.
- Cho phép chọn lại chính kho đã đăng ký mà không yêu cầu cài app/database mới. Sửa xuống dòng cảnh báo Import.
- Windows EXE gate bổ sung 5 trạng thái di sản, từ chối thiếu xác nhận, tiếp nhận có xác nhận, đăng ký qua background task như React, chống nhập trùng, chọn lại kho đã có hàng và giữ ảnh nguồn.
- Typecheck/build và toàn bộ npm run test:gate đã đạt trong môi trường phát triển. Bài xác minh live process cần Windows CI (môi trường hiện tại không đọc được /proc của child). Kết quả phát hành phải xem Actions đúng commit, không dùng PASS baseline.
- **Tại thời điểm ghi mục này, checkpoint chọn/quét/duyệt/đăng ký kho thật còn OPEN.** Sau đó, chủ shop đã xác nhận import thành công ngày 15/10/2026; xem phần trạng thái mới nhất ở đầu file. Kiểm tra sau khởi động lại vẫn chưa có xác nhận riêng.
- Cập nhật laptop chỉ qua **Cài đặt → Kiểm tra & cập nhật**. Sau khi Release mới được phát hành, đối chiếu tag và sourceCommit trong health; chọn **D:\1-Me CaCao Store**, xác nhận tiếp nhận nếu có cảnh báo, quét và duyệt lô.

---

# BIÊN BẢN BÀN GIAO / PROJECT STATE — SHOP MẸ CACAO V8

**Ngày chốt hồ sơ:** 15/10/2026 (Việt Nam)
**Dự án:** SHOP_MECACAO_WEB — Shop Mẹ CaCao
**Mục đích:** Chuyển nguyên trạng bối cảnh, quyết định, tiến độ và vấn đề chưa hoàn thành sang cuộc trò chuyện ChatGPT mới.
**Trạng thái tổng thể:** Mã nguồn V8 đã có Release chính thức, **NHƯNG CHƯA NGHIỆM THU CHẠY KHO ẢNH THẬT TRÊN LAPTOP**. Tuyệt đối không suy diễn CI PASS = người dùng đã nhập kho và đưa vào kinh doanh.

## 0. CHỈ THỊ CHO CUỘC TRÒ CHUYỆN MỚI (ĐỌC TRƯỚC TIÊN)

Tiếp tục phát triển **trực tiếp trên GitHub `main`**, dùng đúng một cơ sở dữ liệu LOCAL V8 và một kênh STABLE GitHub Releases. Người dùng đã cho phép thực hiện các thay đổi cần thiết qua GitHub và Supabase trong dự án, nhưng **không xóa dữ liệu thật, không đổi kho ảnh gốc, không reset Supabase** nếu chưa có căn cứ rõ ràng và ý định cụ thể.

**Ưu tiên số 1:** Khắc phục dứt điểm việc **chọn và import kho ảnh `D:\1-Me CaCao Store`** trên laptop. Chủ shop là chủ sở hữu kho, khi họ chọn kho phải có quyền tối đa để **xem cảnh báo → xác nhận tiếp nhận/bỏ qua dấu vết LOCAL/V7/phiên bản cũ → dùng kho V8 chính thức**, thay vì bị các khóa cũ chặn lặp đi lặp lại. Các dấu khóa/mốc sở hữu của phiên bản đã bỏ chỉ là dữ liệu di sản; có thể lưu hồ sơ để đối soát, nhưng không ép người dùng sửa file ẩn bằng tay. Chỉ nên chặn trường hợp **xác thực được xung đột ghi dữ liệu thực sự** từ hai tiến trình/DB V8 hoạt động đồng thời hoặc thao tác có nguy cơ làm mất dữ liệu, và thông báo rõ nguyên nhân/cách giải quyết. Không xóa/đổi tên/di chuyển ảnh nguồn. Phải có **kiểm thử EXE trên Windows** cùng tiêu chí nghiệm thu **trên laptop thật**, không chỉ kiểm thử tự động.

**Không tạo thêm PREVIEW/test branch/DB phân tán**. Chỉ có `main`, bản phát hành STABLE và một cơ chế **Cài đặt → Kiểm tra & cập nhật**; cập nhật giữ toàn bộ ảnh, database, cấu hình thực tế.

## 1. THAM CHIẾU KỸ THUẬT ĐÃ XÁC MINH

- Repository: https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB
- Nhánh đang tồn tại: **`main` (duy nhất)**, theo GitHub API tại thời điểm lập hồ sơ.
- HEAD `main`: **`17f3289557fb261d93f57a5e71970fe6bc7d4f05`**.
- Release mới nhất: **`v8.0.54-stable`**, non-prerelease, non-draft; có asset **`ShopMeCaCao-V8-STABLE-win-x64.zip`**.
- Trang Release: https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/releases/tag/v8.0.54-stable
- GitHub Actions phát hành Windows: run **38680330286**, **success**.
- GitHub Pages: run **38680330285**, **success**.
- Website: https://anphanguyen191-cell.github.io/SHOP_MECACAO_WEB/
- Giao diện Cloud tham chiếu: https://anphanguyen191-cell.github.io/SHOP_MECACAO_WEB/?cloud=1
- **Lưu ý:** tình trạng laptop là chứng cứ riêng. Ảnh người dùng gần nhất cho thấy mã đang chạy **`77f4fbf51566`**, tương ứng Release **V8.0.45**, trên giao diện vẫn hiển thị **8.0.0** trước khi sửa; chưa có ảnh xác nhận laptop đã lên V8.0.54, cũng chưa có bằng chứng kho thật đã import được.

## 2. KIẾN TRÚC & DỮ LIỆU CHUẨN

- Frontend: React + TypeScript + Vite; giao diện HTML/CSS tương tác nhanh, thống nhất desktop/iPhone PWA, ưu tiên đẹp và dễ sử dụng.
- Backend LOCAL: Node, SQLite (schema 130), hệ thống xử lý ảnh; EXE Windows bao gói runtime, không yêu cầu chủ shop tự chạy BAT/VBS/npm.
- Thư mục cài chính thức: `D:\ShopMeCaCao`.
- Database V8 máy chính: `D:\ShopMeCaCao\data\shop-v8\database\shop-v8.db`.
- **Kho ảnh thực tế user đang chọn:** `D:\1-Me CaCao Store` — **không tự thay bằng** `D:\Me CaCao Store`.
- Cấu trúc kho ảnh: `<KHO GỐC>\<Product>\<Size>\<ảnh>`.
- Ảnh nguồn và database phải tách khỏi các file Release/ứng dụng cập nhật.
- LOCAL Windows là nơi quản lý kho ảnh vật lý; Supabase phục vụ đồng bộ Cloud/mobile. Chỉ một lõi local V8; Cloud không được âm thầm trở thành kho local thứ hai.
- Khi update: tải bản STABLE từ GitHub Release, kiểm tra toàn vẹn, kiểm tra tiến trình/giao dịch, đổi phiên bản mã có rollback; không xóa `data`, kho ảnh, lịch sử đơn.

## 3. QUY TẮC NGHIỆP VỤ ĐÃ CHỐT — TỒN ẢNH

**QUY TẮC CUỐI CÙNG (thay thế yêu cầu cũ): 1 FILE ẢNH TỒN THỰC TẾ = 1 BỘ TỒN. SỐ LƯỢNG TỒN PHẢI BẰNG SỐ FILE ẢNH HỢP LỆ THỰC TẾ.**

- Kích thước/Size có 20 ảnh → tồn 20. Xóa 3 ảnh trực tiếp trong Windows Explorer → sau khi làm mới/quét tồn còn 17. Phục hồi 1 ảnh → tồn 18.
- Thêm ảnh vào thư mục Product/Size đã biết: tồn vật lý tăng tương ứng. Ảnh **chưa duyệt/đăng ký** được báo chờ duyệt; vẫn tính vào số đếm file vật lý, nhưng **không được chọn bán** trước khi duyệt.
- Ảnh của Product/Size hoàn toàn mới phải được phát hiện trong lần quét và đưa vào quy trình đăng ký, tránh bỏ sót.
- Không cộng dồn theo số lần quét; quét lặp phải idempotent.
- Ảnh SOLD không được tính tồn chỉ vì còn bản lưu ảnh nhỏ để phục vụ chứng từ/hậu kiểm.
- Ledger nhập/xuất chỉ phục vụ đối soát, không áp đặt số lượng tồn trái với kiểm đếm file. Xóa ảnh trực tiếp **không tự tạo đơn bán, doanh thu, công nợ, lịch sử thanh toán**.
- Khi đường dẫn/ổ đĩa không truy cập được, phải báo **không thể kiểm đếm**, không được âm thầm tính tồn bằng 0 rồi ghi đè dữ liệu.
- Cần đảm bảo làm mới tồn nhanh khi người dùng xóa/thêm ảnh trực tiếp; yêu cầu trải nghiệm **gần realtime**, có quét thủ công/lúc mở/định kỳ phù hợp hiệu năng.

Tại `main`, `inventoryQuery.ts` và `physicalInventory.ts` đã có tính toán ảnh thực tế (gồm ảnh chờ duyệt ở Product/Size đã biết), nhưng **chưa được người dùng nghiệm thu bằng kho thật**, và việc phát hiện Product/Size hoàn toàn mới vẫn cần kiểm chứng qua Import kho.

## 4. QUY TRÌNH KHO MỤC TIÊU

**Lần đầu chạy V8 chính thức:**
1. Mở EXE → **Import kho**.
2. Chọn trực tiếp **`D:\1-Me CaCao Store`**; xem số sản phẩm, Size, ảnh dự kiến; không đẩy qua một menu khác để chọn thư mục.
3. Nếu phát hiện khóa/dấu sở hữu cũ: chỉ giải thích **cảnh báo** và cho chủ shop **Xác nhận tiếp nhận kho này**. Dữ liệu dấu cũ được lưu ở khu vực dữ liệu V8 để đối soát; ảnh nguồn nguyên vẹn. Nếu có nguy cơ hai phiên bản V8 cùng ghi vào hai database đang chạy, báo rõ chi tiết và cách tắt tiến trình kia — không mặc định mọi PID cũ là đang chạy Shop.
4. **Quét đọc thuần** ban đầu, không tự ý thay đổi Product/Size, tên file, hay đăng ký dữ liệu.
5. Màn duyệt cho phép chọn toàn bộ/nhóm Product/Size, kiểm tra ảnh, số lượng, giá vốn/giá bán, cảnh báo trùng.
6. Xác nhận đăng ký kho vào một database V8 duy nhất; thanh tiến độ rõ, rollback khi lỗi.
7. Dashboard, Danh mục sản phẩm và Tồn kho phải khớp số ảnh thực tế, kể cả sau khởi động lại.

**Nhập hàng (khác Import kho gốc):** hỗ trợ 3 luồng độc lập: (i) Product hoàn toàn mới; (ii) thêm Size mới cho Product đã có; (iii) bổ sung ảnh/đồ cho Product–Size đã có. Nguồn nhập là thư mục ngoài kho; chỉ COPY ảnh vào kho chính, không cắt/xóa ảnh nguồn. Số lượng của Size = số ảnh hợp lệ được nhập; kiểm tra ảnh trùng/hash/tên, rollback khi lỗi; đơn giá vốn/bán theo Size. Ảnh mới cần duyệt nếu chính sách hiện hành yêu cầu. Đã có kiểm thử giả lập 3 luồng qua Windows CI, **chưa có kiểm chứng từ kho ảnh thật của chủ shop**.

## 5. LỖI THỰC TẾ CHƯA NGHIỆM THU — CỰC KỲ QUAN TRỌNG

Người dùng liên tục gặp các lỗi khi chọn `D:\1-Me CaCao Store`:
- `Kho đang thuộc bản cài khác; chọn thư mục chưa được bản khác sử dụng`.
- `Kho có khóa LOCAL không rõ chủ, không thể chuyển quyền`.
- `Chưa xác nhận được phiên bản LOCAL cũ đã dừng. Đóng phần mềm cũ trước khi tiếp nhận kho.`

**Người dùng khẳng định chỉ còn bản V8 chính thức vận hành; các phiên bản trước không còn sử dụng.** Người dùng muốn quyền chủ shop ưu tiên: có thể thấy cảnh báo, chọn chấp nhận dùng kho, **không bị khóa/marker phiên bản cũ ngăn cản**.

Kiểm tra code `apps/api/src/warehouseOwnership.ts` tại `main` V8.0.54 cho thấy **vẫn có các trường hợp chặn**: marker LOCAL bị lỗi/mismatch, marker V8 thuộc đường dẫn/DB khác, `inspectWarehouseOwner` với legacy owner + PID đang sống, và khóa orphan không hợp lệ. Chế độ `allowUnverified` mới chỉ xử lý một số tình huống khóa orphan PID không xác minh được. Vì vậy **không được tuyên bố yêu cầu quyền tối đa của chủ shop đã hoàn thành**. Cần audit lại toàn bộ preflight → POST chọn kho → `validateNewWarehouse` → `inspectWarehouseOwner`/`adoptWarehouse` → quét kho → thử trên laptop.

**Một lỗi giao diện khác đã phát hiện:** bản V8.0.45 chạy mã đúng Release nhưng vẫn hiển thị `8.0.0` do hardcode. V8.0.54 đã thêm metadata Release thực tế và kiểm chứng commit đang chạy trong CI; **chưa có xác nhận trên laptop thực tế**.

### Hướng sửa bắt buộc tiếp theo

- Thống nhất một màn **Chọn kho / Tiếp nhận kho cũ**. Có cảnh báo ngắn và một lựa chọn chủ động để chủ shop nhận quyền quản lý chính thức.
- Không buộc chủ shop tìm, xóa hoặc chỉnh các file `.mecacao-local-active.json` / `.mecacao-local-runtime.lock`.
- Thông tin marker cũ không có giá trị áp chế chủ shop; được lưu lại an toàn khi tiếp nhận. Không dùng việc nhận diện PID không chắc chắn để chặn vô thời hạn.
- Vẫn bảo vệ chống **hai tiến trình thực sự đang ghi cùng database/kho** và chống mất dữ liệu bằng xác thực rõ ràng; không biến “quyền tối đa” thành tự động ghi đè database khác hoặc xóa ảnh.
- Phải thử chính xác dữ liệu biên: marker format cũ, thiếu marker/chỉ có lock, PID sống nhưng đã bị hệ điều hành tái sử dụng, marker lỗi/khác đường dẫn, kho thật chứa hàng nghìn ảnh, và phiên bản V8 đã được cài đặt cập nhật nhiều lần.
- Chặn phát hành chính thức nếu không có bài test Windows EXE kiểm chứng tiếp nhận kho bằng xác nhận của chủ shop; **test PASS chưa thay cho nghiệm thu laptop thật**.

## 6. CẬP NHẬT VÀ PHÁT HÀNH

- `main` là nhánh duy nhất. GitHub Actions phát hành **STABLE** sau test. Không tạo thêm nhiều nhánh/bản `PREVIEW` gây nhầm dữ liệu.
- Đường dẫn tải file ở Release; người dùng đang dùng V8 STABLE **chỉ bấm `Cài đặt → Kiểm tra & cập nhật`**, không cần cài lại sau mỗi lần sửa lỗi.
- Nút cập nhật phải hiển thị **tag Release**, mã commit trước/sau, quá trình kiểm tra tải file và trạng thái backend. Chỉ xác nhận thành công nếu **mã đang chạy** khớp với bản tải và đã mở được hệ thống.
- Không viết cứng `8.0.0` khi Release đã lên V8.0.54.
- Kiểm thử update thực tế từ phiên bản cũ trên laptop. Nếu người dùng vừa cập nhật nhưng thấy hành vi cũ, ưu tiên kiểm tra `active.json`, `update-status.json`, `/api/health`, tag đang chạy; không kết luận “chưa cập nhật” chỉ dựa vào nhãn cũ.

## 7. CÁC CHỨC NĂNG V8 KHÁC PHẢI GIỮ VÀ KIỂM CHỨNG

- Giao diện Modern Web App/Premium Retail: sáng, sạch, màu Shop Mẹ CaCao (pastel/coral/mint), tên shop, slogan **“Tole xinh cho bé yêu!”**, Since 2023. Dashboard đầu trang thu gọn được; sidebar rõ; popup đẹp; 3 mật độ Nhỏ/Vừa/Lớn; iPhone safe area.
- Tìm kiếm Product/Size, cây kho Product → Size → ảnh, gallery nhiều ảnh, chọn hàng loạt, panel thao tác nổi thu gọn được, chia sẻ nhanh Zalo/Messenger.
- Cảnh báo ảnh nằm trong đơn nháp khác; đơn nháp không tự giảm tồn. Ghi SOLD phải có nghiệp vụ chính thức, chứng từ và lịch sử bất biến; ảnh gốc bán và ảnh bản sao/Cloud theo chính sách đã duyệt.
- Khách hàng, hóa đơn PNG, ship, COD/chuyển khoản, đã thu/còn lại, công nợ, sửa/hủy/hoàn hàng; báo cáo doanh thu, giá vốn, lợi nhuận, kiểm kê.
- Xuất tồn Excel theo Product/Size/số lượng/giá vốn/giá bán/tổng; người dùng được điền số liệu thiếu và import hàng loạt trở lại **không trùng dữ liệu**. Trạng thái triển khai chi tiết tính năng này **cần kiểm tra trên repo trước khi tuyên bố hoàn thành**.
- Đồng bộ LAN Windows/iPhone; Cloud Supabase đăng nhập qua email, lưu phiên đăng nhập, cập nhật tồn/đơn có cơ chế đồng bộ thống nhất; ảnh Cloud nén ~150 KB và dọn ảnh SOLD có kiểm soát. **Chưa có bằng chứng nghiệm thu đồng bộ Cloud thực tế từ người dùng**, không tự xóa dữ liệu Supabase.
- Theo dõi tiến độ nhập, thông báo kết quả/hàng chờ duyệt, không che mất thao tác trên di động. Hiệu năng kho nhiều nghìn ảnh: thumbnail caching, lazy load, giới hạn truy vấn, quét không làm treo UI.

## 8. QUY TRÌNH PHÁT TRIỂN / CHECKPOINT

**Checkpoint 1 (P0) — Chọn kho thật:** đọc & sửa toàn bộ code chặn kho; hợp nhất quyền chủ shop và cảnh báo/tiếp nhận kho cũ; test Windows EXE; phát hành STABLE; người dùng xác nhận chọn được `D:\1-Me CaCao Store`.

**Checkpoint 2 (P0) — Import kho thật:** quét toàn bộ cấu trúc Product/Size/ảnh, hiển thị số liệu, duyệt và đăng ký vào SQLite V8, không trùng; nghiệm thu sau restart Windows.

**Checkpoint 3 (P0) — Tồn vật lý:** xóa/copy ảnh bằng File Explorer, quét/làm mới ngay; Dashboard/Size/danh mục khớp; không tạo doanh thu/đơn giả, SOLD không quay lại tồn.

**Checkpoint 4 (P1) — Nhập hàng:** test đủ 3 luồng nhập, ảnh nguồn giữ nguyên, số lượng bằng số ảnh, giá vốn/bán, rollback nhập trùng.

**Checkpoint 5 (P1) — Nghiệp vụ kinh doanh:** draft/đơn/SOLD/COD/công nợ/hoàn trả/báo cáo, rồi Excel giá vốn/giá bán hàng loạt.

**Checkpoint 6 (P1) — Mobile/Cloud:** chỉ sau khi LOCAL đủ chắc, nghiệm thu đăng nhập, realtime, đồng bộ đơn và ảnh, cleanup Cloud an toàn.

Mỗi checkpoint: **nêu rõ thay đổi → kiểm thử source + GitHub Actions + EXE khi phù hợp → commit `main` + Release STABLE → người dùng test trên laptop → đánh dấu PASS thực tế → cập nhật PROJECT_STATE**. Người dùng đã trao quyền triển khai liên tục, chỉ cần thông báo gọn khi đạt mốc; không hỏi lại từng sửa đổi nhỏ.

## 9. BẰNG CHỨNG VÀ TRẠNG THÁI PHÁT HÀNH (KHÔNG NHẦM)

- V8.0.54 STABLE đã phát hành; cả Windows Release và Pages CI đều thành công trên commit `17f3289557fb261d93f57a5e71970fe6bc7d4f05`.
- CI Windows từng PASS các bài test chọn kho và nhập hàng giả lập, nhưng **ảnh chụp laptop người dùng vẫn cho thấy bị chặn kho**. Đây là bằng chứng CI chưa bao phủ đủ dữ liệu di sản trên máy người dùng.
- Đặc biệt, yêu cầu mới nhất **bỏ mọi rào cản khóa phiên bản cũ và cho chủ shop tự quyết định tiếp nhận** chưa được nghiệm thu và có thể chưa đáp ứng trọn trong bản mới nhất. Phải coi là **OPEN / P0**.
- Không có cơ sở để tuyên bố kho ảnh thật đã đăng ký thành công hay dữ liệu Cloud đã đồng bộ hoàn chỉnh.

## 10. NHỮNG VIỆC TUYỆT ĐỐI KHÔNG LÀM

1. Không đề xuất gỡ app/cài sạch/xóa folder ảnh chỉ để vượt lỗi marker.
2. Không xóa file ẩn trong kho bằng tay nếu chưa hiểu logic sở hữu; bản vá phải xử lý qua giao diện xác nhận.
3. Không tạo thêm database local mới mỗi lần cập nhật; không trộn kho test vào kho thật.
4. Không xóa ảnh hoặc dữ liệu Supabase tùy tiện.
5. Không ghi “STABLE hoàn thiện” chỉ dựa trên CI PASS khi laptop người dùng vẫn lỗi.
6. Không nhập số lượng tồn độc lập trái quy tắc 1 ảnh = 1 bộ.
7. Không làm thêm Cloud/marketing/UI trong khi bước chọn kho gốc vẫn thất bại.

## 11. YÊU CẦU TRẢ LỜI ĐẦU TIÊN CỦA TRỢ LÝ TRONG CHAT MỚI

Tiếp nhận nguyên trạng hồ sơ này. Kiểm tra **GitHub `main`/Release/CI mới nhất ngay trước khi sửa**, vì HEAD có thể thay đổi sau ngày 15/10/2026. Ưu tiên phân tích/sửa `apps/api/src/warehouseOwnership.ts`, `apps/api/src/freshDevelopment.ts`, `apps/api/src/server.ts`, `apps/web/src/WarehouseImport.tsx`, `scripts/v8/smoke-desktop.ps1`, `apps/web/src/WindowsUpdate.tsx`, `scripts/v8/node-runner.mjs` cùng logic khởi tạo SQLite/khóa runtime. Đối chiếu thông báo lỗi thực tế với các nhánh code; đưa **quyền nhận kho của chủ shop** thành luồng rõ ràng, vẫn an toàn cho ảnh và dữ liệu. Thực hiện commit trên `main`, theo dõi CI, tạo STABLE, hướng dẫn cập nhật một nút. **Chỉ tuyên bố hoàn tất khi chủ shop xác nhận import được kho thật.**

---
**KẾT LUẬN BÀN GIAO:** Mã nguồn và kênh STABLE đã có, nhưng nghiệm thu kho ảnh gốc vẫn **CHƯA ĐẠT**. Ưu tiên duy nhất của phiên làm việc kế tiếp: **dứt điểm quyền chọn/tiếp nhận kho `D:\1-Me CaCao Store` và thực hiện thành công import kho trên laptop thật**. Các tính năng tiếp theo chỉ được triển khai sau khi nút thắt này được tháo gỡ.
