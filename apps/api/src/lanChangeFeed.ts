import {randomUUID} from 'node:crypto'
import type {Request,Response,NextFunction} from 'express'

/** Server-process change counter; successful API writes only. */
export function createLanChangeFeed(){
 const epoch=randomUUID()
 let revision=0,changedAt:string|null=null
 let businessRevision=0,businessChangedAt:string|null=null
 function middleware(req:Request,res:Response,next:NextFunction){
  if(!/^\/api\/local\/lan(?:\/|\?|$)/.test(req.originalUrl)&&req.originalUrl.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(req.method)&&
     !/^\/api\/lan\/(?:login|logout|changes|status|session)(?:\/|\?|$)/.test(req.originalUrl)){
   res.once('finish',()=>{
    if(res.statusCode>=200&&res.statusCode<300&&res.locals?.skipChangeFeed!==true){revision++;changedAt=new Date().toISOString();if(/^\/api\/(sales|customers|finance|aftercare|stocktake)(\/|\?|$)/.test(req.originalUrl)){businessRevision++;businessChangedAt=changedAt}}
   })
  }
  next()
 }
 const view=()=>({epoch,revision,changedAt})
 return {middleware,view,businessView:()=>({epoch,revision:businessRevision,changedAt:businessChangedAt}),touch:()=>{revision++;changedAt=new Date().toISOString()}}
}
