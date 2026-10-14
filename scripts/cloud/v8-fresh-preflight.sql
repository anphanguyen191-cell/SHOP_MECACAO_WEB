-- V8 Cloud clean-install preflight. Read-only: does NOT delete any data.
select jsonb_build_object(
  'schema', (select value from public.app_metadata where key='schema_version'),
  'status', (select value from public.app_metadata where key='cloud_status'),
  'has_legacy_instance', exists(select 1 from public.app_metadata where key='cloud_instance'),
  'products', (select count(*) from public.products),
  'images', (select count(*) from public.product_images),
  'drafts_or_orders', (select count(*) from public.sales_orders),
  'cloud_image_assets', (select count(*) from public.cloud_image_assets),
  'storage_objects', (select count(*) from storage.objects where bucket_id='shop-mobile-images'),
  'ready_for_clean_v8', (
    not exists(select 1 from public.app_metadata where key='cloud_instance')
    and not exists(select 1 from public.product_images)
    and not exists(select 1 from public.sales_orders)
    and not exists(select 1 from storage.objects where bucket_id='shop-mobile-images')
  )
) as v8_cloud_readiness;
