import { requireAdmin } from "../../../lib/requireAdmin";

export const config = { maxDuration: 30 };

// Admin-only logo / icon search. Runs on the server (some ISPs block these
// hosts from the browser) and only when the admin clicks Search. No API keys.
// Sources: Apple iOS + Mac app icons, Simple Icons (brand glyphs), Wikimedia
// Commons logos, and the website icon of the brand's domain.
const UA = "DigiVerseAdmin/1.0 (product image search; contact: site admin)";

async function timed(url, ms = 6000, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal, headers: { "User-Agent": UA, ...(init.headers || {}) } });
    return r;
  } finally {
    clearTimeout(t);
  }
}
const json = async (url, ms) => {
  const r = await timed(url, ms);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

async function apple(q) {
  const base = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&limit=6&entity=`;
  const [ios, mac] = await Promise.allSettled([json(`${base}software`), json(`${base}macSoftware`)]);
  const rows = [
    ...(ios.status === "fulfilled" ? ios.value.results || [] : []),
    ...(mac.status === "fulfilled" ? mac.value.results || [] : []),
  ];
  if (ios.status === "rejected" && mac.status === "rejected") throw new Error("Apple unreachable");
  const seen = new Set();
  const results = [];
  const hosts = [];
  for (const r of rows) {
    const url = r.artworkUrl512 || r.artworkUrl100;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    results.push({ url, label: r.trackName, source: "App icon" });
    const h = hostOf(r.sellerUrl);
    if (h) hosts.push(h);
  }
  return { results: results.slice(0, 8), hosts };
}

// Simple Icons serves brand-colored SVGs at cdn.simpleicons.org/<slug>.
async function simpleIcons(q) {
  const clean = q.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const words = clean.split(" ").filter(Boolean);
  const slugs = [...new Set([words.join(""), words[0], words.slice(0, 2).join("")].filter((s) => s && s.length > 1))];
  const hits = await Promise.all(
    slugs.map(async (slug) => {
      try {
        const r = await timed(`https://cdn.simpleicons.org/${slug}`, 5000);
        return r.ok ? { url: `https://cdn.simpleicons.org/${slug}`, label: slug, source: "Brand icon" } : null;
      } catch {
        return null;
      }
    })
  );
  return { results: hits.filter(Boolean) };
}

async function wikimedia(q) {
  const d = await json(
    "https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
      `&gsrsearch=${encodeURIComponent(`${q} logo`)}&gsrnamespace=6&gsrlimit=10` +
      "&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=256&format=json"
  );
  const results = Object.values(d?.query?.pages || {})
    .map((p) => ({ info: p.imageinfo?.[0], title: p.title }))
    .filter(({ info }) => info && /^image\/(png|jpeg|svg\+xml|webp)/.test(info.mime))
    .map(({ info, title }) => ({
      url: info.thumburl || info.url,
      label: String(title || "").replace(/^File:/, ""),
      source: "Wikimedia",
    }))
    .slice(0, 6);
  return { results };
}

const siteIcon = (host) => ({
  url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=256`,
  label: host,
  source: "Website icon",
});

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const q = String(req.query.q || "").trim().slice(0, 80);
  if (!q) return res.status(400).json({ success: false, error: "query_required" });

  const jobs = { Apple: apple(q), "Brand icons": simpleIcons(q), Wikimedia: wikimedia(q) };
  const names = Object.keys(jobs);
  const settled = await Promise.allSettled(Object.values(jobs));
  const status = {};
  let results = [];
  let hosts = [];
  settled.forEach((s, i) => {
    status[names[i]] = s.status === "fulfilled" ? "ok" : "failed";
    if (s.status === "fulfilled") {
      results = results.concat(s.value.results || []);
      hosts = hosts.concat(s.value.hosts || []);
    }
  });

  // Website icon: the domain the admin typed, or the seller site Apple returned.
  const typed = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(q) ? q.toLowerCase() : "";
  const siteHosts = [...new Set([typed, ...hosts].filter(Boolean))].slice(0, 2);
  results = results.concat(siteHosts.map(siteIcon));

  const seen = new Set();
  results = results.filter((r) => r.url && !seen.has(r.url) && seen.add(r.url));

  const failed = names.filter((n) => status[n] === "failed");
  return res.status(200).json({ success: true, results, status, partial: failed.length > 0, failed });
}
