import {fork} from 'node:child_process'
import path from 'node:path'
const release=process.cwd()
const child=fork(path.join(release,'apps/api/dist/server.js'),[],{
 cwd:release,env:{...process.env,SHOP_FRESH_DEVELOPMENT:'1',SHOP_HOST:'127.0.0.1',PORT:'3000'},
 stdio:['ignore','inherit','inherit','ipc'],windowsHide:true
})
let stopping=false
function stop(){
 if(stopping)return
 stopping=true
 if(child.connected)child.send('SHOP_LOCAL_CLOSE')
 else child.kill()
 setTimeout(()=>{if(child.exitCode===null)child.kill()},15000).unref()
}
process.stdin.setEncoding('utf8')
process.stdin.on('data',data=>{if(data.includes('STOP'))stop()})
process.stdin.on('end',stop)
process.on('SIGTERM',stop)
process.on('SIGINT',stop)
child.once('exit',code=>{process.exitCode=code||0})
