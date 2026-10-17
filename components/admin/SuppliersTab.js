import { useEffect, useMemo, useState } from "react";
import SectionHeading from "../ui/SectionHeading";
import { SecondaryButton, LinkButton } from "../ui/Button";
import { ErrorState, LoadingState } from "../ui/States";

const LABEL = { digitrust: "DigiTrust", xpro: "XPro" };
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
              <ProductSources key={m.product.id} entry={m} act={act} />
            ))}
          </div>
        )}
      </section>

      {/* Match products across suppliers */}
      <section>
        <h3 className="mb-1 text-sm font-semibold text-ink">Match products (same product at two suppliers)</h3>
        <p className="mb-3 text-xs text-muted">
          Pick one DigiTrust product and one XPro product, then link them. They become ONE product on your store; customers
          always pay your price, and the cheaper supplier is used automatically. Check the match carefully — customers get
          whatever the supplier delivers.
        </p>
        <ProductMatcher unlinked={data.unlinked} targets={data.linkTargets} act={act} />
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
              <ProductSources key={m.product.id} entry={m} act={act} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProductSources({ entry, act }) {
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
                    {LABEL[s.supplier] || s.supplier}
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

function ProductMatcher({ unlinked, targets, act }) {
  const [xSel, setXSel] = useState(null); // XPro (supplier-only) product id
  const [dSel, setDSel] = useState(null); // DigiTrust product id
  const [xq, setXq] = useState("");
  const [dq, setDq] = useState("");

  const xItem = unlinked.find((u) => u.product.id === xSel) || null;
  const dItem = targets.find((t) => t.id === dSel) || null;

  const canLink = (u, t) =>
    !t.sources.some((s) => s.supplier === u.product.provider) &&
    !(t.requires_email && u.product.provider === "xpro");

  // Best guesses, shown as one-click suggestions.
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

  const xList = unlinked.filter((u) => includesText(xq, u.product.title));
  const dList = targets
    .filter((t) => includesText(dq, t.title))
    .map((t) => ({ t, score: xItem ? similarity(xItem.product.title, t.title) : 0 }))
    .sort((a, b) => b.score - a.score || a.t.title.localeCompare(b.t.title));

  async function link(u, t) {
    await act(
      { action: "link", stub_product_id: u.product.id, target_product_id: t.id },
      "Linked. These are now one product; the cheaper eligible supplier is used."
    );
    setXSel(null);
    setDSel(null);
  }

  if (unlinked.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
        No unlinked XPro products. Run Sync (Products tab) to fetch XPro products, then come back here.
      </p>
    );
  }

  const dtCost = dItem?.sources.find((s) => s.supplier === "digitrust")?.cost;
  const xCost = xItem?.source?.cost;
  const cheaper = dtCost !== undefined && xCost !== undefined ? (Number(xCost) < Number(dtCost) ? "XPro" : Number(xCost) > Number(dtCost) ? "DigiTrust" : "Same") : null;

  return (
    <div className="space-y-4">
      {suggestions.length > 0 && (
        <div className="rounded-xl border border-border bg-brand-soft p-3">
          <div className="mb-2 text-xs font-semibold text-ink">Likely matches</div>
          <div className="space-y-1.5">
            {suggestions.map(({ u, t, score }) => (
              <div key={u.product.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 text-ink">
                  <b>{LABEL[u.product.provider] || u.product.provider}:</b> {u.product.title}
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

      <div className="grid gap-4 md:grid-cols-2">
        <MatchColumn
          title={`XPro products (${xList.length})`}
          query={xq}
          setQuery={setXq}
          empty="No XPro products match."
        >
          {xList.map((u) => (
            <MatchRow
              key={u.product.id}
              active={xSel === u.product.id}
              onClick={() => setXSel(xSel === u.product.id ? null : u.product.id)}
              title={u.product.title}
              meta={`Cost ${u.source ? money(u.source.cost) : "—"} · stock ${u.source ? u.source.stock : "—"}`}
            />
          ))}
        </MatchColumn>

        <MatchColumn
          title={`DigiTrust products (${dList.length})`}
          query={dq}
          setQuery={setDq}
          empty="No DigiTrust products match."
        >
          {dList.map(({ t, score }) => {
            const blocked = xItem && !canLink(xItem, t);
            const dt = t.sources.find((s) => s.supplier === "digitrust");
            return (
              <MatchRow
                key={t.id}
                active={dSel === t.id}
                disabled={Boolean(blocked)}
                onClick={() => setDSel(dSel === t.id ? null : t.id)}
                title={t.title}
                meta={
                  blocked
                    ? t.requires_email
                      ? "Needs customer email — XPro can't deliver this"
                      : "Already linked to this supplier"
                    : `Cost ${dt ? money(dt.cost) : "—"} · your price ${money(t.sell_price)} · stock ${t.available_stock}${
                        t.sources.length > 1 ? " · has 2 sources" : ""
                      }`
                }
                badge={xItem && score >= 0.3 ? `${Math.round(score * 100)}%` : null}
              />
            );
          })}
        </MatchColumn>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        {xItem && dItem ? (
          <div className="space-y-3">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className="text-xs text-muted">XPro</div>
                <div className="text-ink">{xItem.product.title}</div>
                <div className="font-mono text-xs text-muted">cost {money(xCost ?? 0)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">DigiTrust (kept as the store product)</div>
                <div className="text-ink">{dItem.title}</div>
                <div className="font-mono text-xs text-muted">
                  cost {dtCost !== undefined ? money(dtCost) : "—"} · your price {money(dItem.sell_price)}
                </div>
              </div>
            </div>
            {cheaper && (
              <p className="text-xs text-muted">
                Cheaper right now: <b className="text-ink">{cheaper}</b>. Customers pay{" "}
                <b className="text-ink">{money(dItem.sell_price)}</b> either way.
                {Number(xCost) > Number(dItem.sell_price) &&
                  " XPro costs more than your price, so it stays hidden unless you approve it."}
              </p>
            )}
            <SecondaryButton
              onClick={() =>
                window.confirm(`Link "${xItem.product.title}" with "${dItem.title}" as the same product?`) && link(xItem, dItem)
              }
            >
              Link as the same product
            </SecondaryButton>
          </div>
        ) : (
          <p className="text-sm text-muted">
            {!xItem && !dItem
              ? "Step 1: pick an XPro product on the left. Step 2: pick the same product on the right."
              : !xItem
              ? "Now pick the XPro product on the left."
              : "Now pick the matching DigiTrust product on the right (best matches are listed first)."}
          </p>
        )}
      </div>
    </div>
  );
}

function MatchColumn({ title, query, setQuery, empty, children }) {
  const rows = Array.isArray(children) ? children : [children];
  return (
    <div className="rounded-xl border border-border bg-surface shadow-card">
      <div className="space-y-2 border-b border-border p-3">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
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
