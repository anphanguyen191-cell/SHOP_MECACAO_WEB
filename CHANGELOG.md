# CHANGELOG

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
