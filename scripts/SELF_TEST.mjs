import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const required=['package.json','README.md','PROJECT_STATE.md','CHANGELOG.md','ROADMAP.md','TEST_CHECKLIST_V0.1.md','START_SHOP.bat','apps/web/package.json','apps/web/src/App.tsx','apps/api/package.json','apps/api/src/server.ts','.github/workflows/pages.yml']
let failed=false
for(const rel of required){if(!fs.existsSync(path.join(root,rel))){console.error('FAIL missing: '+rel);failed=true}else console.log('PASS exists: '+rel)}
if(failed)process.exit(1)
console.log('\nSELF_TEST_V0_1 PASS (structure/config only)')
