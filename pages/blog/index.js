import Link from "next/link";
import SEO from "../../components/SEO";
import SiteHeader from "../../components/layout/SiteHeader";
import SiteFooter from "../../components/layout/SiteFooter";
import PageContainer from "../../components/layout/PageContainer";
import { getAllPosts } from "../../lib/blog";

export async function getStaticProps() {
  const posts = getAllPosts().map(({ slug, title, description, date, readMinutes }) => ({
    slug, title, description, date, readMinutes,
  }));
  return { props: { posts } };
}

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";

export default function BlogIndex({ posts }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO
        title="Blog"
        description="Guides, comparisons and explainers about AI tools and digital subscriptions."
        path="/blog"
      />
      <SiteHeader />
      <main className="flex-1">
        <PageContainer className="space-y-6 py-10" width="max-w-2xl">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold text-ink">Blog</h1>
            <p className="text-sm text-muted">Guides and comparisons on AI tools and digital subscriptions.</p>
          </header>
          {posts.length === 0 && <p className="text-sm text-muted">No articles yet — check back soon.</p>}
          <ul className="space-y-4">
            {posts.map((p) => (
              <li key={p.slug} className="rounded-xl border border-border bg-surface p-5 shadow-card">
                <Link href={`/blog/${p.slug}`} className="text-lg font-semibold text-ink hover:text-brand">
                  {p.title}
                </Link>
                <p className="mt-1 text-sm text-muted">{p.description}</p>
                <p className="mt-2 text-xs text-muted">
                  {fmt(p.date)} · {p.readMinutes} min read
                </p>
              </li>
            ))}
          </ul>
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}
