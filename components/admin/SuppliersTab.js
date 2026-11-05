import { useEffect, useMemo, useState } from "react";
import { SecondaryButton, PrimaryButton, LinkButton } from "../ui/Button";
import { ErrorState, LoadingState } from "../ui/States";

// ── label helpers ────────────────────────────────────────────────
const BUILTIN = { digitrust: "DigiTrust", xpro: "XPro" };
const buildLabelMap = (configured = []) => {
  const map = { ...BUILTIN };
  for (const s of configured) if (s.id && s.label) map[s.id] = s.label;
  return map;
};
// c_shotix1shop → "Shotix1shop" fallback when not in labelMap
const autoLabel = (id) => {
  if (!id) return "";
  if (BUILTIN[id]) return BUILTIN[id];
  if (id.startsWith("c_")) return id.slice(2).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return id;
};
const money = (n) => `$${Number(n).toFixed(2)}`;

// Supplier icon initials
const SupplierIcon = ({ id, lbl, size = "md" }) => {
  const colors = {
    digitrust: "bg-blue-100 text-blue-700",
    xpro: "bg-purple-100 text-purple-700",
  };
  const cls = colors[id] || "bg-orange-100 text-orange-700";
  const letter = (lbl || autoLabel(id) || "?")[0].toUpperCase();
  const sz = size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm";
  return (
    <span className={`inline-flex items-center justify-center rounded-lg font-bold ${cls} ${sz} shrink-0`}>
      {letter}
    </span>
  );
};

// ── main component ───────────────────────────────────────────────
export default function SuppliersTab({ onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkData, setCheckData] = useState(null);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("ok"); // "ok" | "err"

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

  useEffect(() => { load(); }, []);

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
      setMsgType("err");
      return;
    }
    setMsg(okMsg);
    setMsgType("ok");
    await load();
    onChanged?.();
  }

  async function runCheck() {
    setChecking(true);
    const res = await fetch("/api/admin/suppliers?check=1");
    const json = await res.json();
    setCheckData(json.suppliers || []);
    setChecking(false);
  }

  if (loading && !data) return <LoadingState label="Loading suppliers…" />;
  if (error && !data) return <ErrorState title="Couldn't load suppliers" message={error} onRetry={load} />;
  if (!data) return null;

  const labelMap = buildLabelMap(data.configured || []);
  const lbl = (id) => labelMap[id] || autoLabel(id);

  // Stats
  const totalSupplierProducts = (data.unlinked?.length || 0) +
    (data.multi?.reduce((s, m) => s + m.sources.length, 0) || 0);
  const linkedCount = data.multi?.length || 0;
  const unlinkedCount = data.unlinked?.length || 0;
  const outOfStockCount = data.multi?.filter((m) => m.product.supplier_status === "out_of_stock").length || 0;

  // Suggestions (score ≥ 0.5)
  const canLink = (u, t) =>
    !t.sources.some((s) => s.supplier === u.product.provider) &&
    !(t.requires_email && u.product.provider !== "digitrust");

  const suggestions = useMemo(() => {
    if (!data) return [];
    const out = [];
    for (const u of data.unlinked || []) {
      let best = null;
      for (const t of data.linkTargets || []) {
        if (!canLink(u, t)) continue;
        const score = similarity(u.product.title, t.title);
        if (!best || score > best.score) best = { u, t, score };
      }
      if (best && best.score >= 0.5) out.push(best);
    }
    return out.sort((a, b) => b.score - a.score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const highSuggestions = suggestions.filter((s) => s.score >= 0.9);
  const midSuggestions = suggestions.filter((s) => s.score >= 0.7 && s.score < 0.9);
  const lowSuggestions = suggestions.filter((s) => s.score < 0.7);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Suppliers</h1>
          <p className="text-sm text-muted">Manage supplier products, match items and choose the best source</p>
        </div>
        <div className="flex gap-2">
          <SecondaryButton onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "↻ Refresh All"}
          </SecondaryButton>
          <SecondaryButton onClick={runCheck} disabled={checking}>
            {checking ? "Checking…" : "⚙ Settings"}
          </SecondaryButton>
          <span className="flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-xs font-medium text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Online
          </span>
        </div>
      </div>

      {msg && (
        <p className={`rounded-lg px-3 py-2 text-sm ${msgType === "err" ? "bg-danger-soft text-danger" : "bg-brand-soft text-ink"}`}>
          {msg}
        </p>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon="📦" label="Total Supplier Products" value={totalSupplierProducts}
          sub={`Across ${(data.configured || []).length} Suppliers`} color="blue" />
        <StatCard icon="✅" label="Linked Products" value={linkedCount}
          sub="Successfully Matched" color="green" />
        <StatCard icon="🕐" label="Unlinked Products" value={unlinkedCount}
          sub="Need Matching" color="amber" />
        <StatCard icon="⚠️" label="Out-of-Stock Products" value={outOfStockCount}
          sub="Across Linked Sources" color="red" />
      </div>

      {/* Connection check panel */}
      {checkData && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Connection test results</h3>
            <button onClick={() => setCheckData(null)} className="text-xs text-muted hover:text-ink">✕ Close</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {checkData.map((s) => (
              <div key={s.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                <SupplierIcon id={s.id} lbl={s.label} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{s.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      !s.configured ? "bg-border text-muted" : s.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                    }`}>
                      {!s.configured ? "Not configured" : s.ok ? "Connected" : "Failed"}
                    </span>
                  </div>
                  {s.balance !== undefined && s.balance !== null && (
                    <p className="mt-0.5 text-xs text-muted">Balance: <span className="font-mono text-ink">{money(s.balance)}</span></p>
                  )}
                  {s.catalog?.total != null && (
                    <p className="text-xs text-muted">{s.catalog.total} products in catalog</p>
                  )}
                  {s.error && <p className="mt-0.5 break-all text-xs text-danger">{s.error}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two-column layout: left = Matching + Explorer, right = Status + Compare */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">

          {/* Matching Suggestions */}
          <MatchingSuggestionsPanel
            suggestions={suggestions}
            highSuggestions={highSuggestions}
            midSuggestions={midSuggestions}
            lowSuggestions={lowSuggestions}
            act={act}
            lbl={lbl}
          />

          {/* Supplier Products Explorer */}
          <ExplorerPanel
            unlinked={data.unlinked || []}
            targets={data.linkTargets || []}
            configured={data.configured || []}
            act={act}
            lbl={lbl}
            canLink={canLink}
          />

          {/* Linked Products */}
          <LinkedProductsPanel
            multi={data.multi || []}
            needsPrice={data.needsPrice || []}
            act={act}
            lbl={lbl}
          />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <SupplierStatusPanel configured={data.configured || []} checkData={checkData} lbl={lbl} />
        </div>
      </div>
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color }) {
  const colors = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/30",
    green: "bg-green-50 text-green-600 dark:bg-green-950/30",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/30",
    red: "bg-red-50 text-red-600 dark:bg-red-950/30",
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-card">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${colors[color]}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted truncate">{label}</p>
        <p className="text-2xl font-bold text-ink leading-tight">{value}</p>
        <p className="text-xs text-muted truncate">{sub}</p>
      </div>
    </div>
  );
}

// ── Matching Suggestions ─────────────────────────────────────────
function MatchingSuggestionsPanel({ suggestions, highSuggestions, midSuggestions, lowSuggestions, act, lbl }) {
  const [filter, setFilter] = useState("all"); // "all" | "high" | "mid" | "low"
  const [linking, setLinking] = useState(null);

  async function link(u, t) {
    if (!window.confirm(`Link "${u.product.title}" with "${t.title}"?`)) return;
    setLinking(u.product.id);
    await act(
      { action: "link", stub_product_id: u.product.id, target_product_id: t.id },
      "Linked. These are now one product."
    );
    setLinking(null);
  }

  const shown = filter === "high" ? highSuggestions : filter === "mid" ? midSuggestions : filter === "low" ? lowSuggestions : suggestions;

  if (suggestions.length === 0) return null;

  const pct = (s) => Math.round(s * 100);
  const matchColor = (s) =>
    s >= 0.9 ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
    : s >= 0.7 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
    : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  const matchLabel = (s) => s >= 0.9 ? "Full warranty • Same product" : s >= 0.7 ? "Check warranty & duration" : "Possible mismatch";
  const btnLabel = (s) => s >= 0.9 ? "Link Products" : s >= 0.7 ? "Review" : "Compare";

  return (
    <div className="rounded-xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-ink">✦ Matching Suggestions</span>
          <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-white">{suggestions.length} suggestions</span>
        </div>
        {suggestions.length > 0 && (
          <button
            onClick={() => {
              if (!window.confirm(`Auto-link all ${highSuggestions.length} high-confidence (90–100%) matches?`)) return;
              highSuggestions.forEach(({ u, t }) =>
                act({ action: "link", stub_product_id: u.product.id, target_product_id: t.id }, "")
              );
            }}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
          >
            ✓ Bulk Approve
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-border px-5 py-2">
        {[
          { id: "all", label: `All (${suggestions.length})` },
          { id: "high", label: "90–100%" },
          { id: "mid", label: "70–89%" },
          { id: "low", label: "Below 70%" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.id ? "bg-brand text-white" : "text-muted hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="divide-y divide-border">
        {shown.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted">No suggestions in this range.</p>
        ) : (
          shown.slice(0, 10).map(({ u, t, score }) => (
            <div key={u.product.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              {/* Left: supplier product */}
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <SupplierIcon id={u.product.provider} lbl={lbl(u.product.provider)} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{u.product.title}</p>
                  <p className="text-xs text-muted">{matchLabel(score)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${matchColor(score)}`}>
                  {pct(score)}% match
                </span>
              </div>

              {/* Arrow */}
              <span className="text-muted">⇄</span>

              {/* Right: DigiTrust product */}
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <SupplierIcon id="digitrust" lbl="DigiTrust" size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{t.title}</p>
                  <p className="text-xs text-muted">DigiTrust</p>
                </div>
              </div>

              <button
                disabled={linking === u.product.id}
                onClick={() => link(u, t)}
                className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  score >= 0.9
                    ? "border-brand bg-brand text-white hover:bg-brand-dark"
                    : "border-border text-ink hover:bg-bg"
                }`}
              >
                {linking === u.product.id ? "Linking…" : btnLabel(score)}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Supplier Products Explorer ───────────────────────────────────
function ExplorerPanel({ unlinked, targets, configured, act, lbl, canLink }) {
  const supplierIds = useMemo(() => {
    // configured suppliers + DigiTrust
    const ids = configured.map((s) => s.id);
    if (!ids.includes("digitrust")) ids.push("digitrust");
    return ids;
  }, [configured]);

  // Per-supplier search query
  const [queries, setQueries] = useState({});
  // Selected items: { supplierId: productId } — only one per supplier
  const [selBySupplier, setSelBySupplier] = useState({});
  // Compare panel: two items selected
  const [comparing, setComparing] = useState(null); // { u, t }
  const [linking, setLinking] = useState(false);

  const setQ = (id, v) => setQueries((p) => ({ ...p, [id]: v }));
  const setSel = (supplierId, productId) =>
    setSelBySupplier((p) => ({ ...p, [supplierId]: p[supplierId] === productId ? null : productId }));

  // When a non-DT item is selected, show compare panel with best DT match
  useEffect(() => {
    const nonDT = supplierIds.filter((id) => id !== "digitrust");
    const selectedUnlinked = nonDT
      .filter((id) => selBySupplier[id])
      .map((id) => unlinked.find((u) => u.product.id === selBySupplier[id]))
      .filter(Boolean)[0];

    const dtSel = selBySupplier["digitrust"];
    const dtItem = targets.find((t) => t.id === dtSel) || null;

    if (selectedUnlinked && dtItem) {
      setComparing({ u: selectedUnlinked, t: dtItem });
    } else if (selectedUnlinked) {
      // Auto-pick best DT match
      let best = null;
      for (const t of targets) {
        if (!canLink(selectedUnlinked, t)) continue;
        const s = similarity(selectedUnlinked.product.title, t.title);
        if (!best || s > best.score) best = { t, score: s };
      }
      setComparing(best ? { u: selectedUnlinked, t: best.t, autoScore: best.score } : null);
    } else {
      setComparing(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selBySupplier]);

  async function linkCompared() {
    if (!comparing) return;
    if (!window.confirm(`Link "${comparing.u.product.title}" ↔ "${comparing.t.title}"?`)) return;
    setLinking(true);
    await act(
      { action: "link", stub_product_id: comparing.u.product.id, target_product_id: comparing.t.id },
      "Linked successfully."
    );
    setSelBySupplier({});
    setComparing(null);
    setLinking(false);
  }

  // Products per supplier column
  const colItems = (id) => {
    if (id === "digitrust") {
      return targets
        .filter((t) => includesText(queries[id] || "", t.title))
        .map((t) => ({
          id: t.id,
          title: t.title,
          cost: t.sources.find((s) => s.supplier === "digitrust")?.cost,
          stock: t.available_stock,
          isDT: true,
          obj: t,
        }));
    }
    return unlinked
      .filter((u) => u.product.provider === id && includesText(queries[id] || "", u.product.title))
      .map((u) => ({
        id: u.product.id,
        title: u.product.title,
        cost: u.source?.cost,
        stock: u.source?.stock ?? 0,
        isDT: false,
        obj: u,
      }));
  };

  const matchScore = (item) => {
    if (!comparing?.u || item.isDT) return null;
    return similarity(item.title, comparing?.u?.product?.title ?? "");
  };

  return (
    <div className="rounded-xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-ink">📦 Supplier Products Explorer</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-0 divide-x divide-border" style={{ minWidth: `${supplierIds.length * 220}px` }}>
          {supplierIds.map((id) => {
            const items = colItems(id);
            const countRow = configured.find((s) => s.id === id);
            const count = id === "digitrust"
              ? targets.length
              : unlinked.filter((u) => u.product.provider === id).length;
            const statusObj = configured.find((c) => c.id === id);

            return (
              <div key={id} className="flex min-w-0 flex-1 flex-col">
                {/* Column header */}
                <div className="border-b border-border px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{lbl(id)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      id === "digitrust" ? "bg-amber-100 text-amber-700" : "bg-success-soft text-success"
                    }`}>
                      {id === "digitrust" ? "DigiTrust" : "● Connected"}
                    </span>
                  </div>
                  <p className="text-xs text-muted">{count} products</p>
                </div>

                {/* Search */}
                <div className="border-b border-border px-3 py-2">
                  <input
                    type="search"
                    value={queries[id] || ""}
                    onChange={(e) => setQ(id, e.target.value)}
                    placeholder={`Search in ${lbl(id)}…`}
                    className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs focus:border-brand focus:outline-none"
                  />
                </div>

                {/* Product list */}
                <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                  {items.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs text-muted">No products</p>
                  ) : (
                    items.slice(0, 30).map((item) => {
                      const sel = selBySupplier[id] === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSel(id, item.id)}
                          className={`block w-full rounded-lg px-3 py-2 text-left transition-colors ${
                            sel ? "border border-brand bg-brand-soft" : "border border-transparent hover:bg-bg"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-xs font-medium text-ink leading-snug line-clamp-2">{item.title}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted">
                            {item.cost !== undefined ? money(item.cost) : "—"} · Stock: {item.stock ?? 0}
                          </p>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Compare panel */}
      {comparing && (
        <ComparePanel
          u={comparing.u}
          t={comparing.t}
          autoScore={comparing.autoScore}
          lbl={lbl}
          linking={linking}
          onLink={linkCompared}
          onDismiss={() => { setComparing(null); setSelBySupplier({}); }}
          canLink={canLink}
        />
      )}
    </div>
  );
}

// ── Compare Panel ────────────────────────────────────────────────
function ComparePanel({ u, t, autoScore, lbl, linking, onLink, onDismiss, canLink }) {
  const supplierCost = u.source?.cost;
  const dtCost = t.sources?.find((s) => s.supplier === "digitrust")?.cost;
  const score = autoScore ?? similarity(u.product.title, t.title);
  const pct = Math.round(score * 100);
  const matchLabel = score >= 0.9 ? "Same Product" : score >= 0.7 ? "Likely Match" : "Possible Mismatch";
  const matchColor = score >= 0.9 ? "text-success" : score >= 0.7 ? "text-amber-600" : "text-danger";
  const blocked = !canLink(u, t);

  return (
    <div className="border-t border-border p-5">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-ink">⚖️ Compare Selected Products</h4>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${score >= 0.7 ? "bg-success-soft text-success" : "bg-amber-100 text-amber-700"}`}>
            ✓ {matchLabel}
          </span>
          <button onClick={onDismiss} className="text-xs text-muted hover:text-ink">✕</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Supplier side */}
        <div className="rounded-lg border border-border bg-bg p-3">
          <p className="text-xs text-muted mb-1">{lbl(u.product.provider)}</p>
          <p className="font-semibold text-ink">{u.product.title}</p>
          <p className="mt-2 text-2xl font-bold text-brand">
            {supplierCost !== undefined ? money(supplierCost) : "—"}
            <span className="text-xs text-muted font-normal"> / 1 Month</span>
          </p>
          <dl className="mt-2 space-y-1 text-xs text-muted">
            <div className="flex justify-between"><dt>Stock</dt><dd className="text-ink">{u.source?.stock ?? "—"}</dd></div>
          </dl>
        </div>

        {/* DigiTrust side */}
        <div className="rounded-lg border border-border bg-bg p-3">
          <p className="text-xs text-muted mb-1">DigiTrust</p>
          <p className="font-semibold text-ink">{t.title}</p>
          <p className="mt-2 text-2xl font-bold text-brand">
            {dtCost !== undefined ? money(dtCost) : "—"}
            <span className="text-xs text-muted font-normal"> / 1 Month</span>
          </p>
          <dl className="mt-2 space-y-1 text-xs text-muted">
            <div className="flex justify-between"><dt>Your Price</dt><dd className="text-ink">{money(t.sell_price)}</dd></div>
            <div className="flex justify-between"><dt>Stock</dt><dd className="text-ink">{t.available_stock ?? "—"}</dd></div>
            <div className="flex justify-between"><dt>Match</dt>
              <dd className={`font-semibold ${matchColor}`}>● {matchLabel} ({pct}%)</dd>
            </div>
          </dl>
        </div>
      </div>

      {blocked ? (
        <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
          Cannot link: product requires email delivery and {lbl(u.product.provider)} doesn't support it.
        </p>
      ) : (
        <button
          onClick={onLink}
          disabled={linking}
          className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          🔗 {linking ? "Linking…" : "Link These Products"}
        </button>
      )}
    </div>
  );
}

// ── Supplier Status (right sidebar) ─────────────────────────────
function SupplierStatusPanel({ configured, checkData, lbl }) {
  const checkMap = Object.fromEntries((checkData || []).map((s) => [s.id, s]));

  return (
    <div className="rounded-xl border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <span className="text-sm font-semibold text-ink">📶 Supplier Status</span>
        <a href="#" className="text-xs text-brand hover:underline">View All →</a>
      </div>
      <div className="divide-y divide-border">
        {configured.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted">No suppliers configured.</p>
        ) : (
          configured.map((s) => {
            const check = checkMap[s.id];
            const count = s.productCount ?? "—";
            return (
              <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                <SupplierIcon id={s.id} lbl={s.label} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{lbl(s.id)}</p>
                  <p className="text-xs text-muted">{count} products</p>
                </div>
                <div className="text-right">
                  <span className={`block rounded-full px-2 py-0.5 text-xs font-medium ${
                    check ? (check.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")
                    : "bg-amber-100 text-amber-700"
                  }`}>
                    {check ? (check.ok ? "● Connected" : "● Failed") : "● Sync Delayed"}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">Sync: —</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Linked Products ──────────────────────────────────────────────
function LinkedProductsPanel({ multi, needsPrice, act, lbl }) {
  const [search, setSearch] = useState("");
  const [selIds, setSelIds] = useState(new Set());
  const all = [...multi, ...needsPrice];
  const filtered = all.filter((m) => includesText(search, m.product.title));

  const toggle = (id) =>
    setSelIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleAll = () =>
    setSelIds(selIds.size === filtered.length ? new Set() : new Set(filtered.map((m) => m.product.id)));

  const STATUS_CLS = {
    ok: "bg-success-soft text-success",
    out_of_stock: "bg-amber-100 text-amber-700",
    price_too_high: "bg-danger-soft text-danger",
  };
  const STATUS_LABEL = { ok: "Active", out_of_stock: "Out of Stock", price_too_high: "Price Too High" };

  return (
    <div className="rounded-xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-ink">✅ Linked Products</span>
          <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success">{multi.length} linked</span>
        </div>
        <div className="flex gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search linked products…"
            className="rounded-lg border border-border px-3 py-1.5 text-xs focus:border-brand focus:outline-none w-48"
          />
          {selIds.size > 0 && (
            <div className="relative">
              <button className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-bg">
                Bulk Actions ▾
              </button>
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">
          {all.length === 0 ? "No linked products yet. Match products above to link them." : "No products match your search."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={selIds.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll} className="rounded" />
                </th>
                <th className="px-4 py-3">Product Name</th>
                <th className="px-4 py-3">Your Price</th>
                <th className="px-4 py-3">Cheapest Supplier</th>
                <th className="px-4 py-3">Supplier Cost</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Profit</th>
                <th className="px-4 py-3">Active Supplier</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((m) => {
                const p = m.product;
                const sources = m.sources || [];
                const activeSrc = sources.find((s) => s.supplier === p.active_supplier) || sources[0];
                const cheapest = [...sources].sort((a, b) => Number(a.cost) - Number(b.cost))[0];
                const profit = cheapest ? Number(p.sell_price) - Number(cheapest.cost) : null;
                const st = p.supplier_status || "ok";

                return (
                  <tr key={p.id} className="hover:bg-bg/50">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selIds.has(p.id)} onChange={() => toggle(p.id)} className="rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <SupplierIcon id={p.active_supplier || p.provider} lbl={lbl(p.active_supplier || p.provider)} size="sm" />
                        <span className="font-medium text-ink">{p.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-ink">{money(p.sell_price)}</td>
                    <td className="px-4 py-3">
                      {cheapest && (
                        <span className="flex items-center gap-1 text-xs">
                          <SupplierIcon id={cheapest.supplier} lbl={lbl(cheapest.supplier)} size="sm" />
                          {lbl(cheapest.supplier)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-muted">{activeSrc ? money(activeSrc.cost) : "—"}</td>
                    <td className="px-4 py-3 font-mono text-muted">{p.available_stock ?? "—"}</td>
                    <td className={`px-4 py-3 font-mono font-semibold ${profit !== null && profit >= 0 ? "text-success" : "text-danger"}`}>
                      {profit !== null ? (profit >= 0 ? "+" : "") + money(profit) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {p.active_supplier && (
                        <span className="flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">
                          <SupplierIcon id={p.active_supplier} lbl={lbl(p.active_supplier)} size="sm" />
                          {lbl(p.active_supplier)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLS[st] || STATUS_CLS.ok}`}>
                        ● {STATUS_LABEL[st] || "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <LinkedProductActions product={p} sources={sources} act={act} lbl={lbl} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LinkedProductActions({ product: p, sources, act, lbl }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-ink hover:bg-bg"
      >
        Manage ▾
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-44 rounded-xl border border-border bg-surface shadow-lg">
          <div className="p-1">
            {sources.filter((s) => s.supplier !== "digitrust").map((s) => (
              <button
                key={s.id}
                onClick={() => { setOpen(false); window.confirm("Unlink this source?") && act({ action: "unlink", source_id: s.id }, "Unlinked."); }}
                className="block w-full rounded-lg px-3 py-2 text-left text-xs text-muted hover:bg-bg hover:text-ink"
              >
                Unlink {lbl(s.supplier)}
              </button>
            ))}
            {sources.filter((s) => Number(p.sell_price) - Number(s.cost) < 0).map((s) => (
              <button
                key={`app-${s.id}`}
                onClick={() => { setOpen(false); act({ action: "approve", source_id: s.id, approved: !s.approved }, s.approved ? "Approval removed." : "Approved."); }}
                className="block w-full rounded-lg px-3 py-2 text-left text-xs text-muted hover:bg-bg hover:text-ink"
              >
                {s.approved ? "Remove approval" : "Approve"} {lbl(s.supplier)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── utilities ────────────────────────────────────────────────────
const tokenSet = (t) =>
  new Set(String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 1));

function similarity(a, b) {
  const A = tokenSet(a), B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / (A.size + B.size - hit);
}

const includesText = (q, text) => !q.trim() || String(text).toLowerCase().includes(q.trim().toLowerCase());

function MatchColumn({ title, query, setQuery, empty, children }) {
  const rows = Array.isArray(children) ? children : [children];
  return (
    <div className="rounded-xl border border-border bg-surface shadow-card">
      <div className="space-y-2 border-b border-border p-3">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…"
          className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30" />
      </div>
      <div className="max-h-80 overflow-y-auto p-2">
        {rows.length === 0 ? <p className="px-2 py-6 text-center text-sm text-muted">{empty}</p> : <div className="space-y-1">{rows}</div>}
      </div>
    </div>
  );
}

function MatchRow({ active, disabled, onClick, title, meta, badge }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={`block w-full rounded-lg border px-3 py-2 text-left transition-colors ${active ? "border-brand bg-brand-soft" : "border-transparent hover:bg-bg"} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-ink">{title}</span>
        {badge && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">{badge}</span>}
      </div>
      <div className="text-xs text-muted">{meta}</div>
    </button>
  );
}
