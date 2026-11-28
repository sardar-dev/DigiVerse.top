import { useEffect, useMemo, useRef, useState } from "react";
import SectionHeading from "../ui/SectionHeading";
import { PrimaryButton, SecondaryButton } from "../ui/Button";
import { FormInput } from "../ui/FormInput";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/States";
import { AI_ERROR_MESSAGES, formatAiError, requestAiDraft } from "../../lib/aiRewriteClient";

const BATCH_LIMIT = 5;
const PAGE_SIZE = 30;

// Review flow: Generate a draft -> read/edit it -> Save. Nothing goes live
// until you press Save; "Use original" restores the supplier text.
export default function AiDescriptionsTab() {
  const [info, setInfo] = useState(null);
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({}); // id -> text
  const [busy, setBusy] = useState({}); // id -> bool
  const [rowErr, setRowErr] = useState({}); // id -> message
  const [bulk, setBulk] = useState({ running: false, done: 0, total: 0 });
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | needs | live
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const stopRef = useRef(false);

  async function load() {
    const d = await (await fetch("/api/admin/ai-descriptions")).json();
    if (d.success) {
      setInfo({ migrated: d.migrated, configured: d.configured });
      setRows(d.products);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const setBusyFor = (id, v) => setBusy((b) => ({ ...b, [id]: v }));
  const post = async (body) =>
    (
      await fetch("/api/admin/ai-descriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    ).json();

  async function generate(id) {
    setBusyFor(id, true);
    setRowErr((e) => ({ ...e, [id]: "" }));
    const res = await requestAiDraft({ id });
    setBusyFor(id, false);
    if (res.ok) {
      setDrafts((x) => ({ ...x, [id]: res.draft }));
      return { ok: true };
    }
    setRowErr((e) => ({ ...e, [id]: res.message }));
    return { ok: false, error: res.error };
  }

  async function save(id) {
    const text = (drafts[id] || "").trim();
    if (!text) return;
    setBusyFor(id, true);
    const d = await post({ action: "save", id, text });
    setBusyFor(id, false);
    if (d.success) {
      setRows((r) => r.map((p) => (p.id === id ? { ...p, ai_description: text } : p)));
      setDrafts((x) => {
        const n = { ...x };
        delete n[id];
        return n;
      });
    } else setRowErr((e) => ({ ...e, [id]: formatAiError(d.error) }));
  }

  async function reset(id) {
    if (!window.confirm("Go back to the supplier's original description?")) return;
    setBusyFor(id, true);
    const d = await post({ action: "reset", id });
    setBusyFor(id, false);
    if (d.success) setRows((r) => r.map((p) => (p.id === id ? { ...p, ai_description: null } : p)));
  }

  const todo = useMemo(
    () => rows.filter((p) => p.description && !p.ai_description && !drafts[p.id]),
    [rows, drafts]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((p) => {
      if (statusFilter === "needs" && (!p.description || p.ai_description)) return false;
      if (statusFilter === "live" && !p.ai_description) return false;
      if (q && !(p.title || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  async function generateNextBatch() {
    stopRef.current = false;
    const list = todo.slice(0, BATCH_LIMIT);
    setBulk({ running: true, done: 0, total: list.length });
    for (let i = 0; i < list.length; i++) {
      if (stopRef.current) break;
      const out = await generate(list[i].id);
      setBulk({ running: true, done: i + 1, total: list.length });
      if (!out.ok && ["ai_not_configured", "ai_key_invalid", "ai_rate_limited"].includes(out.error)) {
        break;
      }
    }
    setBulk((b) => ({ ...b, running: false }));
  }

  async function saveAllDrafts() {
    const ids = Object.keys(drafts).filter((id) => (drafts[id] || "").trim());
    if (!ids.length) return;
    if (!window.confirm(`Save ${ids.length} reviewed description(s) to the storefront?`)) return;
    for (const id of ids) await save(Number(id));
    setNotice(`Saved ${ids.length} description(s).`);
  }

  if (!info) return <LoadingState label="Loading…" />;
  const draftCount = Object.keys(drafts).length;
  const shownRows = filteredRows.slice(0, visibleLimit);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="AI descriptions"
        description="Rewrite supplier descriptions on demand so storefront copy stays unique. You can also rewrite single products inline from Catalog → Edit."
      />
      {!info.configured && <Alert variant="warning">{AI_ERROR_MESSAGES.ai_not_configured}</Alert>}
      {!info.migrated && <Alert variant="warning">{AI_ERROR_MESSAGES.run_migration_018}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PrimaryButton
            onClick={generateNextBatch}
            disabled={bulk.running || !todo.length || !info.configured}
          >
            {bulk.running
              ? `Generating ${bulk.done}/${bulk.total}…`
              : `✨ Rewrite next ${Math.min(BATCH_LIMIT, todo.length)} (${todo.length} left)`}
          </PrimaryButton>
          {bulk.running && (
            <SecondaryButton onClick={() => (stopRef.current = true)}>Stop</SecondaryButton>
          )}
          {draftCount > 0 && !bulk.running && (
            <SecondaryButton onClick={saveAllDrafts}>Save all {draftCount} reviewed drafts</SecondaryButton>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-56">
            <FormInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleLimit(PAGE_SIZE);
              }}
              placeholder="Filter products…"
              className="text-xs py-1.5"
            />
          </div>
          {[
            ["all", `All (${rows.length})`],
            ["needs", `Needs rewrite (${rows.filter((p) => p.description && !p.ai_description).length})`],
            ["live", `AI live (${rows.filter((p) => p.ai_description).length})`],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setStatusFilter(k);
                setVisibleLimit(PAGE_SIZE);
              }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                statusFilter === k
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-surface text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {shownRows.length === 0 && (
          <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            No products match this filter.
          </p>
        )}
        {shownRows.map((p) => {
          const draft = drafts[p.id];
          return (
            <div key={p.id} className="rounded-xl border border-border bg-surface p-4 shadow-card">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-ink">
                  {p.title}{" "}
                  {p.ai_description && (
                    <span className="ml-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
                      AI text live
                    </span>
                  )}
                  {!p.selected && <span className="ml-1 text-xs text-muted">(hidden)</span>}
                </div>
                <div className="flex gap-2">
                  <SecondaryButton
                    className="px-3 py-1.5 text-xs"
                    disabled={busy[p.id] || !p.description || !info.configured}
                    onClick={() => generate(p.id)}
                  >
                    {busy[p.id] ? "Working…" : draft || p.ai_description ? "↻ Regenerate" : "✨ Rewrite"}
                  </SecondaryButton>
                  {p.ai_description && (
                    <SecondaryButton className="px-3 py-1.5 text-xs" onClick={() => reset(p.id)} disabled={busy[p.id]}>
                      Use original
                    </SecondaryButton>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-medium text-muted">Original (supplier)</div>
                  <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-bg p-3 text-sm text-ink">
                    {p.description || <span className="text-muted">No description</span>}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-muted">
                    {draft !== undefined ? "Draft — edit, then save" : p.ai_description ? "Live on your store" : "Rewrite"}
                  </div>
                  {draft !== undefined ? (
                    <>
                      <textarea
                        value={draft}
                        onChange={(e) => setDrafts((x) => ({ ...x, [p.id]: e.target.value }))}
                        rows={8}
                        className="w-full rounded-lg border border-border bg-bg p-3 text-sm text-ink"
                      />
                      <div className="mt-2 flex gap-2">
                        <PrimaryButton className="px-4 py-1.5 text-sm" onClick={() => save(p.id)} disabled={busy[p.id]}>
                          Save
                        </PrimaryButton>
                        <SecondaryButton
                          className="px-3 py-1.5 text-xs"
                          onClick={() =>
                            setDrafts((x) => {
                              const n = { ...x };
                              delete n[p.id];
                              return n;
                            })
                          }
                        >
                          Discard
                        </SecondaryButton>
                      </div>
                    </>
                  ) : (
                    <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-bg p-3 text-sm text-ink">
                      {p.ai_description || <span className="text-muted">Not rewritten yet.</span>}
                    </div>
                  )}
                </div>
              </div>
              {rowErr[p.id] && (
                <div id={`err-${p.id}`} className="mt-2 text-sm text-danger">
                  {rowErr[p.id]}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredRows.length > visibleLimit && (
        <div className="flex justify-center">
          <SecondaryButton onClick={() => setVisibleLimit((n) => n + PAGE_SIZE)}>
            Show more ({filteredRows.length - visibleLimit} remaining)
          </SecondaryButton>
        </div>
      )}
    </div>
  );
}
