import { useEffect, useRef, useState } from "react";
import SectionHeading from "../ui/SectionHeading";
import { PrimaryButton, SecondaryButton } from "../ui/Button";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/States";

const ERR = {
  ai_not_configured: "Add GEMINI_API_KEY in Vercel environment variables, then redeploy.",
  ai_key_invalid: "Gemini rejected the API key — check GEMINI_API_KEY.",
  ai_rate_limited: "Gemini free limit reached — wait a minute and try again.",
  ai_timeout: "Gemini took too long — try again.",
  ai_empty: "Gemini returned nothing — try again.",
  ai_failed: "Gemini request failed — try again.",
  no_description: "This product has no description to rewrite.",
  run_migration_018: "Run supabase/migration_018 in the Supabase SQL editor first.",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Review flow: Generate a draft → read/edit it → Save. Nothing goes live
// until you press Save; "Original" always restores the supplier text.
export default function AiDescriptionsTab() {
  const [info, setInfo] = useState(null);
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({}); // id -> text
  const [busy, setBusy] = useState({}); // id -> bool
  const [rowErr, setRowErr] = useState({}); // id -> message
  const [bulk, setBulk] = useState({ running: false, done: 0, total: 0 });
  const [notice, setNotice] = useState("");
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
    let d = await post({ action: "generate", id });
    // Temporary Google trouble (busy / slow): wait a few seconds and retry,
    // up to 2 more times. Each try is its own request, so no timeout piles up.
    for (let i = 0; i < 2 && !d.success && ["ai_failed", "ai_timeout", "ai_empty"].includes(d.error); i++) {
      await sleep(5000);
      d = await post({ action: "generate", id });
    }
    if (!d.success && d.error === "ai_rate_limited") {
      await sleep(30000); // free-tier per-minute limit: wait once, retry
      d = await post({ action: "generate", id });
    }
    setBusyFor(id, false);
    if (d.success) {
      setDrafts((x) => ({ ...x, [id]: d.draft }));
      return true;
    }
    setRowErr((e) => ({
      ...e,
      [id]: (ERR[d.error] || d.error) + (d.detail ? ` — ${d.detail}` : ""),
    }));
    return false;
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
    } else setRowErr((e) => ({ ...e, [id]: ERR[d.error] || d.error }));
  }

  async function reset(id) {
    if (!window.confirm("Go back to the supplier's original description?")) return;
    setBusyFor(id, true);
    const d = await post({ action: "reset", id });
    setBusyFor(id, false);
    if (d.success) setRows((r) => r.map((p) => (p.id === id ? { ...p, ai_description: null } : p)));
  }

  const todo = rows.filter((p) => p.description && !p.ai_description && !drafts[p.id]);

  async function generateAll() {
    stopRef.current = false;
    const list = [...todo];
    setBulk({ running: true, done: 0, total: list.length });
    for (let i = 0; i < list.length; i++) {
      if (stopRef.current) break;
      const ok = await generate(list[i].id);
      setBulk({ running: true, done: i + 1, total: list.length });
      if (!ok) {
        // stop on a config/key problem, keep going on a one-off failure
        const e = (document.getElementById(`err-${list[i].id}`) || {}).textContent || "";
        if (/GEMINI_API_KEY|rejected the API key/.test(e)) break;
      }
      await sleep(4000); // stay under the free per-minute limit
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

  return (
    <div className="space-y-6">
      <SectionHeading
        title="AI descriptions"
        description="Gemini rewrites each supplier description in the same format so your store's text is unique. Nothing goes live until you review it and press Save."
      />
      {!info.configured && <Alert variant="warning">{ERR.ai_not_configured}</Alert>}
      {!info.migrated && <Alert variant="warning">{ERR.run_migration_018}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <PrimaryButton onClick={generateAll} disabled={bulk.running || !todo.length || !info.configured}>
          {bulk.running ? `Generating ${bulk.done}/${bulk.total}…` : `✨ Generate drafts for ${todo.length} product(s)`}
        </PrimaryButton>
        {bulk.running && (
          <SecondaryButton onClick={() => (stopRef.current = true)}>Stop</SecondaryButton>
        )}
        {draftCount > 0 && !bulk.running && (
          <SecondaryButton onClick={saveAllDrafts}>Save all {draftCount} reviewed drafts</SecondaryButton>
        )}
      </div>

      <div className="space-y-4">
        {rows.map((p) => {
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
    </div>
  );
}
