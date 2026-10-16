# UI-DESKTOP-013 — Splash/Login visual fidelity to Travel Luxe V2 demo

Date: 2026-10-16
Source of truth: user-supplied `Shop_MeCaCao_Travel_Luxe_Laptop_Demo_V2.html`.
User's evidence: `Recording 2026-10-16 220137.mp4` (7.8 s): alternating narrow LAN login and Dashboard; no original scenic split-screen or demo welcome in the captured login state.
Status: Implementation details are retained here; the owner later accepted the unified Travel Luxe V2 baseline and authorized its official release on 2026-10-17. See [`windows-ui-v2-accepted.md`](windows-ui-v2-accepted.md). First launch on the shop laptop remains the practical point to report runtime issues.

## Scope
- Reuse the exact scenic SVG artwork embedded in the approved HTML demo as `apps/web/public/brand/travel-luxe-login-scene.svg`.
- Splash matches demo flower mark, pastel gradient, original headline, subtitle and loading line. Windows shows it on each fresh open, automatically transitions after 2.1 seconds, and allows skip.
- Windows login matches demo's two-column layout: large left scenic illustration and greeting, right white form with Shop Mẹ CaCao identity, credentials, remembered-login choice. Actual Windows auth uses real credential verification and HttpOnly cookies, not the demo's fake login.
- LAN desktop sign-in uses the same scenic shell but retains distinct HTTPS LAN credential/session policy; mobile LAN keeps responsive compact login.
- Fix session routing: local Windows session expiry returns to Windows splash, never the LAN form. LAN change-feed 401 verifies the session before forcing reauthentication. After genuine LAN expiry, the login remains visible until the user signs in (no automatic login/Dashboard oscillation).
- No database migration, no modifications to D:\\1-Me CaCao Store, no weakening of password, role or transaction gates.

## Acceptance
1. Launch Windows: scenic splash with `Hành trình xinh đẹp bắt đầu...` then scenic two-column login. Compare against original HTML at same desktop viewport.
2. Enter actual owner credentials or remembered session; no automatic bypass of login button.
3. Dashboard appears only after authenticated login. Logout/reload shows splash again.
4. LAN desktop: scenic login. Force 401/session expiry and verify it does not bounce repeatedly between login and Dashboard.
5. Verify actual data and CORE remain unchanged.
6. Browser acceptance checks scenic layout geometry, exact SVG asset, secure remembered login and logout; CI must pass.

This is a historical visual/functional implementation record. The owner's current acceptance is captured in `windows-ui-v2-accepted.md`.
