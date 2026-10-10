import {randomUUID} from 'node:crypto'
import type {Request,Response,NextFunction} from 'express'

/** Server-process change counter; successful API writes only. */
export function createLanChangeFeed(){
 const epoch=randomUUID()
 let revision=0,changedAt:string|null=null
 function middleware(req:Request,res:Response,next:NextFunction){
  if(req.originalUrl.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(req.method)&&
     !/^\/api\/lan\/(?:login|logout|changes|status|session)(?:\/|\?|$)/.test(req.originalUrl)){
   res.once('finish',()=>{
    if(res.statusCode>=200&&res.statusCode<300){revision++;changedAt=new Date().toISOString()}
   })
  }
  next()
 }
 const view=()=>({epoch,revision,changedAt})
 return {middleware,view}
}
