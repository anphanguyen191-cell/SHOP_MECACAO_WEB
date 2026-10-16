import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import {createWindowsAuth} from '../../apps/api/src/windowsAuth.ts'

test('Windows owner login: setup, session gate, remembered one-click, logout, restart and forget',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-win-auth-'))
 const build=()=>{
  const app=express();app.use(express.json())
  const auth=createWindowsAuth(dir)
  app.use('/api/local/auth',auth.router)
  app.use('/api',auth.gate)
  app.get('/api/private',(_req,res)=>res.json({ok:true}))
  return app
 }
 let server=build().listen(0,'127.0.0.1')
 await new Promise<void>(resolve=>server.once('listening',resolve))
 const address=()=> 'http://127.0.0.1:'+(server.address() as any).port
 const request=async(route:string,method='GET',body?:unknown,cookies='')=>{
  const r=await fetch(address()+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookies?{Cookie:cookies}:{})},body:body?JSON.stringify(body):undefined})
  const json=await r.json()
  return {status:r.status,json,cookies:r.headers.getSetCookie()}
 }
 try{
  const initial=await request('/api/local/auth/state')
  assert.equal(initial.status,200);assert.equal(initial.json.configured,false)
  assert.equal((await request('/api/private')).status,200,'First-run setup must not destroy existing local workflow')
  const password='MecacaoOwner2026!Secure'
  const setup=await request('/api/local/auth/setup','POST',{username:'owner',password,remember:true})
  assert.equal(setup.status,200,JSON.stringify(setup.json))
  const persistent=setup.cookies.find(x=>x.startsWith('mecacao_windows_remember='))
  const active=setup.cookies.find(x=>x.startsWith('mecacao_windows_session='))
  assert(persistent&&active,'Both session and persistent cookies must be HttpOnly')
  assert(persistent.includes('HttpOnly')&&persistent.includes('SameSite=Strict'))
  const rememberCookie=persistent.split(';')[0],sessionCookie=active.split(';')[0]
  const file=fs.readFileSync(path.join(dir,'auth','windows-auth.json'),'utf8')
  assert(!file.includes(password),'Never persist a plaintext password')
  assert(!file.includes(rememberCookie.split('=')[1]),'Never persist a raw remember token')
  assert.equal((await request('/api/private')).status,401,'Protected Windows API must require session')
  assert.equal((await request('/api/private','GET',undefined,sessionCookie)).status,200)
  assert.equal((await request('/api/local/auth/setup','POST',{username:'intruder',password,remember:false})).status,409)
  assert.equal((await request('/api/local/auth/login','POST',{username:'owner',password:'incorrect',remember:false})).status,401)
  assert.equal((await request('/api/local/auth/state','GET',undefined,rememberCookie)).json.remembered,true)
  await new Promise<void>(resolve=>server.close(()=>resolve()))
  server=build().listen(0,'127.0.0.1')
  await new Promise<void>(resolve=>server.once('listening',resolve))
  assert.equal((await request('/api/private','GET',undefined,sessionCookie)).status,401,'Session must expire on server restart')
  const login=await request('/api/local/auth/login','POST',{username:'owner',useRemember:true,remember:true},rememberCookie)
  assert.equal(login.status,200,JSON.stringify(login.json))
  const newSession=login.cookies.find(x=>x.startsWith('mecacao_windows_session='))!.split(';')[0]
  const newRemember=login.cookies.find(x=>x.startsWith('mecacao_windows_remember='))!.split(';')[0]
  assert.equal((await request('/api/private','GET',undefined,newSession)).status,200)
  const forget=await request('/api/local/auth/forget','POST',{},newSession+'; '+newRemember)
  assert.equal(forget.status,200)
  assert.equal((await request('/api/local/auth/state','GET',undefined,newRemember)).json.remembered,false)
  assert.equal((await request('/api/local/auth/login','POST',{username:'owner',useRemember:true,remember:true},newRemember)).status,401)
  const passwordLogin=await request('/api/local/auth/login','POST',{username:'owner',password,remember:false})
  assert.equal(passwordLogin.status,200)
  const lastSession=passwordLogin.cookies.find(x=>x.startsWith('mecacao_windows_session='))!.split(';')[0]
  assert.equal((await request('/api/local/auth/logout','POST',{},lastSession)).status,200)
  assert.equal((await request('/api/private','GET',undefined,lastSession)).status,401)
 }finally{
  await new Promise<void>(resolve=>server.close(()=>resolve()))
  fs.rmSync(dir,{recursive:true,force:true})
 }
})
