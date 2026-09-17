# DeepKhata 📦⚡

> **High-speed, offline-first Point of Sale (POS) & Spatial Inventory Management System tailored for Pakistani wholesale and retail tech & electronics markets (e.g., Hafeez Centre, Montgomery Road).**

---

## 🌟 Overview

**DeepKhata** is an enterprise-grade, offline-first POS and inventory management platform designed to withstand real-world retail friction: unreliable internet connections, complex spatial inventory (parts, conditions, physical bins), unified service/labor charges, and traditional _Udhar_ (credit ledger) bookkeeping.

Unlike conventional POS software that tracks inventory as naive aggregate counts or records single-entry balances, DeepKhata enforces:

1. **Mathematical Accuracy**: A strict, double-entry financial ledger (Debits = Credits) with zero single-number balance shortcuts.
2. **Spatial Inventory Granularity**: Individual item condition tracking (e.g., _Original Pull_, _Minor Scratches_, _Dead Donor_) down to physical shop locations (_Branch &rarr; Cabinet &rarr; Shelf &rarr; Bin_).
3. **True Offline Resilience**: IndexedDB-backed offline checkout queues with background synchronization and Service Worker app-shell caching.

---

## 🏗️ Architecture & Tech Stack

```
                                  +---------------------------------------+
                                  |         Next.js App Shell (PWA)       |
                                  |  (React 19, Tailwind CSS, Base UI)   |
                                  +-------------------+-------------------+
                                                      |
                         +----------------------------+----------------------------+
                         |                                                         |
                         v                                                         v
              [Online Operations]                                         [Offline Operations]
                         |                                                         |
                         | HTTPS / REST                                            v
                         v                                              +---------------------+
              +---------------------+                                   |   Dexie.js (IDB)    |
              |    NestJS Backend   | <======== Auto-Sync Queue ======== | - Offline Checkout  |
              |   (Node.js API)     |         on Reconnect              | - Local Caching     |
              +----------+----------+                                   +---------------------+
                         |
                         v
              +---------------------+
              |  Prisma ORM + PGSQL |
              |  (Connection Pool)  |
              +---------------------+
```

### Stack Breakdown

| Layer             | Technology                                                                                         | Key Responsibility                                                               |
| :---------------- | :------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------- |
| **Frontend**      | [Next.js](https://nextjs.org/) (App Router, React 19)                                              | Expansive, keyboard-friendly full-page POS and management routes                 |
| **Styling & UI**  | [Tailwind CSS v4](https://tailwindcss.com/), `@base-ui/react`, [Lucide Icons](https://lucide.dev/) | Clean typography, high-contrast usability, thermal printer print-styling         |
| **Offline & PWA** | [Dexie.js](https://dexie.com/) (IndexedDB), `@serwist/next`                                        | Local transaction queuing, offline app shell caching, background synchronization |
| **Backend API**   | [NestJS](https://nestjs.com/) (TypeScript)                                                         | Domain validation, RBAC, ledger audit enforcement, sync coordinator              |
| **Database**      | PostgreSQL & [Prisma ORM](https://www.prisma.io/)                                                  | Relational consistency, connection pooling, ACID ledger transactions             |

---

## 🔑 Core Architectural Principles

### 1. 📴 Offline-First Resilience

- **Zero-Downtime POS**: The app shell loads instantly without an active internet connection via Serwist service workers.
- **Durable Checkout Queue**: Invoices and checkouts created offline are stored in IndexedDB via Dexie.js and automatically dispatched and reconciled with the NestJS backend upon network reconnection.

### 2. ⚖️ Mathematically Strict Double-Entry Ledger

- Single-number customer/vendor balances are prohibited.
- Every financial movement creates a `Transaction` entity containing paired, balanced `Posting` records (**Debits must strictly equal Credits**).
- Any posting batch failing zero-sum balance triggers an immediate atomic database rollback.

### 3. 📍 Spatial Inventory & Condition Tracking

- Stock is never treated as an abstract bulk quantity.
- Each item is mapped to physical spaces (`Branch` &rarr; `Cabinet` / `Rack` / `Shelf` / `Bin`).
- Every product instance carries its verified physical condition:
  - `Original Pull`
  - `Brand New`
  - `Minor Scratches`
  - `Dead Donor` (for parts harvesting)
  - `Defective`

---

## 🚀 Key Feature Modules

### 1. Unified Point of Sale (POS)

- **Expansive Workspace**: Full-page, ergonomic interface prioritizing a wide cart over cramped sidebar panels.
- **Unified Inventory + Labor Cart**: Seamlessly bill physical parts (auto-decrementing stock) and custom labor/repair service charges on a single unified invoice.
- **Condition Selector**: Explicit condition selection during item addition to ensure accurate physical stock deduction.
- **Walk-In / Guest Accounts**: Defaults to a pre-seeded "Walk-In Customer" profile with optional inline name/phone inputs.
- **Amanat (Memo) vs. Final Sale**:
  - **Amanat (Memo)**: Locks `ProductInstance` status to `MEMO_LOCKED` without writing to the financial ledger.
  - **Final Sale**: Transitions instances to `SOLD` and commits double-entry journal postings.

### 2. Receipt Printing & WhatsApp Dispatch

- **Thermal Print CSS**: Dedicated `@media print` rules optimized for 58mm and 80mm thermal receipt rolls, hiding headers, sidebars, and UI controls.
- **WhatsApp Direct Receipt**: Single-click generation of formatted `wa.me` text receipts detailing line items, labor breakdown, and the customer’s net outstanding _Udhar_ balance.

### 3. Inventory Logistics & Restocking

- **Dedicated Restock Hub (`/inventory/restock`)**: Standalone full-page route for rapid bulk-entry of large shipments directly to specific cabinets and conditions (no cramped modals).
- **Immutable Movement Ledger**: Complete `InventoryMovement` audit log recording user, timestamp, source/destination location, condition transition, and quantity.

### 4. Customer Khata & Udhar (Credit)

- **Customer Khata Profile**: Chronological ledger statement showing every invoice, debit, credit, and running balance.
- **Settlement Processing**: Easy logging of cash/bank collections against credit balances, posting:
  $$\text{Debit: Cash / Bank} \quad \longleftrightarrow \quad \text{Credit: Accounts Receivable}$$

### 5. Cash Hub & Day-End Z-Report

- **Petty Cash Book**: Fast capture of daily shop overheads (chai, courier/riders, utilities) posting:
  $$\text{Debit: Operating Expense} \quad \longleftrightarrow \quad \text{Credit: Drawer Cash}$$
- **Register Reconciliation (Z-Report)**: Automated day-end calculation of Expected Cash:
  $$\text{Expected Cash} = \text{Opening Float} + \text{Cash Inflows} - \text{Cash Expenses}$$
  Staff logs physical counted cash to record verified overages or shortages.

### 6. Role-Based Access Control (RBAC) & Returns

- **Granular Roles**:
  - `STAFF`: Process counter sales, create memos, record petty cash expenses.
  - `OWNER`: Full administrative rights, record deletion, price adjustments, Udhar debt forgiveness/settlements.
- **Defect-Aware Returns**: Return processing evaluates product state; faulty parts are routed to `DEFECTIVE` inventory to prevent resale while automatically reversing financial postings.

---

## 📂 Repository Structure

```
DeepKhata/
├── PRD.md                  # Product Requirements Document
├── README.md               # Project documentation & system overview
├── client/                 # Frontend Next.js Web App
│   ├── public/             # Static assets & PWA manifests
│   ├── src/                # Next.js App Router, components, Dexie schemas
│   ├── package.json        # Client dependencies & scripts
│   └── tsconfig.json       # TypeScript configuration
└── server/                 # Backend NestJS Application
    ├── prisma/             # Prisma schema & database migrations
    ├── src/                # Modules (Auth, POS, Inventory, Ledger, etc.)
    ├── test/               # Vitest e2e and unit test suites
    ├── package.json        # Server dependencies & scripts
    └── tsconfig.json       # TypeScript configuration
```

---

## 🛠️ Getting Started

### Prerequisites

- **Node.js**: `v20.x` or `v22.x`
- **PostgreSQL**: `v15+`
- **Package Manager**: `npm` (or `pnpm` / `yarn`)

---

### 1. Server Setup

```bash
# Navigate to the backend directory
cd server

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your PostgreSQL credentials & JWT secret:
# DATABASE_URL="postgresql://user:password@localhost:5432/deepkhata?schema=public"
# JWT_SECRET="your-secure-jwt-secret"

# Run database migrations and generate Prisma client
npx prisma migrate dev
npx prisma generate

# Start development server
npm run start:dev
```

The NestJS backend will be running at `http://localhost:3000` (or your configured port).

---

### 2. Client Setup

```bash
# Navigate to the frontend directory
cd ../client

# Install dependencies
npm install

# Start Next.js development server
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) (or your assigned Next.js port) in your browser.

---

## 🧪 Testing & Code Quality

### Server Tests

```bash
cd server
npm run test        # Unit tests with Vitest
npm run test:e2e    # End-to-end tests
npm run lint        # Fast linting with Oxlint
```

### Client Linting & Type-Checking

```bash
cd client
npm run lint
npx tsc --noEmit
```

---

## 📋 Developer Directives & Guidelines

1. **No Modals for High-Data Tasks**: Never use modals for complex workflows (e.g., Bulk Restocking, Ledger Auditing). Build dedicated Next.js page routes (`/inventory/restock`, etc.).
2. **Strict Print CSS**: Thermal print overrides in `globals.css` must isolate the receipt container and suppress all other UI components during `window.print()`.
3. **Smooth Financial Inputs**: Numerical and discount input fields must prevent formatting glitches (e.g., stripping unwanted leading zeroes like `06000`).
4. **No Disconnected Work Order Systems**: Service, parts, and labor must remain unified within the POS cart and single-bill format.

---

## 📄 License

This project is proprietary and confidential. All rights reserved.
