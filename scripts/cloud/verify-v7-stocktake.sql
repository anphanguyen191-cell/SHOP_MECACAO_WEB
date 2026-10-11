BEGIN;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM auth.users LIMIT 1),true);
INSERT INTO products(id,product_code,name) VALUES(998,'FAKE998','FAKE stocktake');
INSERT INTO product_variants(id,product_id,sku,size) VALUES(998,998,'FAKE998-S1','S1');
INSERT INTO product_images(id,product_id,variant_id,file_path) VALUES(998,998,998,'fake/998.jpg');
INSERT INTO cloud_image_assets(image_id,object_path,bytes,sha256,revision,ready) VALUES(998,'fake/998.jpg',10000,repeat('b',64),'fake',true);
SET LOCAL ROLE authenticated;
SELECT mc_v7_stocktake('fake-stocktake-create','stocktake.create','{"id":"fake-stocktake","title":"FAKE stocktake"}');
SELECT mc_v7_stocktake('fake-stocktake-row01','stocktake.row','{"id":"fake-stocktake","version":1,"variantId":998,"counted":1,"note":"FAKE"}');
SELECT mc_v7_stocktake('fake-stocktake-row01','stocktake.row','{"id":"fake-stocktake","version":1,"variantId":998,"counted":1,"note":"FAKE"}');
DO $$ BEGIN
 IF (SELECT version FROM stocktake_sessions WHERE id='fake-stocktake')<>2 THEN RAISE EXCEPTION 'RETRY_BUMPED_VERSION'; END IF;
 BEGIN PERFORM mc_v7_stocktake('fake-stocktake-stale','stocktake.row','{"id":"fake-stocktake","version":1,"variantId":998,"counted":2}');RAISE EXCEPTION 'TEST_FAILED';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CLOUD_VERSION_CONFLICT' THEN RAISE;END IF;END;
END $$;
SELECT mc_v7_stocktake('fake-stocktake-close','stocktake.finish','{"id":"fake-stocktake","version":2,"conclusion":"FAKE completed","confirmed":true}');
DO $$ BEGIN
 IF (SELECT status FROM stocktake_sessions WHERE id='fake-stocktake')<>'CLOSED' THEN RAISE EXCEPTION 'NOT_CLOSED'; END IF;
 IF (SELECT count(*) FROM sales_units WHERE image_id=998)<>0 THEN RAISE EXCEPTION 'COUNTING_SOLD_STOCK'; END IF;
END $$;
RESET ROLE;
SELECT 'PASS stocktake create/count/retry/version/finish; no stock mutation' AS verified;
ROLLBACK;
