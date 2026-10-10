# Chặng 6 — kiểm thử bản 3.4.0-stage6-main-test

Mọi bài tự động dùng DB/ảnh/thư mục tạm giả lập; không kiểm thử trên kho thật của shop.

| Kiểm tra | Bằng chứng local trước publish |
|---|---|
| Full regression gate | PASS: typecheck/schema/core/hiệu năng/kho/share/nháp/preflight/PNG/archive/staging/commit/recovery/restore/tasks/chặng2/3/4/5A/LAN/build/UI |
| LAN security | PASS 79 kiểm tra, gồm giới hạn/session/role/khóa/reset và saturated unknown names vẫn cho owner đăng nhập |
| LAN control mới | PASS 44 kiểm tra: LOCAL Host/Origin, tài khoản, CA/cert/private key, HTTPS/port bận, role/401/403, CA-only bootstrap, đổi tài khoản thu hồi phiên, stop/restart/audit |
| HTTPS HTTP | PASS 17 kiểm tra |
| Bán đồng thời HTTPS thật | PASS 13 kiểm tra, hai thiết bị cùng ảnh chỉ một SOLD |
| Ảnh HTTPS và duyệt LOCAL | PASS 24 kiểm tra |
| Build + UI regression | PASS; UI source-level 31 kiểm tra |

TLS control dùng Node xác minh chuỗi CA/hostname bình thường; trường hợp Host giả cố ý chỉ bỏ TLS hostname check để tới server Host guard. Không có bypass TLS trong cấu hình sản phẩm.

## CI đúng mã main

Workflow [pages.yml](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/workflows/pages.yml) chạy Linux full gate/HTTP/browser và Windows Node22/24 gate/launcher/HTTP. Khi đối chiếu, chọn **head_sha của commit chứa bản 3.4**, không lấy CI 3.3.1 hoặc retry của baseline làm bằng chứng bản mới.

Bài mới `scripts/stage6-browser-e2e.mjs`: GUI Windows React tạo owner/cert/bật HTTPS/CA; login HTTPS owner→viewer, menu/API đúng quyền, offline/online, SOLD thật qua service làm viewer refresh, reset password về login/xóa dữ liệu; screenshot 1366/390 sáng/tối. Fixture Chrome bỏ qua trust certificate để tự động hóa; bài Node TLS riêng kiểm CA. Chỉ chạy Chromium trong Linux CI, không khởi chạy local browser ở môi trường phát triển này.

Artifact `mobile-smoke-<sha>` chứa `stage6-control`, `main-release`, `mobile-smoke` và các bài nháp/bán hiện có. Trạng thái Windows/browser cần đọc ở đúng run/commit; ghi kết quả cuối sau khi run hoàn tất.

## Giới hạn nghiệm thu

Không thay thế Windows/iPhone vật lý: trust CA/Firewall/Wi-Fi shop, Safari/camera HEIC/chia sẻ/clipboard/download và ngắt Wi-Fi trong nghiệp vụ còn cần chủ shop kiểm tra trên kho tự tạo. Polling không bảo đảm mọi thay đổi ngoài API/watcher. Không tự đánh dấu STABLE, không coi Stage5B/5C/Stage7 đã triển khai.
