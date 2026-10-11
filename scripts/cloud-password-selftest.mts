import assert from 'node:assert/strict'
import type {Session,SupabaseClient} from '@supabase/supabase-js'
import {saveCloudPassword} from '../apps/web/src/cloudPassword'

const session={access_token:'fake-access',refresh_token:'fake-refresh'} as Session
let active:Session|null=session,restoreError:Error|null=null,updateError:Error|null=null,updates=0,restores=0
const auth={
 async getSession(){return {data:{session:active},error:null}},
 async setSession(tokens:unknown){restores++;assert.deepEqual(tokens,{access_token:'fake-access',refresh_token:'fake-refresh'});if(restoreError)return {data:{session:null},error:restoreError};active=session;return {data:{session},error:null}},
 async updateUser(input:unknown){updates++;assert(active);assert.deepEqual(input,{password:'fake-new-password'});return {data:{user:updateError?null:{id:'fake-user'}},error:updateError}}
} as unknown as SupabaseClient['auth']
await saveCloudPassword(auth,session,'fake-new-password');assert.equal(restores,0);assert.equal(updates,1)
active=null;await saveCloudPassword(auth,session,'fake-new-password');assert.equal(restores,1);assert.equal(updates,2)
active=null;restoreError=new Error('fake invalid recovery token');await assert.rejects(saveCloudPassword(auth,session,'fake-new-password'),/invalid recovery token/);assert.equal(updates,2)
await assert.rejects(saveCloudPassword(auth,null,'fake-new-password'),/Phiên đăng nhập/);assert.equal(updates,2)
active=session;updateError=new Error('fake server rejected update');await assert.rejects(saveCloudPassword(auth,session,'fake-new-password'),/server rejected update/)
console.log('PASS Cloud password: active session, recovery storage restoration, invalid-token refusal, sign-out refusal and server errors')
