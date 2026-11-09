import Head from "next/head";
import Link from "next/link";
import SEO from "../../components/SEO";
import SiteHeader from "../../components/layout/SiteHeader";
import SiteFooter from "../../components/layout/SiteFooter";
import PageContainer from "../../components/layout/PageContainer";
import Markdown from "../../components/blog/Markdown";
import { getAllPosts, getPost } from "../../lib/blog";
import { SITE_URL } from "../../lib/siteConfig";
import { useT, intlLocale } from "../../lib/i18n";

// One page per post per language (/blog/x, /ar/blog/x, /ru/blog/x).
export async function getStaticPaths({ locales = ["en"] }) {
  const posts = getAllPosts();
  const paths = locales.flatMap((locale) => posts.map((p) => ({ params: { slug: p.slug }, locale })));
  return { paths, fallback: false };
}

export async function getStaticProps({ params }) {
  const post = getPost(params.slug);
  if (!post) return { notFound: true };
  return { props: { post } };
}

const fmt = (d, locale) =>
  d ? new Date(d).toLocaleDateString(intlLocale(locale), { year: "numeric", month: "long", day: "numeric" }) : "";

export default function Post({ post }) {
  const { t, locale } = useT();
  const url = `${SITE_URL}${locale === "en" ? "" : `/${locale}`}/blog/${post.slug}`;
  const cta = post.ctaQuery ? `/?q=${encodeURIComponent(post.ctaQuery)}#catalog` : "";
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        dateModified: post.updated,
        mainEntityOfPage: url,
        inLanguage: "en",
        keywords: post.keywords,
        author: { "@type": "Organization", name: "DigiVerse", url: SITE_URL },
        publisher: { "@type": "Organization", name: "DigiVerse", url: SITE_URL },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: t("Home"), item: SITE_URL },
          { "@type": "ListItem", position: 2, name: t("Blog"), item: `${SITE_URL}/blog` },
          { "@type": "ListItem", position: 3, name: post.title, item: url },
        ],
      },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO title={post.title} description={post.description} path={`/blog/${post.slug}`} type="article" />
      <Head>
        <meta property="article:published_time" content={post.date} />
        <meta property="article:modified_time" content={post.updated} />
        {post.keywords && <meta name="keywords" content={post.keywords} />}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      </Head>
      <SiteHeader />
      <main className="flex-1">
        <PageContainer className="space-y-6 py-10" width="max-w-2xl">
          <nav aria-label={t("Breadcrumb")} className="text-xs text-muted">
            <Link href="/" className="hover:underline">{t("Home")}</Link> /{" "}
            <Link href="/blog" className="hover:underline">{t("Blog")}</Link>
          </nav>
          <header className="space-y-2">
            <h1 className="text-2xl font-bold leading-tight text-ink sm:text-4xl">{post.title}</h1>
            <p className="text-xs text-muted">
              {t("Published {date}", { date: fmt(post.date, locale) })}
              {post.updated && post.updated !== post.date ? ` · ${t("Updated {date}", { date: fmt(post.updated, locale) })}` : ""} · {t("{n} min read", { n: post.readMinutes })}
            </p>
          </header>

          <article>
            <Markdown source={post.body} />
          </article>

          {cta && (
            <aside className="rounded-xl border border-brand/20 bg-brand-soft p-5">
              <p className="text-sm text-ink">
                {post.ctaLabel || t("Interested? See what's currently available in our store.")}
              </p>
              <Link
                href={cta}
                className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 text-sm font-medium text-white hover:bg-brand/90"
              >
                {t("Search “{q}” in the store →", { q: post.ctaQuery })}
              </Link>
            </aside>
          )}
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}
