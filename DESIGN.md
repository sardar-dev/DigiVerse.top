---
name: "DigiVerse Clean Cloud Commerce"
description: "Stripe and Wise-inspired clean commerce design system tailored for digital goods, crypto payments, and token deliveries."
version: "1.0.0"
brand: "DigiVerse"
status: "active"
---

# DigiVerse Design System: Clean Cloud Commerce

## 1. Vision & Core Philosophy
DigiVerse is a premier digital marketplace specializing in AI accounts, token buffs, and instant automated digital assets paid via Crypto and Wallet Balance.

* **Tone & Mood:** Trustworthy, Crisp, Modern, High-Velocity, Transparent.
* **Inspiration:** Stripe Dashboard, Wise, Linear Clean Light.
* **Core Principle:** Frictionless buying experience. Every card, badge, and modal must convey immediate legitimacy, instant delivery status, and absolute payment safety.

---

## 2. Color Palette & Semantic Tokens

All color references **MUST** use these Tailwind classes rather than arbitrary inline hex codes.

| Role | Tailwind Token | Hex Value | Primary Usage |
| :--- | :--- | :--- | :--- |
| **Canvas Background** | `bg-bg` | `#F6F8FC` | Main app background, page wrapper. Soft, reduces eye strain. |
| **Surface / Card** | `bg-surface` | `#FFFFFF` | Product cards, modals, popovers, table bodies. |
| **Border / Hairline** | `border-border` | `#DFE5F0` | Dividers, card boundaries, table grid lines, inputs. |
| **Primary Text (Ink)** | `text-ink` | `#17213A` | Headings, strong numbers, titles, high-contrast labels. |
| **Secondary Text (Muted)** | `text-muted` | `#6E7890` | Subtitles, helper text, timestamps, captions, breadcrumbs. |
| **Brand Primary** | `bg-brand` / `text-brand` | `#3169F5` | Primary CTA buttons, active tabs, brand logo, highlights. |
| **Brand Light / Focus** | `border-brand-light` | `#73A0FF` | Focus rings, input focus, hover outlines. |
| **Brand Dark (Active)** | `hover:bg-brand-dark` | `#1E4FD6` | Pressed states, active hover on primary buttons. |
| **Brand Soft (Tint)** | `bg-brand-soft` | `#EDF2FB` | Subtle pill backgrounds, icon badges, promo callout boxes. |
| **Success (Automated/Paid)** | `text-success` / `bg-success` | `#15803D` | "Automatic delivery" badges, confirmed payments, checkmarks. |
| **Success Soft** | `bg-success-soft` | `#ECFDF3` | Success pill backgrounds, completed order tags. |
| **Warning (Manual/Pending)**| `text-warning` / `bg-warning` | `#B45309` | "Manual delivery" badges, awaiting payment alerts, warnings. |
| **Warning Soft** | `bg-warning-soft` | `#FFFBEB` | Warning alert boxes, countdown containers. |
| **Danger (Error/Cancelled)**| `text-danger` / `bg-danger` | `#DC2626` | Error notices, out of stock badges, cancellations. |
| **Danger Soft** | `bg-danger-soft` | `#FEF2F2` | Error banner backgrounds, failed transactions. |

---

## 3. Typography Hierarchy

### Font Families
- **Display & Body:** `'Inter', 'Noto Sans Arabic', sans-serif` (Universal UI readability with Arabic/RTL support).
- **Numbers, Codes & Crypto:** `'IBM Plex Mono', monospace` (Used for order IDs, wallet addresses, token units e.g. `1B`, `500M`, and transaction hashes).

### Hierarchy Scale
* **Display / Hero Headline:** `text-3xl sm:text-5xl font-extrabold tracking-tight text-ink`
* **Section Heading:** `text-xl sm:text-2xl font-bold text-ink`
* **Card Title:** `text-base font-bold text-ink`
* **Body Normal:** `text-sm text-ink leading-relaxed`
* **Body Muted / Description:** `text-xs sm:text-sm text-muted`
* **Microcopy & Meta Tags:** `text-[11px] sm:text-xs font-semibold text-muted uppercase tracking-wider`
* **Crypto / Financial Numbers:** `font-mono font-bold text-ink` with explicit `dir="ltr"` so numbers never reverse in RTL languages.

---

## 4. Spacing, Elevation & Shapes

* **Corner Radii:**
  - Small / Badges: `rounded-full` or `rounded-lg` (8px).
  - Buttons & Form Inputs: `rounded-xl` (12px).
  - Cards, Modals & Containers: `rounded-2xl` (16px) or `rounded-3xl` (24px).
* **Card Depth / Shadows:**
  - Standard Card: `shadow-card` (`0 1px 2px 0 rgba(23, 33, 58, 0.04), 0 1px 3px 0 rgba(23, 33, 58, 0.06)`)
  - Hover Card: `shadow-card-hover` (`0 4px 10px 0 rgba(23, 33, 58, 0.08)`) with `transition-all duration-200`
  - Modal Elevation: `shadow-2xl`
* **Containers:**
  - Max Width: `max-w-6xl` or `max-w-7xl` with `mx-auto px-4 sm:px-6`

---

## 5. Standard Component Specs

### 5.1 Primary Button (CTA)
```html
<button className="inline-flex items-center justify-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed">
  Confirm Order
</button>
```

### 5.2 Secondary / Ghost Button
```html
<button className="inline-flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-brand-soft/50 hover:border-brand-light">
  Cancel
</button>
```

### 5.3 Product Card
```html
<div className="group flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
  <!-- Badge + Title + Price + Delivery Badge + Buy Button -->
</div>
```

### 5.4 Delivery Status Badges
* **Automatic Delivery:**
  ```html
  <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
    ⚡ Automatic delivery
  </span>
  ```
* **Manual Delivery:**
  ```html
  <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">
    ✋ Manual delivery
  </span>
  ```

### 5.5 Form Inputs
```html
<input
  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition"
/>
```

### 5.6 Crypto Address & Transaction Hash
```html
<div className="flex items-center justify-between rounded-xl border border-border bg-bg p-3 font-mono text-xs text-ink" dir="ltr">
  <span className="truncate">0x71C...392B</span>
  <button className="text-brand font-semibold hover:underline">Copy</button>
</div>
```

---

## 6. Golden Rules for AI Developers (Do's & Don'ts)

### DO:
1. **Always use Semantic Tokens:** Use `bg-surface`, `text-ink`, `text-muted`, `border-border`, `bg-brand` instead of raw Tailwind grays like `bg-gray-100` or `text-gray-900`.
2. **Always wrap financial amounts and crypto codes in `dir="ltr"`:** Arabic and Urdu users navigate in RTL, but `$5.00` and `0xabc...` must always read left-to-right.
3. **Use IBM Plex Mono for Identifiers:** Order IDs (`ord_xyz`), coupons (`SAVE20`), wallet addresses, and token amounts (`1B`) must always use `font-mono`.
4. **Use Subtle Card Shadows + Hairlines:** Depth is achieved by pairing `border border-border` with soft `shadow-card`, not heavy dark borders or aggressive drop shadows.

### DON'T:
1. **NO Neon Rainbow Gradients:** Avoid heavy purple-to-pink or blue-to-yellow gradients. Keep gradients subtle and reserved for promotional banners only.
2. **NO Hardcoded Black Texts:** Never use `#000000` or `text-black`. Always use `#17213A` (`text-ink`) which provides softer, professional contrast.
3. **NO Arbitrary Border Radii:** Stick strictly to `rounded-xl` for buttons/inputs, `rounded-2xl` for cards, and `rounded-full` for pills/badges.
4. **NO Low-Contrast Alerts:** Every alert must pair its text color with its matching soft background (e.g. `text-success` with `bg-success-soft`).

