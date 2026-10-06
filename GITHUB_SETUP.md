# GITHUB SETUP — V0.1

Repository: `SHOP_MECACAO_WEB`

## GitHub Pages

1. Source code lives on `main`.
2. GitHub Actions workflow builds only the web frontend.
3. GitHub Pages is DEMO/PREVIEW mode only.
4. Production SQLite and real shop images are never committed.

## Safety rule

- `data/shop.db` is ignored.
- `storage/images/*` is ignored.
- Do not commit backups containing real shop/customer data.
