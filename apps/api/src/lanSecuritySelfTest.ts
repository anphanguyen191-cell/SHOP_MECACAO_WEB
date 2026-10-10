import assert from 'node:assert/strict'
import {createLanSessionManager,makeLanCredential,checkLanCredential,lanApiAllowed,changeLanAccount} from './lanSecurity.js'
let checks=0
const must=(v:unknown,m:string)=>{assert.ok(v,m);checks++}
let t=100_000
const owner=makeLanCredential('owner','test-password-567890','owner'),cashier=makeLanCredential('cashier','test-password-123456','cashier')
must(owner.passwordHash!=='test-password-567890','Password must be salted')
must(checkLanCredential(owner,'test-password-567890'),'Correct credential')
must(!checkLanCredential(owner,'wrong'),'Incorrect password')
const sessions=createLanSessionManager([owner,cashier],()=>t)
must(sessions.attempt('owner','wrong')===null,'Wrong password')
const logged=sessions.attempt('owner','test-password-567890')!
must(logged?.identity.role==='owner'&&!!logged.token,'Owner login')
must(sessions.inspect(logged.token)?.username==='owner','Session inspection')
must(sessions.inspect('invalid')===null,'Invalid token')
const staff=sessions.attempt('cashier','test-password-123456')!
sessions.revoke(staff.token)
must(sessions.inspect(staff.token)===null,'Explicit logout')
t+=8*60*60*1000+1
must(sessions.inspect(logged.token)===null,'Session expires')
const locked=createLanSessionManager([owner],()=>t)
for(let n=0;n<5;n++)must(locked.attempt('owner','bad')===null,'Bad login stays denied')
must(locked.attempt('owner','test-password-567890')===null,'Locked after failures')
t+=15*60*1000+1
must(!!locked.attempt('owner','test-password-567890'),'Can sign in after cooldown')
for(const p of ['/api/fs/roots','/api/backup/restore-test','/api/local/warehouse','/api/tasks/123','/api/store/import','/api/sales/drafts/recover','/api/inventory/share/copy','/api/sales/drafts/id/archives']){
 for(const role of ['owner','cashier','inventory','viewer'] as const)must(!lanApiAllowed(role,'GET',p)&&!lanApiAllowed(role,'POST',p),'High-risk path denied '+p)
}
must(!lanApiAllowed('viewer','GET','/api/sales/drafts/reports/summary'),'Viewer cannot access reports')
must(!lanApiAllowed('viewer','GET','/api/sales/drafts/customers'),'Viewer cannot access customer PII')
must(!lanApiAllowed('inventory','GET','/api/sales/drafts/finance/debts'),'Inventory cannot access receivables')
must(!lanApiAllowed('cashier','GET','/api/sales/drafts/stocktakes'),'Cashier cannot access stocktake')
must(lanApiAllowed('owner','GET','/api/sales/drafts/sold-retention'),'Owner may review SOLD archive')
must(!lanApiAllowed('cashier','GET','/api/sales/drafts/sold-retention'),'Cashier cannot see retention')
must(lanApiAllowed('inventory','GET','/api/sales/drafts/stocktakes'),'Inventory may read stocktake')
must(lanApiAllowed('viewer','GET','/api/inventory/explorer'),'Viewer may read available stock')
must(lanApiAllowed('cashier','GET','/api/sales/drafts/finance/debts'),'Cashier may read receivables')
must(!lanApiAllowed('viewer','POST','/api/sales/drafts'),'Viewer no write')
must(lanApiAllowed('cashier','POST','/api/sales/drafts'),'Cashier may draft')
must(lanApiAllowed('cashier','POST','/api/sales/drafts/order-1/confirm'),'Cashier can confirm')
must(!lanApiAllowed('inventory','POST','/api/sales/drafts/order-1/confirm'),'Inventory cannot sell')
must(lanApiAllowed('inventory','POST','/api/sales/drafts/stocktakes'),'Inventory can open count')
must(!lanApiAllowed('cashier','POST','/api/sales/drafts/stocktakes'),'Cashier cannot open count')
must(!lanApiAllowed('owner','DELETE','/api/sales/drafts/order-1'),'Unknown destructive verb denied')
must(!lanApiAllowed('owner','POST','/api/mystery/new'),'Unknown API denied')
must(!lanApiAllowed('owner','POST','/api/fs/%2e%2e/secret'),'Encoded path denied')
const team=changeLanAccount([owner],'owner','test-password-567890',{action:'add',username:'inventory1',role:'inventory',password:'test-inventory-12345'})
must(team.length===2&&team[1].role==='inventory','Owner can add staff')
assert.throws(()=>changeLanAccount([owner],'owner','incorrect',{action:'add',username:'cashier3',role:'cashier',password:'long-password-1234'}));checks++
const changed=changeLanAccount(team,'owner','test-password-567890',{action:'reset',username:'inventory1',password:'changed-password-4455'})
must(checkLanCredential(changed[1],'changed-password-4455')&&!checkLanCredential(changed[1],'test-inventory-12345'),'Reset revokes old credential on restart')
must(changeLanAccount(changed,'owner','test-password-567890',{action:'disable',username:'inventory1'}).length===1,'Owner may revoke staff')
assert.throws(()=>changeLanAccount([owner],'owner','test-password-567890',{action:'disable',username:'owner'}));checks++
must(lanApiAllowed('owner','GET','/api/lan/photos'),'Owner may inspect mobile inbox')
must(lanApiAllowed('inventory','POST','/api/lan/photos/upload'),'Inventory may stage photo')
must(!lanApiAllowed('cashier','POST','/api/lan/photos/upload'),'Cashier cannot upload stock')
must(!lanApiAllowed('viewer','GET','/api/lan/photos'),'Viewer cannot inspect staging')
must(!lanApiAllowed('owner','POST','/api/lan/photos/11111111-1111-1111-1111-111111111111/review'),'LAN owner cannot review via WiFi')
must(lanApiAllowed('inventory','GET','/api/lan/photos/11111111-1111-1111-1111-111111111111/preview'),'Authorized preview')
must(!lanApiAllowed('owner','GET','/api/lan/photos/11111111-1111-1111-1111-111111111111/approved'),'Never expose approved Windows source paths to LAN')
console.log('STAGE6 SECURITY FOUNDATION PASS',checks)
