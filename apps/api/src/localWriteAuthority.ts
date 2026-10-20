/** The authenticated Windows V8 owner remains authoritative even after Cloud activation.
 * Upstream server authentication and same-origin checks are mandatory. */
export function cloudAuthorityWriteBlocked(active:boolean,windowsOwner:boolean,lanClient:boolean):boolean {
 return active && (!windowsOwner || lanClient)
}
