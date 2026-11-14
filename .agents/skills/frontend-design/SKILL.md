---
name: frontend-design
description: >-
  Specialized frontend UI, responsive design, and mobile-first standards for DigiVerse.
  Use when designing, building, or refactoring storefront UI, product cards, checkout modals,
  account dashboards, navigation headers, or admin views using Next.js Pages Router and Tailwind CSS.
---

# DigiVerse Frontend Design & Mobile UI Skill

This skill defines the visual language, mobile-first responsive mechanics, and UI component standards for **DigiVerse** (`digiverse.top`). All UI work must follow these principles to guarantee a crisp, trustworthy, and high-converting experience across mobile and desktop devices.

---

## 1. Semantic Color Tokens (Strict Usage)

Never use arbitrary Tailwind grays (e.g. `bg-gray-100`, `text-gray-900`) or hardcoded hex colors. Always reference semantic tokens defined in `tailwind.config.js`:

| Role | Semantic Class | Hex Equivalent | Usage |
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
| **Warning (Manual/Pending)** | `text-warning` / `bg-warning` | `#B45309` | "Manual delivery" badges, awaiting payment alerts, warnings. |
| **Warning Soft** | `bg-warning-soft` | `#FFFBEB` | Warning alert boxes, countdown containers. |
| **Danger (Error/Cancelled)** | `text-danger` / `bg-danger` | `#DC2626` | Error notices, out of stock badges, cancellations. |
| **Danger Soft** | `bg-danger-soft` | `#FEF2F2` | Error banner backgrounds, failed transactions. |

---

## 2. Mobile-First Responsive Design Principles

### 2.1 The Mobile-First Order
Write base un-prefixed classes for small smartphone screens (`360px–430px`) first, then progressively layer larger breakpoints:
```html
<!-- CORRECT: Stacks on mobile, 2 columns on tablet, 3 on desktop -->
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
```

### 2.2 Touch Target Ergonomics (44px Rule)
Mobile users navigate with thumbs. All interactive buttons, tabs, inputs, and icon click targets must have a minimum tap area of **44×44px**:
```html
<!-- Minimum 44px tap target -->
<button className="min-h-[44px] px-4 py-2.5 rounded-xl ...">
  Action Button
</button>
```

### 2.3 Fluid Containers Over Fixed Widths
- **NEVER** use fixed pixel widths on layout containers (e.g., `w-[500px]`, `w-[380px]`).
- **ALWAYS** use fluid widths with max limits: `w-full max-w-md mx-auto` or `max-w-7xl mx-auto px-4 sm:px-6`.

### 2.4 Zero Horizontal Overflow
- Prevent horizontal scrollbars on mobile.
- Tables, crypto addresses, and code snippets must be explicitly scrollable or truncated:
```html
<div className="w-full overflow-x-auto">
  <table className="w-full min-w-[600px] text-left">...</table>
</div>
```

---

## 3. Typography & Internationalization (RTL & LTR)

### 3.1 Font Families
- **Display & Body:** `'Inter', 'Noto Sans Arabic', sans-serif` (`font-body` or `font-display`).
- **Financial & Identifiers:** `'IBM Plex Mono', monospace` (`font-mono`).

### 3.2 LTR Enforcement for Financials & Codes
Because DigiVerse supports Arabic (`/ar`), numbers, currencies, wallet addresses, order IDs, and invite codes must never flip backwards:
```html
<!-- ALWAYS wrap numbers, hashes, and invite codes with font-mono and dir="ltr" -->
<span className="font-mono text-sm font-bold text-ink" dir="ltr">
  $12.50
</span>
<span className="font-mono text-xs text-muted truncate" dir="ltr">
  0x71C...392B
</span>
```

---

## 4. Component Patterns & Visual Elevation

### 4.1 Card Elevation & Depth
Depth is created using subtle borders paired with soft multi-layer shadows, never harsh dark drop-shadows:
```html
<div className="rounded-2xl border border-border bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
  <!-- Card Content -->
</div>
```

### 4.2 Primary CTA Button
```html
<button className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed">
  ⚡ Buy Now
</button>
```

### 4.3 Secondary / Outline Button
```html
<button className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-brand-soft/50 hover:border-brand-light active:scale-[0.99]">
  Cancel
</button>
```

### 4.4 Status & Delivery Badges
```html
<!-- Automatic Delivery Badge -->
<span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
  ⚡ Automatic delivery
</span>

<!-- Manual Delivery Badge -->
<span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">
  ✋ Manual delivery
</span>
```

### 4.5 Responsive Modals & Dialogs
Modals must fit comfortably on small screens without trapping scroll or cutting off action buttons:
```html
<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/40 backdrop-blur-sm">
  <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-surface border border-border p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
    <!-- Modal content with sticky or visible action buttons -->
  </div>
</div>
```

---

## 5. Reusable UI Components Directory

Before writing raw markup, check for existing shared components in `components/ui/`:

- `components/ui/Button.js` — `PrimaryButton`, `SecondaryButton`, `GhostButton`
- `components/ui/Modal.js` — Accessible modal dialog with backdrop blur and escape key handling
- `components/ui/Alert.js` — Semantic status banners (`success`, `warning`, `danger`, `info`)
- `components/ui/FormInput.js` — Styled text input with label and error helpers
- `components/ui/ProductCard.js` — Official storefront product card layout
- `components/ui/Toast.js` — Notification popups (`useToast` hook)
- `components/ui/States.js` — `LoadingState`, `EmptyState`, `ErrorState`

---

## 6. Pre-Commit Responsive Checklist

When modifying or creating any UI:
1. **[ ] Mobile Check (360px–430px):** Does it look balanced on mobile without any horizontal overflow?
2. **[ ] Tap Target Check (44px):** Are all buttons and clickable links at least 44px tall?
3. **[ ] Semantic Tokens:** Are all colors using `bg-surface`, `text-ink`, `text-muted`, `bg-brand`?
4. **[ ] Directional Currency (`dir="ltr"`):** Are prices, tokens, and hashes wrapped in `dir="ltr"` with `font-mono`?
5. **[ ] Build Verification:** Run `npm run build` and ensure exit code `0`.

