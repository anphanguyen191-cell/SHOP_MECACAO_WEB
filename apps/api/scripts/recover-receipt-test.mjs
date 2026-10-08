import { recoverPendingGoodsReceipts } from '../src/receiptRecovery.ts'
const result=recoverPendingGoodsReceipts()
if(result.journals!==1||result.removedCopies!==1||result.committed!==0)throw Error('Unexpected crash-recovery result: '+JSON.stringify(result))
console.log('HARD_CRASH_RECOVERY PASS '+JSON.stringify(result))
