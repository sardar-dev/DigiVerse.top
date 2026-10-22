import { useEffect, useState } from "react";
import { SecondaryButton } from "../ui/Button";

// Fills the "Image/logo URL" box with a direct https link.
//  • ✨ Make with AI — pick a provider (or Auto = try each in turn).
//      Free, keyless: Pollinations (drawn in your browser, zero server load).
//      With a key set in Vercel: Gemini / Hugging Face / Together / Cloudflare —
//      the image is generated once, saved to Supabase Storage, and its link returned.
//  • 🔎 Find online — app icons (Apple) + Wikimedia logos, searched server-side.
const NOISE =
  /\b(\d+\s*(months?|mo|days?|years?|yrs?|y|gb|tb|m)|pro|plus|premium|ultra|account|accounts|subscription|key|keys|license|licence|activation|link|trial|personal|shared|private|invite|code|1|\d+)\b/gi;

function brandOf(title) {
  const t = String(title || "")
    .replace(/[(){}\[\]|–—-]+/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t || String(title || "").trim();
}

const rnd = () => Math.floor(Math.random() * 1e6);
const promptFor = (name) =>
  `Clean modern app icon for "${name}", flat vector style, glossy gradient background, centered symbol, simple, square, no text`;
const pollUrl = (name, seed) =>
  `https://image.pollinations.ai/prompt/${encodeURIComponent(promptFor(name))}?width=512&height=512&nologo=true&seed=${seed}`;

export default function ImagePicker({ title, onPick }) {
  const [mode, setMode] = useState(null); // null | "ai" | "find"
  const [query, setQuery] = useState("");
  const [providers, setProviders] = useState(null); // keyed ones from the server
  const [provider, setProvider] = useState("auto");
  const [seeds, setSeeds] = useState([]);
  const [shown, setShown] = useState(1);
  const [made, setMade] = useState(null); // url from a server provider
  const [working, setWorking] = useState(false);
  const [found, setFound] = useState(null);
  const [err, setErr] = useState("");

  const name = () => query.trim() || brandOf(title);

  useEffect(() => {
    if (mode !== "ai" || providers) return;
    fetch("/api/admin/ai-image")
      .then((r) => r.json())
      .then((d) => setProviders(d.success ? d.providers : []))
      .catch(() => setProviders([]));
  }, [mode, providers]);

  function pick(u) {
    onPick(u);
    setMode(null);
  }

  async function generate() {
    setErr("");
    setMade(null);
    const keyed = (providers || []).map((p) => p.id);
    const wantsServer = provider === "auto" ? keyed.length > 0 : keyed.includes(provider);

    if (wantsServer) {
      setWorking(true);
      try {
        const d = await (
          await fetch("/api/admin/ai-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider, prompt: promptFor(name()) }),
          })
        ).json();
        if (d.success) {
          setMade(d.url);
          setWorking(false);
          return;
        }
        setErr(`${d.detail || d.error}${provider === "auto" ? " — showing free Pollinations instead." : ""}`);
        if (provider !== "auto") {
          setWorking(false);
          return;
        }
      } catch {
        setErr("Request failed — showing free Pollinations instead.");
      }
      setWorking(false);
    }
    // Keyless (or Auto fallback): Pollinations, drawn in the browser.
    setSeeds([rnd(), rnd(), rnd()]);
    setShown(1);
  }

  async function find(q) {
    setWorking(true);
    setErr("");
    setFound(null);
    try {
      const d = await (await fetch(`/api/admin/image-search?q=${encodeURIComponent(q)}`)).json();
      if (!d.success) throw new Error(d.error);
      setFound(d.results);
      if (!d.results.length) setErr("Nothing found — try a shorter name (just the brand).");
      else if (d.partial) setErr("One source didn't answer; showing the other.");
    } catch {
      setErr("Search failed — try again in a moment.");
    }
    setWorking(false);
  }

  function openAi() {
    setMode("ai");
    setErr("");
    if (!query) setQuery(brandOf(title));
  }
  function openFind() {
    setMode("find");
    const q = query || brandOf(title);
    setQuery(q);
    if (!found) find(q);
  }

  const options = [{ id: "auto", label: "Auto (try each)" }, ...(providers || []), { id: "pollinations", label: "Pollinations (free)" }];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <SecondaryButton type="button" onClick={openAi} className="px-3 py-1.5 text-xs">
          ✨ Make with AI
        </SecondaryButton>
        <SecondaryButton type="button" onClick={openFind} className="px-3 py-1.5 text-xs">
          🔎 Find online
        </SecondaryButton>
        {mode && (
          <button type="button" onClick={() => setMode(null)} className="text-xs text-muted hover:underline">
            Close
          </button>
        )}
      </div>

      {mode && (
        <div className="space-y-2 rounded-lg border border-border bg-bg p-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Brand / product name"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink"
            />
            {mode === "ai" && (
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-ink"
                aria-label="AI provider"
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            <SecondaryButton
              type="button"
              className="px-3 py-1.5 text-xs"
              disabled={working}
              onClick={() => (mode === "ai" ? generate() : find(name()))}
            >
              {working ? "Working…" : mode === "ai" ? "Generate" : "Search"}
            </SecondaryButton>
          </div>

          {mode === "ai" && (
            <>
              <div className="flex flex-wrap gap-2">
                {made && (
                  <button
                    type="button"
                    onClick={() => pick(made)}
                    className="h-24 w-24 overflow-hidden rounded-lg border border-border bg-surface hover:ring-2 hover:ring-brand"
                    title="Use this image"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={made} alt="" className="h-full w-full object-cover" />
                  </button>
                )}
                {seeds.slice(0, shown).map((s) => {
                  const u = pollUrl(name(), s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => pick(u)}
                      className="relative h-24 w-24 overflow-hidden rounded-lg border border-border bg-surface hover:ring-2 hover:ring-brand"
                      title="Use this image"
                    >
                      <span className="absolute inset-0 flex items-center justify-center text-xs text-muted">Drawing…</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={u}
                        alt=""
                        className="relative h-full w-full object-cover"
                        onLoad={() => setShown((n) => Math.min(seeds.length, Math.max(n, seeds.indexOf(s) + 2)))}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-muted">
                Press Generate, then click an image to use its link.{" "}
                {providers && providers.length === 0 && "Only the free provider is on — add a key in Vercel to enable more."}
              </div>
            </>
          )}

          {mode === "find" && (
            <>
              {working && <div className="text-xs text-muted">Searching…</div>}
              {found && found.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {found.map((r) => (
                    <button
                      key={r.url}
                      type="button"
                      onClick={() => pick(r.url)}
                      className="w-20 overflow-hidden rounded-lg border border-border bg-white p-1 text-left hover:ring-2 hover:ring-brand"
                      title={`${r.label} (${r.source})`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.url} alt="" className="h-16 w-full object-contain" />
                      <span className="mt-0.5 block truncate text-[10px] text-muted">{r.source}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {mode === "find" && (
            <div className="rounded bg-warning-soft px-2 py-1.5 text-xs text-warning">
              Careful: official brand logos can make Google flag the whole site as deceptive. Prefer
              ✨ AI-made generic icons, or your own artwork.
            </div>
          )}
          {err && <div className="break-words text-xs text-danger">{err}</div>}
        </div>
      )}
    </div>
  );
}
