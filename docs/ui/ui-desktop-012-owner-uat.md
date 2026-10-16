# UI-DESKTOP-012 — Windows Travel Luxe: owner UAT build (NOT ACCEPTED)

Date: 2026-10-16
Branch: main
Status: Code implemented; CI Windows build + isolated EXE smoke passed before owner UAT. **Windows laptop visual/functional acceptance remains pending.**

## Approved changes implemented
1. Each Windows workspace header (besides the Dashboard's existing hero) has an independent image or MP4/WebM cover picker, a default-reset control, and device-local IndexedDB persistence. Never writes to the physical inventory photo folder or database.
2. Bell notifications show compact actionable records, unread/pending and resolved history tabs, localized dates, and a maximum of eight rows before expanding. Startup inventory notices are not duplicated over the Dashboard; newly arriving notices can be displayed.
3. Higher contrast for Windows light mode, vivid but readable Travel Luxe pastels; Cloud and mobile layouts retain their separate scope.
4. Money spinners in manual products, receiving, warehouse import, local price operations, Cloud catalog/order and payment fields increment by 1,000 VND. Stock quantities/counts retain step 1.
5. Real product selector for stock explorer and catalog; uncategorized products appear as “Chưa phân loại”; search handles Vietnamese diacritics and product codes, sizes, SKUs. Dashboard featured cards now load actual product records.
6. Original Windows splash -> login (with secure remembered credentials) remains intact; no CORE transaction, original photo, database or Cloud schema change.

## Windows owner UAT checklist
- Restart application, verify splash and credential login appear every launch.
- Open Settings and two other workspaces, upload different images and verify each persists independently across restart; restore default.
- Inspect bell pending/history, close, mark resolved, verify no duplicate popup.
- Test price spinner from 0 to 1000 to 2000; verify inventory quantity remains +1.
- With the actual D:\\1-Me CaCao Store, verify Product dropdown contains real products, “Chưa phân loại” is available when applicable, and searching a name with/without Vietnamese accents yields matching product and Size.
- Confirm product list and Dashboard feature actual stock and images; compare counts to physical folders.
- Confirm no changes to database path, warehouse ownership, SOLD/archive and draft confirmation.

**This document is NOT the Windows UI V2 acceptance marker.**
