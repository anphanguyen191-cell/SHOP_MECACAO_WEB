## Global UI Refresh — Checkpoint 1–5 (2026-10-11, WIP)
- Chuẩn hóa màu viền thẻ Dashboard, Danh mục và Tồn kho; cải thiện độ rõ nội dung ở dark mode.
- Đồng bộ các khối biểu mẫu Nhập hàng, Bán hàng, Khách hàng, Tài chính, Công nợ, Báo cáo, Kiểm kê, Ảnh SOLD, Ảnh iPhone và Cài đặt.
- Chỉ bổ sung stylesheet `globalUIRefresh.css` sau các CSS cũ và kiểm tra nguồn; không thay API, schema, transaction hay ảnh.
- Chưa nghiệm thu visual Windows/iPhone thật, không đánh dấu STABLE.

## 3.3.1-stage6-main-test — 2026-10-11
- Theo yêu cầu chủ shop: chọn kho tự tạo trên laptop qua UI, không cần marker/CREATE_MAIN_TEST_WAREHOUSE.bat; dùng đầy đủ nhập/scan/import/rename/bán/tiền/backup như LOCAL.
- Giữ fresh DB bản cài, chọn kho trước khi có dữ liệu, tự restart và mở lại giữ kho. Giữ chặn root/app-data/symlink/kho bản cài khác, transaction/recovery và quyền LAN.
- HTTP/launcher browser acceptance dùng kho tạm không marker; kiểm thử tự động vẫn chỉ giả lập. Chưa nghiệm thu thiết bị thật/STABLE.

## MAIN TEST — 3.3.0-stage6-main-test (chưa STABLE) — 2026-10-11
- Stage 5A kiểm chứng và giữ nguyên ảnh SOLD; Stage 6C/6D HTTPS LAN, xác thực vai trò, kiểm toán, đồng bộ và ảnh chờ từ iPhone được chuẩn bị tích hợp MAIN TEST.
- Database riêng `data/stage6-main-test/database/shop-stage6-main-test.db`. Windows launcher chỉ cho chọn kho thử có marker; `CREATE_MAIN_TEST_WAREHOUSE.bat` tạo ảnh fixture. Không tự chuyển `data/stage4` hoặc cộng ảnh iPhone vào tồn.
- Không mở Internet, không xoá ảnh, chưa nghiệm thu trực tiếp Safari/Windows. CI commit MAIN TEST phải PASS trước khi merge.

## WIP — Checkpoint 6C iPhone photo inbox (chưa main / chưa STABLE) — 2026-10-10
- Thêm ảnh iPhone vào vùng chờ, kiểm tra JPEG/PNG/WebP, SHA-256, dung lượng và chống ảnh trùng/SOLD; chủ shop Windows duyệt bản sao, không cộng tồn. Trình duyệt có thể chuyển HEIC sang JPEG.
- Bổ sung API role owner/inventory và chặn duyệt bản sao qua LAN; giữ nguyên ảnh gốc, chờ xác nhận Nhập hàng Windows. Chưa nghiệm thu camera iPhone / kho thật.

## WIP — Stage 5A + UI Refresh + Stage 6 LAN Preview (nhánh riêng, chưa main) — 2026-10-10
- SOLD retention read-only, Global UI tokens, HTTPS LAN opt-in/auth/RBAC/audit và test dual-client; chờ CI cuối + Windows/iPhone nghiệm thu; không xóa ảnh, không dùng kho thật.

## 3.2.0-stage4 — 2026-10-10
- Báo cáo ngày VN: SOLD/doanh số/ship/sản phẩm, thu/hoàn/giảm, công nợ hiện tại, lãi gộp snapshot/thiếu vốn và xuất CSV an toàn.
- Phiên kiểm kê theo Size: snapshot tồn ảnh/sổ/thiếu/SOLD, đếm/chênh/lý do, version/hash/kho thay đổi, chốt/hủy bất biến và CSV. Không tự điều chỉnh tồn.
- Backup/restore giữ kiểm kê; dữ liệu fresh stage4, cùng START_SHOP.bat và chức năng chặng1/2/3.
- Local service78, HTTP77, fullgate PASS; CI Windows/Linux/browser chạy mã mới. Checkpoint tổng hợp: MAIN_CHECKPOINT_STAGE4_2026-10-10.md.

## 3.1.0-stage3 — 2026-10-10
- Thu tiền/cọc nhiều lần, COD/chuyển khoản/tiền mặt; hoàn/điều chỉnh, số dư/công nợ và giao hàng/vận đơn độc lập với SOLD.
- Chứng từ bất biến, revision/order version, transaction và same-key retry; UI giữ pending intent qua reload.
- Công nợ theo khách/đơn; yêu cầu đổi/trả/hỗ trợ và kết quả hậu mãi không ghi đè.
- PNG có hình thức/đã thu/còn lại/cần hoàn, bảo vệ revision thanh toán; backup/restore giữ sổ tiền và hậu mãi.
- Nhập hàng không tái sử dụng đường dẫn của ảnh đã đăng ký/bán.
- Một launcher main, dữ liệu phát triển stage3 mới; giữ toàn bộ chức năng chặng 1/2.
- Service53, HTTP56, toàn bộ gate, CI Windows/Linux/browser cho mã mới. Chi tiết và giới hạn: STAGE3_PAYMENTS_AFTERCARE.md.

## Checkpoint main đầy đủ — 2026-10-10
- Xác nhận runtime 3.0.1-stage2 trên main (`099386a`), Actions 38042560022: Linux, Windows 22/24, browser và deploy SUCCESS.
- Tổng hợp toàn bộ chức năng, nguyên tắc, kiến trúc/dữ liệu, bằng chứng và giới hạn trong MAIN_CHECKPOINT_2026-10-10.md.
- Đồng bộ PROJECT_STATE/ROADMAP/hướng dẫn chặng 2; sửa trạng thái khách/PNG BACKLOG đã lỗi thời, thống nhất START_SHOP.bat.
- Giữ nhật ký PROJECT_STATE cũ trong docs/history. Cập nhật tài liệu, không đổi runtime hoặc triển khai chặng 3.

## 3.0.1-stage2 — 2026-10-10
- Tăng tương phản giao diện sáng, tách nhóm chức năng xanh/cam/tím, giữ palette tối.
- Launcher Windows main thống nhất; chọn kho ngay trên UI trước khi nhập dữ liệu, tự restart.
- DB mới theo bản cài, kho chọn DIRECT, không kế thừa DB thử cũ.
- Hiển thị phiên bản/chặng hiện tại và phần tiếp theo chưa triển khai.

# Chặng 2 — bản phát triển đầy đủ, dữ liệu mới — 2026-10-10

Giữ chức năng chặng 1; thêm danh mục khách, cảnh báo điện thoại trùng, snapshot giao hàng, phí ship/miễn ship, phiếu PNG có ảnh hàng và nhiều trang. START_SHOP_CHANG_2.bat mở bản LOCAL dùng dữ liệu mới của thư mục cài, nhập ảnh từ UI bằng COPY. Cập nhật README, checkpoint và CI Linux/Windows/browser. Chưa bổ sung nghiệp vụ chặng 3.

# Restore result regression fix — 2026-10-10

Review for owner Windows instructions found schema130 restore result missing counts consumed by UI. Return verified row counts, make UI resilient, show correct V2 sales restore launcher, and add real Chromium full-backup→restore READY result coverage. Tests and exact CI must be checked on new commit. This supersedes b001faf for owner download.

# Checkpoint 2026-10-10 — V2 sales sandbox130

Owner requested whole-flow Windows test. Added opt-in actual sandbox sale + immutable SOLD history/relative evidence, coordinated HTTP/watch lock and recovery, role-aware full backup/portable restore and new port3007/3016 launchers. Originals retained; default110 and draft120 unchanged. Scope: `V2_SALES_SANDBOX_CHECKPOINT.md`; acceptance: `WINDOWS_V2_SALES_TEST.md`. Latest CI must be checked for final commit. Not business release/STABLE; image quality/cleanup and owner full Windows/restore acceptance pending. Historical checkpoints below describe earlier revisions.

## 2026-10-10 — V2 copied-only confirm trial UI/API

Connected preflight to trusted copy/derivative/staging/atomic-commit orchestration on cloned DB/photos, persistent same-key trial status/resume/recovery and explicit responsive themed UI. Added eighteen hard-exit points and real HTTP/browser replay tests. Protected internal trial areas from stock/import/share and stopped full backup on invalid internal registrations. No operational sale, source migration/deletion or SOLD backup release; see V2_CONFIRM_TRIAL_CHECKPOINT.md.

## 2026-10-10 — V2 copied-DB atomic commit foundation

Added isolated schema129 prototype: backup migration, atomic SOLD/UNIQUE image claims/SALE ledger, immutable snapshots, request-key idempotency, current-cost/zero-price guards and DB-derived staging recovery. Added eleven hard-exit points and real two-process contention tests to the Linux/Windows gate. Not mounted by server/UI; no live stock/schema/file mutation or deletion. See V2_ATOMIC_COMMIT_CHECKPOINT.md.

## 2026-10-10 — V2 whole-order preflight

Added read-only physical-image/decode/checksum gate and per-unit review in draft editor, with version/token revalidation, overlap/zero-price/cost warnings and desktop/mobile light/dark UI. Regression coverage includes changed/missing/corrupt images and report invalidation after saving edits. No SALE/SOLD/deletion; see V2_PREFLIGHT_CHECKPOINT.md.

# 2026-10-10 — Full restore và backup archive V2

Restore schema110/120 sang kho/database mới, byte-exact + ID/history preservation, SHA/integrity/FK/READY guards and seven hard-exit checks. Full V2 sandbox backup includes completed trial archives; pending/busy/corrupt sets fail closed. Cài đặt restore flow and Windows launcher3016 with V1/V2 choice. No live-DB switch, sale or original deletion. Details: V2_BACKUP_RESTORE_CHECKPOINT.md.

# 2026-10-10 — V2 lưu thử / phục hồi

Durable derivative save/verify/recover, SHA/version guards, idempotent retained trial sets and pastel UI. Scanner/import exclude trial archive. Isolated cloned-file staging lab checks nine hard-exit points; no real sale/cleanup/schema changes. See V2_ARCHIVE_RECOVERY_CHECKPOINT.md.

# 2026-10-10 — V2 ảnh nhẹ xem trước

Sandbox nháp: so sánh ảnh gốc/JPEG 1280 quality82, dung lượng thật, guards version/hash/decode, UI pastel sáng/tối/mobile. Chỉ đọc, không bán/xóa/đổi tồn/schema. Chi tiết: V2_IMAGE_PREVIEW_CHECKPOINT.md.

## 2026-10-10 — Draft duplicate choice and UI polish

- Require explicit, transaction-revalidated choice before placing the same physical image in another draft; identify related orders, exclude cancelled/current draft, preserve idempotent retry and no reservation.
- Styled accessible conflict dialog, overlap badges and pastel primary/add/remove/secondary buttons with mobile/dark states; record mandatory feature + workflow + UI principles.
- Regression coverage for decline/accept, stale token, same Product/Size different unit and unchanged data.

## 2026-10-10 — V2 draft sandbox foundation

- Owner authorized continuation: isolated schema120 migration backup/rollback and draft CRUD with idempotent create, optimistic version, price validation and snapshots; no stock reservation/SALE/image mutation.
- Sandbox-only Bán hàng UI linked to inventory selection; add/remove images, edit/cancel/reopen; separate Windows V2 launcher port3006 and acceptance steps.
- Added service and real HTTP/browser acceptance to Linux/Windows CI; local service39/HTTP23 PASS. V1 release/full restore gate retained; no local browser claim or V2 STABLE claim.

# CHANGELOG

## V1 owner Windows report / V2 specification — 2026-10-10
- Record owner-reported successful V1 Windows testing and verified baseline CI 37945599496; retain explicit full restore/release-checkpoint evidence limits.
- Prepare V2 proposed sales logic and phased acceptance checklist: draft/confirm, image claims/idempotency, physical-stock removal, lightweight sold-image history, durable cleanup/recovery, migration and backup/restore contracts.
- Documentation only; no V2 runtime/schema or image deletion. Business proposal and image cleanup settings require approval before implementation.

## V1 stock-image copy/share — 2026-10-09
- Size/Product/filter quick selection, Shift range, retained hidden selections, large viewer and bottom copy/share bar.
- Same-machine Windows CF_HDROP clipboard bridge with complete C# source, COPY effect, ID-only validation and origin/sandbox guards; no PowerShell, Python or inventory mutation.
- Capability-gated Web Share with individually prepared JPEGs in memory; request limits and explicit error/retry. Native paste into Zalo/Messenger and real mobile share still await shop acceptance.
- Share integration plus HTTP/browser regressions; Windows CI checks native compilation/Unicode multi-file format. No schema change or V2.

## V1 desktop experience — 2026-10-09
- Remembered Gọn / Thoải mái, compact desktop header/sidebar/KPIs/charts/cards/forms and non-overlapping import confirmation; mobile keeps its tap sizes.
- Clear receipt destination/source labels and jump-to-form action; improved dark muted-text contrast, focus visibility and reduced-motion support.
- Six-module desktop browser matrix at 1366×768 and 1920×1080, both themes/densities, plus mobile and mocked LOCAL workflows; 31 source UI regressions.
- Presentation only: no backend/schema or inventory-rule changes. Shop Windows UI acceptance and full restore pending; V1 NOT STABLE.

## Windows fsync setup blocker — 2026-10-09
- Fix EPERM on copied goods-receipt / rename files: open COPY targets with r+ instead of read-only before fsync; preserve contents, checksums and fail-closed recovery.
- Add writable-flush regression guards and native Windows Node 22/24 internal + HTTP gates. Deployment waits for Linux and Windows checks. Shop Windows acceptance and full restore remain pending.

## V1 warehouse workflow upgrade — 2026-10-09
Status: AUTOMATED LOCAL PASS / WINDOWS FULL ACCEPTANCE UNVERIFIED / NOT STABLE

- Ten scan KPIs, pending/registered separation, selected Size bulk pricing and reviewed per-Product batch registration with retained outcomes.
- Remembered warehouse, opt-in startup/periodic read-only scanning, persistent notices, bell/toast and optional non-interrupting popup.
- Registered physical-image rename with checksum-bound preview, stable IDs, DB backup, durable journal and mapping logs; source receipt images remain unchanged.
- Opt-in canonical naming for newly copied receipt images, dashboard refresh, labelled responsive forms/cards and dark mode.
- Extended API, crash/recovery and browser regressions. No schema migration, no cloud/LAN exposure, no V2; full Windows restore remains unverified.

## V1 pre-Windows hardening — 2026-10-09
Status: AUTOMATED LOCAL PASS / WINDOWS UNVERIFIED / NOT STABLE

- Batched physical inventory reads; consistent file-only stock and complete ledger totals on SKU search.
- Receipt/folder async state, double-submit prevention and automatic dashboard refresh.
- Existing Size batch-import reconciliation, folder browsing/paste, retry/loading states, UI preferences, accessible labels/focus and non-cropped lazy galleries.
- Backup manifest completeness verification against snapshot; sandbox API/db guards and fresh Windows source build.
- Dependency lockfile + npm ci; expanded core, HTTP, browser and performance regressions.
- No new schema, no V2 and no real inventory mutation. Full Windows restore remains unverified.

## V0.1.2 — Foundation Stable — 2026-10-06
Status: DONE / STABLE

### Fixed
- Windows local startup now waits for API health before opening localhost.
- Startup errors remain visible for diagnosis.
- Completed local Windows acceptance test.

### Verified
- SETUP PASS.
- Production build PASS.
- localhost:3000 PASS.
- LOCAL mode PASS.
- SQLite `data/shop.db` creation PASS.
- GitHub Pages/iPhone DEMO preview PASS.

## V0.1.1 — Foundation local setup patch — 2026-10-06
Status: SUPERSEDED

### Fixed
- Removed `better-sqlite3` native npm dependency.
- SQLite moved to built-in `node:sqlite`.
- Removed Visual Studio Build Tools requirement for Shop dependencies.

## V0.1 — Foundation — 2026-10-06
Status: SUPERSEDED

### Added
- React/TypeScript/Vite/PWA frontend.
- Node/Express local API.
- SQLite bootstrap.
- LOCAL/DEMO distinction.
- Windows scripts.
- GitHub Pages workflow.
- Project governance documents.

# Windows acceptance fix — 2026-10-09

- Reject Product/Size folders passed as warehouse scan roots with an actionable message. Clear stale scan previews and block saving previews without any selected Size containing valid image paths. Regression tests cover wrong folder depth and the UI guard. No business data changed.
