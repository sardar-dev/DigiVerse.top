import Link from "next/link";

// Tiny, dependency-free renderer for the blog's plain-text format:
//   ## Heading   ### Subheading   - bullet   1. numbered   **bold**   [text](url)
// Builds React elements (never raw HTML), and only allows internal or
// https links.
function inline(text, k) {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
    const key = `${k}-${i}`;
    let m = part.match(/^\*\*([^*]+)\*\*$/);
    if (m) return <strong key={key} className="font-semibold text-ink">{m[1]}</strong>;
    m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (m) {
      const [, label, href] = m;
      if (href.startsWith("/"))
        return (
          <Link key={key} href={href} className="font-medium text-brand underline underline-offset-2">
            {label}
          </Link>
        );
      if (/^https:\/\//.test(href))
        return (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline underline-offset-2">
            {label}
          </a>
        );
      return label;
    }
    return part;
  });
}

export default function Markdown({ source }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let para = [];
  let list = null; // { ordered, items }
  let n = 0;

  const flushPara = () => {
    if (para.length) {
      out.push(
        <p key={`p${n++}`} className="leading-relaxed text-ink/90">
          {inline(para.join(" "), `p${n}`)}
        </p>
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const Tag = list.ordered ? "ol" : "ul";
      out.push(
        <Tag key={`l${n++}`} className={`space-y-1.5 pl-5 text-ink/90 ${list.ordered ? "list-decimal" : "list-disc"}`}>
          {list.items.map((it, i) => (
            <li key={i} className="leading-relaxed">{inline(it, `li${n}-${i}`)}</li>
          ))}
        </Tag>
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if ((m = line.match(/^###\s+(.*)/))) {
      flushPara(); flushList();
      out.push(<h3 key={`h${n++}`} className="pt-2 text-lg font-semibold text-ink">{inline(m[1], `h${n}`)}</h3>);
    } else if ((m = line.match(/^##\s+(.*)/))) {
      flushPara(); flushList();
      out.push(<h2 key={`h${n++}`} className="pt-4 text-xl font-semibold text-ink sm:text-2xl">{inline(m[1], `h${n}`)}</h2>);
    } else if ((m = line.match(/^[-*]\s+(.*)/))) {
      flushPara();
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; }
      list.items.push(m[1]);
    } else if ((m = line.match(/^\d+\.\s+(.*)/))) {
      flushPara();
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; }
      list.items.push(m[1]);
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return <div className="space-y-4 text-[15px] sm:text-base">{out}</div>;
}
