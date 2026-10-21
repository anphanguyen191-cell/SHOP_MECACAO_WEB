# Windows confirms the final sale (option A)

The owner Windows warehouse remains the authority for inventory, sale archives
and money. Mobile can create a new Cloud draft. Subsequent draft edits,
cancellation, sale confirmation, receipts/refunds, delivery and aftercare submit
durable requests. A pending request does not reserve or deduct stock and is not
proof of payment or SOLD.

The signed-in owner browser on Windows polls the localhost coordinator every
five seconds, independently of the photo auto-sync preference. The coordinator
authenticates the Cloud owner and warehouse instance, compares the frozen intent
with LOCAL, and uses the existing draft, preflight, archive and finance services.
It uploads the resulting LOCAL evidence before acknowledging the request.

The normal sale operation key and the transactional mutation journal make retries
safe after a lost reply or restart. Unfinished archive recovery retains the
existing owner recovery gate. A conflict preserves LOCAL records and returns a
specific rejection. A pending order cannot be edited or paid on Cloud while it is
being checked. The old direct Cloud commands are fenced once an updated owner
laptop has enabled option A; committed legacy request retries still return their
original result.

| Area | Behavior |
| --- | --- |
| Mobile and Windows sales | Pending / confirmed / rejected requests; original image bytes bound through the final preflight; no Cloud-only final sale after A is enabled |
| Sync diagnostics | Separate last check and last fully verified sync; completion requires current business evidence, physical stock, source revision and Cloud Storage checks |
| Customer history | Explicit customer FK, full-history debt totals, paginated orders; global LOCAL order search has no 200-order truncation |
| Intake and inquiries | Cloud receipt and LOCAL photo review in one workflow, batch receipt, explicit goods receipt; global paginated inquiry search retains 90-day redaction |
| Regression gates | LOCAL SQLite + PostgreSQL + real HTTP coordinator, React DOM, physical Chrome interactions on Linux and Windows CI, existing business and updater gates |

Run `npm run typecheck`, `npm run test:gate` and `npm run test:cloud`.
The release workflow additionally runs `node scripts/cloud-browser-e2e.mjs` with
real Chrome. All test business data and remote transports are isolated.

Deploy the additive migration and use the existing in-app Windows updater.
The owner laptop must run the updated app and remain signed in to Cloud; mobile
shows pending while it is off, disconnected, or waiting for recovery. Historical
unlinked orders are never assigned to a customer by guessing from names or phone
numbers. Existing SOLD, archive and financial evidence is preserved.

Physical acceptance still requires the shop's actual laptop/iPhone: create and
edit a draft, submit a request with the laptop offline, reconnect, verify one
SOLD and one stock deduction, then check the same payment and customer debt on
both devices. Historical screenshot counts are not a current stock measurement.

## Queue conflict rejection (2026-10-21)

Only the Cloud rejection guard changes. If a pending mobile sale loses to a
different uploaded Windows operation, the laptop can reject that intent and
continue to the next request. The winning SOLD, archive, stock and money evidence
is untouched. An uploaded operation with the same deterministic mobile request
key still cannot be rejected: lost upload/finish replies must resume it instead.
Unknown or legacy Cloud-origin proof does not qualify as a different verified
Windows operation. Owner/warehouse checks, the transaction lock and all finish
checks retain their installed definitions and grants.

`scripts/local-final-sales-selftest.mts` reproduces the independent laptop-sale
race twice with real isolated preflight/archive/upload, checks B advances once,
lost rejection/upload replies, same-request refusal and owner-only rejection.
It also verifies SQL/LOCAL key derivation and that the migration changes only the
targeted guard while preserving the function OID, ACL and security settings.
No production test orders or manual terminal-state edits are needed. Existing
pending requests are retried by the normal laptop worker; no updater is required
for this Cloud-only guard correction on an already compatible option-A laptop.
