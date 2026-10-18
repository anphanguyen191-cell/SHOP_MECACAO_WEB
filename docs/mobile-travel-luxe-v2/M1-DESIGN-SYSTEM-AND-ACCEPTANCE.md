# SHOP MẸ CACAO — MOBILE TRAVEL LUXE V2.0
## M1 — Design system & acceptance contract (2026-10-18)

Status: SPECIFICATION / awaiting owner visual approval. M2–M4 not started.
Scope: Mobile LAN and Cloud presentation; Windows UI, CORE, SQLite, stock calculations, SALES/SOLD and Supabase schema remain unchanged.
Source of truth: current `main` application and owner-approved 16-screen concept. Concept images are visual guidance, NOT proof of supported functionality.

### Architecture rules
1. Keep `apps/web/src/App.tsx` (LAN/Windows workflow) and `apps/web/src/CloudWorkspace.tsx` (Cloud workflow) as existing entry points; implement shared **presentation-only** mobile components and tokens, rather than a second business engine.
2. Never infer inventory freshness from authentication or network availability. Display source (LAN/Cloud), last confirmed synchronization time, pending state and explicit stale/offline notice.
3. Authorize actions through existing server/Cloud roles. UI hiding is never authorization. Unsafe mutations must not be unlocked by visual changes.
4. Windows local remains authoritative for original photos and inventory; mobile does not invent independent stock ledger or delete local photos. SOLD actions require existing preflight/confirmation and idempotency protections.
5. No migration, reset, cleanup, or change in API payloads during M1. No new production feature may be claimed without integration tests.

### Design tokens (proposal — must be checked against current desktop CSS)
- Canvas: #F7F2F8; surface #FFFFFF; ink #29324D; muted #85859B; line #EEE8F1.
- Rose #E07AA6; blue #7B9DE4; mint #69BDB5; violet #A394D6.
- Use existing brand logo and Since 2023; do not hardcode concept screenshots' fictional customers, accounts or stock.
- Radius: cards 18–22px; buttons 12–14px; sheets 22–26px top corners.
- Spacing scale: 4/8/12/16/20/24/32px. Touch targets >=44×44 CSS px.
- Type minimum 14px for body and actionable labels; supporting captions >=12px with clear contrast. Use existing application's typography where possible.
- Motion: 180–260ms (opacity/transform); disable nonessential motion under prefers-reduced-motion.
- Respect iOS safe-area-inset-top/bottom and keyboard; do not cover bottom CTAs.
- Density: small/medium/large as existing per-device UI preference, without changing business data.

### Mobile navigation map
Bottom bar (max 5): Tổng quan | Kho hàng | Bán hàng | Cloud | Thêm.
Thêm groups: Khách hàng, Công nợ, Báo cáo, Kiểm kê, Nhập hàng, Công cụ kho, Cài đặt, Thông báo, hỗ trợ. Only show actions permitted by current LAN/Cloud capability and user role. Tab names can map to existing internal route names; avoid changing those routes during M1.

### Screens and acceptance criteria
| ID | Screen | Required UI | Data/action constraint |
|---|---|---|---|
| M-01 | Splash | Lightweight logo, skip, reduced-motion fallback | No false loading percent |
| M-02 | Login | Password/session, clear errors, one-hand layout | Actual LAN or Supabase auth; no fake sign-in |
| M-03 | Dashboard | KPI cards, status, optional compact chart | Metrics sourced from API, no placeholder values in production |
| M-04 | Inventory | Search, Product/Size filter, 1–2 column gallery, density | Show source and freshness |
| M-05 | Detail | Image, Product, Size, remaining stock, image history state | Exact image identity retained |
| M-06 | Multi-select | Selection persists across Product/Size, floating action bar | No deduction on selection/share/draft |
| M-07 | Order wizard | Products → Customer → Pricing/confirm → Summary | Only expose supported authority and commit flow |
| M-08 | Order detail | Totals, payment state, history, slip | No undocumented SOLD reversal |
| M-09 | Customers/debts | Search, cards, detail tabs | Permission-scoped |
| M-10 | Reports | KPIs, filter, responsive charts | Correct amounts and date ranges |
| M-11 | Cloud status | Last sync, pending, errors, reconnect, storage if measurable | Never fabricate quota/online/realtime |
| M-12 | Settings root | Grouped items and back navigation | No destructive reset shortcuts |
| M-13 | Appearance | Density, motion, theme and accessibility | Device-local presentation preferences |
| M-14 | Notifications | Orders, sync, warning | Separate real events from example content |
| M-15 | More/tools | Permission-aware grouped navigation | CORE confirmation dialogs unchanged |
| M-16 | Responsive | 375/390/430/768px & landscape, reduced-motion | No horizontal overflow or keyboard-hidden primary action |

### System states per screen
Loading skeleton; empty with next step; recoverable error with retry; blocked by role with explanation; offline/stale where relevant; success toast; explicit pending progress; long task progress panel. Never equate optimistic UI with server confirmation.

### Acceptance / evidence gates
M1: source inventory reviewed; shared token/navigation/state contracts written; owner approves visual fidelity and module map. NO runtime implementation or CORE modification.
M2: render/navigation/UI state tests at 375, 390, 430, 768px; screenshot review and accessibility tests; mocked/read-only API. Do not edit Windows-validated styles.
M3: LAN and Cloud real auth/session; role and contract tests; image selection and draft non-deduction; SOLD transaction conflict/idempotency; photo deletion reconciliation; stale/offline.
M4: iPhone Safari/PWA manual tests on Wi-Fi and mobile network, network disconnects, resume/session persistence, memory/performance, accessibility, deployment gating; rollback plan.
Each phase requires recorded evidence and owner acceptance before next phase. CI passing alone is not Windows/iPhone acceptance.

### Preliminary source audit (2026-10-18)
- `apps/web/src/main.tsx`: runtime chooses Windows/LAN App versus `CloudWorkspace`, PWA registered.
- `apps/web/src/App.tsx`: mobile breakpoint handling and existing LAN roles.
- `apps/web/src/CloudWorkspace.tsx`: separate Cloud product/order flows.
- `apps/web/src/displaySize.css`, `uiState.ts`: device-local density and preferences.
- `apps/web/src/lanLogin.css`, `LanLogin.tsx`: actual LAN login.
- `apps/web/src/travelLuxeDesktopFinal.css`: desktop-only selectors; do NOT reuse desktop layout rules globally.
Open gaps: exact parity of Cloud/LAN APIs, screen-specific mobile screenshots, auth edge cases, iPhone hardware testing and performance measurements. None are claimed passed.

### Development guardrails
One `main` only (per owner instruction). UI work must not start while Windows update is being validated unless scoped and regression-tested. Make small traceable commits; run existing `npm run test:ui`, `npm run typecheck` and relevant Cloud/LAN tests before release. Do not change CORE or production database in M1.
