# ARCHITECTURE

## Runtime modes

### LOCAL
Browser → Node API → SQLite + local image storage.

### DEMO / GITHUB PAGES
Static PWA only. No production API and no production database.

## Planned module boundaries

- products
- inventory
- orders
- customers
- reports
- settings
- backup
- sync

Each business module will separate UI, service/business rules, repository/data access, schema/migration and tests.

## Inventory invariant (planned for V1.0)

`current_stock` will be derived from an inventory ledger. No arbitrary direct stock edits in normal workflow.
