# Cloud reset — 11/10/2026

Project ShopMeCaCao-Cloud (eyckwoewpomssjjggslr).

Reset applied successfully after user emptied Storage via authenticated Dashboard. Storage objects: 0. Old shop business tables and RPCs replaced by 20 schema-130 core tables plus 5 Cloud support tables. Business data: empty. Existing Auth identity preserved with enabled owner membership. RLS enabled on all 25 tables; 11 tables published to Realtime. Added 11 foreign-key indexes.

Post-reset fake transaction test PASS: SOLD immutability, finance immutability, stock ledger, image <=150000 bytes, unauthorized RLS reads. All fixtures rolled back.

Bucket remains private/JPEG only, existing upload limit 2 MiB. Asset metadata enforces 150000 bytes; bucket upload limit still needs adjustment. Security advisor has only existing leaked-password-protection warning: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Status updated: RPC_READY, V7.1.0-cloud-main-test implementation ready for CI/acceptance. Activation after the first owner sync sets CLOUD_TEST_READY. Added private role-checked business dispatchers, image verification, stocktake, reports, inbox and SOLD archive receipts. All mutations require authenticated membership; raw business writes remain revoked. New tables are cloud_photo_inbox and cloud_archive_receipts (27 total). Fake SQL fixtures live in scripts/cloud and roll back. No deletion Edge Function deployed. Actual Windows/iPhone acceptance remains pending; this is not STABLE.
