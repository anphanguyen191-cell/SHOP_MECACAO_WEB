import fs from 'node:fs'
const source=new URL('../apps/web/public/brand/banner.jpg',import.meta.url)
const directory=new URL('../apps/api/dist/brand/',import.meta.url)
fs.mkdirSync(directory,{recursive:true})
fs.copyFileSync(source,new URL('banner.jpg',directory))
