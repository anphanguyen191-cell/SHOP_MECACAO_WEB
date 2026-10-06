# TEST CHECKLIST — V0.1 FOUNDATION

## A. GitHub preview
- [ ] Workflow `Deploy GitHub Pages Preview` succeeds.
- [ ] GitHub Pages opens on iPhone.
- [ ] Header shows `DEMO`, never `LOCAL`.
- [ ] Mobile layout has no horizontal page overflow.

## B. First-time setup on Windows laptop
- [ ] Install Node.js 22 LTS.
- [ ] Run `scripts\SETUP_FIRST_TIME.bat` while internet is available.
- [ ] Confirm `SETUP PASS`.

## C. Local runtime
- [ ] Run `START_SHOP.bat`.
- [ ] Browser opens `http://localhost:3000`.
- [ ] Header shows `LOCAL`.
- [ ] `data\shop.db` is created.
- [ ] Restart app and confirm API returns normally.

## D. PWA
- [ ] Add to Home Screen/install behavior is available after Pages deployment.

## PASS gate
V0.1 becomes `STABLE` only after all required checks pass and the user confirms OK.
