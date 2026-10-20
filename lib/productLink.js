// Short, reversible product link codes (no database lookup needed).
// Normal products keep their small id:        /?product=10
// Supplier-only products (huge internal ids)  /?product=x7  or  /?product=hk3f9a2
// get a short code that decodes back to the same id. Old long links
// (?product=1000000000007) keep working too.
const STUB_BASE = 1_000_000_000_000;
const HASH_BASE = STUB_BASE + 500_000_000_000;

export function toProductCode(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n < STUB_BASE) return String(id);
  if (n >= HASH_BASE) return `h${(n - HASH_BASE).toString(36)}`;
  return `x${n - STUB_BASE}`;
}

// Returns the real product id (as a string) for any link form.
export function fromProductCode(code) {
  const c = String(code || "").trim();
  if (/^x\d+$/i.test(c)) return String(STUB_BASE + Number(c.slice(1)));
  if (/^h[0-9a-z]+$/i.test(c)) {
    const n = parseInt(c.slice(1), 36);
    if (Number.isFinite(n)) return String(HASH_BASE + n);
  }
  return c;
}
