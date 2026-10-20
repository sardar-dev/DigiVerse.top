import { requireAdmin } from "../../../lib/requireAdmin";

// Admin-only logo/icon search. Runs on the server (some ISPs block
// Wikimedia from the browser) and only when the admin clicks Search.
// Sources: Apple's public app-icon search + Wikimedia Commons. No keys.
const UA = "DigiVerseAdmin/1.0 (product image search; contact: site admin)";

async function timed(url, ms = 8000, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal, headers: { "User-Agent": UA, ...(init.headers || {}) } });
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function itunes(q) {
  const d = await timed(
    `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=software&limit=8`
  );
  return (d.results || [])
    .map((r) => ({ url: r.artworkUrl512 || r.artworkUrl100, label: r.trackName, source: "App icon" }))
    .filter((r) => r.url)
    .slice(0, 6);
}

async function wikimedia(q) {
  const d = await timed(
    "https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
      `&gsrsearch=${encodeURIComponent(`${q} logo`)}&gsrnamespace=6&gsrlimit=10` +
      "&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=256&format=json"
  );
  return Object.values(d?.query?.pages || {})
    .map((p) => ({ info: p.imageinfo?.[0], title: p.title }))
    .filter(({ info }) => info && /^image\/(png|jpeg|svg\+xml|webp)/.test(info.mime))
    .map(({ info, title }) => ({
      url: info.thumburl || info.url,
      label: String(title || "").replace(/^File:/, ""),
      source: "Wikimedia",
    }))
    .slice(0, 6);
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const q = String(req.query.q || "").trim().slice(0, 80);
  if (!q) return res.status(400).json({ success: false, error: "query_required" });

  const [a, b] = await Promise.allSettled([itunes(q), wikimedia(q)]);
  const results = [
    ...(a.status === "fulfilled" ? a.value : []),
    ...(b.status === "fulfilled" ? b.value : []),
  ];
  const errors = [a, b].filter((x) => x.status === "rejected").length;
  return res.status(200).json({ success: true, results, partial: errors > 0 });
}
