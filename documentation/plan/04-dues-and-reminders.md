# Phase 4: Lena / Dena (dues) and reminders

**Goal:** a shopkeeper always knows who owes him, whom he owes, how much and since when, and the
app nudges him before money is forgotten.

## Why (real case)

At GM Traders a fellow shopkeeper walked in and returned Rs 2,000 the owner had completely forgotten
about. The owner's rule of thumb: if you don't collect within about a week, the other person forgets
and the money is lost. People remember what they're owed and forget what they owe. Most of these
debts are informal (cash lent, parts taken on trust between shops), not POS invoices.

## Data model

1. **Due dates on existing credit.**
   - `Order.dueDate DateTime?`: set when an order is created with an unpaid balance. Default = order date + `Business.defaultReceivableDays` (default 7).
   - `Customer.paymentTermsDays Int?` overrides the business default.
   - Vendor credit: find how vendor payables are recorded today (inspect `vendors.service.ts`, restock flow and `Posting` with `accountType` VENDOR). Add `dueDate` to whatever record represents a vendor bill; default = `Business.defaultPayableDays` (default 15).
2. **New `KhataEntry` model** for informal lena/dena not tied to a sale:
   - Fields: `id`, `businessId`, `branchId?`, `direction` (`RECEIVABLE` | `PAYABLE`), `partyType` (`CUSTOMER` | `VENDOR` | `OTHER`), `customerId?`, `vendorId?`, `partyName`, `partyPhone?`, `amount Decimal(14,2)`, `settledAmount Decimal(14,2) @default(0)`, `dueDate`, `note?`, `status` (`OPEN` | `PARTIAL` | `SETTLED` | `WRITTEN_OFF`), `createdById`, timestamps, `deletedAt`.
   - Creating, settling and writing off post balanced ledger transactions (Receivable vs Cash; Cash vs Payable; Write-off expense vs Receivable).
   - `OTHER` parties can be promoted to a Customer or Vendor later, keeping history.
3. **`PromiseToPay`**: `entityType`, `entityId`, `promisedDate`, `note`, `createdById`. Recording a promise moves the reminder schedule to that date.
4. **Notifications:**
   - `Notification`: `businessId`, `userId?` (null = all owners/managers), `type`, `title`, `body`, `link`, `entityType?`, `entityId?`, `readAt?`, `createdAt`.
   - `NotificationSetting` (per business, optionally overridden per user): JSON or columns for each rule below with `enabled`, `channels` (`IN_APP`, `EMAIL`, `WHATSAPP_LINK`), and offsets.
   - `NotificationLog`: unique `(ruleKey, entityId, fireDate)` so a reminder never fires twice.

## Reminder rules (defaults; editable in Settings → Notifications)

| Rule key | Fires | Default |
| --- | --- | --- |
| `receivable.due_soon` | N days before due | On, 1 day |
| `receivable.due_today` | On due date | On |
| `receivable.overdue` | After due, repeating | On, days 3, 7, 14, 30 |
| `payable.due_soon` | N days before due | On, 2 days |
| `payable.overdue` | After due | On, days 1, 7 |
| `digest.daily` | Daily at a set time | On, 10:00 Asia/Karachi |
| `promise.broken` | Day after a missed promise | On |
| `register.not_closed` | Register still open at a set time | On, 23:00 |
| `stock.low` | Product falls under its threshold | Off (Phase 5 adds thresholds) |

## Backend

1. `DuesModule` with endpoints:
   - `GET /dues/summary` → totals: to receive, to pay, overdue to receive, due this week, plus aging buckets (0–7, 8–30, 31–90, 90+ days) for both directions.
   - `GET /dues?direction=receivable|payable&bucket=&q=&sort=oldest|amount` → unified list of open orders with balance + open KhataEntries, each with party, phone, amount open, due date, days overdue, last reminder sent, promise date.
   - `POST /khata-entries`, `PATCH /khata-entries/:id`, `POST /khata-entries/:id/settle` (partial allowed), `POST /khata-entries/:id/write-off` (owner only).
   - `POST /dues/:entityType/:entityId/promise`, `POST /dues/:entityType/:entityId/reminded` (logs that a WhatsApp reminder was sent manually).
2. `NotificationsModule`: `GET /notifications` (paginated, unread count), `POST /notifications/read`, `GET/PUT /notification-settings`.
3. **Scheduler** with `@nestjs/schedule`: a job every 15 minutes evaluates rules in Asia/Karachi time and creates notifications idempotently via `NotificationLog`. The email channel is a stub interface (`NotificationChannel`) until Phase 6 wires the mailer.
4. **WhatsApp link builder:** `GET /dues/:entityType/:entityId/whatsapp-link?lang=ur|en` returns a `https://wa.me/92XXXXXXXXXX?text=...` URL. Templates (Roman Urdu default):
   - Receivable: "Assalam o Alaikum {name}, {shop} ki taraf se yaad-dehani: aap ke zimme Rs {amount} baqi hain ({days} din se). Shukriya."
   - Phone numbers are normalised to `92` format (03xx → 923xx).
5. Permissions: new `read:dues` (owner, manager; staff optional via setting) and `manage:dues` (owner, manager). Write-off is owner-only.

## Frontend (`apps/client`)

1. **Lena / Dena page** (`/dues`), with command palette keywords `lena`, `dena`, `wasooli`, `udhar`:
   - Top cards: Lena hai (to receive), Dena hai (to pay), Overdue, Is hafte (this week).
   - Tabs Lena / Dena; aging bucket chips; search; sort by oldest or amount.
   - Each row: party, amount open, days overdue (red after due), last reminder, promise date. Actions: WhatsApp reminder (opens the link and logs it), Call (`tel:`), Record payment, Promise date, Snooze 3 days.
2. **Quick entry** from anywhere (header button and Ctrl+K "naya lena/dena"): direction toggle, party picker (customer, vendor or free text name + phone), amount, due date (chips: 3 days, 1 week, 2 weeks, 1 month), note. Should take under 10 seconds.
3. **Checkout:** when a sale leaves a balance, show the due date (pre-filled from terms) and let the cashier change it.
4. **Bell in header** with unread count, dropdown list, mark all read; links open the relevant due.
5. **Dashboard widgets:** "Aaj wasooli" (due today + overdue to collect, top 5) and "Aaj dena hai".
6. **Settings → Notifications:** replace the "coming soon" placeholder in `components/settings/NotificationsTab.tsx` with the rules table above: toggle, offsets, channels, digest time, and who receives them (owner only or owner + managers). Email channel shows as "available after email setup" until Phase 6.
7. **Customer and vendor profiles:** show open dues, promises and reminder history on the existing khata pages.

## Tests

- API: aging buckets on fixed dates (use a fake clock); KhataEntry create/settle/write-off ledger balanced; reminder job idempotent (run twice, one notification); promise moves the schedule; WhatsApp phone normalisation.
- E2E: quick entry of Rs 2,000 lena from "Rana Electronics" due in 7 days → appears on Lena tab; advance clock 8 days → overdue notification in bell → WhatsApp action opens the correct wa.me URL → record payment → entry settled and removed from list.
- E2E: credit sale with due date → shows on Lena; partial payment updates open amount.
- Isolation tests for all new `:id` routes.

## Acceptance criteria

- [ ] Owner can see total lena and dena with aging in one screen in under 1 second.
- [ ] A Rs 2,000 informal entry can be logged in under 10 seconds from any page.
- [ ] Overdue reminders appear in-app on schedule with no duplicates.
- [ ] Notification settings are saved and respected by the scheduler.
- [ ] All new money flows keep the ledger balanced (`verify-ledger.ts` clean).
