# V1.0 SPEC — PRODUCT + SKU + INVENTORY LEDGER

Approved: 2026-10-06
Status: **APPROVED / READY FOR IMPLEMENTATION**
Foundation dependency: **V0.1.2 STABLE**

## Goal
Quản lý sản phẩm, ảnh theo kho hiện hữu, SKU/size, nhập/điều chỉnh kho và lịch sử tồn. V1.0 chưa bao gồm đơn hàng, khách hàng, công nợ hay hóa đơn.

## Approved storage model
Kho hiện hữu là cấu trúc chuẩn:

```text
1-Me CaCao Store/
└── <Tên sản phẩm>/
    └── <Size tự do>/
        ├── 001.jpg
        ├── 002.jpg
        └── ...
```

- Size là text tự do: ví dụ `Size 8 (16-17kg)`, `90`, `XL`, `12M`.
- Ảnh được phép gắn tới Product/Variant và liên kết tới file trong folder size.
- SQLite quản lý metadata/quan hệ; không nhét binary ảnh vào DB.
- Không ép tầng Color trong V1.0. Nếu màu đang được tách theo folder/tên sản phẩm thì coi là sản phẩm riêng.

## Product / SKU
- Product: tên, mã, danh mục, giá nhập, giá bán, trạng thái, timestamps.
- Variant/SKU: product_id, size tự do, sku, trạng thái.
- Mã sản phẩm/SKU: hệ thống **gợi ý tự động nhưng phải cho người dùng lựa chọn/chỉnh sửa trước khi lưu**.
- Mặc định hỗ trợ tự sinh mã nhưng không khóa người dùng vào mã tự sinh.

## Inventory invariant
Không sửa trực tiếp số tồn trong workflow bình thường. Tồn hiện tại được suy ra từ Inventory Ledger.

V1.0 transaction types:
- OPENING
- IMPORT
- ADJUST_PLUS
- ADJUST_MINUS

Các loại SALE/RETURN dành cho milestone sau.

## Main workflows
1. Tạo sản phẩm + chọn/nhập mã + size + ảnh + tồn đầu.
2. Nhập kho nhiều size trong một thao tác.
3. Điều chỉnh kho bằng chênh lệch có lý do.
4. Xem tồn theo sản phẩm/SKU/size.
5. Tìm kiếm/lọc theo tên, mã, SKU, danh mục, size và trạng thái tồn.
6. Xem lịch sử biến động kho.
7. Cảnh báo tồn thấp với ngưỡng cấu hình.
8. Sản phẩm có lịch sử giao dịch không hard-delete; chuyển inactive.
9. Backup DB + ảnh trước migration quan trọng.

## Data model
Core tables:
- products
- product_variants
- product_images
- inventory_transactions
- categories
- app_settings

Schema target: `schema_version = 100`.

## API boundary
React UI → REST API → service/repository layer → SQLite.

Planned routes:
- /api/products
- /api/products/:id
- /api/categories
- /api/inventory
- /api/inventory/import
- /api/inventory/adjust
- /api/inventory/history
- /api/images
- /api/settings
- /api/backup

Critical multi-step writes must use DB transactions/rollback.

## UI scope
- Tổng quan
- Sản phẩm
- Nhập kho
- Tồn kho
- Lịch sử kho
- Cài đặt/Backup

Desktop ưu tiên quản trị. Mobile responsive ưu tiên tìm sản phẩm, xem ảnh và tồn theo size. Full mobile LAN workflow vẫn để V5.0.

## GitHub DEMO
GitHub Pages dùng dữ liệu demo, không dùng dữ liệu shop thật. Badge DEMO giữ nguyên. Local app dùng SQLite và badge LOCAL.

## Explicitly out of scope
- Orders/sales
- Customers
- COD/công nợ
- Receipt PNG
- Revenue/profit reporting
- Cloud sync
- Facebook integration
- AI Try-On

## Implementation/Test gate
Trước USER TEST phải PASS hoặc được ghi rõ UNVERIFIED:
1. source/config/dependency review
2. typecheck/build
3. schema migration
4. create product + variants + opening stock
5. import stock
6. adjustment
7. stock calculation
8. inventory history
9. image handling
10. search/filter
11. restart persistence
12. backup
13. API health
14. Windows startup
15. GitHub DEMO build/deploy

Sau user acceptance PASS mới khóa **V1.0 STABLE**.
