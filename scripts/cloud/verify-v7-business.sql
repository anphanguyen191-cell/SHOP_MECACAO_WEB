BEGIN;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM auth.users LIMIT 1),true);
INSERT INTO products(id,product_code,name) VALUES(999,'FAKE999','FAKE product');
INSERT INTO product_variants(id,product_id,sku,size,sale_price) VALUES(999,999,'FAKE999-1','1',50000);
INSERT INTO product_images(id,product_id,variant_id,file_path) VALUES(999,999,999,'fake/999.jpg');
INSERT INTO cloud_image_assets(image_id,object_path,bytes,sha256,revision,ready) VALUES(999,'fake/999.jpg',10000,repeat('a',64),'fake',true);
INSERT INTO app_metadata(key,value) VALUES('cloud_instance','11111111-1111-4111-8111-111111111111');
SET LOCAL ROLE authenticated;
SELECT mc_v7_command('fake-customer-0001','customer.save','{"id":"fake-customer","version":0,"name":"FAKE Customer","phone":"0909999999"}');
SELECT mc_v7_command('fake-draft-000001','draft.save','{"id":"fake-order","version":0,"items":[{"imageId":999,"unitPrice":50000}],"contact":{"customerId":"fake-customer","recipientName":"FAKE","shippingFee":10000},"discount":5000}');
DO $$ BEGIN
 BEGIN PERFORM mc_v7_command('fake-stale-00001','draft.save','{"id":"fake-order","version":0,"items":[{"imageId":999,"unitPrice":1}]}'); RAISE EXCEPTION 'TEST_FAILED'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CLOUD_VERSION_CONFLICT' THEN RAISE; END IF; END;
 IF (mc_v7_finance('fake-order')->>'originalTotal')::bigint<>55000 THEN RAISE EXCEPTION 'STALE_WRITE_CHANGED_TOTAL'; END IF;
END $$;
SELECT mc_v7_command('fake-payment-0001','finance.entry','{"id":"fake-order","version":0,"orderVersion":1,"kind":"RECEIPT","amount":10000,"method":"TRANSFER","note":"FAKE deposit"}');
SELECT mc_v7_command('fake-sale-000001','sale.confirm','{"id":"fake-order","version":1,"confirmed":true,"acknowledgeZeroPrice":false}');
SELECT mc_v7_command('fake-sale-000001','sale.confirm','{"id":"fake-order","version":1,"confirmed":true,"acknowledgeZeroPrice":false}');
SELECT mc_v7_command('fake-credit-00001','finance.entry','{"id":"fake-order","version":1,"orderVersion":1,"kind":"CREDIT","amount":5000,"method":"TRANSFER","note":"FAKE adjustment"}');
DO $$ BEGIN
 IF (mc_v7_finance('fake-order')->>'due')::bigint<>40000 THEN RAISE EXCEPTION 'FINANCE_WRONG'; END IF;
 IF (SELECT count(*) FROM sales_units WHERE image_id=999)<>1 THEN RAISE EXCEPTION 'SALE_DUPLICATE'; END IF;
 IF (mc_v7_report('2000-01-01','2100-12-31')->'totals'->>'goodsTotal')::bigint<>45000 THEN RAISE EXCEPTION 'REPORT_REVENUE_WRONG'; END IF;
 IF (mc_v7_report('2000-01-01','2100-12-31')->'totals'->>'netCash')::bigint<>10000 THEN RAISE EXCEPTION 'REPORT_CASH_WRONG'; END IF;
 BEGIN PERFORM mc_v7_command('fake-second-0001','draft.save','{"id":"fake-order2","version":0,"items":[{"imageId":999,"unitPrice":50000}]}'); RAISE EXCEPTION 'TEST_FAILED'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CLOUD_STOCK_UNAVAILABLE' THEN RAISE; END IF; END;
 BEGIN PERFORM mc_v7_command('fake-overpay-001','finance.entry','{"id":"fake-order","version":2,"orderVersion":1,"kind":"RECEIPT","amount":100000,"method":"CASH","note":"FAKE"}'); RAISE EXCEPTION 'TEST_FAILED'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CLOUD_FINANCE_AMOUNT_INVALID' THEN RAISE; END IF; END;
END $$;
DO $$ BEGIN
 BEGIN PERFORM mc_v7_sold_cleanup('prepare',ARRAY[999]::bigint[],'FAKE cleanup',true);RAISE EXCEPTION 'TEST_FAILED';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CLOUD_ARCHIVE_NOT_VERIFIED' THEN RAISE;END IF;END;
 PERFORM mc_v7_archive_ack('fake-order','11111111-1111-4111-8111-111111111111',(SELECT operation_id FROM sales_confirmations WHERE order_id='fake-order'),'22222222-2222-4222-8222-222222222222');
 PERFORM mc_v7_sold_cleanup('prepare',ARRAY[999]::bigint[],'FAKE cleanup',true);
 -- No Storage objects were inserted by this fixture. Verify the ledger survives
 -- finalizing an absent fake file; real deletion is performed only via Storage API.
 PERFORM mc_v7_sold_cleanup('finalize',ARRAY[999]::bigint[],'FAKE cleanup',true);
 IF (SELECT ready FROM cloud_image_assets WHERE image_id=999) THEN RAISE EXCEPTION 'CLEANUP_READY_WRONG';END IF;
 IF (SELECT count(*) FROM sales_units WHERE image_id=999)<>1 OR (mc_v7_finance('fake-order')->>'due')::bigint<>40000 THEN RAISE EXCEPTION 'CLEANUP_CHANGED_HISTORY'; END IF;
END $$;
RESET ROLE;
SELECT 'PASS business commands, deposit, SOLD retry, stock conflict, credit and amount guard' AS verified;
ROLLBACK;
