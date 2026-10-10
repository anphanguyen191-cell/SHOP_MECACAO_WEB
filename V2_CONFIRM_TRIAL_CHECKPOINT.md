# V2 — Luồng thử xác nhận từ UI đến transaction (2026-10-10)

Chủ shop yêu cầu tiếp tục hoàn thiện V2. Đợt này nối nền atomic commit vào **thử xác nhận trên bản sao** trong sandbox: database→orchestrator→API→UI→status/recovery→regressions. Đây là rehearsal có nhãn rõ, **không phải bán vận hành**. Nháp, ảnh, ledger và tồn nguồn giữ nguyên. Không đổi schema nguồn110/120, không ghi SALE/SOLD/claim vào DB đang dùng, không xóa ảnh.

## Đã triển khai

- Sau Kiểm tra toàn đơn đạt, UI có Thử xác nhận trên bản sao. Checkbox nói rõ phạm vi; hàng giá0 cần xác nhận riêng. Nút pastel thống nhất, gọn/mobile/sáng-tối, loading/error và số bộ/giá trị/dung lượng gốc→bản nhẹ thực tế.
- Orchestrator `salesConfirmTrialService` chỉ nhận DB120 sandbox. Client chỉ gửi version/token/ack, không gửi path/giá/kế hoạch ảnh. Server revalidate token, VACUUM snapshot DB, COPY byte-exact ảnh chọn, tạo JPEG1280/82 từ đúng bytes đã hash, decode+SHA lại, remap selected image IDs **trong DB clone**, migration129+backup clone, journal/stage rồi atomic commit.
- Bản thử nằm tại `sandbox/.mecacao-v2-recovery-lab/confirm-runs/<SHA request key>`, DB/clone/staging/archive tiếp tục nằm trong lab riêng. Source metadata/IDs/ledger/bytes giữ nguyên; file nguồn không MOVE/rename/xóa. Chỉ xử lý một lần thử trên sandbox cùng lúc để hạn chế RAM/CPU; ảnh được làm lần lượt.
- Intent ghi durable trước tạo bản sao; key+payload hash chống request khác nội dung. Retry cùng key trả trạng thái đúng lần thử, không tạo bản sao/giao dịch mới. Lần dở không tự tiếp tục ghi đè hoặc bị xóa; key mới chỉ tạo khi chủ shop chọn rõ.
- API sandbox có POST `/:id/confirm-trial`, GET `/:id/confirm-trials/:requestKey`, POST `/:id/confirm-trials/:requestKey/recover` dưới `/api/sales/drafts`, dùng gate loopback/origin hiện có. Không có `/confirm` bán thật và không mở LAN.
- UI giữ request key trong localStorage theo draft/version/token. Khi mở lại cùng đơn và kiểm tra lại, tìm đúng lần thử. Mất phản hồi không tự gửi một key mới; có Kiểm tra trạng thái. RUNNING chưa phải thất bại/thành công, PREPARED có thể phục hồi clone, INCOMPLETE/RECOVERY_REQUIRED dừng review.
- SOLD_TRIAL chỉ báo khi DB evidence đầy đủ, staged originals còn đúng SHA và JPEG liên kết giải mã/hash đạt. Sau toàn bộ async decode, revalidate originals/derivatives lần nữa. DB đã commit nhưng chưa viết ready marker vẫn nhận ra bằng SQLite; không bán lại hoặc trả clone về canonical.
- Trước commit có thể bấm Phục hồi ảnh bản sao. Recovery đọc quyết định DB/journal thật, all-file preflight, no-overwrite; durable restored marker để mở lại thấy RESTORED_TRIAL. Không replay commit sau recovery.
- Trong lúc trial/status đang xử lý, giao diện khóa sửa/hủy/thêm ảnh/đổi đơn và xử lý ảnh nặng liên quan. Server vẫn revalidate nếu một cửa sổ khác sửa nguồn giữa preparation. Snapshot là tại lần thử, không phải khóa/claim hàng nguồn.
- Internal archive/recovery folders bị loại khỏi scanner/import/path picker access và physical stock/images/share, cả lexical path và canonical alias. Nếu metadata sai đã đăng ký ảnh internal làm tồn, full lossless backup dừng trước tạo bundle để review, không âm thầm bỏ sót. Không tự sửa/xóa metadata.

## Giới hạn phải hiểu đúng

- Có thể thử cùng bộ trong nhiều bản sao độc lập; **không phải** bán cùng hàng ở nhiều đơn vận hành. UNIQUE chống tranh hàng nằm trong mỗi DB bán; nền hai-process contention đã được kiểm chứng riêng ở V2_ATOMIC_COMMIT_CHECKPOINT.md.
- Bản thử được giữ để đối chiếu, có phát sinh dung lượng. Chưa tự dọn và chưa có retention policy. **Không nằm trong backup kho đang dùng**, có nhắc ngay trên UI; nó không chứa nghiệp vụ SOLD thật của nguồn. Backup/restore SOLD vận hành vẫn phải thiết kế/nối riêng.
- Không mở server129 để vận hành: launcher110/120/restore từ chối schema thử. Bản gốc staging của clone chưa bị xóa; chất lượng1280/82 vẫn là đề xuất cần xem trước, chưa duyệt cleanup sau bán thật.
- Chưa có danh sách/ảnh nhẹ lịch sử SOLD vận hành; card chỉ kết quả snapshot rehearsal. Mobile ở đây là responsive UI, không mở dữ liệu Windows qua LAN/Internet.
- fsync/process-kill evidence không thay thử cúp điện/hỏng ổ. V1 restore Windows owner acceptance/STABLE và V2 sale release vẫn pending.

## Kiểm chứng

`test:sales-confirm-trial` vào gate Linux/Windows22/24. Có **18 hard-exit points**: intent, database, clone/archive ảnh0/1, PREPARED, linked/staged ảnh0/1, trước DB, sale-row, image0/1, trước/sau COMMIT và READY. Restart xác định đúng pre-commit/SOLD_TRIAL, recover/retry giữ source rows/ledger/photos. Kiểm tra zero/stale/concurrency/symlink/checksum đổi trong async verification và metadata cố tình đăng ký internal image: stock/images/share/scan/full-backup phải fail closed.

HTTP thật: origin/checkbox/version/token/key guards, commit/retry/status, source DRAFT+stock unchanged, scanner/import denied for recovery area; source backup/restore + archived previews vẫn chạy. Chromium: checkbox→trial success→status→reload→mở đúng đơn→kiểm tra→resume đúng key→sửa giảm giá/lưu→trial49k; screenshots1366/390 sáng/tối và không tràn ngang.

Baseline36eb5c4 Actions38019637655 tất cả SUCCESS. Không lấy baseline để báo CI mới; phải xác minh exact commit đợt này. Chromium local không có, browser evidence ở Linux Actions.

## Bro test Windows đợt mới

1. Giải nén source mới; chạy RUN_WINDOWS_V2_DRAFT_TEST.bat, mở http://127.0.0.1:3006.
2. Vào Bán hàng, mở một nháp đã lưu → Kiểm tra toàn đơn.
3. Đánh dấu hiểu chỉ dùng bản sao (và giá0 nếu có) → Thử xác nhận trên bản sao. Chờ card báo bản sao đã xác nhận, đúng số bộ/tiền/dung lượng.
4. Bấm Kiểm tra trạng thái. F5, vào Bán hàng, mở đúng nháp, kiểm tra toàn đơn: phải hiện lại kết quả lần thử. Không tạo key mới âm thầm.
5. Mở Tồn kho/Tổng quan/Danh mục: tồn nguồn vẫn như trước; đơn nguồn vẫn NHÁP. File ảnh nguồn giữ nguyên. Trial không phải chốt bán nguồn.
6. Sửa giảm giá/lưu rồi kiểm tra lại; kết quả cũ không dùng cho phiên bản mới. Có thể thử phiên bản mới để đối chiếu tiền.

## V2 còn lại

Promotion schema/migration vận hành trên verified backup clone; coordination lock cho mọi mutation/đọc tồn/backup; source-image SOLD eligibility trên mọi tab; confirm API/idempotency/operation status thật + UI/history; role-aware AVAILABLE original/SOLD derivative/staging manifests và full restore; Windows nghiệm thu bán/restart/restore; duyệt quality/cleanup trước xóa nguồn. Không coi rehearsal PASS là V2 STABLE.
