import { useEffect, useMemo, useState } from "react";
import SectionHeading from "../ui/SectionHeading";
import { SecondaryButton, LinkButton } from "../ui/Button";
import { ErrorState, LoadingState } from "../ui/States";

const LABEL = { digitrust: "DigiTrust", xpro: "XPro", emstore: "EM Store", shotix: "Shotix" };
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

  if (loading && !data) return <LoadingState label="Loading suppliers…" />;
  if (error && !data) return <ErrorState title="Couldn't load suppliers" message={error} onRetry={load} />;
  if (!data) return null;

  // Merge custom supplier labels so the matcher shows "Shotix" not "c_shotix1shop"
  const labelMap = buildLabelMap(data.configured || []);

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
              <ProductSources key={m.product.id} entry={m} act={act} labelMap={labelMap} />
            ))}
          </div>
        )}
      </section>

      {/* Match products across suppliers */}
      <section>
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
        <h3 className="mb-2 text-sm font-semibold text-ink">Products with several sources</h3>
        {data.multi.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            None linked yet.
          </p>
        ) : (
          <div className="space-y-3">
            {data.multi.map((m) => (
              <ProductSources key={m.product.id} entry={m} act={act} labelMap={labelMap} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProductSources({ entry, act, labelMap = LABEL }) {
  const lbl = (id) => labelMap[id] || LABEL[id] || id;
  const { product, sources } = entry;
  const st = STATUS[product.supplier_status] || STATUS.ok;
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium text-ink">{product.title}</div>
          <div className="text-xs text-muted">
            Your price <span className="font-mono text-ink">{money(product.sell_price)}</span>
            {!product.selected && " · hidden by you"}
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.text}</span>
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
              return (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-2 pr-3 text-ink">
                    {lbl(s.supplier)}
                    {active && product.supplier_status === "ok" && (
                      <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">in use</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono text-muted">{money(s.cost)}</td>
                  <td className="py-2 pr-3 font-mono text-muted">
                    {s.available_stock}
                    <span className="text-xs"> / {s.stock}</span>
                  </td>
                  <td className={`py-2 pr-3 font-mono ${margin < 0 ? "text-danger" : "text-success"}`}>
                    {margin >= 0 ? "+" : "−"}
                    {money(Math.abs(margin))}
                  </td>
                  <td className="space-x-3 whitespace-nowrap py-2">
                    {margin < 0 && (
                      <LinkButton
                        onClick={() =>
                          act(
                            { action: "approve", source_id: s.id, approved: !s.approved },
                            s.approved ? "Approval removed." : "Approved — this source can now be shown even though it costs more than your price."
                          )
                        }
                        className={s.approved ? "text-danger" : ""}
                      >
                        {s.approved ? "Remove approval" : "Approve anyway"}
                      </LinkButton>
                    )}
                    {s.supplier !== "digitrust" && sources.length > 1 && (
                      <LinkButton
                        onClick={() =>
                          window.confirm("Unlink this source? It will come back as a separate product on the next sync.") &&
                          act({ action: "unlink", source_id: s.id }, "Unlinked.")
                        }
                        className="text-muted"
                      >
                        Unlink
                      </LinkButton>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
