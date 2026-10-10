import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import express from 'express'
import {X509Certificate} from 'node:crypto'
import {createLanControl,lanControlRouter} from './lanControl.js'
import {certificatePair,certificateDirectory,exactLanFile} from './lanCertificates.js'
import {createLanSessionManager} from './lanSecurity.js'
import {installLanGuard} from './lanServer.js'
import {privateIP} from './lanRuntime.js'
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-lan-control-')),app=express();app.use(express.json());let control:ReturnType<typeof createLanControl>,checks=0
const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++}
const listener=http.createServer(app);await new Promise<void>(r=>listener.listen(0,'127.0.0.1',r));const localPort=(listener.address() as any).port,local='http://127.0.0.1:'+localPort
// Loopback network dependency is isolated to this disposable test, never an environment/config option.
const dependencies={addresses:()=>[{name:'fixture-loopback',address:'127.0.0.1'}],validAddress:(s:string)=>s==='127.0.0.1',load:(address:string,port:number,dir:string,audit:any)=>{const {cert,key}=certificatePair(dir,address),cfg=JSON.parse(exactLanFile(path.join(dir,'users.json')).toString());return {address,port,cert,key,audit,sessions:createLanSessionManager(cfg.users)}}}
control=createLanControl(app,directory,localPort,null,dependencies);installLanGuard(app,()=>control.current());app.use('/api/local/lan',lanControlRouter(control,localPort));app.get('/api/health',(_req,res)=>res.json({ok:true,lan:!!res.locals.lanUser}))
async function api(route:string,body?:any,origin=local){const r=await fetch(local+'/api/local/lan'+route,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()}}
async function freePort(){const s=http.createServer();await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const p=(s.address() as any).port;await new Promise<void>(r=>s.close(()=>r()));return p}
let port=0;function tls(route:string,method='GET',body?:any,cookie='',host?:string){return new Promise<any>((resolve,reject)=>{const bytes=body===undefined?undefined:JSON.stringify(body),ca=exactLanFile(path.join(certificateDirectory(directory),'ca.pem'));const req=https.request({hostname:'127.0.0.1',port,path:route,method,ca,...(host?{rejectUnauthorized:false}:{}),headers:{Origin:'https://127.0.0.1:'+port,...(cookie?{Cookie:cookie}:{}),...(host?{Host:host}:{}),...(bytes?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(bytes)}:{})}},res=>{let text='';res.setEncoding('utf8');res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text),cookie:res.headers['set-cookie']?.[0]?.split(';')[0]}))});req.on('error',reject);if(bytes)req.write(bytes);req.end()})}
try{
 eq(privateIP('8.8.8.8'),false);eq(privateIP('0.0.0.0'),false);eq(privateIP('192.168.1.3'),true)
 eq((await api('')).data.enabled,false);eq((await api('/accounts',{action:'add',username:'owner',role:'owner',password:'owner-password-123456'},'https://evil.invalid')).status,403)
 eq((await api('/accounts',{action:'add',username:'owner',role:'viewer',password:'owner-password-123456'})).status,400)
 eq((await api('/accounts',{action:'add',username:'owner',role:'owner',password:'owner-password-123456'})).status,200)
 eq((await api('/accounts',{action:'add',username:'viewer',role:'viewer',password:'viewer-password-123456',actor:'owner',ownerPassword:'wrong'})).status,403)
 eq((await api('/accounts',{action:'add',username:'viewer',role:'viewer',password:'viewer-password-123456',actor:'owner',ownerPassword:'owner-password-123456'})).status,200)
 eq((await api('/certificates',{address:'8.8.8.8',confirmed:true})).status,409);eq((await api('/certificates',{address:'127.0.0.1',confirmed:true})).status,200)
 const pair=certificatePair(directory,'127.0.0.1'),ca=new X509Certificate(control.publicCa());eq(ca.ca,true);eq(pair.x.verify(ca.publicKey),true);eq(pair.x.checkIP('127.0.0.1'),'127.0.0.1');eq(fs.existsSync(path.join(pair.directory,'ca-key.pem')),false)
 const state=(await api('')).data;eq(JSON.stringify(state).includes('PRIVATE KEY'),false);eq(JSON.stringify(state).includes('passwordHash'),false)
 port=await freePort();const occupied=http.createServer();await new Promise<void>(r=>occupied.listen(port,'127.0.0.1',r));eq((await api('/enable',{address:'127.0.0.1',port,confirmed:true})).status,409);await new Promise<void>(r=>occupied.close(()=>r()));eq((await fetch(local+'/api/health')).status,200)
 eq((await api('/enable',{address:'127.0.0.1',port,confirmed:true})).status,200);eq((await tls('/api/health')).status,401);eq((await tls('/api/health','GET',undefined,'','evil.invalid:'+port)).status,403)
 const login=await tls('/api/lan/login','POST',{username:'viewer',password:'viewer-password-123456'});eq(login.status,200);eq((await tls('/api/health','GET',undefined,login.cookie)).data.lan,true);eq((await tls('/api/local/lan','GET',undefined,login.cookie)).status,403)
 eq((await api('/certificates',{address:'127.0.0.1',confirmed:true})).status,409)
 const bootPort=await freePort();eq((await api('/ca-download',{port:bootPort,confirmed:true})).status,200);const publicResponse=await fetch('http://127.0.0.1:'+bootPort+'/ca.cer');eq(publicResponse.status,200);eq(new X509Certificate(Buffer.from(await publicResponse.arrayBuffer())).fingerprint256,ca.fingerprint256);eq((await fetch('http://127.0.0.1:'+bootPort+'/api/health')).status,404);eq((await fetch('http://127.0.0.1:'+bootPort+'/key.pem')).status,404)
 eq((await api('/accounts',{action:'reset',username:'viewer',password:'viewer-new-password-56789',actor:'owner',ownerPassword:'owner-password-123456'})).status,200);eq((await tls('/api/health','GET',undefined,login.cookie)).status,401);eq((await tls('/api/lan/login','POST',{username:'viewer',password:'viewer-password-123456'})).status,401)
 eq((await api('/accounts',{action:'disable',username:'owner',actor:'owner',ownerPassword:'owner-password-123456'})).status,403)
 eq((await api('/disable',{})).data.enabled,false);await assert.rejects(tls('/api/health'));checks++;await assert.rejects(fetch('http://127.0.0.1:'+bootPort+'/ca.cer'));checks++;eq((await fetch(local+'/api/health')).status,200)
 const restart=createLanControl(app,directory,localPort,null,dependencies);eq(restart.view().enabled,false);eq(restart.view().users.length,2);eq(restart.view().certificate.caFingerprint,ca.fingerprint256)
 const log=fs.readFileSync(path.join(directory,'audit.jsonl'),'utf8');eq(log.includes('owner-password-123456'),false);eq(log.includes(login.cookie),false)
 console.log('STAGE6_CONTROL PASS: '+checks+' checks; native WebCrypto CA/verified TLS, UI-source guard, first owner/admin roles, no private-key leakage, port conflict LOCAL alive, dedicated TLS login/Host, public CA-only bootstrap, immediate password revoke, stop and restart OFF')
}finally{if(control.current())await control.disable();await new Promise<void>(r=>{listener.close(()=>r());listener.closeAllConnections()});fs.rmSync(directory,{recursive:true,force:true})}
