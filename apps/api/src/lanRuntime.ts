import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {isIP} from 'node:net'
import {X509Certificate} from 'node:crypto'
import {createLanAudit} from './lanAudit.js'
import {createLanSessionManager,type LanCredential} from './lanSecurity.js'
import {freshDevelopment,freshRoot} from './freshDevelopment.js'

function privateIP(ip:string){
 if(isIP(ip)!==4)return false
 const [a,b]=ip.split('.').map(Number)
 return a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168)
}
function readExact(file:string){
 const target=path.resolve(file)
 if(!fs.existsSync(target)||fs.realpathSync(target)!==target||fs.lstatSync(target).isSymbolicLink()||!fs.lstatSync(target).isFile())throw Error('Cấu hình LAN không an toàn')
 return fs.readFileSync(target)
}
export function configureLan(){
 if(process.env.SHOP_LAN_ENABLED!=='1')return null
 if(!freshDevelopment)throw Error('LAN chỉ bật trên bản dữ liệu phát triển riêng')
 const address=String(process.env.SHOP_LAN_BIND??'')
 const port=Number(process.env.SHOP_LAN_PORT??3443)
 if(!privateIP(address)||!Number.isInteger(port)||port<1024||port>65535||port===Number(process.env.PORT??3000))throw Error('Chọn IP riêng của Wi-Fi và cổng HTTPS riêng')
 if(!Object.values(os.networkInterfaces()).flat().some(x=>x?.family==='IPv4'&&!x.internal&&x.address===address))throw Error('IP LAN không thuộc card mạng hiện hành')
 const dir=path.join(freshRoot,'lan')
 if(!fs.existsSync(dir)||fs.realpathSync(dir)!==dir)throw Error('Chưa cấu hình chứng chỉ/tài khoản LAN')
 const cfg=JSON.parse(readExact(path.join(dir,'users.json')).toString('utf8')) as {format:number;users:LanCredential[]}
 if(cfg.format!==1||!Array.isArray(cfg.users)||!cfg.users.some(u=>u.role==='owner'))throw Error('Thiếu tài khoản chủ shop')
 const key=readExact(path.join(dir,'key.pem')),cert=readExact(path.join(dir,'cert.pem')),x=new X509Certificate(cert)
 if(!x.checkIP(address)||Date.parse(x.validFrom)>Date.now()||Date.parse(x.validTo)<Date.now())throw Error('Chứng chỉ HTTPS không hợp lệ với IP LAN')
 return {address,port,key,cert,sessions:createLanSessionManager(cfg.users),audit:createLanAudit(path.join(dir,'audit.jsonl'))}
}
export type LanRuntime=NonNullable<ReturnType<typeof configureLan>>
