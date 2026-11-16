import { useEffect, useMemo, useState } from "react";
import SectionHeading from "../ui/SectionHeading";
import { SecondaryButton, LinkButton } from "../ui/Button";
import { ErrorState, LoadingState } from "../ui/States";
import Modal from "../ui/Modal";

const LABEL = { digitrust: "DigiTrust", xpro: "XPro", emstore: "EM Store", shotix: "Shotix", tunvn: "TunVN" };
// admin-added APIs show their saved name (see custom_suppliers)
// buildLabelMap merges built-in labels with any configured custom suppliers
const buildLabelMap = (configured = []) => {
  const map = { ...LABEL };
  for (const s of configured) {
    if (!s.id) continue;
    // If DB label is the placeholder word "custom", derive a better name from the id
    const label = s.label && s.label.toLowerCase() !== "custom" ? s.label : autoLabel(s.id);
    map[s.id] = label;
  }
  return map;
};
const labelOf = (id) => LABEL[id] || id;
const money = (n) => `$${Number(n).toFixed(2)}`;

const STATUS = {
  ok: { text: "Live", cls: "bg-success-soft text-success" },
  out_of_stock: { text: "Out of stock — hidden", cls: "bg-border text-muted" },
  price_too_high: { text: "Price too high — hidden", cls: "bg-danger-soft text-danger" },
};

// Loads only when opened / refreshed — no polling.
export default function SuppliersTab({ onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState("");

  const [multiFilter, setMultiFilter] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/suppliers");
      const json = await res.json();
      if (!json.success) throw new Error(json.hint || json.error || "failed");
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function act(body, okMsg) {
    setMsg("");
    const res = await fetch("/api/admin/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.success) {
      setMsg(`Failed: ${json.error}`);
      return;
    }
    setMsg(okMsg);
    await load();
    onChanged?.();
  }

  async function runCheck() {
    setChecking(true);
    const res = await fetch("/api/admin/suppliers?check=1");
    const json = await res.json();
    setCheck(json.suppliers || []);
    setChecking(false);
  }

  // Merge custom supplier labels so the matcher shows "Shotix" not "c_shotix1shop"
  const labelMap = useMemo(() => buildLabelMap(data?.configured || []), [data?.configured]);

  const filteredMulti = useMemo(() => {
    if (!data?.multi) return [];
    if (!multiFilter.trim()) return data.multi;
    const q = multiFilter.trim().toLowerCase();
    return data.multi.filter(
      (m) =>
        m.product.title.toLowerCase().includes(q) ||
        m.sources.some((s) => (labelMap[s.supplier] || s.supplier).toLowerCase().includes(q))
    );
  }, [data?.multi, multiFilter, labelMap]);

  if (loading && !data) return <LoadingState label="Loading suppliers…" />;
  if (error && !data) return <ErrorState title="Couldn't load suppliers" message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Suppliers"
        description="Each product can be sourced from several stores. The cheapest in-stock source that costs no more than your sell price is used automatically; anything pricier stays hidden until you approve it."
        action={
          <div className="flex gap-2">
            <SecondaryButton onClick={runCheck} disabled={checking}>
              {checking ? "Checking…" : "Test connections"}
            </SecondaryButton>
            <SecondaryButton onClick={load} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </SecondaryButton>
          </div>
        }
      />

      {msg && <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-ink">{msg}</p>}

      {check && (
        <div className="grid gap-3 sm:grid-cols-2">
          {check.map((s) => (
            <div key={s.id} className="rounded-xl border border-border bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink">{s.label}</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    !s.configured ? "bg-border text-muted" : s.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                  }`}
                >
                  {!s.configured ? "Not configured" : s.ok ? "Connected" : "Failed"}
                </span>
              </div>
              {s.configured && s.ok && (
                <p className="mt-2 text-sm text-muted">
                  Wallet balance: <span className="font-mono text-ink">{s.balance === null ? "unknown" : money(s.balance)}</span>
                </p>
              )}
              {s.catalog && !s.catalog.error && (
                <p className="mt-1 text-xs text-muted">
                  Catalog: {s.catalog.total ?? s.catalog.sample.length} product(s)
                  {s.catalog.sample.length === 0 && ` — empty (response keys: ${s.catalog.keys.join(", ")})`}
                </p>
              )}
              {s.catalog?.single && (
                <p className="mt-1 break-all text-xs text-muted">
                  Live check of product #{s.catalog.single.id}:{" "}
                  {s.catalog.single.error
                    ? s.catalog.single.error
                    : `stock ${s.catalog.single.stock}, cost ${money(s.catalog.single.cost)} — raw: ${s.catalog.single.raw}`}
                </p>
              )}
              {s.catalog?.error && <p className="mt-1 break-all text-xs text-danger">Catalog: {s.catalog.error}</p>}
              {s.error && <p className="mt-2 break-all text-xs text-danger">{s.error}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Needs attention */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink">Needs your decision (price too high)</h3>
        {data.needsPrice.length + data.multi.filter((m) => m.product.supplier_status === "price_too_high").length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            Nothing waiting. Every in-stock source is within your sell price.
          </p>
        ) : (
          <div className="space-y-3">
            {[...data.multi.filter((m) => m.product.supplier_status === "price_too_high"), ...data.needsPrice].map((m) => (
              <ProductSources
                key={m.product.id}
                entry={m}
                act={act}
                labelMap={labelMap}
                unlinked={data.unlinked}
              />
            ))}
          </div>
        )}
      </section>

      {/* Match products across suppliers */}
      <section id="product-matcher">
        <h3 className="mb-1 text-sm font-semibold text-ink">Match products (same product at two suppliers)</h3>
        <p className="mb-3 text-xs text-muted">
          Pick one supplier product (XPro, Shotix, etc.) and one DigiTrust product, then link them. They become ONE product on
          your store; customers always pay your price, and the cheaper supplier is used automatically. Check the match carefully
          — customers get whatever the supplier delivers.
        </p>
        <ProductMatcher unlinked={data.unlinked} targets={data.linkTargets} act={act} labelMap={labelMap} />
      </section>

      {/* Multi-source products */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Products with several sources</h3>
            <p className="text-xs text-muted">
              Edit linked products, unlink any supplier source, or add new supplier sources directly.
            </p>
          </div>
          <div className="w-full sm:w-72">
            <input
              type="search"
              value={multiFilter}
              onChange={(e) => setMultiFilter(e.target.value)}
              placeholder="Search linked products..."
              className="w-full rounded-xl border border-border bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand shadow-xs"
            />
          </div>
        </div>

        {filteredMulti.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            {multiFilter ? "No linked products match your search." : "None linked yet."}
          </p>
        ) : (
          <div className="space-y-3">
            {filteredMulti.map((m) => (
              <ProductSources
                key={m.product.id}
                entry={m}
                act={act}
                labelMap={labelMap}
                unlinked={data.unlinked}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const tokenSet = (t) =>
  new Set(
    String(t || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 1)
  );

function similarity(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / (A.size + B.size - hit);
}

const includesText = (q, text) => !q.trim() || String(text).toLowerCase().includes(q.trim().toLowerCase());

function ProductSources({ entry, act, labelMap = LABEL, unlinked = [] }) {
  const lbl = (id) => labelMap[id] || LABEL[id] || id;
  const { product, sources } = entry;
  const st = STATUS[product.supplier_status] || STATUS.ok;

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkingId, setLinkingId] = useState(null);

  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState(String(product.sell_price));
  const [savingPrice, setSavingPrice] = useState(false);

  // Suppliers already linked to this product
  const existingSupplierIds = new Set(sources.map((s) => s.supplier));

  // Eligible unlinked supplier products that don't belong to already linked suppliers
  const eligibleUnlinked = useMemo(() => {
    if (!unlinked || unlinked.length === 0) return [];
    return unlinked
      .filter((u) => {
        // Exclude supplier if this product already has a source from this supplier
        if (existingSupplierIds.has(u.product.provider)) return false;
        // If product requires email, only suppliers that deliver email can be linked
        if (product.requires_email && u.product.provider !== "digitrust") {
          // Keep unless known incompatible
        }
        return true;
      })
      .map((u) => {
        const score = similarity(u.product.title, product.title);
        const cost = Number(u.source?.cost ?? u.product.cost_price ?? 0);
        const margin = Number(product.sell_price) - cost;
        return { u, score, cost, margin };
      })
      .filter(({ u }) => {
        if (!linkSearch.trim()) return true;
        const q = linkSearch.trim().toLowerCase();
        return (
          u.product.title.toLowerCase().includes(q) ||
          lbl(u.product.provider).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.score - a.score);
  }, [unlinked, sources, product, linkSearch]);

  async function handleLink(u) {
    setLinkingId(u.product.id);
    try {
      await act(
        { action: "link", stub_product_id: u.product.id, target_product_id: product.id },
        `Linked ${lbl(u.product.provider)} to "${product.title}".`
      );
      setShowLinkModal(false);
    } finally {
      setLinkingId(null);
    }
  }

  async function handleSavePrice() {
    const p = Number(priceInput);
    if (!Number.isFinite(p) || p <= 0) return;
    setSavingPrice(true);
    try {
      await act(
        { action: "set_price", product_id: product.id, sell_price: p },
        `Updated sell price to ${money(p)}.`
      );
      setEditingPrice(false);
    } finally {
      setSavingPrice(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink text-base">{product.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>Your price</span>
            {editingPrice ? (
              <div className="inline-flex items-center gap-1.5">
                <span className="font-mono text-ink">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="w-20 rounded border border-border bg-bg px-2 py-0.5 font-mono text-xs text-ink focus:border-brand focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  disabled={savingPrice}
                  onClick={handleSavePrice}
                  className="rounded bg-brand px-2 py-0.5 text-xs font-semibold text-white hover:bg-brand-dark"
                >
                  {savingPrice ? "…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPriceInput(String(product.sell_price));
                    setEditingPrice(false);
                  }}
                  className="text-xs text-muted hover:text-ink underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5">
                <span className="font-mono font-bold text-ink">{money(product.sell_price)}</span>
                <button
                  type="button"
                  onClick={() => setEditingPrice(true)}
                  className="text-[11px] text-brand hover:underline font-medium"
                >
                  Edit price
                </button>
              </div>
            )}
            {!product.selected && <span className="text-muted">· hidden on store</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLinkModal(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-brand/30 bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand hover:text-white transition shadow-xs"
          >
            <span>+ Link Supplier</span>
          </button>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.text}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1.5 pr-3">Supplier</th>
              <th className="py-1.5 pr-3">Cost</th>
              <th className="py-1.5 pr-3">Stock</th>
              <th className="py-1.5 pr-3">Margin</th>
              <th className="py-1.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => {
              const margin = Number(product.sell_price) - Number(s.cost);
              const active = product.active_supplier === s.supplier;
              const isPrimary = s.supplier === "digitrust";
              return (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-2 pr-3 text-ink">
                    <span className="font-medium">{lbl(s.supplier)}</span>
                    {active && product.supplier_status === "ok" && (
                      <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand font-medium">
                        in use
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono text-muted">{money(s.cost)}</td>
                  <td className="py-2 pr-3 font-mono text-muted">
                    {s.available_stock}
                    <span className="text-xs"> / {s.stock}</span>
                  </td>
                  <td className={`py-2 pr-3 font-mono font-medium ${margin < 0 ? "text-danger" : "text-success"}`}>
                    {margin >= 0 ? "+" : "−"}
                    {money(Math.abs(margin))}
                  </td>
                  <td className="space-x-3 whitespace-nowrap py-2">
                    {margin < 0 && (
                      <LinkButton
                        onClick={() =>
                          act(
                            { action: "approve", source_id: s.id, approved: !s.approved },
                            s.approved
                              ? "Approval removed."
                              : "Approved — this source can now be shown even though it costs more than your price."
                          )
                        }
                        className={s.approved ? "text-danger" : ""}
                      >
                        {s.approved ? "Remove approval" : "Approve anyway"}
                      </LinkButton>
                    )}
                    {!isPrimary && (
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Unlink ${lbl(s.supplier)} from "${product.title}"?\n\nIt will be detached and immediately restored as an unlinked product so you can re-link it or manage it.`
                            )
                          ) {
                            act(
                              { action: "unlink", source_id: s.id },
                              `Unlinked ${lbl(s.supplier)} and restored to unlinked products.`
                            );
                          }
                        }}
                        className="text-xs font-semibold text-danger hover:underline"
                      >
                        Unlink
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Supplier Modal */}
      {showLinkModal && (
        <Modal
          title={`Link Another Supplier to "${product.title}"`}
          onClose={() => setShowLinkModal(false)}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4 text-sm">
            {/* Context Box */}
            <div className="rounded-xl border border-border bg-bg p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Target Store Product:</span>
                <span className="font-semibold text-ink">{product.title}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Current Sell Price:</span>
                <span className="font-mono font-bold text-ink">{money(product.sell_price)}</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-border/60">
                <span className="text-muted">Already Linked:</span>
                <div className="flex flex-wrap gap-1">
                  {sources.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1 rounded bg-surface border border-border px-1.5 py-0.5 text-[11px] font-medium text-ink"
                    >
                      <span className="text-brand font-semibold">{lbl(s.supplier)}</span>
                      <span className="font-mono text-muted">({money(s.cost)})</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">🔍</span>
              <input
                type="search"
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
                placeholder="Search available unlinked supplier products..."
                className="w-full rounded-xl border border-border bg-surface pl-9 pr-3 py-2 text-xs text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                autoFocus
              />
            </div>

            {/* List of Eligible Unlinked Products */}
            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
              {eligibleUnlinked.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-bg/50 p-6 text-center text-xs text-muted">
                  {linkSearch
                    ? "No unlinked products match your search."
                    : "No unlinked products available from other suppliers."}
                </div>
              ) : (
                eligibleUnlinked.map(({ u, score, cost, margin }) => {
                  const isLinking = linkingId === u.product.id;
                  const isProfitable = margin >= 0;
                  return (
                    <div
                      key={u.product.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 hover:border-brand-light transition-all shadow-xs"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="rounded bg-brand-soft border border-brand/20 px-2 py-0.5 text-[10px] font-bold text-brand uppercase">
                            {lbl(u.product.provider)}
                          </span>
                          <span className="font-medium text-xs text-ink truncate max-w-[280px]">
                            {u.product.title}
                          </span>
                          {score >= 0.4 && (
                            <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-600">
                              {Math.round(score * 100)}% match
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-muted">
                            Cost: <b className="font-mono text-ink">{money(cost)}</b>
                          </span>
                          <span className="text-muted">
                            Stock: <b className="font-mono text-ink">{u.product.available_stock}</b>
                          </span>
                          <span className={isProfitable ? "text-success font-medium" : "text-danger font-medium"}>
                            Margin: {isProfitable ? "+" : "−"}{money(Math.abs(margin))}
                          </span>
                        </div>
                      </div>

                      <div className="flex-shrink-0">
                        <button
                          type="button"
                          disabled={isLinking}
                          onClick={() => handleLink(u)}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand hover:bg-brand-dark px-3 py-1.5 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-50"
                        >
                          {isLinking ? "Linking…" : "+ Link to Product"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <SecondaryButton onClick={() => setShowLinkModal(false)} className="px-4 py-1.5 text-xs">
                Close
              </SecondaryButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// One supplier column — shows its own unlinked products, highlights matches.
// globalQ: shared search from the global bar above all columns
function SupplierColumn({ supplierId, unlinked, dSel, targets, onSelect, selId, lbl, globalQ }) {
  const [q, setQ] = useState("");
  const activeQ = globalQ || q; // global takes priority when set
  const dItem = targets.find((t) => t.id === dSel) || null;

  const list = unlinked
    .filter((u) => u.product.provider === supplierId && includesText(activeQ, u.product.title))
    .map((u) => ({
      u,
      score: dItem ? similarity(u.product.title, dItem.title) : 0,
    }))
    .sort((a, b) => b.score - a.score || a.u.product.title.localeCompare(b.u.product.title));

  return (
    <MatchColumn
      title={`${lbl(supplierId)} (${list.length})`}
      query={globalQ ? "" : q}           // hide local query when global is active
      setQuery={globalQ ? () => {} : setQ} // disable local input when global active
      queryPlaceholder={globalQ ? `Filtered by global search…` : `Search in ${lbl(supplierId)}…`}
      queryDisabled={Boolean(globalQ)}
      empty={`No ${lbl(supplierId)} products.`}
    >
      {list.map(({ u, score }) => (
        <MatchRow
          key={u.product.id}
          active={selId === u.product.id}
          onClick={() => onSelect(selId === u.product.id ? null : u.product.id)}
          title={u.product.title}
          meta={`Cost ${u.source ? money(u.source.cost) : "—"} · stock ${u.source ? u.source.stock : "—"}`}
          badge={dItem && score >= 0.3 ? `${Math.round(score * 100)}%` : null}
        />
      ))}
    </MatchColumn>
  );
}

function ProductMatcher({ unlinked, targets, act, labelMap = LABEL }) {
  const lbl = (id) => labelMap[id] || LABEL[id] || id;

  // One selected product id per supplier column, keyed by supplier id
  const [selBySupplier, setSelBySupplier] = useState({}); // { xpro: 123, c_shotix: 456 }
  const [dSel, setDSel] = useState(null); // DigiTrust product id
  const [dq, setDq] = useState("");
  const [globalQ, setGlobalQ] = useState(""); // searches ALL columns at once

  // All unique non-DigiTrust suppliers present in unlinked list
  const supplierIds = useMemo(() => {
    const seen = new Set();
    for (const u of unlinked) seen.add(u.product.provider);
    return [...seen].sort();
  }, [unlinked]);

  const canLink = (u, t) =>
    !t.sources.some((s) => s.supplier === u.product.provider) &&
    !(t.requires_email && u.product.provider !== "digitrust");

  // Currently selected supplier item (first one that has a selection)
  const selectedSupplierItems = supplierIds
    .filter((id) => selBySupplier[id])
    .map((id) => unlinked.find((u) => u.product.id === selBySupplier[id]))
    .filter(Boolean);
  const anySupplierSel = selectedSupplierItems[0] || null; // used for DT scoring

  const dItem = targets.find((t) => t.id === dSel) || null;

  // Auto-suggestions: best DigiTrust match for each unlinked product
  const suggestions = useMemo(() => {
    const out = [];
    for (const u of unlinked) {
      let best = null;
      for (const t of targets) {
        if (!canLink(u, t)) continue;
        const score = similarity(u.product.title, t.title);
        if (!best || score > best.score) best = { u, t, score };
      }
      if (best && best.score >= 0.5) out.push(best);
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlinked, targets]);

  const activeDq = globalQ || dq; // global overrides per-column search
  const dList = targets
    .filter((t) => includesText(activeDq, t.title))
    .map((t) => ({ t, score: anySupplierSel ? similarity(anySupplierSel.product.title, t.title) : 0 }))
    .sort((a, b) => b.score - a.score || a.t.title.localeCompare(b.t.title));

  // Link one supplier product → DigiTrust
  async function link(u, t) {
    await act(
      { action: "link", stub_product_id: u.product.id, target_product_id: t.id },
      "Linked. These are now one product; the cheaper eligible supplier is used."
    );
    setSelBySupplier((prev) => ({ ...prev, [u.product.provider]: null }));
    setDSel(null);
  }

  // Link ALL currently selected supplier products → DigiTrust at once
  async function linkAll(items, t) {
    await act(
      {
        action: "link",
        stub_product_id: items.map((x) => x.product.id),
        target_product_id: t.id,
      },
      `Linked ${items.length} suppliers → DigiTrust. One product, best source used automatically.`
    );
    setSelBySupplier({});
    setDSel(null);
  }

  if (unlinked.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
        No unlinked supplier products. Run Sync (Products tab) to fetch products, then come back here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Auto-suggestions */}
      {suggestions.length > 0 && (
        <div className="rounded-xl border border-border bg-brand-soft p-3">
          <div className="mb-2 text-xs font-semibold text-ink">Likely matches</div>
          <div className="space-y-1.5">
            {suggestions.map(({ u, t, score }) => (
              <div key={u.product.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 text-ink">
                  <b>{lbl(u.product.provider)}:</b> {u.product.title}
                  <span className="mx-1 text-muted">↔</span>
                  <b>DigiTrust:</b> {t.title}{" "}
                  <span className="text-muted">({Math.round(score * 100)}% match)</span>
                </span>
                <LinkButton
                  onClick={() =>
                    window.confirm(`Link "${u.product.title}" with "${t.title}" as the same product?`) && link(u, t)
                  }
                >
                  Link
                </LinkButton>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global search — searches ALL columns at once */}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">🔍</span>
        <input
          type="search"
          value={globalQ}
          onChange={(e) => setGlobalQ(e.target.value)}
          placeholder="Search all suppliers at once…"
          className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-4 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        {globalQ && (
          <button
            onClick={() => setGlobalQ("")}
            className="absolute inset-y-0 right-3 flex items-center text-xs text-muted hover:text-ink"
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* One column per supplier + DigiTrust column on the right */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${supplierIds.length + 1}, minmax(0, 1fr))` }}
      >
        {supplierIds.map((supplierId) => (
          <SupplierColumn
            key={supplierId}
            supplierId={supplierId}
            unlinked={unlinked}
            dSel={dSel}
            targets={targets}
            selId={selBySupplier[supplierId] || null}
            onSelect={(id) => setSelBySupplier((prev) => ({ ...prev, [supplierId]: id }))}
            lbl={lbl}
            globalQ={globalQ}
          />
        ))}

        {/* DigiTrust column — always last */}
        <MatchColumn
          title={`DigiTrust (${dList.length})`}
          query={globalQ ? "" : dq}
          setQuery={globalQ ? () => {} : setDq}
          queryPlaceholder={globalQ ? "Filtered by global search…" : "Search in DigiTrust…"}
          queryDisabled={Boolean(globalQ)}
          empty="No DigiTrust products match."
        >
          {dList.map(({ t, score }) => {
            const blockedBy = anySupplierSel && !canLink(anySupplierSel, t) ? anySupplierSel : null;
            const dt = t.sources.find((s) => s.supplier === "digitrust");
            return (
              <MatchRow
                key={t.id}
                active={dSel === t.id}
                disabled={Boolean(blockedBy)}
                onClick={() => setDSel(dSel === t.id ? null : t.id)}
                title={t.title}
                meta={
                  blockedBy
                    ? t.requires_email
                      ? `Needs email — ${lbl(blockedBy.product.provider)} can't deliver`
                      : "Already linked to this supplier"
                    : `Cost ${dt ? money(dt.cost) : "—"} · price ${money(t.sell_price)} · stock ${t.available_stock}${
                        t.sources.length > 1 ? ` · ${t.sources.length} sources` : ""
                      }`
                }
                badge={anySupplierSel && score >= 0.3 ? `${Math.round(score * 100)}%` : null}
              />
            );
          })}
        </MatchColumn>
      </div>

      {/* Link panel — shown when any supplier product + DigiTrust product selected */}
      {selectedSupplierItems.length > 0 || dItem ? (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card space-y-3">
          {selectedSupplierItems.length > 0 && dItem ? (
            <>
              {/* Selected items preview */}
              <div className="grid gap-3 text-sm" style={{ gridTemplateColumns: `repeat(${selectedSupplierItems.length + 1}, minmax(0,1fr))` }}>
                {selectedSupplierItems.map((sItem) => (
                  <div key={sItem.product.id} className="rounded-lg border border-border bg-bg p-2">
                    <div className="text-xs font-medium text-brand">{lbl(sItem.product.provider)}</div>
                    <div className="text-ink truncate">{sItem.product.title}</div>
                    <div className="font-mono text-xs text-muted">cost {money(sItem.source?.cost ?? 0)}</div>
                  </div>
                ))}
                <div className="rounded-lg border border-border bg-bg p-2">
                  <div className="text-xs font-medium text-muted">DigiTrust (store product)</div>
                  <div className="text-ink truncate">{dItem.title}</div>
                  <div className="font-mono text-xs text-muted">
                    cost {dItem.sources.find((s) => s.supplier === "digitrust") ? money(dItem.sources.find((s) => s.supplier === "digitrust").cost) : "—"} · price {money(dItem.sell_price)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Link All button — shown when 2+ suppliers selected */}
                {selectedSupplierItems.length >= 2 && (
                  <SecondaryButton
                    onClick={() => {
                      const names = selectedSupplierItems.map((x) => lbl(x.product.provider)).join(" + ");
                      window.confirm(
                        `Merge ALL selected:\n${selectedSupplierItems.map((x) => `• ${lbl(x.product.provider)}: ${x.product.title}`).join("\n")}\n\n→ DigiTrust: ${dItem.title}\n\nAll 3 sources will be linked to one product.`
                      ) && linkAll(selectedSupplierItems, dItem);
                    }}
                    className="border-brand text-brand font-semibold"
                  >
                    🔗 Link All ({selectedSupplierItems.length} suppliers) ↔ DigiTrust
                  </SecondaryButton>
                )}

                {/* Individual link buttons */}
                {selectedSupplierItems.map((sItem) => (
                  <SecondaryButton
                    key={sItem.product.id}
                    onClick={() =>
                      window.confirm(`Link "${sItem.product.title}" (${lbl(sItem.product.provider)}) with "${dItem.title}"?`) &&
                      link(sItem, dItem)
                    }
                  >
                    Link {lbl(sItem.product.provider)} ↔ DigiTrust
                  </SecondaryButton>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">
              {selectedSupplierItems.length > 0
                ? "Now select the matching DigiTrust product on the right."
                : "Now select the supplier product on the left."}
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-4 text-center text-sm text-muted">
          Select a product from any supplier column, then select its match in DigiTrust to link them.
        </p>
      )}
    </div>
  );
}

function MatchColumn({ title, query, setQuery, queryPlaceholder, queryDisabled, empty, children }) {
  const rows = Array.isArray(children) ? children : [children];
  return (
    <div className="rounded-xl border border-border bg-surface shadow-card">
      <div className="space-y-2 border-b border-border p-3">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={queryDisabled}
          placeholder={queryPlaceholder || "Search…"}
          className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 ${
            queryDisabled
              ? "border-brand/30 bg-brand-soft text-brand placeholder-brand/60 cursor-not-allowed"
              : "border-border focus:border-brand"
          }`}
        />
      </div>
      <div className="max-h-80 overflow-y-auto p-2">
        {rows.length === 0 ? <p className="px-2 py-6 text-center text-sm text-muted">{empty}</p> : <div className="space-y-1">{rows}</div>}
      </div>
    </div>
  );
}

function MatchRow({ active, disabled, onClick, title, meta, badge }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`block w-full rounded-lg border px-3 py-2 text-left transition-colors ${
        active ? "border-brand bg-brand-soft" : "border-transparent hover:bg-bg"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-ink">{title}</span>
        {badge && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">{badge}</span>}
      </div>
      <div className="text-xs text-muted">{meta}</div>
    </button>
  );
}
