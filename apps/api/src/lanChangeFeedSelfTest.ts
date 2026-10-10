import assert from 'node:assert/strict'
import express from 'express'
import {createLanChangeFeed} from './lanChangeFeed.js'
const feed=createLanChangeFeed()
const app=express()
app.use(feed.middleware)
app.get('/api/lan/changes',(_req,res)=>res.json(feed.view()))
app.post('/api/sales/drafts',(_req,res)=>res.status(201).json({ok:true}))
app.put('/api/sales/drafts/order',(_req,res)=>res.status(409).json({error:'stale'}))
app.post('/api/lan/login',(_req,res)=>res.json({ok:true}))
app.get('/api/inventory/explorer',(_req,res)=>res.json([]))
const srv=app.listen(0,'127.0.0.1')
const base='http://127.0.0.1:'+(srv.address() as any).port
let checks=0
const read=async()=>await (await fetch(base+'/api/lan/changes')).json()
try{
 const first=await read()
 assert.equal(first.revision,0);checks++
 assert.match(first.epoch,/^[0-9a-f-]{36}$/);checks++
 await fetch(base+'/api/inventory/explorer')
 assert.equal((await read()).revision,0);checks++
 await fetch(base+'/api/sales/drafts',{method:'POST'})
 const after=await read()
 assert.equal(after.revision,1);checks++
 assert.ok(after.changedAt);checks++
 await fetch(base+'/api/sales/drafts/order',{method:'PUT'})
 assert.equal((await read()).revision,1);checks++
 await fetch(base+'/api/lan/login',{method:'POST'})
 assert.equal((await read()).revision,1);checks++
 assert.notEqual(createLanChangeFeed().view().epoch,first.epoch);checks++
 console.log('STAGE6 CHANGE FEED PASS',checks)
}finally{await new Promise<void>((resolve,reject)=>srv.close(e=>e?reject(e):resolve()))}
