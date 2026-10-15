-- V8 owner-approved archival Cloud transition. Schema-only; cannot delete any data by installation.
create table if not exists private.mc_v8_handoff_archive (
 id bigint generated always as identity primary key,
 source_instance uuid not null,
 target_instance uuid not null unique,
 recorded_at timestamptz not null default now(),
 source_sequence bigint not null,
 data_snapshot jsonb not null,
 object_count integer not null,
 object_bytes bigint not null
);
revoke all on private.mc_v8_handoff_archive from public,anon,authenticated;
create table if not exists private.mc_v8_handoff_assets (
 archive_id bigint not null references private.mc_v8_handoff_archive(id),
 object_path text not null, sha256 text not null, bytes bigint not null,
 primary key(archive_id,object_path)
);
revoke all on private.mc_v8_handoff_assets from public,anon,authenticated;
create index if not exists mc_v8_handoff_assets_sha on private.mc_v8_handoff_assets(sha256);

CREATE OR REPLACE FUNCTION private.mc_v8_handoff_preview(p_target_instance uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r text; origin text; target text; seq bigint;
begin
  r:=private.mc_v7_role();
  if r<>'owner' then raise exception 'CLOUD_ROLE_DENIED' using errcode='42501';end if;
  if p_target_instance is null then raise exception 'V8_TARGET_REQUIRED'; end if;
  select value into origin from public.app_metadata where key='cloud_instance';
  target:=p_target_instance::text;
  select coalesce(max(sequence),0) into seq from public.cloud_sync_events;
  return jsonb_build_object(
    'currentInstance',origin,'targetInstance',target,'sameInstance',origin=target,
    'sequence',seq,'products',(select count(*) from public.products),
    'images',(select count(*) from public.product_images),
    'orders',(select count(*) from public.sales_orders),
    'sold',(select count(*) from public.sales_confirmations),
    'finance',(select count(*) from public.finance_entries),
    'objects',(select count(*) from storage.objects where bucket_id='shop-mobile-images' and name like ('v7/'||coalesce(origin,'')||'/%')),
    'bytes',(select coalesce(sum((metadata->>'size')::bigint),0) from storage.objects where bucket_id='shop-mobile-images' and name like ('v7/'||coalesce(origin,'')||'/%')),
    'archived',(select count(*) from private.mc_v8_handoff_archive where target_instance=p_target_instance),
    'status',(select value from public.app_metadata where key='cloud_status')
  );
end $function$

CREATE OR REPLACE FUNCTION private.mc_v8_handoff(p_target_instance uuid, p_source_instance uuid, p_expected_sequence bigint, p_confirmation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare origin text;seq bigint;snapshot jsonb:='{}'::jsonb;part jsonb;
   tab text; arch_id bigint;ob_count integer;ob_bytes bigint;
begin
 if private.mc_v7_role()<>'owner' then raise exception 'CLOUD_ROLE_DENIED' using errcode='42501';end if;
 if p_target_instance is null or p_source_instance is null or p_target_instance=p_source_instance
    or p_confirmation<>'TIEP_NHAN_V8_CHINH_THUC'
 then raise exception 'CLOUD_V8_HANDOFF_CONFIRMATION_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 -- Lock the entire mutable business set to prevent a competing request during snapshot/switch.
 lock table public.categories,public.products,public.product_variants,public.product_images,
 public.inventory_transactions,public.sales_orders,public.sales_order_images,
 public.sales_operations,public.sales_confirmations,public.sales_units,public.sales_ledger,
 public.shop_customers,public.order_contacts,public.order_finance,public.finance_entries,
 public.aftercare_cases,public.stocktake_sessions,public.stocktake_rows,
 public.cloud_image_assets,public.cloud_sync_events,public.cloud_sync_cursors,
 public.cloud_requests,public.cloud_photo_inbox,public.cloud_archive_receipts
 in access exclusive mode;
 select value into origin from public.app_metadata where key='cloud_instance' for update;
 if origin=p_target_instance::text then
   select id into arch_id from private.mc_v8_handoff_archive where target_instance=p_target_instance;
   return jsonb_build_object('ok',true,'alreadySwitched',true,'archiveId',arch_id);
 end if;
 if origin is distinct from p_source_instance::text then raise exception 'CLOUD_WAREHOUSE_MISMATCH';end if;
 if exists(select 1 from private.mc_v8_handoff_archive where target_instance=p_target_instance) then
   raise exception 'CLOUD_V8_HANDOFF_ALREADY_USED';end if;
 select coalesce(max(sequence),0) into seq from public.cloud_sync_events;
 if seq is distinct from p_expected_sequence then raise exception 'CLOUD_CHANGED_RECHECK';end if;
 -- Business-financial history must never be silently reset, even into an archive.
 if exists(select 1 from public.sales_confirmations)
 or exists(select 1 from public.sales_units)
 or exists(select 1 from public.finance_entries)
 or exists(select 1 from public.sales_ledger)
 or exists(select 1 from public.aftercare_cases)
 or exists(select 1 from public.order_finance)
 or exists(select 1 from public.sales_operations)
 or exists(select 1 from public.stocktake_sessions)
 or exists(select 1 from public.sales_orders where status not in ('DRAFT','CANCELLED_DRAFT'))
 then raise exception 'CLOUD_HAS_LIVE_BUSINESS_DATA';end if;
 if exists(select 1 from public.cloud_image_assets a where a.ready and not exists(
    select 1 from storage.objects o where o.bucket_id='shop-mobile-images' and o.name=a.object_path))
 then raise exception 'CLOUD_LEGACY_ASSET_MISSING';end if;
 for tab in select unnest(array[
 'categories','products','product_variants','product_images','inventory_transactions',
 'sales_orders','sales_order_images','sales_operations','sales_confirmations',
 'sales_units','sales_ledger','shop_customers','order_contacts','order_finance',
 'finance_entries','aftercare_cases','stocktake_sessions','stocktake_rows',
 'cloud_image_assets','cloud_sync_events','cloud_sync_cursors','cloud_requests',
 'cloud_photo_inbox','cloud_archive_receipts','app_metadata','app_settings'
 ]) loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t',tab) into part;
  snapshot:=snapshot||jsonb_build_object(tab,part);
 end loop;
 select count(*),coalesce(sum((o.metadata->>'size')::bigint),0) into ob_count,ob_bytes
 from storage.objects o where o.bucket_id='shop-mobile-images' and o.name like ('v7/'||origin||'/%');
 insert into private.mc_v8_handoff_archive(source_instance,target_instance,source_sequence,
 data_snapshot,object_count,object_bytes)
 values(p_source_instance,p_target_instance,seq,snapshot,ob_count,ob_bytes)
 returning id into arch_id;
 insert into private.mc_v8_handoff_assets(archive_id,object_path,sha256,bytes)
 select arch_id,a.object_path,a.sha256,a.bytes
 from public.cloud_image_assets a where a.ready
   and exists(select 1 from storage.objects o where o.bucket_id='shop-mobile-images' and o.name=a.object_path);
 -- The 24 named tables form a complete FK closure. Auth membership/config remain intact.
 truncate table public.cloud_archive_receipts,public.cloud_photo_inbox,
 public.cloud_sync_cursors,public.cloud_sync_events,public.cloud_requests,
 public.cloud_image_assets,public.stocktake_rows,public.stocktake_sessions,
 public.aftercare_cases,public.finance_entries,public.order_finance,
 public.order_contacts,public.shop_customers,public.sales_ledger,public.sales_units,
 public.sales_confirmations,public.sales_operations,public.sales_order_images,
 public.sales_orders,public.inventory_transactions,public.product_images,
 public.product_variants,public.products,public.categories restart identity;
 insert into public.app_metadata(key,value) values('cloud_instance',p_target_instance::text)
 on conflict(key) do update set value=excluded.value;
 insert into public.app_metadata(key,value) values('cloud_status','RPC_READY')
 on conflict(key) do update set value=excluded.value;
 insert into public.app_metadata(key,value) values('cloud_version','V8-official-handoff')
 on conflict(key) do update set value=excluded.value;
 return jsonb_build_object('ok',true,'alreadySwitched',false,'archiveId',arch_id,
   'archivedStorageObjects',ob_count,'archivedStorageBytes',ob_bytes,'newInstance',p_target_instance);
end $function$

CREATE OR REPLACE FUNCTION private.mc_v8_can_cleanup_legacy(p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select private.mc_v7_role()='owner' and exists(
 select 1 from private.mc_v8_handoff_assets h
 join private.mc_v8_handoff_archive a on a.id=h.archive_id
 join public.cloud_image_assets current_asset on current_asset.sha256=h.sha256
 join storage.objects current_object on current_object.bucket_id='shop-mobile-images' and current_object.name=current_asset.object_path
 where h.object_path=p_path and current_asset.ready and current_asset.source_present is distinct from false
 and current_asset.object_path<>h.object_path
 and (select value from public.app_metadata where key='cloud_instance')=a.target_instance::text
 and (select value from public.app_metadata where key='cloud_status')='CLOUD_TEST_READY'
)
$function$

CREATE OR REPLACE FUNCTION private.mc_v8_archive_delete_allowed(p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select not exists(select 1 from private.mc_v8_handoff_assets where object_path=p_path)
   or private.mc_v8_can_cleanup_legacy(p_path)
$function$

CREATE OR REPLACE FUNCTION public.mc_v8_handoff_preview(p_target_instance uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
select private.mc_v8_handoff_preview(p_target_instance)
$function$

CREATE OR REPLACE FUNCTION public.mc_v8_handoff(p_target_instance uuid, p_source_instance uuid, p_expected_sequence bigint, p_confirmation text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
select private.mc_v8_handoff(p_target_instance,p_source_instance,p_expected_sequence,p_confirmation)
$function$

CREATE OR REPLACE FUNCTION public.mc_v8_legacy_cleanup_candidates(p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare answer jsonb;
begin
 if private.mc_v7_role()<>'owner' then raise exception 'CLOUD_ROLE_DENIED' using errcode='42501';end if;
 if p_limit<1 or p_limit>100 then raise exception 'CLOUD_BATCH_TOO_LARGE';end if;
 select coalesce(jsonb_agg(jsonb_build_object('path',q.object_path,'bytes',q.bytes)),'[]'::jsonb)
 into answer from (
  select h.object_path,h.bytes from private.mc_v8_handoff_assets h
  join storage.objects o on o.bucket_id='shop-mobile-images' and o.name=h.object_path
  where private.mc_v8_can_cleanup_legacy(h.object_path)
  order by h.object_path limit p_limit
 ) q;
 return answer;
end $function$


revoke all on function private.mc_v8_handoff_preview(uuid) from public,anon,authenticated;
revoke all on function private.mc_v8_handoff(uuid,uuid,bigint,text) from public,anon,authenticated;
revoke all on function private.mc_v8_can_cleanup_legacy(text) from public,anon;
revoke all on function private.mc_v8_archive_delete_allowed(text) from public,anon;
grant execute on function private.mc_v8_can_cleanup_legacy(text) to authenticated;
grant execute on function private.mc_v8_archive_delete_allowed(text) to authenticated;
revoke all on function public.mc_v8_handoff_preview(uuid) from public,anon;
revoke all on function public.mc_v8_handoff(uuid,uuid,bigint,text) from public,anon;
revoke all on function public.mc_v8_legacy_cleanup_candidates(integer) from public,anon;
grant execute on function public.mc_v8_handoff_preview(uuid) to authenticated;
grant execute on function public.mc_v8_handoff(uuid,uuid,bigint,text) to authenticated;
grant execute on function public.mc_v8_legacy_cleanup_candidates(integer) to authenticated;
drop policy if exists "mc_v8_identical_legacy_object_cleanup" on storage.objects;
create policy "mc_v8_identical_legacy_object_cleanup" on storage.objects for delete to authenticated
using (bucket_id='shop-mobile-images' and private.mc_v8_can_cleanup_legacy(name));
