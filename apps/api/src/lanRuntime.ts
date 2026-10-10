import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {isIP} from 'node:net'
import {certificatePair} from './lanCertificates.js'
import {createLanAudit} from './lanAudit.js'
import {createLanSessionManager,type LanCredential} from './lanSecurity.js'
import {freshDevelopment,freshRoot} from './freshDevelopment.js'

export function privateIP(ip:string){
 if(isIP(ip)!==4)return false
 const [a,b]=ip.split('.').map(Number)
 return a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168)
}
function readExact(file:string){
 const target=path.resolve(file)
 if(!fs.existsSync(target)||fs.realpathSync(target)!==target||fs.lstatSync(target).isSymbolicLink()||!fs.lstatSync(target).isFile())throw Error('Cấu hình LAN không an toàn')
 return fs.readFileSync(target)
}
export function lanAddresses(){try{return Object.entries(os.networkInterfaces()).flatMap(([name,rows])=>(rows??[]).filter(x=>x.family==='IPv4'&&!x.internal&&privateIP(x.address)).map(x=>({name,address:x.address})))}catch{return []}}
export function loadLanRuntime(address:string,port:number,dir=path.join(freshRoot,'lan'),audit?:ReturnType<typeof createLanAudit>){
 if(!privateIP(address)||!Number.isInteger(port)||port<1024||port>65535||port===Number(process.env.PORT??3000))throw Error('Chọn IP riêng của Wi-Fi và cổng HTTPS riêng')
 if(!lanAddresses().some(x=>x.address===address))throw Error('IP LAN không thuộc card mạng hiện hành')
 if(!fs.existsSync(dir)||fs.realpathSync(dir)!==dir)throw Error('Chưa cấu hình chứng chỉ/tài khoản LAN')
 const cfg=JSON.parse(readExact(path.join(dir,'users.json')).toString('utf8')) as {format:number;users:LanCredential[]}
 if(cfg.format!==1||!Array.isArray(cfg.users)||!cfg.users.some(u=>u.role==='owner'))throw Error('Thiếu tài khoản chủ shop')
 const {key,cert}=certificatePair(dir,address)
 return {address,port,key,cert,sessions:createLanSessionManager(cfg.users),audit:audit??createLanAudit(path.join(dir,'audit.jsonl'))}
}
export function configureLan(){if(process.env.SHOP_LAN_ENABLED!=='1')return null;if(!freshDevelopment)throw Error('LAN chỉ bật trên bản dữ liệu phát triển riêng');return loadLanRuntime(String(process.env.SHOP_LAN_BIND??''),Number(process.env.SHOP_LAN_PORT??3443))}
export type LanRuntime=ReturnType<typeof loadLanRuntime>
