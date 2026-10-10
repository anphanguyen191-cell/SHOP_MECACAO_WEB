import path from 'node:path'
export const INTERNAL_WAREHOUSE_FOLDERS=new Set(['.mecacao-v2-archive','.mecacao-v2-recovery-lab','.mecacao-v2-sales'])
export function isInternalWarehousePath(file:string){return path.resolve(file).split(path.sep).some(p=>INTERNAL_WAREHOUSE_FOLDERS.has(p.toLowerCase()))}
