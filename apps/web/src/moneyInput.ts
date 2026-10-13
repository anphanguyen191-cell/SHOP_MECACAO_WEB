export const validMoneyInput=(value:unknown)=>/^\d+$/.test(String(value))&&Number.isSafeInteger(Number(value))&&Number(value)>=0
