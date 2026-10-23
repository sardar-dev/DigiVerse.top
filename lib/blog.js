import fs from "fs";
import path from "path";

// The blog is plain text files in /content/blog — no database, no server
// work. Pages are built once at deploy time (static), so a visit costs
// nothing but CDN bandwidth. Publishing = adding a file (see README).
const DIR = path.join(process.cwd(), "content", "blog");

function parse(file) {
  const raw = fs.readFileSync(path.join(DIR, file), "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = {};
  let body = raw;
  if (m) {
    body = m[2];
    for (const line of m[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  const slug = file.replace(/\.md$/, "");
  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    slug,
    title: meta.title || slug,
    description: meta.description || "",
    date: meta.date || "",
    updated: meta.updated || meta.date || "",
    keywords: meta.keywords || "",
    ctaQuery: meta.cta_query || "",
    ctaLabel: meta.cta_label || "",
    draft: meta.draft === "true",
    readMinutes: Math.max(1, Math.round(words / 200)),
    body,
  };
}

export function getAllPosts() {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .map(parse)
    .filter((p) => !p.draft)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPost(slug) {
  return getAllPosts().find((p) => p.slug === slug) || null;
}
