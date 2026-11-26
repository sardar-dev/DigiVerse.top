import { useEffect, useRef, useState } from "react";
import { SecondaryButton, PrimaryButton } from "../ui/Button";

// Fills the product "Image/logo URL" with a link to OUR OWN hosted image.
//
// How it works
//  1. Get a logo:  🔎 Find (Apple app icons, brand icons, Wikimedia, website icon)
//                  📤 Upload your own file   🔗 Paste any image link   🎨 No logo (initials tile)
//  2. Compose:     the logo is placed on a DigiVerse-styled tile (own colors, own text),
//                  drawn in the browser on a canvas, then saved to Supabase Storage.
//  The product never shows a hot-linked brand image, and the thumbnail reads as a
//  DigiVerse product card instead of the brand's own artwork.

const NOISE =
  /\b(\d+\s*(months?|mo|days?|years?|yrs?|y|gb|tb|m)|pro|plus|premium|ultra|account|accounts|subscription|key|keys|license|licence|activation|link|trial|personal|shared|private|invite|code|digital|1|\d+)\b/gi;

function brandOf(title) {
  const t = String(title || "")
    .replace(/[(){}\[\]|–—-]+/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t || String(title || "").trim();
}

const PALETTES = [
  { id: "violet", a: "#6d5dfc", b: "#241a6e" },
  { id: "blue", a: "#22b8ff", b: "#0b3a85" },
  { id: "green", a: "#10c9a0", b: "#06555a" },
  { id: "coral", a: "#ff7a59", b: "#9c1f4c" },
  { id: "slate", a: "#475569", b: "#0f172a" },
  { id: "grape", a: "#a855f7", b: "#1e1b4b" },
];
const CAPTIONS = ["Digital subscription", "License key", "Account", "AI tokens", "Gift card", "None"];
const SIZE = 512;
const MAX_ORIGINAL = 1024; // longest side kept for "Original"

// ---------- helpers ----------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file could not be read as an image."));
    img.src = src;
  });
}

// SVGs with only a viewBox have no size and may not draw on a canvas.
function sizeSvg(text) {
  return text.replace(/<svg\b([^>]*)>/i, (m, attrs) => (/\bwidth\s*=/.test(attrs) ? m : `<svg width="512" height="512"${attrs}>`));
}

async function toObjectUrl(blob) {
  if (/svg/i.test(blob.type)) {
    const text = sizeSvg(await blob.text());
    return URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  }
  return URL.createObjectURL(blob);
}

async function fetchViaProxy(url, any) {
  const r = await fetch(`/api/admin/image-proxy?url=${encodeURIComponent(url)}${any ? "&mode=any" : ""}`);
  if (!r.ok) {
    let msg = `Could not load the image (${r.status}).`;
    try {
      msg = (await r.json()).detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return toObjectUrl(await r.blob());
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Average color of the visible, non-white pixels of the logo.
function dominant(img) {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0, 32, 32);
    const d = x.getImageData(0, 0, 32, 32).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128 || d[i] + d[i + 1] + d[i + 2] > 700) continue;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    if (!n) return null;
    const h = (v) => Math.round(v / n).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  } catch {
    return null;
  }
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function contain(ctx, img, x, y, w, h) {
  const s = Math.min(w / (img.naturalWidth || img.width || 1), h / (img.naturalHeight || img.height || 1));
  const dw = (img.naturalWidth || img.width || w) * s;
  const dh = (img.naturalHeight || img.height || h) * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function fitText(ctx, text, maxW, start, weight = 700) {
  let size = start;
  do {
    ctx.font = `${weight} ${size}px Inter, "Segoe UI", system-ui, sans-serif`;
    size -= 2;
  } while (ctx.measureText(text).width > maxW && size > 18);
}

const initialsOf = (name) =>
  String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

function draw(canvas, o) {
  const ctx = canvas.getContext("2d");
  if (o.style === "original" && o.logo) {
    // As-is: same picture, same proportions, no tile, no text, no crop.
    const iw = o.logo.naturalWidth || o.logo.width || SIZE;
    const ih = o.logo.naturalHeight || o.logo.height || SIZE;
    const k = Math.min(1, MAX_ORIGINAL / Math.max(iw, ih));
    canvas.width = Math.max(1, Math.round(iw * k));
    canvas.height = Math.max(1, Math.round(ih * k));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(o.logo, 0, 0, canvas.width, canvas.height);
    return;
  }
  canvas.width = canvas.height = SIZE;
  ctx.clearRect(0, 0, SIZE, SIZE);
  const pal = o.palette;
  const mark = (x, y, w, h) => {
    if (o.logo && o.style !== "initials") contain(ctx, o.logo, x, y, w, h);
    else {
      ctx.fillStyle = pal.a;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      fitText(ctx, initialsOf(o.name), w * 0.9, h * 0.7, 800);
      ctx.fillText(initialsOf(o.name), x + w / 2, y + h / 2 + 4);
    }
  };

  if (o.style === "plain") {
    rr(ctx, 0, 0, SIZE, SIZE, 112);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.save();
    mark(88, 88, SIZE - 176, SIZE - 176);
    ctx.restore();
    return;
  }

  // tile
  ctx.save();
  rr(ctx, 0, 0, SIZE, SIZE, 112);
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  g.addColorStop(0, pal.a);
  g.addColorStop(1, pal.b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const glow = ctx.createRadialGradient(110, 70, 10, 110, 70, 300);
  glow.addColorStop(0, "rgba(255,255,255,0.30)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.beginPath();
  ctx.arc(SIZE - 40, SIZE - 20, 170, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fill();
  ctx.restore();

  const hasText = !!(o.showName && o.name);
  const hasCaption = hasText && o.caption && o.caption !== "None";
  const plate = hasText ? 280 : 340;
  const py = hasText ? 52 : (SIZE - plate) / 2;
  const px = (SIZE - plate) / 2;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.30)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 14;
  rr(ctx, px, py, plate, plate, 76);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  mark(px + 48, py + 48, plate - 96, plate - 96);

  if (hasText) {
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    fitText(ctx, o.name, 430, 46);
    ctx.fillText(o.name, SIZE / 2, hasCaption ? 404 : 420);
    if (hasCaption) {
      ctx.fillStyle = "rgba(255,255,255,0.78)";
      ctx.font = `600 21px Inter, "Segoe UI", system-ui, sans-serif`;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
      ctx.fillText(o.caption.toUpperCase(), SIZE / 2, 448);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    }
  }
}

// ---------- compression ----------
// Shrinks the finished image before it is stored (free Supabase has 1 GB):
// WebP at ~512px, quality lowered step by step until it is under TARGET_BYTES.
// Browsers that cannot encode WebP (older Safari) get a 384px PNG instead.
const TARGET_BYTES = 40 * 1024;
const ORIGINAL_STEPS = [[1024, 0.9], [1024, 0.82], [800, 0.76], [640, 0.7]];
const STEPS = [[512, 0.86], [512, 0.76], [448, 0.7], [384, 0.62]];

function scaled(src, size) {
  const k = Math.min(1, size / Math.max(src.width, src.height));
  if (k === 1) return src;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(src.width * k));
  c.height = Math.max(1, Math.round(src.height * k));
  const x = c.getContext("2d");
  x.imageSmoothingQuality = "high";
  x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
const blobOf = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));
const dataUrlOf = (blob) =>
  new Promise((res, rej) => {
    const f = new FileReader();
    f.onload = () => res(f.result);
    f.onerror = () => rej(new Error("Could not read the image."));
    f.readAsDataURL(blob);
  });

export async function compressCanvas(canvas, original = false) {
  let best = null;
  // Original keeps more pixels (and a higher target) so the picture stays as it was.
  for (const [size, q] of original ? ORIGINAL_STEPS : STEPS) {
    const blob = await blobOf(scaled(canvas, size), "image/webp", q);
    if (!blob || blob.type !== "image/webp") break; // no WebP encoder in this browser
    best = blob;
    if (blob.size <= (original ? TARGET_BYTES * 3 : TARGET_BYTES)) break;
  }
  if (!best) best = await blobOf(scaled(canvas, original ? 768 : 384), "image/png");
  return { blob: best, dataUrl: await dataUrlOf(best) };
}

// ---------- component ----------
export default function ImagePicker({ title, onPick }) {
  const [mode, setMode] = useState(null); // null | "find" | "upload" | "url" | "tile"
  const [query, setQuery] = useState("");
  const [link, setLink] = useState("");
  const [found, setFound] = useState(null);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const [logo, setLogo] = useState(null); // HTMLImageElement | null
  const [composing, setComposing] = useState(false);
  const [style, setStyle] = useState("tile"); // tile | plain | initials
  const [paletteId, setPaletteId] = useState("auto");
  const [auto, setAuto] = useState(null);
  const [name, setName] = useState("");
  const [showName, setShowName] = useState(true);
  const [caption, setCaption] = useState(CAPTIONS[0]);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef(null);

  const brand = () => query.trim() || brandOf(title);
  const palette =
    paletteId === "auto" && auto
      ? { a: shade(auto, -0.1), b: shade(auto, -0.65) }
      : PALETTES.find((p) => p.id === paletteId) || PALETTES[0];

  useEffect(() => {
    if (!composing || !canvasRef.current) return;
    draw(canvasRef.current, { logo, style, palette, name, showName, caption });
  });

  function reset() {
    setMode(null);
    setComposing(false);
    setLogo(null);
    setErr("");
    setNote("");
  }

  async function useLogoFrom(objectUrlPromise, label, startStyle = "tile") {
    setErr("");
    setWorking(true);
    try {
      const img = await loadImage(await objectUrlPromise);
      setLogo(img);
      setAuto(dominant(img));
      setPaletteId("auto");
      setStyle(startStyle);
      setName((n) => n || label || brand());
      setComposing(true);
    } catch (e) {
      setErr(e.message || "Could not load that image.");
    }
    setWorking(false);
  }

  async function find(q) {
    setWorking(true);
    setErr("");
    setNote("");
    setFound(null);
    try {
      const r = await fetch(`/api/admin/image-search?q=${encodeURIComponent(q)}`);
      let d = null;
      try {
        d = await r.json();
      } catch {}
      if (!r.ok || !d?.success) {
        throw new Error(
          r.status === 401 || r.status === 403
            ? "Your admin session expired — reload the page and log in again."
            : `Search failed${r.status ? ` (${r.status})` : ""} — try again in a moment.`
        );
      }
      setFound(d.results);
      if (!d.results.length) setErr("Nothing found — try just the brand name, a domain like adobe.com, or Upload / paste a link.");
      else if (d.partial) setNote(`Couldn't reach: ${d.failed.join(", ")}. Showing the rest.`);
    } catch (e) {
      setErr(e.message);
    }
    setWorking(false);
  }

  function openFind() {
    setMode("find");
    setComposing(false);
    const q = query || brandOf(title);
    setQuery(q);
    if (!found) find(q);
  }
  function openTile() {
    setMode("tile");
    setErr("");
    setLogo(null);
    setStyle("initials");
    setPaletteId("violet");
    setName((n) => n || brand());
    setComposing(true);
  }

  async function save() {
    if (!canvasRef.current) return;
    setSaving(true);
    setErr("");
    try {
      const { dataUrl, blob } = await compressCanvas(canvasRef.current, style === "original");
      const r = await fetch("/api/admin/image-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.detail || d.error || `Upload failed (${r.status})`);
      onPick(d.url);
      reset();
      setNote(`Saved ${Math.max(1, Math.round(blob.size / 1024))} KB ${blob.type.replace("image/", "").toUpperCase()}`);
    } catch (e) {
      setErr(e.message);
    }
    setSaving(false);
  }

  const tab = (id, label, onClick) => (
    <SecondaryButton
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs ${mode === id ? "ring-2 ring-brand" : ""}`}
    >
      {label}
    </SecondaryButton>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {tab("find", "🔎 Find logo", openFind)}
        {tab("upload", "📤 Upload my own image", () => { setMode("upload"); setComposing(false); setErr(""); })}
        {tab("url", "🔗 From link", () => { setMode("url"); setComposing(false); setErr(""); })}
        {tab("tile", "🎨 No logo (initials)", openTile)}
        {mode && (
          <button type="button" onClick={reset} className="text-xs text-muted hover:underline">
            Close
          </button>
        )}
      </div>

      {!mode && note && <div className="text-xs text-muted">{note}</div>}

      {mode && (
        <div className="space-y-3 rounded-lg border border-border bg-bg p-3">
          {mode === "find" && (
            <div className="flex flex-wrap gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), find(brand()))}
                placeholder="Brand name or website (e.g. Adobe Express, adobe.com)"
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink"
              />
              <SecondaryButton type="button" className="px-3 py-1.5 text-xs" disabled={working} onClick={() => find(brand())}>
                {working ? "Searching…" : "Search"}
              </SecondaryButton>
            </div>
          )}

          {mode === "find" && found && found.length > 0 && !composing && (
            <div className="flex flex-wrap gap-2">
              {found.map((r) => (
                <button
                  key={r.url}
                  type="button"
                  onClick={() => useLogoFrom(fetchViaProxy(r.url, false), r.label)}
                  className="w-20 overflow-hidden rounded-lg border border-border bg-white p-1 text-left hover:ring-2 hover:ring-brand"
                  title={`${r.label} (${r.source})`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.url} alt="" referrerPolicy="no-referrer" className="h-16 w-full object-contain" />
                  <span className="mt-0.5 block truncate text-[10px] text-muted">{r.source}</span>
                </button>
              ))}
            </div>
          )}

          {mode === "upload" && !composing && (
            <label className="block text-xs text-muted">
              Choose your own PNG, JPG, WebP or SVG (max 5 MB). It is saved exactly as it is: no tile, no text, no crop (only compressed). You can still switch to Tile or Plain in the next step.
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="mt-1 block w-full text-sm text-ink"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 5 * 1024 * 1024) return setErr("That file is larger than 5 MB.");
                  useLogoFrom(toObjectUrl(f), brandOf(f.name.replace(/\.[a-z0-9]+$/i, "")), "original");
                }}
              />
            </label>
          )}

          {mode === "url" && !composing && (
            <div className="flex flex-wrap gap-2">
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://… link to any image"
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink"
              />
              <SecondaryButton
                type="button"
                className="px-3 py-1.5 text-xs"
                disabled={working || !link.trim()}
                onClick={() => useLogoFrom(fetchViaProxy(link.trim(), true), brand())}
              >
                {working ? "Loading…" : "Load"}
              </SecondaryButton>
            </div>
          )}

          {composing && (
            <div className="flex flex-wrap items-start gap-4">
              <canvas
                ref={canvasRef}
                width={SIZE}
                height={SIZE}
                className="h-40 w-40 rounded-2xl object-contain border border-border bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px]"
                aria-label="Preview of the product image"
              />
              <div className="min-w-[14rem] flex-1 space-y-2 text-xs text-muted">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ["tile", "Tile (recommended)"],
                    ["plain", "Plain on white"],
                    ...(logo ? [["initials", "Initials only"], ["original", "Original (as is)"]] : []),
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setStyle(id)}
                      className={`rounded-full border px-2.5 py-1 ${style === id ? "border-brand bg-brand-soft text-ink" : "border-border bg-surface"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {style !== "plain" && style !== "original" && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span>Color</span>
                    {auto && logo && (
                      <button
                        type="button"
                        onClick={() => setPaletteId("auto")}
                        title="Match the logo"
                        className={`h-6 w-6 rounded-full border-2 ${paletteId === "auto" ? "border-ink" : "border-transparent"}`}
                        style={{ background: `linear-gradient(135deg, ${shade(auto, -0.1)}, ${shade(auto, -0.65)})` }}
                      />
                    )}
                    {PALETTES.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPaletteId(p.id)}
                        title={p.id}
                        className={`h-6 w-6 rounded-full border-2 ${paletteId === p.id ? "border-ink" : "border-transparent"}`}
                        style={{ background: `linear-gradient(135deg, ${p.a}, ${p.b})` }}
                      />
                    ))}
                  </div>
                )}

                {style === "tile" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
                      Show name
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value.slice(0, 28))}
                      placeholder="Name on tile"
                      className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-ink"
                    />
                    <select
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-ink"
                      aria-label="Caption"
                    >
                      {CAPTIONS.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                )}
                {style === "original" && (
                  <p>Your picture is saved as it is: same proportions, no tile, no text, no crop. It is only compressed to save space.</p>
                )}
                {style !== "tile" && style !== "original" && (
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 28))}
                    placeholder="Name (used for initials)"
                    className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs text-ink"
                  />
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <PrimaryButton type="button" className="px-3 py-1.5 text-xs" disabled={saving} onClick={save}>
                    {saving ? "Saving…" : "Use this image"}
                  </PrimaryButton>
                  <SecondaryButton type="button" className="px-3 py-1.5 text-xs" onClick={() => (mode === "tile" ? reset() : setComposing(false))}>
                    {mode === "tile" ? "Cancel" : "Pick another"}
                  </SecondaryButton>
                </div>
              </div>
            </div>
          )}

          <div className="rounded bg-warning-soft px-2 py-1.5 text-xs text-warning">
            Logos are saved as your own copy on a DigiVerse tile, never linked from the brand. Keep the
            non-affiliation notice on the site and don&apos;t copy a brand&apos;s login or payment look — those,
            not product thumbnails, are what get sites flagged. No tool can promise Google won&apos;t flag a site.
          </div>
          {note && <div className="text-xs text-muted">{note}</div>}
          {err && <div className="break-words text-xs text-danger">{err}</div>}
        </div>
      )}
    </div>
  );
}
