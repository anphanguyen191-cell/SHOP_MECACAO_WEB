# M1 — Mobile screen map and gap audit
Date: 2026-10-18. Source: GitHub main (read-only inspection); visual/runtime status **NOT TESTED**.
Depends on [M1 design system](./M1-DESIGN-SYSTEM-AND-ACCEPTANCE.md).

## Existing entry points
- `apps/web/src/main.tsx`: PWA registration and conditional App / CloudWorkspace runtime.
- `apps/web/src/App.tsx`: local Windows / LAN navigation; LAN permission gates; existing `.mobileQuickNav`.
- `apps/web/src/CloudWorkspace.tsx`: Cloud navigation and existing Cloud order, customer, stocktake and reports components.
- `apps/web/src/ShopChrome.tsx`: shared ShopHeader and menu drawer.
- `apps/web/src/displaySize.css`, `uiState.ts`: device-local small/medium/large density, safe-area nav offsets.
- `apps/web/src/LanLogin.tsx` + `lanLogin.css`: real LAN login.
- `apps/web/src/TravelLuxeAuthLayout.tsx`: existing visual splash/auth shell.
- `apps/web/src/travelLuxeDesktopFinal.css`: desktop-only design, **not** a global mobile skin.

## Screen-by-screen integration matrix
| Screen | Existing LAN/Windows anchor | Existing Cloud anchor | M2 visual requirement | M3 capability condition |
|---|---|---|---|---|
| M-01 Splash | TravelLuxeAuthLayout / LAN Login | Cloud auth flow, to review | Mobile splash with skip, no fictitious % | Cannot bypass auth |
| M-02 Login | LanLogin | CloudWorkspace auth/session | Accessible fields, error/safe keyboard | Distinct real LAN vs Cloud session |
| M-03 Tổng quan | App / Dashboard | CloudWorkspace overview | KPI 2-column, chart overflow-safe | API quantities only |
| M-04 Kho hàng | InventoryView | CloudCatalog / CloudPhotos | Product/Size filters, gallery | Freshness and source shown |
| M-05 Chi tiết | ProductDetail / InventoryView | CloudCatalog / CloudPhotos | Bottom sheet or route | Photo identity and SOLD status |
| M-06 Đa chọn | InventoryView selection | CloudShare / CloudPhotos selection | Persistent tray at safe area | Never deduct stock on selection/share |
| M-07 Tạo đơn | SalesDraftView | CloudOrderEditor | Guided stepper, sticky amount | Preflight before any irreversible commit |
| M-08 Chi tiết đơn | SalesDraftView / PNG flow | CloudOrders / CloudOrderSlip | Status, totals, history | Transactions confirmed server-side |
| M-09 Khách hàng | CustomersView / DebtsView | CloudCustomers / CloudDebts | Search + detail tabs | Permission-filtered |
| M-10 Báo cáo | BusinessReports | CloudReports / CloudFinance | Responsive KPI/chart/table | No UI-calculated accounting |
| M-11 Cloud | CloudSettings / ShopSyncStatus | CloudWorkspace sync status | Status card; last confirmed sync | Stale/pending/errors explicit |
| M-12 Cài đặt chính | SettingsView | Cloud settings navigation | Grouped routes, no giant form | No destructive quick action |
| M-13 Ngoại hình | DisplayDensity / uiState | DisplayDensity / uiState | Density/theme/motion | Local-only preferences |
| M-14 Thông báo | WarehouseNotifications | Cloud status/events | Grouped activity timeline | No demo notifications in live app |
| M-15 Thêm | ShopDrawer + nav | ShopDrawer + sections | 5-tab footer + More | Preserve role-conditioned routes |
| M-16 Responsive | displaySize.css | cloudWorkspace.css | 375/390/430/768, rotation | Keyboard and viewport safe |

This is a component **mapping**, not a certification that every listed screen is fully implemented or visually correct.

## Findings with severity / required action
- **GAP-01 P1**: `App.tsx` already renders mobile navigation using all allowed `nav` entries. The proposed five-tab structure requires a mobile-only presentation mapping to fixed primary tabs + More, without deleting existing sections. Verify actual node counts and role variants before touching JSX.
- **GAP-02 P1**: Cloud and LAN are separate runtime trees; a shared mobile design cannot assume shared write semantics. Inventory source + freshness must be visible, particularly after reconnect.
- **GAP-03 P1**: Desktop CSS is scoped to `.luxeWindows`. Build an isolated mobile token/layout layer; avoid broad `.shell` overrides that regress Windows.
- **GAP-04 P1**: Mobile logout/session lifecycle differs by connection. Require actual iPhone lifecycle and session persistence tests; do not replace credential flow with demo controls.
- **GAP-05 P1**: Buttons in `displaySize.css` have 36px densitySmall defaults outside mobile breakpoint; ensure mobile touch targets remain at least 44px in all density modes.
- **GAP-06 P1**: Selection and order creation use different components across LAN/Cloud. Write a capability and confirmation matrix before enabling changes from new Mobile UI.
- **GAP-07 P2**: Need reduced-motion fallback, actual foreground/background PWA re-entry checks and skeleton/empty/error states; static stylesheet inspection is insufficient.
- **GAP-08 P2**: Demo image collateral includes fictional quantities, device names, storage quota and login details. None may enter production runtime as default real data.

## Acceptance checklist for M1
- [x] Inventory core UI entry points and relevant files
- [x] Complete 16-screen LAN/Cloud anchoring matrix
- [x] Explicit high-risk gap register
- [x] System tokens and state contract written
- [ ] Owner signs off mobile look-and-feel and bottom navigation
- [ ] Actual 375/390/430/768px visual proof (M2)
- [ ] Hardware session and transaction regression proof (M3/M4)

## Phase gates
M1: documentary contract complete; **not approved until owner explicitly confirms**.
M2: mobile presentation build only, mocked/read-only first, visual evidence; owner acceptance required.
M3: real LAN/Cloud API wiring with role, non-deduction, SOLD and conflict tests; owner acceptance required.
M4: physical iPhone, PWA, LAN, cellular, offline/stale, speed and rollback tests; only then stable.

### One-main rule
Do not create a preview branch; make scoped changes on main with auditable commits and avoid any interference with ongoing desktop update. This M1 artifact changes documentation only.
