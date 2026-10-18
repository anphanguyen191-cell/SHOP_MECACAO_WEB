import fs from 'node:fs'
import path from 'node:path'
import {shopWindowsIcon} from '../../apps/api/src/desktopShortcut.js'
const target=path.resolve('desktop/Assets/ShopMeCaCao.ico')
fs.mkdirSync(path.dirname(target),{recursive:true})
fs.writeFileSync(target,await shopWindowsIcon(fs.readFileSync('apps/web/public/brand/catalog-shop-logo.jpg')))
console.log('SHOP_WINDOWS_ICON: approved logo, 16/24/32/48/64/128/256px')
