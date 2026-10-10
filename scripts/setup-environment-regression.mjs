import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// Reproduce a first-time setup called from the V2 Windows launcher.
// A deliberately invalid sentinel DB must never be opened or changed by tests.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mecacao-setup-env-'))
const db = path.join(root, 'launcher-db-sentinel')
const sentinel = Buffer.from('DO NOT OPEN OR MODIFY: launcher database sentinel')
fs.writeFileSync(db, sentinel)
try {
  for (const file of ['src/selfTest.ts', 'src/performanceSelfTest.ts', 'src/warehouseUpgradeSelfTest.ts']) {
    const result = spawnSync(process.execPath, ['scripts/run-self-test.mjs', file], {
      cwd: path.resolve('apps/api'),
      env: { ...process.env, SHOP_DB_PATH: db, SHOP_SANDBOX_ROOT: root, SHOP_ENABLE_V2_DRAFTS: '1', SHOP_ENABLE_V2_SALES: '1' },
      stdio: 'inherit'
    })
    assert.equal(result.error, undefined)
    assert.equal(result.status, 0, `Inherited V2 flags broke ${file}`)
    assert.deepEqual(fs.readFileSync(db), sentinel)
    assert.deepEqual(fs.readdirSync(root), ['launcher-db-sentinel'])
  }
  console.log('PASS: all 3 setup runners isolate inherited V2 flags and preserve caller database/root')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
