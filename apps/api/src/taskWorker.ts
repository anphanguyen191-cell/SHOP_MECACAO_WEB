// This worker is started by the server, waits for its durable PID lock, and never serves HTTP.
if(!process.send||process.env.SHOP_TASK_WORKER!=='1')throw Error('Task worker requires parent IPC')
process.once('disconnect',()=>process.exit(1))
function finish(value:unknown,code:number){process.once('message',(ack:any)=>process.exit(ack?.persisted===true?code:1));process.send?.(value)}
process.once('message',async(message:any)=>{
 const emit=(progress:unknown)=>process.send?.({progress})
 try{
  const {recoverPendingGoodsReceipts}=await import('./receiptRecovery.js');recoverPendingGoodsReceipts()
  const {recoverImageRenames}=await import('./imageRename.js');recoverImageRenames()
  let result:unknown
  if(message.kind==='SCAN'){const {checkWarehouse}=await import('./warehouseWatch.js');const scan=checkWarehouse(message.payload.rootPath,emit);result=message.payload.background?{mode:'BACKGROUND_SCAN',summary:scan.summary,rootPath:scan.rootPath,scannedAt:scan.scannedAt}:scan}
  else if(message.kind==='RECEIPT'){const {receiveGoods}=await import('./goodsReceipt.js');result=receiveGoods(message.payload,emit)}
  else if(message.kind==='BACKUP'){const {createLosslessBackup}=await import('./backup.js');result=createLosslessBackup(emit)}
  else if(message.kind==='REGISTER_BATCH'){
   const {commitStoreImport}=await import('./storeImport.js'),{db}=await import('./db.js'),outcomes:any[]=[]
   for(let i=0;i<message.payload.products.length;i++){
    const p=message.payload.products[i];emit({phase:'REGISTER',completed:i,total:message.payload.products.length,current:p.name,outcomes})
    try{const before=Number(db.prepare('SELECT COUNT(*) n FROM product_images').get()!.n),sizes=Number(db.prepare('SELECT COUNT(*) n FROM product_variants').get()!.n);commitStoreImport(p);outcomes.push({name:p.name,status:'SAVED',images:Number(db.prepare('SELECT COUNT(*) n FROM product_images').get()!.n)-before,sizes:Number(db.prepare('SELECT COUNT(*) n FROM product_variants').get()!.n)-sizes,message:'Đã đăng ký; ảnh cũ không cộng trùng'})}
    catch(e){outcomes.push({name:p.name,status:'ERROR',images:0,sizes:0,message:e instanceof Error?e.message:String(e)});for(const rest of message.payload.products.slice(i+1))outcomes.push({name:rest.name,status:'UNPROCESSED',images:0,sizes:0,message:'Lô đã dừng ở lỗi trước'});break}
   }
   result={outcomes};emit({phase:'REGISTER',completed:outcomes.filter(r=>r.status==='SAVED').length,total:message.payload.products.length,outcomes})
  }else throw Error('Unknown task')
  finish({result},0)
 }catch(e){finish({error:e instanceof Error?e.message:String(e)},1)}
})
