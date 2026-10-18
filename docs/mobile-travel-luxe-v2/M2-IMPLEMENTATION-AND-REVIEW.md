# M2 Mobile Travel Luxe V2.0 — Implementation & review
Date: 2026-10-18
Status: **CODE INTEGRATED / RELEASE GATE NOT PASSED / OWNER ACCEPTANCE PENDING**
Reference: M1 signed off by owner; maintain existing CORE and Windows UX.

## What was implemented
1. `MobileLuxeNav.tsx`: responsive, shared LAN/Cloud 4 primary route candidates (Tổng quan/Kho/Bán hàng/Cloud) + Thêm, availability derived from existing routes; no new business action.
2. `MobileLuxeSectionHeader.tsx`: presentation-only contextual header displaying current screen and connection source, not an assurance of sync freshness.
3. `mobileLuxeV2.css`: separate mobile-only scoped styles for title/header/nav, safe-area, cards, inventory gallery, Product/Size tree, image selection, orders, customers and debts via shared cards, reports, stocktake, Cloud/configuration, loading and empty states, readable forms, responsiveness and reduced-motion.
4. Existing `App.tsx` (Windows/LAN) and `CloudWorkspace.tsx` (Cloud) now mount the mobile presentation layer without changing API invocation patterns.
5. `main.tsx` loads the mobile CSS last; desktop section header hidden >=801px.
6. UI regression source checks in `scripts/v8/mobile-luxe-m2-nav.test.mjs` and `scripts/v8/mobile-luxe-m2-responsive.test.mjs` are included in `npm run test:ui`.

## Scope coverage vs 16 mockup screens
- Splash/Login: retained existing TravelLuxeAuthLayout, LanLogin and Cloud auth. No auth API changes; **visual fidelity on mobile not hardware verified**.
- Overview: compact KPI cards and header via CSS.
- Inventory/Product/Size/Detail: single-column stack and 2-column gallery, keep existing selection/action handlers. Layout is CSS-level, interactive details require browser inspection.
- Multi-image selection: preserve existing selection state, avoid business logic changes.
- Orders/Customer/Debts/Reports/Stocktake: responsive shared cards, header, table scrolling and controls; no new business flow.
- Cloud: Cloud workspace remains functionally authoritative, header includes CLOUD source; real freshness comes only from existing status components.
- Settings/Appearance: existing SettingsView and DisplayDensity flows restyled; not a separate new settings workflow.
- Notifications and More: existing drawer and notifications retained, CSS refined.
- Responsive/Access: CSS safe area, >=50px nav targets, mobile input sizing, landscape and prefers-reduced-motion.

## Verified this session
- Live GitHub default branch fetches of changed files.
- 12/12 custom source-level assertions PASS (component wiring, route keys, scoped styles, desktop header masking, safe-area, motion preference, test-gate registration, no business call in presentation header).
- No database, API, Supabase or CORE files were modified by the M2 commits.
## NOT verified; do not call this STABLE
- `npm run build`, `npm run typecheck`, `npm run test:ui`, cloud/LAN automated test execution: environment cannot clone GitHub via DNS and no Node workspace was available.
- Screenshots or interactive visual review on iPhone 375/390/430px and tablet 768px.
- Auth, offline transitions, conflict/SOLD flow, photo counts, source freshness and physical device performance. M3/M4 scopes.
- Existing Windows laptop update in production, despite desktop-scoped CSS. Still needs regression evidence.

## Blocker and next actions before owner can accept M2
1. Run `npm ci && npm run build && npm run typecheck && npm run test:ui` on an accessible checkout or CI.
2. Check 375/390/430/768 widths and landscape, especially oversized gallery/finance tables, modal/drawer, keyboard, iPhone safe area and 5-tab role-dependent variants.
3. Capture screens for all 16 mockup states from both LAN and Cloud, compare with approved reference and fix UI defects.
4. Record Windows desktop screenshot regression at 1366×768 and 1920×1080; verify core and Cloud smoke tests.
5. Obtain owner M2 sign-off. No M3 implementation before these checks.

## GitHub strategy
One main branch, small traceable commits, no parallel preview branch. This report adds docs only.

## Additional audit — 2026-10-18
- Corrected stale assertions in `scripts/v8/mobile-luxe-m2-nav.test.mjs`: stylesheet is now scoped to `.shell.mobileLuxeWorkspace`, uses `@media (max-width:800px)` and sets 50px minimum nav touch height. The old source tests were guaranteed to fail although CSS had changed.
- Verified the mobile CSS correction for the older `.imageSendBar` component against the bottom navigation offset; regression assertion remains wired into the `test:ui` gate.
- Re-fetched current GitHub sources and evaluated 14 independent source-level assertions: **14/14 PASS**. This is **NOT** an actual `node --test` execution.
- Existing `.github/workflows/pages.yml` runs `npm ci`, `npm run build`, `npm run test:gate` and Windows smoke checks on push; however no completed workflow evidence was returned for current M2 commit. Do not infer PASS from workflow configuration.
- Direct `git ls-remote` and clone via container still fail with `Could not resolve host: github.com`. Build, TypeScript, Browser/iPhone visual screenshots, and Windows physical regression remain UNVERIFIED.
- Release gate status remains **BLOCKED / NOT STABLE**. M3 must not start.
