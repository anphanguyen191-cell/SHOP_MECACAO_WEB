-- Inventory users must observe source withdrawal/recovery in their watermark;
-- these events carry counts/image metadata, not order/contact/payment details.
ALTER POLICY member_read ON public.cloud_sync_events USING(EXISTS(
 SELECT 1 FROM public.cloud_members WHERE user_id=(SELECT auth.uid()) AND enabled
 AND (role<>'inventory' OR entity_type IN ('catalog','image','image.ready','image.cleanup','variant.price','product.status','inventory.ledger','stocktake.create','stocktake.row','stocktake.finish','source_presence','sold_proof') OR entity_type LIKE 'inbox.%')
));
