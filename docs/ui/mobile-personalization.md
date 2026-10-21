# Mobile CaCao appearance

Open **Thêm → Cài đặt → Phong cách riêng CaCao**.

- Presets: Travel Luxe gốc, CaCao Signature, Vườn mint, Lavender dịu, Champagne.
- Mix a palette, Flat/Glass/Pearl chrome, Original/Soft/Outlined/Lifted cards,
  Nature/Family/Muse decorative header patterns, mascot and motion.
- Patterns decorate the existing heading and welcome frame. They are lightweight
  native vector motifs, not replacements for the shop's previously generated
  image collections. Choose a JPG/PNG/WebP from those collections as a local banner.
- Upload accepts at most 8 MiB; a raster thumbnail is generated locally, at most
  960 × 480 pixels and 400,000 data-URL characters. No image is uploaded to Cloud.
- Choices apply immediately and survive reload in this browser's
  `mecacao-ui-mobile-appearance-v1` key. No account, business or other device data
  changes. Storage denial applies a temporary style with an explicit status.
- Default remains the original Travel Luxe appearance. Reset is confirmed and
  resets only these new choices, including the custom thumbnail; the existing
  Light/Dark and display-density controls retain their own preferences.
- Native system Reduce Motion overrides all decorative motion. Off disables page,
  button and sheet transitions. Gentle uses a 160 ms opacity change on existing
  surfaces without wrapping, remounting or delaying operational forms.
- All CSS is mobile-scoped below 801 px; body-portaled sheets inherit the same
  palette. Business status colors, warehouse images, receipts and PNGs are not styled.

## Verification

`scripts/mobile-cloud-navigation-dom.mjs` exercises the real workspace, form
retention, all settings, persistence, corrupted/denied storage, safe URL validation,
local raster selection/removal, sheet inheritance, default reset and desktop isolation
with a read-only fake transport. It runs in `npm run test:ui`.

`scripts/cloud-browser-e2e.mjs` exercises actual Chromium at 375/390/430/768 px,
all five presets in light/dark, text contrast ≥ 4.5, 44 px touch targets, overflow,
banner selection/reload, reduced motion, unsaved finance and unchanged business
fixtures. It writes screenshots to `artifacts/cloud-browser/appearance-*.png`.
Existing Windows/Mobile/Cloud gates remain required before publication.
