// Pure decision logic: which supplier source should power a product?
// No I/O here so it can be unit-tested and reused by sync + admin actions.
//
// Rules (set by the store owner):
//  - Customer price never changes: it is products.sell_price.
//  - A source is usable if it has stock (after buffer) and can serve
//    this product (e.g. XPro cannot take a customer email).
//  - A usable source is *eligible* when cost <= sell_price, or when the
//    admin approved it by hand (cost may be higher).
//  - Among eligible sources the cheapest wins; ties keep the current
//    one, then fall back to supplier priority.
//  - No eligible source => product is hidden (available_stock = 0) with
//    a status explaining why; it re-appears automatically when a
//    source becomes eligible. Never auto-buys from a second supplier.

const EPS = 1e-9;

export function chooseSource(product, sources, supplierMeta = {}) {
  const sell = Number(product.sell_price);
  const canServe = (s) => {
    const meta = supplierMeta[s.supplier];
    if (product.requires_email && meta && meta.supportsEmail === false) return false;
    return true;
  };
  const priority = (s) => supplierMeta[s.supplier]?.priority ?? 99;
  const cmp = (a, b) =>
    Number(a.cost) - Number(b.cost) ||
    (b.supplier === product.active_supplier) - (a.supplier === product.active_supplier) ||
    priority(a) - priority(b);

  const servable = sources.filter(canServe);
  const inStock = servable.filter((s) => Number(s.available_stock) > 0);
  const eligible = inStock.filter((s) => s.approved || Number(s.cost) <= sell + EPS);

  let chosen;
  let status;
  if (eligible.length > 0) {
    chosen = [...eligible].sort(cmp)[0];
    status = "ok";
  } else if (inStock.length > 0) {
    chosen = [...inStock].sort(cmp)[0];
    status = "price_too_high";
  } else {
    // Nothing in stock: keep showing the current/cheapest source in admin.
    const pool = servable.length ? servable : sources;
    chosen = [...pool].sort(cmp)[0] || null;
    status = "out_of_stock";
  }

  if (!chosen) {
    return {
      source: null,
      status: "out_of_stock",
      mirror: {
        active_supplier: product.active_supplier ?? null,
        supplier_status: "out_of_stock",
        cost_price: product.cost_price,
        real_stock: 0,
        available_stock: 0,
      },
    };
  }

  return {
    source: chosen,
    status,
    mirror: {
      active_supplier: chosen.supplier,
      supplier_status: status,
      cost_price: Number(chosen.cost),
      real_stock: Number(chosen.stock),
      available_stock: status === "ok" ? Number(chosen.available_stock) : 0,
    },
  };
}
