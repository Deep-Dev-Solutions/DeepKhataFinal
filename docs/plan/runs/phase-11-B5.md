# T20 / B5 — "Request item from another branch" fails: live repro

**Date:** 2026-11-12. Stack: local e2e database, ownerA (GM Traders), Hall Road active.

## 1. Repro (network level)

The finder calls `createStockTransfer(payload, activeBranchId)`. When
`activeBranchId` is still `null` (first paint before the branch list resolves, or
`/product/getbranches` fails) the call carries no `x-branch-id` header. That is
the request a shopkeeper sends when the page looks ready but the branch context
is not there yet.

Request captured with the same session the browser uses
(`Authorization: Bearer test-session-ownerA`, no `x-branch-id`):

```
POST /stock-transfers
{ "fromBranchId": "<Hafeez Centre>", "productId": "<uuid>", "quantity": 1 }

HTTP/1.1 400 Bad Request
{"message":"Select your branch first","error":"Bad Request","statusCode":400}
```

The page threw nothing: `submitTransfer` had no `catch`, the modal had already
closed, so the shopkeeper saw no toast, no error, nothing. The request appeared
to "just fail".

## 2. Candidate match

| Candidate | Verdict |
| --- | --- |
| 1. `t.branchId` null → 400 "Select your branch first" | **This one.** Response body matches exactly. |
| 2. Finder count vs pick race → 409 "Only N available at <branch>" | Not reproduced; exact error text differs. |
| 3. Condition-filter mismatch | Not reproduced. |

API tests for the other two remain as guards (`test/stock-transfers.e2e-spec.ts`
covers the 409 message too).

## 3. Fix

- `stock-finder/page.tsx` `submitTransfer` now catches and shows the server
  message in a toast, so a late failure is never silent.
- The page shows "Select your branch first" and disables "Request from branch"
  while there is no active branch, instead of letting the 400 happen.

No change to the transfer service itself: it was correct to refuse a branch-less
request.
