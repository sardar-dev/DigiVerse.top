# DigiVerse Project Guidelines & Architecture Map

## 1. Core Identity & Language Standards
- **Project**: DigiVerse (`digiverse.top`) — Modern cloud digital commerce platform for software licenses, AI tokens, and digital goods.
- **Strict Language Requirement**: Always communicate, write code comments, generate UI text, and compose commit messages strictly in **professional, clean English**. Never use Hindi or Urdu.

---

## 2. Technology Stack & Runtime
- **Framework**: Next.js 14 using the **Pages Router** (`pages/` directory). Do not use or look for Next.js App Router (`app/`).
- **Styling**: Tailwind CSS with custom design system defined in `DESIGN.md`.
- **Database & Auth**: Supabase PostgreSQL.
  - Server-side/Admin operations: `lib/supabaseAdmin.js` (uses `SUPABASE_SERVICE_ROLE_KEY`).
  - Client-side auth & queries: `lib/supabaseClient.js` (uses public anon key).
- **Transactional Email**: Resend SMTP configured on custom domain `digiverse.top`.
- **Real-Time Notifications**: Telegram Bot alerts via `lib/telegram.js` (order fulfillment and user signup events).
- **Internationalization (i18n)**: Handled via `lib/i18n.js` and `useT()` hook (`en`, `ar`, `ru`).

---

## 3. Directory & Architecture Map
Fast lookup directory to eliminate unnecessary exploratory searches:

```
DigiVerse.top/
├── pages/
│   ├── index.js                  # Storefront catalog, search, and BuyModal checkout
│   ├── _app.js                   # Application wrapper, theme, and toast providers
│   ├── _document.js              # HTML document template and font imports
│   ├── login.js, signup.js       # Customer authentication pages
│   ├── account/
│   │   ├── orders.js             # Order history and serial keys display
│   │   ├── referrals.js          # Referral dashboard, stats cards, and claim links
│   │   ├── wallet.js             # Customer balance and topup
│   │   └── support.js            # Customer ticket inbox and message submission
│   ├── admin/                    # Admin portal dashboard
│   └── api/
│       ├── orders/               # Order creation, verification, buff-status
│       ├── referrals/            # me.js, qualify.js, claim-gift.js
│       ├── wallet/               # Balance topups and gift availability
│       └── admin/                # Admin APIs (products, orders, telegram-test, etc.)
├── components/
│   ├── layout/                   # SiteHeader, SiteFooter, PageContainer
│   ├── ui/                       # Button, Modal, Alert, FormInput, ProductCard, Toast
│   ├── admin/                    # ReferralsTab, OrdersTab, ProductsTab, SettingsTab
│   └── PaymentPanel.js           # Multi-gateway payment router (Crypto, Balance, etc.)
├── lib/
│   ├── supabaseAdmin.js          # Service-role database client (server only)
│   ├── supabaseClient.js         # Client-safe Supabase instance
│   ├── telegram.js               # Real-time Telegram alert dispatcher
│   ├── fulfillOrder.js           # Order fulfillment pipeline (stock, TunVN, manual)
│   ├── tunvnBuff.js              # Muse AI Buff token delivery via TunVN API
│   ├── referralSettings.js       # Global referral settings and fallbacks
│   └── i18n.js                   # Translations and localization helper
└── supabase/                     # SQL migration scripts (migration_001_ to migration_047_)
```

---

## 4. Fulfillment & Business Logic
- **Stock Serials (`provider = 'digitrust' | 'internal'`)**:
  - Automatically claims available license keys from `stock_items` and marks order completed.
- **TunVN Buff AI Tokens (`tunvn_buff = true`, e.g. Product `-12`)**:
  - Delivers Muse AI tokens to customer accounts asynchronously using their invite link/code.
  - Handled by `lib/tunvnBuff.js` and polled via `/api/orders/buff-status`.
- **Manual Delivery (`provider = 'manual'`)**:
  - Requires admin dispatch from Admin > Orders dashboard.
- **Referral Rewards System**:
  - **Instant Unlocks**: Rewards have 0s lock delay (`lock_delay_seconds = 0`). Available immediately.
  - **1 Box = 1 Billion Muse AI Tokens**.
  - **Seamless Claim Link**: Clicking claim buttons on `/account/referrals` navigates directly to `/?product=-12`.
  - **Auto-Selected Free Gift**: When `/?product=-12` opens for users with available boxes, the purchase modal automatically applies 1 gift box for an instant `$0.00` total checkout.

---

## 5. Development & Shell Execution Rules (Windows Environment)
- **Operating System**: Windows. **Shell**: PowerShell.
- **Command Chaining**: NEVER use bash syntax `&&`. Always use PowerShell semicolon `;` or separate commands:
  ```powershell
  # Correct PowerShell usage:
  git add . ; git commit -m "..." ; git push origin main
  ```
- **Build Verification**:
  - Always verify changes with `npm run build` before pushing to `origin/main`.
  - Ensure the build exits with code `0`.
- **Search Exclusions**:
  - During codebase searches, ignore `.next/`, `node_modules/`, `.git/`, and build artifacts.

---

## 6. SEO & Customer-Facing Terminology Standards
- **Strict Terminology Rule**: NEVER use supplier jargon like "buff" or "buff token" in customer-facing UI, SEO titles, meta descriptions, alt tags, or marketing copy. Always use clean, professional terms: **"Muse AI Tokens"**, **"Meta Muse AI Tokens"**, **"1 Billion Muse AI Tokens"**.
- **Dynamic Sitemap Indexing (`pages/sitemap.xml.js`)**: All active storefront products are dynamically rendered into the sitemap with `daily` change frequency and `0.9` priority so Google crawls and indexes every product.
- **Google Rich Results Schema**: Storefront and individual product pages inject structured `schema.org/Product`, `Offer` (`price`, `priceCurrency: "USD"`, `availability: "InStock"`), `BreadcrumbList`, and `WebSite` with `SearchAction` for Google rich snippets.


