import 'reflect-metadata'
import fs from 'node:fs'
import path from 'node:path'
import {webcrypto,randomUUID,X509Certificate,createPrivateKey} from 'node:crypto'
import * as x509 from '@peculiar/x509'
const crypto=webcrypto as unknown as Crypto
const algorithm={name:'RSASSA-PKCS1-v1_5',hash:'SHA-256',publicExponent:new Uint8Array([1,0,1]),modulusLength:2048}
export function exactLanFile(file:string){if(fs.realpathSync(file)!==file||fs.lstatSync(file).isSymbolicLink()||!fs.lstatSync(file).isFile())throw Error('Tệp cấu hình LAN không an toàn');return fs.readFileSync(file)}
export function durableLanFile(file:string,value:string|Buffer){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,value);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
export function replaceLanJson(file:string,value:unknown){if(fs.existsSync(file))exactLanFile(file);const tmp=file+'.tmp-'+randomUUID();durableLanFile(tmp,JSON.stringify(value,null,2)+'\n');try{fs.renameSync(tmp,file)}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}}
export function certificateDirectory(directory:string){const pointer=path.join(directory,'tls.json');if(!fs.existsSync(pointer))return directory;const p=JSON.parse(exactLanFile(pointer).toString());if(p.format!==1||! /^[a-f0-9-]{36}$/.test(p.bundle))throw Error('Cấu hình chứng chỉ không hợp lệ');const dir=path.join(directory,'tls-bundles',p.bundle);if(fs.realpathSync(dir)!==dir||!fs.lstatSync(dir).isDirectory())throw Error('Thư mục chứng chỉ không an toàn');return dir}
export function certificatePair(directory:string,address:string){const dir=certificateDirectory(directory),cert=exactLanFile(path.join(dir,'cert.pem')),key=exactLanFile(path.join(dir,'key.pem')),x=new X509Certificate(cert);if(!x.checkIP(address)||Date.parse(x.validFrom)>Date.now()||Date.parse(x.validTo)<Date.now()||!x.checkPrivateKey(createPrivateKey(key)))throw Error('Chứng chỉ/khóa HTTPS chưa hợp lệ với IP được chọn');return {cert,key,x,directory:dir}}
export async function generateLanCertificates(directory:string,address:string){
 const before=new Date(Date.now()-300000),after=new Date(Date.now()+90*86400000),caAfter=new Date(Date.now()+365*86400000)
 const caKeys=await crypto.subtle.generateKey(algorithm,true,['sign','verify']) as CryptoKeyPair,keys=await crypto.subtle.generateKey(algorithm,true,['sign','verify']) as CryptoKeyPair
 const name='CN=Me CaCao LAN '+randomUUID().slice(0,8)
 const ca=await x509.X509CertificateGenerator.createSelfSigned({name,notBefore:before,notAfter:caAfter,signingAlgorithm:algorithm,keys:caKeys,extensions:[new x509.BasicConstraintsExtension(true,0,true),new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign|x509.KeyUsageFlags.cRLSign,true),await x509.SubjectKeyIdentifierExtension.create(caKeys.publicKey,false,crypto)]},crypto)
 const cert=await x509.X509CertificateGenerator.create({subject:'CN=Me CaCao Windows',issuer:name,notBefore:before,notAfter:after,signingAlgorithm:algorithm,publicKey:keys.publicKey,signingKey:caKeys.privateKey,extensions:[new x509.BasicConstraintsExtension(false,undefined,true),new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature|x509.KeyUsageFlags.keyEncipherment,true),new x509.ExtendedKeyUsageExtension(['1.3.6.1.5.5.7.3.1']),new x509.SubjectAlternativeNameExtension([{type:'ip',value:address}]),await x509.SubjectKeyIdentifierExtension.create(keys.publicKey,false,crypto),await x509.AuthorityKeyIdentifierExtension.create(caKeys.publicKey,false,crypto)]},crypto)
 const bundles=path.join(directory,'tls-bundles');fs.mkdirSync(bundles,{recursive:true});if(fs.realpathSync(bundles)!==bundles)throw Error('Vùng chứng chỉ không an toàn');const id=randomUUID(),dir=path.join(bundles,id);fs.mkdirSync(dir)
 const pem=(bytes:ArrayBuffer)=>'-----BEGIN PRIVATE KEY-----\n'+Buffer.from(bytes).toString('base64').match(/.{1,64}/g)!.join('\n')+'\n-----END PRIVATE KEY-----\n'
 // CA private key is deliberately not persisted: only this server certificate is issued.
 durableLanFile(path.join(dir,'ca.pem'),ca.toString('pem'));durableLanFile(path.join(dir,'cert.pem'),cert.toString('pem'));durableLanFile(path.join(dir,'key.pem'),pem(await crypto.subtle.exportKey('pkcs8',keys.privateKey)));durableLanFile(path.join(dir,'metadata.json'),JSON.stringify({address,createdAt:new Date().toISOString()}))
 const check=certificatePair(dir,address);if(!check.x.verify(new X509Certificate(ca.toString('pem')).publicKey))throw Error('Không xác minh được chuỗi chứng chỉ vừa tạo')
 replaceLanJson(path.join(directory,'tls.json'),{format:1,bundle:id});return {fingerprint:new X509Certificate(ca.toString('pem')).fingerprint256,expiresAt:after.toISOString()}
}
