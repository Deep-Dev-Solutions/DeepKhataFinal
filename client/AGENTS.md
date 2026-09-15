## Client-Side Architecture (Next.js)

### Offline-First POS & Ledger

- Use Dexie.js (IndexedDB) to cache parts catalogs, cabinet mappings, and customer accounts locally.
- POS operations and ledger memo creation must execute against local storage immediately without waiting for API responses.
- Every offline transaction must receive a client-generated UUID and enter an append-only sync queue in IndexedDB.
- Implement a background sync worker that flushes queued transactions to `POST /api/v1/sync` when `navigator.onLine` fires.

### WhatsApp Receipts

- Avoid third-party messaging APIs for receipts.
- Construct direct URI links using `https://wa.me/<phone>?text=<encoded_invoice>` so mobile operators can open WhatsApp natively to share bills and ledger status.

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
