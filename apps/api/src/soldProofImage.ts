import sharp from 'sharp'
import {createHash} from 'node:crypto'
/** Small read-only derivative of a hash-verified local SOLD archive. */
export async function soldProofImage(bytes:Buffer){
 for(const quality of [68,55,42,30]){const data=await sharp(bytes,{limitInputPixels:40_000_000}).rotate().resize({width:240,height:320,fit:'inside',withoutEnlargement:true}).jpeg({quality}).toBuffer();if(data.length<=40000)return {data,sha256:createHash('sha256').update(data).digest('hex')}}
 throw Error('Ảnh chứng từ chưa đạt giới hạn 40KB; giữ ảnh Cloud để kiểm tra.')
}
