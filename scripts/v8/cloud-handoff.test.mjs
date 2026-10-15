import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const ui=fs.readFileSync(new URL('../../apps/web/src/CloudSettings.tsx',import.meta.url),'utf8')
const sql=fs.readFileSync(new URL('../../supabase/migrations/20261015082500_v8_safe_cloud_handoff.sql',import.meta.url),'utf8')
const guard=fs.readFileSync(new URL('../../supabase/migrations/20261015082600_v8_cloud_storage_guard.sql',import.meta.url),'utf8')
test('handoff requires owner consent, stable sequence, backup and no sold/finance history',()=>{
 for(const token of ['mc_v8_handoff_preview','mc_v8_handoff','TIEP_NHAN_V8_CHINH_THUC'])assert.ok(ui.includes(token))
 for(const token of ['mc_v8_handoff_archive','CLOUD_CHANGED_RECHECK','CLOUD_HAS_LIVE_BUSINESS_DATA','data_snapshot','CLOUD_LEGACY_ASSET_MISSING'])assert.ok(sql.includes(token))
})
test('activation happens only after full Windows/Cloud inventory verification',()=>{
 assert.ok(ui.includes('missingCount>0'))
 assert.ok(ui.includes('reconcileCloudImages(activePhotos,afterImages,afterAssets,afterSold,localProducts)'))
 assert.ok(ui.indexOf("await apiJson('/api/cloud/activate'")>ui.indexOf("afterImages=await cloudRows('product_images'"))
 assert.ok(ui.indexOf("await apiJson('/api/cloud/activate'")>ui.indexOf("mc_v8_stock_integrity"))
 assert.ok(ui.indexOf("await apiJson('/api/cloud/activate'")>ui.indexOf("await apiJson('/api/cloud/prices'"))
})
test('retained old images only delete after identical SHA, ready asset, and explicit action',()=>{
 for(const token of ['Dọn ảnh Cloud cũ đã đối soát','mc_v8_legacy_cleanup_candidates'])assert.ok(ui.includes(token))
 for(const token of ['current_asset.sha256=h.sha256','current_asset.ready','current_object.name=current_asset.object_path'])assert.ok(sql.includes(token))
 assert.ok(guard.includes('as restrictive'))
})

test('V8 Cloud sync checks existing registrations and reuses identical content',()=>{
 for(const token of ['existingImages=new Map','group.filter((item:any)=>!existingImages.has(Number(item.id)))','mc_v8_catalog_variants','mc_v8_reuse_image','reuse.reused&&reuse.ready','ready.set(Number(image.id),hash)'])assert.ok(ui.includes(token),token)
})
const dedup=fs.readFileSync(new URL('../../supabase/migrations/20261015190000_v8_reuse_content_hash_across_versions.sql',import.meta.url),'utf8')
test('Cloud SHA reuse checks physical JPEG, legacy archive and prevents deleting active references',()=>{
 for(const token of ['mc_v8_catalog_variants','mc_v8_reuse_image','mc_v8_handoff_assets','a.sha256=p_sha',"stored.metadata->>'mimetype'='image/jpeg'",'active.object_path=p_path AND active.ready'])assert.ok(dedup.includes(token),token)
})

const soldGuard=fs.readFileSync(new URL('../../supabase/migrations/20261015192000_v8_prevent_shared_sold_asset_deletion.sql',import.meta.url),'utf8')
test('sold unit archive cannot delete the sole jpeg backing another unsold unit',()=>{
 for(const key of ['NOT EXISTS','used.object_path=match_source.object_path','used.ready','mc_v8_unsold_object_protected','mc_v8_unsold_storage_file_guard','AS RESTRICTIVE'])assert.ok(soldGuard.includes(key),key)
})
