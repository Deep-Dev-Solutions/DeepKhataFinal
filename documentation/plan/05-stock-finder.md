# Phase 5: Stock finder (cross-branch, for staff)

**Goal:** when the owner isn't there, any employee can answer a walk-in customer in seconds:
"Yes, we have it, here (or at the other branch), condition X, price Y. Wait for the owner or buy at this rate."

## Why

GM Traders' first pain: they couldn't tell if the other branch had an item. In the laptop repair
trade most parts are "latt" (used or salvage stock from abroad), so finding an exact matching
piece by model or part number is the hard part, and staff often don't know what's in the cabinets.

## Data model

1. Product fields:
   - `partNumber String?` (OEM part number, e.g. `L09547-001`)
   - `aliases String[]` (shop names for it: "840 keyboard", "G3 board")
   - `compatibleWith String[]` (models: "HP EliteBook 840 G3", "HP EliteBook 840 G4")
   - `minSalePrice Decimal(14,2)?` (floor price the owner allows staff to sell at)
   - `lowStockThreshold Int?` (feeds the `stock.low` notification rule from Phase 4)
2. `ProductInstance.photoUrl String?` and `notes String?` (condition proof and remarks for latt parts; Cloudinary upload already exists).
3. `StockReservation`: `instanceId`, `branchId`, `customerName`, `customerPhone?`, `expiresAt` (default 24 h), `createdById`, `status` (`ACTIVE` | `RELEASED` | `CONVERTED`). Reserved instances can't be sold to someone else; expiry releases them (scheduler job).
4. `StockTransferRequest`: `fromBranchId`, `toBranchId`, items (instance IDs), `status` (`REQUESTED` | `DISPATCHED` | `RECEIVED` | `CANCELLED`), timestamps and user IDs. First check whether a transfer feature already exists and extend it rather than duplicating it.

## Search

- Enable `pg_trgm` (done in Phase 2) and add trigram indexes on `partNumber`; use a GIN index for array fields or a generated `search_text` column concatenating name, SKU, part number, aliases and compatibleWith.
- `GET /stock/find?q=&branchId=` → ranked products, each with:
  - Per branch: available count grouped by condition, reserved count, and for the user's own branch the exact locations (cabinet / rack / shelf / bin) of each instance.
  - Sale price, `minSalePrice` and last 5 sold prices. **Cost price is never returned to STAFF.**
  - Photo thumbnails if present.
- Target p95 under 150 ms on the large seed.

## Frontend

1. **Stock Finder page** `/stock-finder` plus a global hotkey (F2) and command palette keywords `maal`, `stock`, `dhoondo`:
   - One big search box that works with a barcode scanner, part numbers and fuzzy text ("840 g3 keybord").
   - Results as cards: product name, part number, compatible models, then a row per branch: "Hafeez Centre: 3 (Original Pull ×2, Scratches ×1), Cabinet A / Rack 2 / Bin 4" and "Hall Road: 1 (Brand New)".
   - Price block: sale price, "lowest allowed" for staff, recent sold prices.
   - Actions: **Reserve for customer** (name, phone, hours), **Request from other branch** (creates a transfer request plus a Phase 4 notification to that branch's manager), **Sell now** (opens POS with the item).
2. **Customer-waiting mode:** a large-text view of the selected item with price and location, to show the customer on screen.
3. **POS guard:** staff cannot sell below `minSalePrice`; owner and manager can, with a reason captured.
4. **Product form:** add part number, aliases, compatible models (tag inputs) and min price; bulk import CSV gets the same columns.
5. **Transfers inbox** on the dashboard for managers: requested, dispatched, received; receiving moves instances to the destination branch and logs `InventoryMovement`.

## Tests

- API: search ranking (part number exact match first), STAFF never receives cost fields (assert the JSON keys), reservation blocks sale and expires, transfer moves instances and logs movements, isolation tests.
- E2E (as STAFF at Hall Road): search "840 keyboard" → sees 0 here and 3 at Hafeez Centre with locations hidden for the other branch and price shown → request transfer → manager at Hafeez Centre sees notification → dispatch → receive → item sellable at Hall Road.
- E2E: staff tries to sell below the minimum price → blocked with a message.

## Acceptance criteria

- [ ] A staff user finds any seeded part by name, part number, alias or compatible model in under 1 second end to end.
- [ ] Other-branch availability and price are visible to staff; cost price is not.
- [ ] Reservations and transfers work end to end with notifications.
