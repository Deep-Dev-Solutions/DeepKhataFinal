# DeepKhata — Live Demo Guide

How to run DeepKhata in front of a client, what to click, and what to say.
Total run time: **12–15 minutes** (plus the 1:47 product video if you want a pre-roll).

---

## 1. The one-line pitch

> DeepKhata answers the three questions every electronics shop asks every evening —
> **aaj kitni sale hui, kaun kitna dena hai, aur maal kahan rakha hai** — from one system,
> even when the internet is down.

Every beat in the demo should map back to one of those three words: **sale**, **udhar**, **maal**.

---

## 2. Before the demo (10 minutes before)

### 2.1 Start the database

This machine runs Postgres on **5434** and Mailpit on **1026 / 8026**, because another
project already holds 5432 / 5433 and 1025 / 8025.

```bash
cd /home/jb/Projects/DeepKhata
POSTGRES_PORT=5434 MAILPIT_SMTP_PORT=1026 MAILPIT_UI_PORT=8026 npm run db:up
```

`apps/server/.env` is already pointed at these ports. If you ever reset the machine,
update the `DATABASE_URL*` lines (5433 → 5434) and `SMTP_PORT` (1025 → 1026) to match.

### 2.2 Load demo data

```bash
npm run db:migrate   # applies migrations, prints "No pending migrations"
npm run db:seed      # GM Traders + Shahzaib Electronics, 114 products, 63 orders
npm run demo:seed    # today's trade: sales, udhar, wasooli, petty cash
```

`npm run db:seed` gives the shop a history. `npm run demo:seed` writes **today's**
activity so the dashboard is not empty when the client looks at it: 16 counter sales
across the morning and afternoon, five of them on udhar, a few collections against
old khata, and petty cash for chai and the rider. Everything is dated up to the
moment you run it, never into the future.

It is safe to run twice — rows are keyed by date, so a second run the same day adds
nothing. To rewrite today's numbers:

```bash
npm run demo:seed -- --clear   # deletes today's demo rows, then seeds them again
npm run demo:seed -- --sales=24 --collections=6 --expenses=5
npm run demo:seed -- --branch="Hall Road"
```

Re-seeding is additive. To get a pristine shop again (fresh order dates, clean ledger):

```bash
npm run db:reset     # drops, re-migrates and re-seeds
npm run demo:seed    # then put today's trade back on top
```

### 2.3 Start the apps

```bash
npm run dev
```

| App | URL | What it is |
| --- | --- | --- |
| Client (the shop) | http://localhost:3000 | What the client will see |
| API | http://localhost:5000 | NestJS, Swagger at `/api/docs` if enabled |
| Agency admin | http://localhost:3001 | Internal master portal, not for the client |
| Mailpit | http://localhost:8026 | Catches every outbound email |

Wait for `Nest application successfully started` and the Next "Ready" line.
First page load in dev takes 5–8 seconds — open the dashboard once *before* the client
joins so the compile is warm.

### 2.4 Log in as the owner

| Role | Email | Password | Shop |
| --- | --- | --- | --- |
| **Owner (use this)** | `owner@deepkhata.test` | `DeepKhata#Test1` | GM Traders |
| Manager | `manager@deepkhata.test` | `DeepKhata#Test1` | GM Traders |
| Staff | `staff@deepkhata.test` | `DeepKhata#Test1` | GM Traders |
| Second shop (isolation) | `ownerb@deepkhata.test` | `DeepKhata#Test1` | Shahzaib Electronics |
| Agency master | `superadmin@deepkhata.test` | `DeepKhata#Test1` | — |

Leave the window on **Dashboard**, branch **Hafeez Centre**, before the client walks in.

### 2.5 Demo-day rules

- **Never hard-refresh a list page in front of the client.** Navigate through the sidebar.
  A cold deep link re-bootstraps auth and branches and sits on "Loading workspace…" for a few seconds.
- Keep one tab on **Point of Sale** the whole time — the offline beat needs the page already loaded.
- Zoom the browser to **100%** and hide bookmarks; the UI is designed for ~1440px width.
- If a sale needs a clean ledger, do it early — it will pollute the reports for the rest of the demo.

---

## 3. The 12-minute script

Each beat lists **what you say** and **what you click**. Do not read the screen aloud —
let them look, then say the number that matters.

### Beat 1 · The three questions (60s) — Dashboard

Say: "Before I show you anything, three questions. Aaj kitni sale hui? Kaun kitna dena hai?
Aur maal kahan rakha hai? Every shop answers these three times a day, from three places."

Click: **Dashboard**.
Point at: **Customer Udhar**, **Aaj wasooli** (who to collect from today),
**Aaj dena hai** (who to pay), **Active Orders**.

Say: "This is not a report that runs at closing time. This is the shop right now."

> Seed data is historical, so **Daily Gross Sales** may read `Rs. 0` until you ring a sale.
> That is intentional — beat 4 makes it move and it is a better moment than a pre-filled number.

### Beat 2 · One counter, one search (3 min) — Point of Sale

Click: **Point of Sale**.

1. Type a model into the catalog search — `iphone`, `battery`, `A-SKU` — the list filters live.
   Say: "Search by model, SKU, barcode, or the name your staff actually uses."
2. Click a product to add it to the invoice. Add a second one.
   Say: "Cart, discounts, and labor charges on one invoice."
3. **Proceed to Checkout**.
4. Customer: leave **Walk-in Customer**, or pick **Existing Account** to attach the udhar.
5. Payment: choose **Cash**, **Bank Transfer / Card**, or split it —
   "Cash now, baqi udhar. The balance posts to his khata automatically."
6. Order status: **Final** (handed over now) or **Pending** (delivery / pickup later).
7. Confirm the sale.

Say: "Two things just happened. Stock came off the shelf we picked, and the ledger got a
balanced double entry. Nobody typed a voucher."

> Optional receipt moment: the invoice opens at `/invoice/[id]` — every sale has a printable
> parchi. Do not print unless they ask; the browser dialog kills momentum.

### Beat 3 · Udhar that adds up (2 min) — Lena / Dena + Customers

Click: **Lena / Dena**.

Say: "Lena hai, dena hai, aur kitna overdue hai — by age: 0–7 din, 8–30, and beyond."

Click a customer, or open **Customers (Udhar)** and pick one with an outstanding balance.

Say: "Every row is a posting, not a note in a diary. Sale on one side, payment on the other.
If the debit and credit do not match, the system refuses to save the entry."

Point at: running balance, order references, and **Record Payment** against an old balance.

### Beat 4 · Maal has a place, not just a number (3 min) — Stock Finder + Restock Hub

Click: **Stock Finder**.

Say: "In an electronics shop, 'we have 12 in stock' is useless. Which cabinet, which shelf,
which condition?"

Search a part → show **Branch → Cabinet → Shelf → Bin** and the condition
(Original Pull, Brand New, Minor Scratches, Dead Donor, Defective).

Click: **Products** → point at the **Spatial Location (Cabinet)** and stock columns.
Say: "The list does not say 'in stock'. It says which cabinet."

Click: **Restock Hub** → batch a shipment into a cabinet with unit cost and vendor.
Say: "One delivery, forty pieces, one batch, full movement history."

Click: **Inventory → Movements** (`/inventory/movements`) to show the audit ledger:
every inbound, outbound and adjustment with who and when.
Say: "Every stock change is logged. Nothing disappears quietly."

### Beat 5 · The internet drops (2 min) — Point of Sale, offline

Say: "Now the part every other system fails at. Load-shedding, or the PTCL line goes down."

1. Stay on the **Point of Sale** tab.
2. DevTools (`F12`) → **Network** → throttling dropdown → **Offline**.
3. The header pill flips to red **Offline** (it reads `Offline, N queued` once sales are queued).
4. Ring a sale anyway. Checkout completes, the invoice is created locally.
5. Say: "The shop did not stop. The sale is on the device, in a queue, in order."
6. Network → **No throttling**.
7. The pill goes **Syncing** then **Online**, and the queue drains.

Say: "Each queued sale carries a client-generated ID, so a retry can never create a duplicate.
And it syncs in the order it happened."

> Do this beat on the same tab you already loaded — offline reload needs the service worker,
> which only runs in a production build (see §5).

### Beat 6 · Gila / cash drawer (90s) — Galla / Cash

Click: **Galla / Cash**.

Show: **Start Shift** with an opening float, live **Cash Sales Inflows**, **Cash Expenses Out**
(chai, rider, packaging — petty cash vouchers), and **Expected In Drawer**.

Say: "At closing, the drawer either matches or it does not. The Z-report explains the difference."

Start a shift if the register is closed — it makes the page feel alive.

### Beat 7 · The owner's view (2 min) — Reports

Click: **Reports** → **Financial Overview** → period **Last 7 Days**.

Say: "Revenue, gross profit, margins — from the same ledger the counter writes to.
Not a spreadsheet someone rebuilds on Sunday."

Click: **Inventory Insights** (what is dead stock, what is moving),
**Staff Performance** (who sold what, by role),
**Customer Insights** (who owes the most, who pays on time).

Say: "This is why the owner stops doing his own bookkeeping at midnight."

### Beat 8 · Multi-shop and multi-branch (60s) — branch switcher + roles

- Branch pill (top bar): switch **Hafeez Centre ↔ Hall Road**. Say: "Same shop, two counters,
  two stock realities. The dashboard follows the branch."
- Log out, log in as `staff@deepkhata.test`: **Reports** and **Store Settings** disappear —
  the sidebar only shows what that role may do.
- Optional: log in as `ownerb@deepkhata.test` to prove the second shop sees none of the first
  shop's customers or stock.

### Beat 9 · Close (30s)

Say: "Sale, udhar, aur maal. One system, one ledger, works offline. That is DeepKhata."

If you have the video, play `others/demo-video/out/deepkhata-demo.mp4` **before** beat 1 as
a 1:47 cold open, or after beat 9 as a recap. Do not do both.

---

## 4. Questions the client will ask

| Question | Answer |
| --- | --- |
| "Do we lose sales when the light goes?" | No. Sales queue on the device in IndexedDB and flush in order when the line returns; a queued sale can never double-post. |
| "Can staff see the profit?" | No. Profit, reports and settings are owner-only; roles gate both the sidebar and the API. |
| "We have two branches." | Branch is part of the session; stock, cash and reports are scoped to it, and transfers move stock between them. |
| "Our parts have no barcode." | Search by SKU, model, alias, or compatible model — aliases are per shop, in your staff's words. |
| "What if the entry is wrong?" | Ledger postings must balance before commit; corrections are new entries, never silent edits. |
| "Can we import our old khata?" | Not from the UI today — this is a data-migration conversation, price it separately. |

---

## 5. The offline beat in a production build (optional, more convincing)

Dev mode disables the service worker (`disable: NODE_ENV === "development"` in
`apps/client/next.config.ts`), so an offline **reload** fails in dev. For the full
"the app still opens" demo, run the client as a production build on a second port:

```bash
# Stop `npm run dev` first — both use apps/client/.next
npm run build
npm run start:prod -w server      # http://localhost:5000
npm run start -w client -- -p 3002  # http://localhost:3002
```

Open http://localhost:3002 once **while online** so the service worker installs and caches
the shell, then repeat beat 5 — this time you can even refresh while offline.

---

## 6. Reset after the demo

```bash
npm run db:reset     # wipes everything and re-seeds the fixture shop
npm run demo:seed    # optional: put today's trade back
```

This is a local dev database only. Never run it, or any reset, against Supabase or production.
A reset also restores the fixture dates, so the dashboard starts from a clean, believable day.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `password authentication failed for user "deepkhata"` | Postgres on 5433 belongs to another project | Use 5434 (`POSTGRES_PORT=5434 npm run db:up`) and check `apps/server/.env` |
| Pages stuck on "Loading workspace…" then fill in | Cold dev bootstrap, auth + branches | Wait 5–8 s; warm the page before the client arrives |
| List page shows `0` / "No products found" right after a hard refresh | Fetched before the branch resolved | Click through from the sidebar; it loads correctly once the app is warm |
| Header pill stuck on Offline | DevTools throttling left on | Network → No throttling, then **Sync now** |
| Login says account locked | Too many failed attempts | Wait out the lockout, or `npm run db:reset` |
| Port 3000/5000/5434 already in use | Old dev process or container | `lsof -i :3000`, or `npm run db:down` then `db:up` |
| Emails never arrive | Mailpit is on 8026, not 8025 | http://localhost:8026 |

---

## 8. The demo video

`others/demo-video` is a Remotion project that renders the same story as a 1:47 film
(1080p30, English voiceover with Roman Urdu shop terms). It is not committed — `others/*`
is gitignored.

```bash
cd others/demo-video
npx remotion studio                     # preview + scrub
npx remotion render DeepKhataDemo out/deepkhata-demo.mp4   # re-render
```

Narration is generated with `edge-tts` (`en-US-AndrewNeural`); the script lives in
`/tmp/opencode/vo_script.json` and the per-scene durations drive the timeline in
`src/timeline.ts`.
