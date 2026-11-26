import dns from "dns/promises";
import net from "net";

// Server-side image fetcher for the admin image picker.
// Safety: https only, public IPs only (no localhost / private ranges, checked
// again on every redirect), size cap, image content-types only, hard timeout.
// Used by admin-only routes, so it is not reachable by shoppers.

export const MAX_BYTES = 5 * 1024 * 1024;
const UA = "DigiVerseAdmin/1.0 (product image tool)";

// Hosts the logo search can return. The proxy only accepts these unless the
// admin explicitly pastes their own link (mode=any).
export const SEARCH_HOSTS = [
  "mzstatic.com",
  "wikimedia.org",
  "simpleicons.org",
  "jsdelivr.net",
  "google.com",
  "gstatic.com",
];

export function hostAllowed(host, list = SEARCH_HOSTS) {
  const h = String(host || "").toLowerCase();
  return list.some((d) => h === d || h.endsWith(`.${d}`));
}

function privateIp(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

async function assertPublic(u) {
  if (u.protocol !== "https:") throw new Error("Only https links are allowed.");
  if (u.username || u.password) throw new Error("Links with credentials are not allowed.");
  const host = u.hostname.replace(/^\[|\]$/g, ""); // IPv6 literals come bracketed
  if (net.isIP(host)) {
    if (privateIp(host)) throw new Error("That address is not allowed.");
    return;
  }
  const addrs = await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error("That address is not allowed.");
}

export async function fetchImage(rawUrl, { allowAny = false, timeoutMs = 8000 } = {}) {
  let u;
  try {
    u = new URL(String(rawUrl));
  } catch {
    throw new Error("That is not a valid link.");
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    for (let hop = 0; hop < 4; hop++) {
      if (!allowAny && !hostAllowed(u.hostname)) throw new Error("That host is not allowed.");
      await assertPublic(u);
      const r = await fetch(u, { signal: ctrl.signal, redirect: "manual", headers: { "User-Agent": UA, Accept: "image/*" } });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        u = new URL(r.headers.get("location"), u);
        continue;
      }
      if (!r.ok) throw new Error(`The image host answered ${r.status}.`);
      const type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!/^image\/(png|jpeg|jpg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(type)) {
        throw new Error("That link is not an image.");
      }
      const reader = r.body.getReader();
      const chunks = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX_BYTES) throw new Error("Image is larger than 5 MB.");
        chunks.push(value);
      }
      return { buffer: Buffer.concat(chunks), type };
    }
    throw new Error("Too many redirects.");
  } finally {
    clearTimeout(timer);
  }
}
