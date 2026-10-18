// Deliberately public guest endpoint; only bounded read/submit/receipt actions.
// Admin writes use authenticated, owner-authorized RPCs and never this endpoint.
const originHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,apikey','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const messages:Record<string,string>={CATALOG_DISABLED:'Shop đang chuẩn bị danh mục. Vui lòng quay lại sau.',CATALOG_STOCK_CHANGED:'Hàng đã thay đổi. Đọc lại giỏ và chọn lại ảnh/số lượng.',CATALOG_PRICE_CHANGED:'Giá đã thay đổi. Đọc lại và xác nhận giá mới trước khi gửi.',CATALOG_RATE_LIMIT:'Bạn đã gửi nhiều yêu cầu. Vui lòng liên hệ Shop hoặc thử lại sau.',CATALOG_RETRY_CONFLICT:'Lần gửi trước có nội dung khác. Kiểm tra kết quả trước khi gửi mới.',CATALOG_CONTACT:'Kiểm tra tên, liên hệ và đồng ý để Shop liên hệ.',CATALOG_UNAVAILABLE:'Ảnh hiện không còn công khai.',CATALOG_INPUT:'Danh sách không hợp lệ. Kiểm tra lại thông tin.',CATALOG_LIMIT:'Mỗi yêu cầu tối đa 100 bộ.'};
const base=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function rpc(name:string,args:unknown){const r=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(args)});const data=await r.json();if(!r.ok)throw Error(Object.keys(messages).find(c=>String(data.message).includes(c))||(['22P02','23514','22003','22023'].includes(data.code)?'CATALOG_INPUT':'CATALOG_SERVER'));return data;}
async function hash(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function ipHash(req:Request){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown')))].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function body(req:Request){if(Number(req.headers.get('content-length'))>45000)throw Error('CATALOG_INPUT');if(!req.body)throw Error('CATALOG_INPUT');const reader=req.body.getReader();let bytes=0,text='';const decoder=new TextDecoder();for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;if(bytes>45000){await reader.cancel();throw Error('CATALOG_INPUT')}text+=decoder.decode(r.value,{stream:true})}text+=decoder.decode();try{return JSON.parse(text)}catch{throw Error('CATALOG_INPUT')}}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:originHeaders});
 try{
  const url=new URL(req.url);let data;
  if(req.method==='GET'){
   if(url.searchParams.has('image')){
    const image=url.searchParams.get('image');if(!image||!/^\d{1,15}$/.test(image))throw Error('CATALOG_INPUT');
    const item=await rpc('mc_catalog_public',{p_action:'image',p_payload:{image_id:Number(image)}});
    const asset=await fetch(base+'/storage/v1/object/authenticated/shop-mobile-images/'+item.path.split('/').map(encodeURIComponent).join('/'),{headers:{apikey:key,Authorization:'Bearer '+key}});
    if(!asset.ok)throw Error('CATALOG_UNAVAILABLE');
    // Never redirect to a signed storage URL. Each future read rechecks eligibility.
    return new Response(asset.body,{headers:{...originHeaders,'Content-Type':'image/jpeg'}});
   }
   const action=url.searchParams.get('action')||'config';if(!['config','products','photos'].includes(action))throw Error('CATALOG_INPUT');
   data=await rpc('mc_catalog_public',{p_action:action,p_payload:{product_id:url.searchParams.get('product_id'),variant_id:url.searchParams.get('variant_id'),offset:url.searchParams.get('offset')||0,query:url.searchParams.get('query')||'',size:url.searchParams.get('size')||'',sort:url.searchParams.get('sort')||'new',in_stock:url.searchParams.get('in_stock')||'false'}});
  }else if(req.method==='POST'){
   const input=await body(req);if(!input||!['submit','receipt'].includes(input.action)||typeof input.token!=='string'||!/^[a-f0-9]{64}$/.test(input.token))throw Error('CATALOG_INPUT');
   data=await rpc('mc_catalog_submit',{p_token_hash:await hash(input.token),p_ip_hash:await ipHash(req),p_payload:input.payload||{},p_lookup:input.action==='receipt'});
  }else return new Response(null,{status:405,headers:originHeaders});
  return Response.json(data,{headers:originHeaders});
 }catch(e){const code=(e as Error).message,status=code==='CATALOG_RATE_LIMIT'?429:code==='CATALOG_DISABLED'?503:code==='CATALOG_UNAVAILABLE'?404:code==='CATALOG_SERVER'?503:409;
  return Response.json({code,error:messages[code]||'Chưa kiểm tra được dữ liệu Shop. Vui lòng thử lại; yêu cầu chưa được xác nhận.'},{status,headers:originHeaders});}
});
