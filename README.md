# SHOP MẸ CACAO WEB — bản mới nhất trên main

## Chặng 2: Khách hàng, phí ship và phiếu chốt đơn PNG

Bản đầy đủ kế thừa chức năng kho/nhập/chọn ảnh/bán hàng/backup/restore và tiến độ tác vụ chặng 1, bổ sung khách hàng, thông tin giao hàng, phí ship/miễn ship và phiếu PNG thương hiệu từ đơn đã lưu.

**Cách chạy Windows:** giải nén vào thư mục mới → chạy **START_SHOP_CHANG_2.bat** → giao diện tự mở tại http://127.0.0.1:3000. Máy cần Node.js 22.13+ hoặc 24; lần đầu cần mạng để cài thư viện.

**Dữ liệu mới:** mỗi thư mục cài mới có kho rỗng riêng. Vào **Nhập hàng** để chọn ảnh nguồn trên giao diện; kho đích đã chọn sẵn. Ảnh được COPY, không MOVE. Mở lại cùng bản cài giữ dữ liệu đã nhập.

Không yêu cầu DB V1, backup V1 hoặc các launcher PREPARE/ACTIVATE để chạy bản phát triển này. Các tài liệu chuyển kho cũ là lịch sử và công cụ tương thích tùy chọn.

- [Bắt đầu chặng 2](BAT_DAU_CHANG_2.txt)
- [Chức năng, kiến trúc và quy tắc chặng 2](STAGE2_CUSTOMERS_PNG.md)
- [Bằng chứng kiểm thử và giới hạn](STAGE2_TEST_REPORT.md)
- [CI của đúng bản main](https://github.com/anphanguyen191-cell/SHOP_MECACAO_WEB/actions/workflows/pages.yml)

Ứng dụng nghiệp vụ chạy LOCAL trên máy. GitHub Pages là DEMO/PREVIEW; không kết nối DB/kho của shop. COD/thu tiền/công nợ/hậu mãi, V4, LAN và cloud chưa thuộc chặng 2.

## Project governance
- `DEVELOPMENT_PRINCIPLES.md`: nguyên tắc bắt buộc về an toàn dữ liệu và hoàn thiện chức năng/giao diện cùng nhau.
- `PROJECT_STATE.md`: source of truth.
- `CHANGELOG.md`: lịch sử baseline/fix.
- `ROADMAP.md`: roadmap và gate.

### Thử full restore ở vị trí mới

Trong Cài đặt sandbox: backup đầy đủ → Phục hồi thử sang kho mới → READY. Chạy `RUN_WINDOWS_RESTORED_SANDBOX_TEST.bat` chọn1 V2 / 2 V1 để mở3016; source3005/3006 giữ nguyên. Scope/evidence/Windows steps: [V2_BACKUP_RESTORE_CHECKPOINT.md](V2_BACKUP_RESTORE_CHECKPOINT.md). Chưa tự chuyển DB đang dùng hay release bán hàng.
