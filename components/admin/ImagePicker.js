import { useState } from "react";
import { SecondaryButton } from "../ui/Button";

// Two ways to fill the "Image/logo URL" box, both with ZERO load on our
// server or database — everything runs in the admin's own browser and
// only a plain https image link is saved (image_url):
//  • ✨ Make with AI  — Pollinations (free, no key) draws an icon from the
//    product name; the link itself is the image URL.
//  • 🔎 Find online   — searches Wikimedia Commons for logos and returns
//    direct thumbnail links.
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
function aiUrl(name, seed) {
  const prompt = `Clean modern app icon for "${name}", flat vector style, glossy gradient background, centered symbol, simple, square, no text`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true&seed=${seed}`;
}

export default function ImagePicker({ title, onPick }) {
  const [mode, setMode] = useState(null); // null | "ai" | "find"
  const [query, setQuery] = useState("");
  const [seeds, setSeeds] = useState([]);
  const [shown, setShown] = useState(1); // thumbs revealed one by one (free generator queues requests)
  const [found, setFound] = useState(null); // null | array
  const [finding, setFinding] = useState(false);
  const [err, setErr] = useState("");

  const name = () => query.trim() || brandOf(title);

  function openAi() {
    setMode("ai");
    setErr("");
    if (!query) setQuery(brandOf(title));
    setSeeds([rnd(), rnd(), rnd()]);
    setShown(1);
  }
  function moreAi() {
    setSeeds([rnd(), rnd(), rnd()]);
    setShown(1);
  }

  async function find(q) {
    setFinding(true);
    setErr("");
    setFound(null);
    try {
      const url =
        "https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
        `&gsrsearch=${encodeURIComponent(`${q} logo`)}&gsrnamespace=6&gsrlimit=10` +
        "&prop=imageinfo&iiprop=url|mime&iiurlwidth=256&format=json&origin=*";
      const d = await (await fetch(url)).json();
      const list = Object.values(d?.query?.pages || {})
        .map((p) => p.imageinfo?.[0])
        .filter((i) => i && /^image\/(png|jpeg|svg\+xml|webp)/.test(i.mime) && (i.thumburl || i.url))
        .map((i) => i.thumburl || i.url)
        .slice(0, 8);
      setFound(list);
      if (!list.length) setErr("Nothing found — try a shorter name (just the brand).");
    } catch {
      setErr("Search failed — check your connection and try again.");
    }
    setFinding(false);
  }
  function openFind() {
    setMode("find");
    const q = query || brandOf(title);
    setQuery(q);
    if (!found) find(q);
  }

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
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Brand / product name"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink"
            />
            <SecondaryButton
              type="button"
              className="px-3 py-1.5 text-xs"
              onClick={() => (mode === "ai" ? (setSeeds([rnd(), rnd(), rnd()]), setShown(1)) : find(name()))}
            >
              {mode === "ai" ? "Generate" : "Search"}
            </SecondaryButton>
          </div>

          {mode === "ai" && (
            <>
              <div className="flex flex-wrap gap-2">
                {seeds.slice(0, shown).map((s) => {
                  const u = aiUrl(name(), s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        onPick(u);
                        setMode(null);
                      }}
                      className="group relative h-24 w-24 overflow-hidden rounded-lg border border-border bg-surface hover:ring-2 hover:ring-brand"
                      title="Use this image"
                    >
                      <span className="absolute inset-0 flex items-center justify-center text-xs text-muted">
                        Drawing…
                      </span>
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
                Click an image to use its link. Each takes a few seconds.{" "}
                <button type="button" onClick={moreAi} className="text-brand hover:underline">
                  Try different ones
                </button>
              </div>
            </>
          )}

          {mode === "find" && (
            <>
              {finding && <div className="text-xs text-muted">Searching…</div>}
              {found && found.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {found.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => {
                        onPick(u);
                        setMode(null);
                      }}
                      className="h-20 w-20 overflow-hidden rounded-lg border border-border bg-white p-1 hover:ring-2 hover:ring-brand"
                      title="Use this image"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="h-full w-full object-contain" />
                    </button>
                  ))}
                </div>
              )}
              <div className="text-xs text-muted">Results from Wikimedia Commons. Click one to use its link.</div>
            </>
          )}
          {err && <div className="text-xs text-danger">{err}</div>}
        </div>
      )}
    </div>
  );
}
