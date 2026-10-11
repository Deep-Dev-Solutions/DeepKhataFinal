# Phase 7: Trials, plans, onboarding and billing

**Goal:** anyone can start a 30-day trial on their own; the agency hears about every signup
immediately; when the trial ends we invoice from the admin panel, confirm payment and extend the plan.

## Plans (seed data; editable later in agency admin)

| Code | Price | Branches | Users | Products | Notes |
| --- | --- | --- | --- | --- | --- |
| `TRIAL` | Free, 30 days | 1 | 2 | 100 | All features; read-only after expiry |
| `STARTER` | Rs 3,000/mo or Rs 30,000/yr | 1 | 3 | Unlimited | Founding-partner price |
| `BUSINESS` | Set by agency | 3 | 10 | Unlimited | Multi-branch, stock finder transfers |
| `CUSTOM` | Per contract | Per contract | Per contract | Per contract | For GM Traders and deals |

Prices live in the database, not in code.

## Data model

1. `Plan`: `code`, `name`, `priceMonthly`, `priceYearly` (Decimal), `maxBranches`, `maxUsers`, `maxProducts` (null = unlimited), `trialDays?`, `features Json`, `isPublic`, `active`.
2. `Subscription` (one current per business): `businessId`, `planId`, `status` (`TRIALING` | `ACTIVE` | `PAST_DUE` | `READ_ONLY` | `SUSPENDED` | `CANCELLED`), `trialEndsAt?`, `currentPeriodStart`, `currentPeriodEnd`, `billingCycle` (`MONTHLY` | `YEARLY`), `customLimits Json?`, `priceOverride Decimal?`.
3. Migrate `Business.status` and `subscriptionExpiresAt` into `Subscription` (backfill existing tenants as `CUSTOM` `ACTIVE` with their current expiry), then update the kill switch to read `Subscription`. Keep the existing READ_ONLY and SUSPENDED behaviour.
4. `AgencyInvoice`: `number` (sequential, `DK-2026-0001`), `businessId`, `subscriptionId`, `periodStart`, `periodEnd`, `lines Json`, `subtotal`, `discount`, `total`, `status` (`DRAFT` | `SENT` | `PAID` | `VOID` | `OVERDUE`), `dueDate`, `sentAt`, `paidAt`, `publicToken` (for a public view link).
5. `AgencyPayment`: `invoiceId`, `amount`, `method` (`BANK_TRANSFER` | `JAZZCASH` | `EASYPAISA` | `CASH` | `OTHER`), `reference`, `proofUrl?`, `receivedAt`, `recordedById`. Replaces `AgencyBillingLog` (migrate old rows).
6. `SignupLead` view or fields on Business: `source`, `city`, `phone`, `followUpStatus` (`NEW` | `CONTACTED` | `FEEDBACK_RECEIVED` | `CONVERTED` | `LOST`), `followUpNotes`.

## Limits enforcement

- `PlanLimitsService.assert(businessId, 'branches' | 'users' | 'products')` called from branch, team and product creation (including bulk import, which checks remaining capacity first). Replace the hardcoded "2 branches / 5 users" checks.
- Error code `PLAN_LIMIT_REACHED` with `{ limit, used, plan }`; the client shows an upgrade dialog with WhatsApp contact.
- Settings → Plan & Usage page: usage meters, trial days left, current plan, invoices list with PDF download.

## Self-serve onboarding flow

1. Public signup (Phase 6) → email verified → onboarding wizard: shop name, city, market (free text, e.g. "Hafeez Centre"), phone (required, WhatsApp), branch name.
2. On completion: create Business, main Branch, `Subscription` on `TRIAL` (30 days), owner role. Load an optional sample-data pack (10 demo products, 2 demo customers) that the owner can wipe with one click.
3. **Getting-started checklist** on the dashboard: add first product, record first sale, add a customer with udhar, invite or create a staff user, set notification preferences. Progress stored per business.
4. **Agency alert:** on signup, email `AGENCY_ALERT_EMAIL` with shop name, owner, phone, city, market and a wa.me link; create an entry in the agency admin "New signups" feed with follow-up status. Day 3: create an agency task "Call for feedback".

## Trial lifecycle (scheduled job, Asia/Karachi)

| Day | Owner gets | Agency gets |
| --- | --- | --- |
| 0 | Welcome email with getting-started links | Signup alert |
| 3 | Tips email | Follow-up task |
| 7 | Usage summary email (sales recorded, dues tracked) | none |
| 25 | "Trial ends in 5 days" email + in-app banner | Conversion task |
| 30 | Trial ended → `READ_ONLY`, payment instructions | Invoice draft created |
| 45 | Reminder | Mark lead `LOST` if unpaid (data kept 90 days, then the agency decides) |

## Billing (agency admin)

1. **Generate invoice:** pick tenant, plan, cycle, period; lines and totals prefilled from the plan (override allowed); invoice number assigned.
2. **PDF:** server-side generation (`@react-pdf/renderer` or `pdfkit`) with agency name, address, NTN field, bank, JazzCash and Easypaisa details from env/settings, invoice lines, due date, and a payment reference to quote.
3. **Send:** email with PDF attached plus a "Send on WhatsApp" button (wa.me link with the public invoice URL). Public invoice page `/i/:publicToken` (read-only, no login).
4. **Record payment:** amount, method, reference, proof upload → invoice `PAID` → subscription extended by the period → status back to `ACTIVE` → tenant gets a receipt email.
5. **Renewals:** job creates the next invoice 7 days before `currentPeriodEnd`, sends it, reminds on due date, sets `PAST_DUE` after due and `READ_ONLY` after a 7-day grace period.

## Tests

- API: limits enforced per plan (101st product on trial blocked, 3rd user blocked), trial expiry flips to read-only on schedule (fake clock), payment extends the period correctly for monthly and yearly, invoice numbering is sequential and unique under concurrency, public invoice token can't list other invoices.
- E2E: signup → wizard → trial dashboard with checklist → agency admin sees the new signup → fake clock to day 31 → tenant read-only → agency generates and sends invoice (Mailpit) → records payment → tenant writable again.

## Acceptance criteria

- [ ] A new shop can sign up and use the trial with no agency involvement.
- [ ] The agency receives an email for every signup within a minute.
- [ ] Trial limits (1 branch, 2 users, 100 products) are enforced on the server.
- [ ] Invoice PDF, email, public link and payment recording work end to end.
