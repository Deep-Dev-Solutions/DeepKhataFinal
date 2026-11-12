"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import styles from "./home.module.css";

const WHATSAPP_NUMBER = "923374990542";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

const SYNC_PHASES = [
  {
    label: "Offline · saving here",
    bg: "#fff7ed",
    fg: "#9a3412",
    bgDark: "#431407",
    fgDark: "#fdba74",
  },
  {
    label: "Syncing 4 orders",
    bg: "#eff6ff",
    fg: "#1e40af",
    bgDark: "#172554",
    fgDark: "#93c5fd",
  },
  {
    label: "All synced",
    bg: "#f0fdf4",
    fg: "#166534",
    bgDark: "#052e16",
    fgDark: "#86efac",
  },
];

const TOASTS = [
  {
    title: "Sale saved offline",
    body: "ORD queued on this PC",
    iconBg: "#fff7ed",
    iconFg: "#c2410c",
  },
  {
    title: "Back online",
    body: "4 orders synced to cloud",
    iconBg: "#eff6ff",
    iconFg: "#1d4ed8",
  },
  {
    title: "Payment received",
    body: "Rs 10,000 from Ali Mirza",
    iconBg: "#f0fdf4",
    iconFg: "#15803d",
  },
];

const QUEUE_LABELS = [
  "Sale · Rs 13,600",
  "Udhar entry · Rs 5,000",
  "Kharcha · Chai Rs 300",
];

const QUEUE_STATES = [
  [
    ["Waiting", "#fdba74"],
    ["Waiting", "#fdba74"],
    ["Waiting", "#fdba74"],
  ],
  [
    ["Synced", "#86efac"],
    ["Sending", "#93c5fd"],
    ["Waiting", "#fdba74"],
  ],
  [
    ["Synced", "#86efac"],
    ["Synced", "#86efac"],
    ["Synced", "#86efac"],
  ],
];

const CART = [
  {
    name: "HP EliteBook 840 G3 keyboard",
    meta: "Original pull · Cabinet A",
    price: "Rs 4,500",
  },
  { name: "Kingston NV2 1TB NVMe", meta: "2 × Rs 6,800", price: "Rs 13,600" },
  {
    name: "Dell Latitude 5490 battery",
    meta: "Brand new · Cabinet C",
    price: "Rs 5,100",
  },
];

const SHOPS = [
  "Laptop parts",
  "Mobile accessories",
  "Electronics",
  "Computer repair",
  "Car audio",
  "Hardware stores",
  "Auto parts",
  "General stores",
];

const PAINS = [
  {
    n: "01",
    quote:
      "I am not at the shop, and my staff cannot tell a customer if the other branch has it.",
    answer:
      "Stock Finder shows every branch, every cabinet and the price staff may sell at.",
  },
  {
    n: "02",
    quote: "I forget who owes me and whom I owe.",
    answer:
      "Lena / Dena keeps every udhar with due dates, so nothing slips through.",
  },
  {
    n: "03",
    quote: "The galla never matches at night.",
    answer:
      "Open and close the register, log kharcha, and the Z-report shows the difference.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Create your shop",
    body: "Sign up, add your branches and invite staff with the right access.",
  },
  {
    n: "2",
    title: "Load your maal",
    body: "Import products from a spreadsheet and place them in cabinets and racks.",
  },
  {
    n: "3",
    title: "Start selling",
    body: "Ring up the first sale, take udhar, and close the galla tonight.",
  },
];

const PLANS = [
  {
    name: "Basic",
    for: "One shop, one counter",
    price: "Rs [PRICE]",
    period: "per year, or Rs [PRICE] per month",
    items: [
      "1 branch",
      "5 user accounts",
      "POS, stock, Lena / Dena, galla",
      "Offline selling",
    ],
    cta: "Start free trial",
    href: "/register",
    popular: false,
  },
  {
    name: "Standard",
    for: "Shops with a second branch",
    price: "Rs [PRICE]",
    period: "per year, or Rs [PRICE] per month",
    items: [
      "2 branches",
      "10 user accounts",
      "Stock Finder across branches",
      "Branch transfers and reports",
    ],
    cta: "Start free trial",
    href: "/register",
    popular: true,
  },
  {
    name: "Custom",
    for: "Chains and special setups",
    price: "Let us talk",
    period: "priced for your shop",
    items: [
      "As many branches as you need",
      "Data migration and staff training",
      "Priority support",
    ],
    cta: "Contact us",
    href: WHATSAPP_URL,
    popular: false,
  },
];

const FAQS = [
  {
    q: "What happens when the internet goes?",
    a: "Keep selling. Sales, khata entries and expenses are saved on the shop computer and sent to the cloud as soon as the connection is back. The top bar always shows what is still waiting to sync.",
  },
  {
    q: "I have two shops. Can each one keep its own galla?",
    a: "Yes. Every branch has its own register, cabinets and stock. You see all branches from one login, and staff only see the branch they work in.",
  },
  {
    q: "Can my staff see my cost price?",
    a: "No. Staff see the sale price and the lowest price you allow. Cost and profit are only for the owner and managers you choose.",
  },
  {
    q: "How do I get my existing products in?",
    a: "Import them from a spreadsheet, or add them one by one with cabinet locations. We help new shops load their stock during the trial.",
  },
  {
    q: "Do I need new hardware?",
    a: "No. DeepKhata runs in the browser on the laptop or PC you already have, and on your phone. Receipts print on a regular thermal printer or go out on WhatsApp.",
  },
];

const BAR_HEIGHTS = [38, 52, 44, 63, 58, 71, 66, 80, 74, 92];

function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1d4ed8" />
      <path
        d="M10 9h8.5a4.5 4.5 0 0 1 4.5 4.5v9.5H14.5A4.5 4.5 0 0 1 10 18.5z"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {size >= 32 && (
        <>
          <path d="M14 14h5M14 18h3" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function Check({ color = "#15803d", size = 16 }: { color?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [tick, setTick] = useState(0);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 2600);
    return () => clearInterval(timer);
  }, []);

  const phase = tick % 3;
  const sync = SYNC_PHASES[phase];
  const queue = QUEUE_LABELS.map((label, index) => ({
    label,
    state: QUEUE_STATES[phase][index][0],
    color: QUEUE_STATES[phase][index][1],
  }));

  return (
    <div id="top" className={`${styles.root} ${styles.anim}`}>
      <header className={styles.header}>
        <nav aria-label="Main" className={styles.nav}>
          <Link href="#top" className={styles.brand}>
            <Logo />
            <span className={styles.brandName}>DeepKhata</span>
          </Link>

          <div className={styles.navLinks}>
            <Link href="#features" className={styles.navLink}>
              Features
            </Link>
            <Link href="#offline" className={styles.navLink}>
              Offline
            </Link>
            <Link href="#branches" className={styles.navLink}>
              Branches
            </Link>
            <Link href="#pricing" className={styles.navLink}>
              Pricing
            </Link>
            <Link href="#faq" className={styles.navLink}>
              FAQ
            </Link>
          </div>

          <div className={styles.navActions}>
            {isAuthenticated ? (
              <Link href="/dashboard" className={`${styles.btn} ${styles.btnPrimary}`}>
                Open dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className={`${styles.loginLink} ${styles.hideSm}`}>
                  Log in
                </Link>
                <Link href="/register" className={`${styles.btn} ${styles.btnPrimary}`}>
                  Start free trial
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main>
        {/* HERO */}
        <section className={styles.hero} data-testid="home-hero">
          <div className={styles.heroFade} aria-hidden="true" />
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <p className={`${styles.up} ${styles.eyebrow}`}>
                <span className={`${styles.pulse} ${styles.eyebrowDot}`} />
                Built in Lahore with real shopkeepers
              </p>
              <h1 className={`${styles.up} ${styles.d1} ${styles.h1}`}>
                Your whole dukaan on one screen. Even when the internet goes.
              </h1>
              <p className={`${styles.up} ${styles.d2} ${styles.heroLead}`}>
                Sell at the counter, find any part across your branches, keep udhar
                and galla straight. DeepKhata is the POS, stock and khata app for
                shops that have outgrown the register book.
              </p>
              <div className={`${styles.up} ${styles.d3} ${styles.heroCtas}`}>
                <Link
                  href={isAuthenticated ? "/dashboard" : "/register"}
                  className={`${styles.btn} ${styles.btnLarge}`}
                >
                  Start 30-day free trial
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
                <Link href="#features" className={`${styles.btn} ${styles.btnGhost}`}>
                  See what it does
                </Link>
              </div>
              <ul className={`${styles.up} ${styles.d4} ${styles.checks}`}>
                <li className={styles.check}>
                  <Check /> No card needed
                </li>
                <li className={styles.check}>
                  <Check /> Works offline
                </li>
                <li className={styles.check}>
                  <Check /> Runs on any shop laptop
                </li>
              </ul>
            </div>

            {/* Product mock */}
            <div className={`${styles.up} ${styles.d3} ${styles.mockWrap}`}>
              <div
                role="img"
                aria-label="DeepKhata point of sale screen showing a three item sale"
                className={styles.mockCard}
              >
                <div className={styles.mockBar}>
                  <div className={styles.dots} aria-hidden="true">
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                  </div>
                  <span className={styles.mockTitle}>Point of Sale · Hall Road</span>
                  <span
                    className={styles.syncPill}
                    style={{ background: sync.bg, color: sync.fg }}
                  >
                    {sync.label}
                  </span>
                </div>

                <div className={styles.mockBody}>
                  <div className={styles.cartHead}>
                    <span className={styles.cartTitle}>Cart</span>
                    <span className={styles.cartCustomer}>Customer: Ali Mirza</span>
                  </div>
                  {CART.map((row) => (
                    <div key={row.name} className={styles.cartRow}>
                      <div className={styles.cartRowMain}>
                        <div className={styles.cartName}>{row.name}</div>
                        <div className={styles.cartMeta}>{row.meta}</div>
                      </div>
                      <div className={`${styles.num} ${styles.cartPrice}`}>
                        {row.price}
                      </div>
                    </div>
                  ))}
                </div>

                <div className={styles.udharRow}>
                  <span className={styles.udharLabel}>Purani udhar</span>
                  <span className={`${styles.num} ${styles.udharValue}`}>
                    Rs 23,200
                  </span>
                </div>

                <div className={styles.totalRow}>
                  <div>
                    <div className={styles.totalLabel}>Grand total</div>
                    <div className={`${styles.num} ${styles.totalValue}`}>
                      Rs 23,200
                    </div>
                  </div>
                  <span className={styles.chargeBtn}>Charge cash</span>
                </div>
              </div>

              <div className={`${styles.float} ${styles.floatChip}`}>
                <span className={styles.chipIcon}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#1d4ed8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                  </svg>
                </span>
                <span className={styles.chipText}>
                  <strong>Liberty has 3</strong>
                  Cabinet B · Rack 2 · Bin 4
                </span>
              </div>

              <div className={`${styles.float2} ${styles.floatToasts}`}>
                {TOASTS.map((toast, index) => {
                  const on = index === phase;
                  return (
                    <div
                      key={toast.title}
                      className={styles.toast}
                      style={{
                        opacity: on ? 1 : 0,
                        transform: `translateY(${on ? "0" : "10px"})`,
                      }}
                      aria-hidden={on ? undefined : true}
                    >
                      <span
                        className={styles.toastIcon}
                        style={{ background: toast.iconBg }}
                      >
                        <Check color={toast.iconFg} />
                      </span>
                      <span className={styles.toastText}>
                        <strong>{toast.title}</strong>
                        {toast.body}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* MARQUEE */}
        <section
          aria-label="Shops DeepKhata is built for"
          className={styles.marqueeSection}
        >
          <div className={`${styles.marqueeTrack} ${styles.marquee}`}>
            {SHOPS.concat(SHOPS).map((shop, index) => (
              <span
                key={`${shop}-${index}`}
                className={styles.marqueeItem}
                aria-hidden={index >= SHOPS.length ? true : undefined}
              >
                <span className={styles.marqueeDot} />
                {shop}
              </span>
            ))}
          </div>
        </section>

        {/* PROBLEMS */}
        <section className={styles.section}>
          <div className={`${styles.reveal} ${styles.sectionHead}`}>
            <p className={styles.kicker}>Sound familiar?</p>
            <h2 className={styles.h2}>Three things every shop owner told us</h2>
          </div>
          <div className={styles.painsGrid}>
            {PAINS.map((pain) => (
              <div key={pain.n} className={`${styles.reveal} ${styles.painCard}`}>
                <div className={styles.painNum}>{pain.n}</div>
                <p className={styles.painQuote}>“{pain.quote}”</p>
                <p className={styles.painAnswer}>{pain.answer}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className={`${styles.section} ${styles.sectionTight}`}>
          <div className={`${styles.reveal} ${styles.sectionHeadRow}`}>
            <div style={{ maxWidth: 640 }}>
              <p className={styles.kicker}>Everything the counter needs</p>
              <h2 className={styles.h2}>
                One app instead of a register, a diary and a calculator
              </h2>
            </div>
            <p className={styles.cardText} style={{ maxWidth: 380 }}>
              Your staff use the same words you do: udhar, galla, khata, lena, dena,
              maal.
            </p>
          </div>

          <div className={styles.bentoGrid}>
            {/* Stock finder */}
            <div className={`${styles.card} ${styles.cardSoft} ${styles.cardWide} ${styles.reveal}`}>
              <div className={styles.cardCol}>
                <h3 className={`${styles.cardTitle} ${styles.cardTitleLg}`}>
                  Stock Finder
                </h3>
                <p className={`${styles.cardText} ${styles.cardTextLg}`}>
                  Type a part number, a model or the name your staff use. See how many
                  are in every branch, which cabinet they sit in, and the lowest price
                  staff may sell at.
                </p>
              </div>
              <div className={styles.finderMock}>
                <div className={styles.finderInput}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#737373"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                  </svg>
                  <span className={`${styles.type} ${styles.finderType}`}>
                    840 g3 keyboard
                  </span>
                </div>
                <div className={styles.finderRows}>
                  <div className={`${styles.finderRow} ${styles.finderRowOpen}`}>
                    <span>
                      <strong>Hall Road</strong>{" "}
                      <span className={styles.finderLoc}>· Cabinet A / Rack 2</span>
                    </span>
                    <span className={styles.finderCountOpen}>2 available</span>
                  </div>
                  <div className={styles.finderRow}>
                    <span>
                      <strong>Liberty</strong>{" "}
                      <span className={styles.finderLoc}>· Original pull ×3</span>
                    </span>
                    <span className={styles.finderCount}>3 available</span>
                  </div>
                  <div className={`${styles.finderRow} ${styles.finderRowNote}`}>
                    <span>Sale Rs 4,500 · lowest Rs 4,000</span>
                    <span className={styles.finderRequest}>Request from Liberty</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Lena Dena */}
            <div className={`${styles.card} ${styles.reveal}`}>
              <h3 className={styles.cardTitle}>Lena / Dena</h3>
              <p className={styles.cardText}>
                Every rupee customers owe you and you owe vendors, with due dates,
                aging and reminders.
              </p>
              <div className={styles.moneyGrid}>
                <div className={`${styles.moneyBox} ${styles.moneyIn}`}>
                  <div className={styles.moneyLabel}>Lena hai</div>
                  <div className={`${styles.num} ${styles.moneyValue}`}>Rs 67,020</div>
                </div>
                <div className={`${styles.moneyBox} ${styles.moneyOut}`}>
                  <div className={styles.moneyLabel}>Dena hai</div>
                  <div className={`${styles.num} ${styles.moneyValue}`}>Rs 18,400</div>
                </div>
              </div>
            </div>

            {/* Galla */}
            <div className={`${styles.card} ${styles.reveal}`}>
              <h3 className={styles.cardTitle}>Galla &amp; daily kharcha</h3>
              <p className={styles.cardText}>
                Open the register in the morning, log chai and rider money, close at
                night with a Z-report that shows if the drawer matches.
              </p>
              <div className={styles.gallaBox}>
                <div className={styles.gallaRow}>
                  <span className={styles.gallaMuted}>Subah ka cash</span>
                  <span className={styles.num}>Rs 5,000</span>
                </div>
                <div className={styles.gallaRow}>
                  <span className={styles.gallaMuted}>Cash sales</span>
                  <span className={`${styles.num} ${styles.gallaIn}`}>+ Rs 41,300</span>
                </div>
                <div className={styles.gallaRow}>
                  <span className={styles.gallaMuted}>Kharcha</span>
                  <span className={`${styles.num} ${styles.gallaOut}`}>− Rs 1,500</span>
                </div>
                <div className={`${styles.gallaRow} ${styles.gallaTotal}`}>
                  <span>Galla mein hona chahiye</span>
                  <span className={styles.num}>Rs 44,800</span>
                </div>
              </div>
            </div>

            {/* Restock */}
            <div className={`${styles.card} ${styles.reveal}`}>
              <h3 className={styles.cardTitle}>Restock Hub</h3>
              <p className={styles.cardText}>
                Receive maal into a branch and cabinet in one batch. The vendor’s khata
                updates on its own, so nothing is entered twice.
              </p>
              <div className={styles.chips}>
                <span className={`${styles.chip} ${styles.chipBlue}`}>12 units in</span>
                <span className={styles.chip}>Cabinet B</span>
                <span className={`${styles.chip} ${styles.chipAmber}`}>
                  Vendor udhar + Rs 54,000
                </span>
              </div>
            </div>

            {/* Reports */}
            <div className={`${styles.card} ${styles.reveal}`}>
              <h3 className={styles.cardTitle}>Reports that answer questions</h3>
              <p className={styles.cardText}>
                Revenue against profit, what sells, who pays late and which staff member
                sold what.
              </p>
              <div className={styles.bars} aria-hidden="true">
                {BAR_HEIGHTS.map((height, index) => (
                  <div
                    key={height + index}
                    className={`${styles.bar} ${styles.barAnim} ${
                      index === BAR_HEIGHTS.length - 1 ? styles.barHot : ""
                    }`}
                    style={{
                      height: `${height}%`,
                      animationDelay: `${index * 0.06}s`,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* POS & receipts */}
            <div className={`${styles.card} ${styles.cardDark} ${styles.cardWide} ${styles.reveal}`}>
              <div className={styles.cardCol}>
                <h3 className={`${styles.cardTitle} ${styles.cardTitleLg}`}>
                  Fast checkout, receipts on WhatsApp
                </h3>
                <p className={`${styles.cardText} ${styles.cardTextLg}`}>
                  Walk-in or regular customer, cash, bank or udhar. Print on a thermal
                  printer or send the invoice link on WhatsApp.
                </p>
              </div>
              <div className={styles.posGrid}>
                <div className={styles.posBox}>
                  <div className={styles.posLabel}>Cash</div>
                  <div className={`${styles.num} ${styles.posValue}`}>Rs 276,580</div>
                </div>
                <div className={styles.posBox}>
                  <div className={styles.posLabel}>Bank</div>
                  <div className={`${styles.num} ${styles.posValue}`}>Rs 152,100</div>
                </div>
                <div className={styles.posBox}>
                  <div className={styles.posLabel}>Udhar</div>
                  <div className={`${styles.num} ${styles.posValue} ${styles.posValueUdhar}`}>
                    Rs 67,020
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* OFFLINE */}
        <section id="offline" className={styles.offline}>
          <div className={styles.offlineInner}>
            <div className={`${styles.reveal} ${styles.offlineCopy}`}>
              <p className={`${styles.kicker} ${styles.kickerLight}`}>Online + offline</p>
              <h2 className={`${styles.h2} ${styles.h2Light}`}>
                Load shedding? Net down? Keep selling.
              </h2>
              <p className={styles.offlineLead}>
                Sales, khata entries and kharcha save on the shop’s own computer while
                the connection is down. When it comes back, DeepKhata syncs everything
                to your other branches and your phone, with no double entries.
              </p>
              <ul className={styles.offlineList}>
                <li className={styles.offlineItem}>
                  <Check color="#60a5fa" size={20} />
                  Products and customers stay searchable offline
                </li>
                <li className={styles.offlineItem}>
                  <Check color="#60a5fa" size={20} />
                  Stock is reserved locally so two counters can’t sell the same unit
                </li>
                <li className={styles.offlineItem}>
                  <Check color="#60a5fa" size={20} />A clear sync status in the top bar,
                  always
                </li>
              </ul>
            </div>

            <div className={`${styles.reveal} ${styles.syncPanel}`}>
              <div className={styles.syncHead}>
                <span className={styles.syncWho}>Hall Road counter</span>
                <span
                  className={styles.syncPill}
                  style={{
                    background: sync.bgDark,
                    color: sync.fgDark,
                    fontSize: 12,
                    padding: "6px 12px",
                  }}
                >
                  {sync.label}
                </span>
              </div>

              <div className={styles.syncRail} aria-hidden="true">
                <div className={styles.syncRailDashes} />
                <div className={`${styles.travel} ${styles.syncDot}`} />
                <span className={`${styles.syncRailLabel} ${styles.syncRailStart}`}>
                  Shop PC
                </span>
                <span className={`${styles.syncRailLabel} ${styles.syncRailEnd}`}>
                  Cloud
                </span>
              </div>

              <div className={styles.queue}>
                {queue.map((item) => (
                  <div key={item.label} className={styles.queueRow}>
                    <span>{item.label}</span>
                    <span className={styles.queueState} style={{ color: item.color }}>
                      {item.state}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* BRANCHES */}
        <section id="branches" className={styles.section}>
          <div className={styles.branchWrap}>
            <div className={`${styles.reveal} ${styles.branchList}`}>
              <div className={styles.branchCard}>
                <span className={styles.branchBadge}>HR</span>
                <div className={styles.branchBody}>
                  <div className={styles.branchName}>Hall Road</div>
                  <div className={styles.branchMeta}>
                    Own galla · own cabinets · own order numbers
                  </div>
                </div>
                <span className={`${styles.num} ${styles.branchOrder}`}>ORD-HR-214</span>
              </div>

              <div className={styles.branchConnector} aria-hidden="true">
                <svg
                  width="24"
                  height="36"
                  viewBox="0 0 24 36"
                  fill="none"
                  stroke="#93c5fd"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2v32M5 9l7-7 7 7M5 27l7 7 7-7" />
                </svg>
              </div>

              <div className={styles.branchCard}>
                <span className={`${styles.branchBadge} ${styles.branchBadgeAlt}`}>LB</span>
                <div className={styles.branchBody}>
                  <div className={styles.branchName}>Liberty</div>
                  <div className={styles.branchMeta}>
                    Transfer request: 1 × 840 G3 keyboard
                  </div>
                </div>
                <span className={styles.branchPill}>Dispatched</span>
              </div>
            </div>

            <div className={`${styles.reveal} ${styles.branchCopy}`}>
              <p className={styles.kicker}>More than one shop</p>
              <h2 className={styles.h2}>
                Every branch separate. Every rupee in one place.
              </h2>
              <p className={styles.lead}>
                Each branch keeps its own galla, cabinets and stock. You see all of it
                from one login, move maal between branches with a request, and give
                staff only the access their job needs. Staff never see your cost price.
              </p>
              <div className={styles.roleChips}>
                <span className={styles.roleChip}>Owner</span>
                <span className={styles.roleChip}>Manager</span>
                <span className={styles.roleChip}>Staff</span>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className={styles.how}>
          <div className={styles.howInner}>
            <div className={`${styles.reveal} ${styles.centered}`}>
              <p className={styles.kicker}>Start today</p>
              <h2 className={styles.h2}>Selling in an afternoon</h2>
            </div>
            <ol className={styles.steps}>
              {STEPS.map((step) => (
                <li key={step.n} className={`${styles.reveal} ${styles.step}`}>
                  <span className={styles.stepNum}>{step.n}</span>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepBody}>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className={styles.section} data-testid="home-pricing">
          <div className={`${styles.reveal} ${styles.centered}`}>
            <p className={styles.kicker}>Pricing</p>
            <h2 className={styles.h2}>Try everything free for 30 days</h2>
            <p className={styles.lead}>
              Unlimited products, customers and vendors on every plan.
            </p>
          </div>

          <div className={styles.pricingGrid}>
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`${styles.planCard} ${styles.reveal} ${
                  plan.popular ? styles.planPopular : ""
                }`}
              >
                <div className={styles.planHead}>
                  <h3 className={styles.planName}>{plan.name}</h3>
                  {plan.popular && (
                    <span className={styles.popularBadge}>Most shops</span>
                  )}
                </div>
                <p className={styles.planFor}>{plan.for}</p>
                <div className={styles.planPrice}>{plan.price}</div>
                <div className={styles.planPeriod}>{plan.period}</div>
                <ul className={styles.planItems}>
                  {plan.items.map((item) => (
                    <li key={item} className={styles.planItem}>
                      <Check color="#1d4ed8" size={18} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`${styles.btn} ${styles.planCta} ${
                    plan.popular ? styles.planCtaPopular : ""
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={styles.faq} data-testid="home-faq">
          <div className={styles.faqInner}>
            <h2 className={`${styles.reveal} ${styles.faqTitle}`}>
              Questions shopkeepers ask
            </h2>
            <div className={styles.faqList}>
              {FAQS.map((faq, index) => {
                const open = openFaq === index;
                return (
                  <div key={faq.q} className={styles.faqItem}>
                    <button
                      type="button"
                      className={styles.faqButton}
                      onClick={() => setOpenFaq(open ? -1 : index)}
                      aria-expanded={open}
                    >
                      <span>{faq.q}</span>
                      <span
                        className={`${styles.faqIcon} ${open ? styles.faqIconOpen : ""}`}
                        aria-hidden="true"
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                        >
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </span>
                    </button>
                    {open && <p className={styles.faqAnswer}>{faq.a}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={styles.ctaSection} data-testid="home-cta">
          <div className={`${styles.reveal} ${styles.ctaBox}`}>
            <div className={styles.ctaGrid} aria-hidden="true" />
            <div className={styles.ctaInner}>
              <h2 className={styles.ctaTitle}>
                Band karein register book. Shuru karein DeepKhata.
              </h2>
              <p className={styles.ctaText}>
                30 days free. We help you load your products and train your staff.
              </p>
              <div className={styles.ctaActions}>
                <Link
                  href={isAuthenticated ? "/dashboard" : "/register"}
                  className={`${styles.btn} ${styles.ctaPrimary}`}
                >
                  Start free trial
                </Link>
                <a
                  href={WHATSAPP_URL}
                  className={`${styles.btn} ${styles.ctaSecondary}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Talk to us on WhatsApp
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <Logo size={24} />
            <span>DeepKhata by Deep Dev Solutions, Lahore · 2026</span>
          </div>
          <div className={styles.footerLinks}>
            <Link href="/terms">Terms</Link>
            <Link href="/login">Log in</Link>
            <Link href="/register">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
