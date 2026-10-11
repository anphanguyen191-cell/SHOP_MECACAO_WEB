BEGIN;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM auth.users LIMIT 1),true);
UPDATE cloud_members SET role='viewer' WHERE user_id=(SELECT auth.uid());
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM mc_v7_command('fake-viewer-denied','customer.save','{"name":"FAKE"}');RAISE EXCEPTION 'TEST_FAILED';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CLOUD_ROLE_DENIED' THEN RAISE;END IF;END;
 BEGIN UPDATE cloud_members SET role='owner' WHERE user_id=auth.uid();RAISE EXCEPTION 'TEST_FAILED';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN INSERT INTO products(product_code,name) VALUES('FAKE_RAW','FAKE');RAISE EXCEPTION 'TEST_FAILED';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM mc_v7_stocktake('fake-viewer-count','stocktake.create','{"title":"FAKE"}');RAISE EXCEPTION 'TEST_FAILED';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CLOUD_ROLE_DENIED' THEN RAISE;END IF;END;
END $$;
RESET ROLE;
UPDATE cloud_members SET role='inventory' WHERE user_id=(SELECT auth.uid());
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM mc_v7_command('fake-inventory-denied','customer.save','{"name":"FAKE"}');RAISE EXCEPTION 'TEST_FAILED';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CLOUD_ROLE_DENIED' THEN RAISE;END IF;END;
 BEGIN PERFORM mc_v7_report('2026-01-01','2026-12-31');RAISE EXCEPTION 'TEST_FAILED';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CLOUD_ROLE_DENIED' THEN RAISE;END IF;END;
END $$;
RESET ROLE;
UPDATE cloud_members SET role='cashier' WHERE user_id=(SELECT auth.uid());
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM mc_v7_catalog('fake-cashier-denied','00000000-0000-0000-0000-000000000001','{}');RAISE EXCEPTION 'TEST_FAILED';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CLOUD_ROLE_DENIED' THEN RAISE;END IF;END;
END $$;
RESET ROLE;
UPDATE cloud_members SET enabled=false WHERE user_id=(SELECT auth.uid());
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM mc_v7_health();RAISE EXCEPTION 'TEST_FAILED';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CLOUD_ACCESS_DENIED' THEN RAISE;END IF;END;
END $$;
RESET ROLE;
SELECT 'PASS role write matrix, raw write denial, membership escalation denial, disabled user' AS verified;
ROLLBACK;
