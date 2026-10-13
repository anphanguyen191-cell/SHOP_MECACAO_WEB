import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function buildId(){
  if(process.env.SHOP_BUILD_ID)return process.env.SHOP_BUILD_ID
  try{return execFileSync('git',['rev-parse','--short=12','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()}catch{
    // ZIP installations have no Git metadata. Identify their actual source
    // rather than making the Windows launcher depend on Git being installed.
    const hash=createHash('sha256'),base=process.cwd()
    const scan=(file:string)=>{if(!fs.existsSync(file))return;if(fs.statSync(file).isDirectory()){for(const name of fs.readdirSync(file).sort())scan(path.join(file,name))}else{hash.update(path.relative(base,file).replaceAll('\\','/'));hash.update(fs.readFileSync(file))}}
    for(const file of ['src','public','vite.config.ts','../api/src','../../package-lock.json'])scan(path.resolve(base,file))
    return 'local-'+hash.digest('hex').slice(0,12)
  }
}

export default defineConfig({
  define:{__APP_BUILD:JSON.stringify(buildId())},
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [],
      manifest: {
        name: 'Shop Mẹ CaCao',
        short_name: 'Mẹ CaCao',
        description: 'Quản lý kho Shop Mẹ CaCao - local first',
        theme_color: '#fff8f5',
        background_color: '#fff8f5',
        display: 'standalone',
        start_url: './'
      }
    })
  ],
  server: {proxy: {'/api': 'http://localhost:3001'}}
})
