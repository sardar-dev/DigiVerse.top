# DigiVerse SEO Article Guide (rules for every new blog post)

Reference article that follows all of these rules: `https://digiverse.top/meta-muse-ai-alternatives`
(file: `content/blog/meta-muse-ai-alternatives.md`, banner: `public/blog/meta-muse-ai-alternatives.jpg`).

Goal of every article: answer exactly what the searcher wants, honestly, in easy words, and be technically clean so Google can index it and show it well.

---

## 0. Hard rules before you touch anything (shared repo)

- Another AI also works on this repo. Never delete, revert or overwrite its work.
- Prefer NEW files. Make minimal edits to shared files.
- Before pushing: `git fetch origin main`, fast-forward or rebase, then push. Never force-push.
- Pre-existing facts on the site must stay consistent across pages (for example Muse delivery time is **10–15 minutes**, price shown comes from the live catalog). If you change a fact in one place, grep and fix the others.

---

## 1. Pick the topic and keyword

1. Search the keyword (WebSearch). Look at who ranks, what type of pages they are (store, blog, forum, official site) and what the searcher actually wants (intent).
2. Fetch 3–4 of the top pages (WebFetch) and note: headings, what they cover, what they miss, which claims are only vendor marketing.
3. Check for ambiguity. Example: "Muse" can mean Meta Muse, muse.ai (video) or Sudowrite Muse. If the keyword is ambiguous, add a short "Which X do you mean?" section near the top.
4. Choose **one main keyword** and 3–8 **sub keywords**. Prefer low-competition, clear-intent phrases. The main keyword goes in the title, slug, first sentence and one H2. Sub keywords go in the frontmatter `keywords`, the H2/H3 headings and FAQ questions, used naturally.
5. Do not write a second article for a keyword we already cover. Link to the existing one instead.

---

## 2. Content rules (what makes it rank AND helps people)

- **Answer first.** The first 2–3 sentences give the direct answer to the search query. Details come after.
- **Match intent.** Only include what someone searching that phrase wants. No filler, no history lessons.
- **Easy words.** Short sentences, simple vocabulary, explain any jargon in a few words. Write like a helpful person, not a brochure. No hype words ("revolutionary", "game-changing").
- **Honest.** Hedge anything unverified ("reviewers report", "as of November 2026"). Never invent prices, features, dates, benchmarks or quotes. If sources disagree, say so. Never present vendor claims as fact.
- **Disclose interest.** DigiVerse sells digital products and is not affiliated with Meta, OpenAI, Google etc. If the article touches something we sell, say so once, clearly.
- **Be useful, not salesy.** Recommend alternatives or free options when they truly fit the reader. One honest mention of a DigiVerse page near the end is enough. Do not push the store in every section.
- **Real structure:** one clear H1 (the title), then H2 sections that match what people ask. Use short lists where it helps scanning. Add a "Quick picks" or "Short answer" block for long articles.
- **Length:** as long as it needs to be to be complete, usually 1,500–2,200 words for competitive topics, 700–1,000 for narrow questions. Never pad.
- **Freshness:** put a real date in frontmatter. Time-sensitive facts (prices, availability) need "as of <month year>" and a note to check the official page.
- **Safety:** no bypass/VPN/cracked-account advice, no password sharing, no medical/legal/financial claims beyond cautious general information.
- **Sources:** end with a `## Sources` list of the pages actually used, as `[Title](URL)` links.
- **Copyright:** never copy text from competitors. Paraphrase facts, write your own explanations.

---

## 3. On-page SEO rules

| Item | Rule |
|---|---|
| Title (frontmatter `title`) | **Max 48 characters.** The site adds ` \| DigiVerse` (12 chars), so the full title stays under 60 and is not cut off in Google. Main keyword near the start. Include the year only if it helps. No dates like "November" that go stale. |
| Description | 140–155 characters. Contains the main keyword, a concrete benefit and no quotes/line breaks. |
| Slug (file name) | Lowercase, hyphens, 3–6 words, contains the main keyword, no stop-word clutter, no dates. The slug is the public URL: `digiverse.top/<slug>`. Example: `meta-muse-ai-alternatives`. The file name `content/blog/<slug>.md` is the slug. |
| H1 | Only one. The template renders it from `title`; do not write `# ` in the body. |
| H2/H3 | Use `##` and `###` only. Put keywords naturally. H2s get anchor ids and an automatic "In this article" contents list (shown when there are 5 or more H2s). |
| Keywords | `keywords:` in frontmatter, comma separated, 6–9 items, lowercase. |
| Internal links | At least 3–5 links to relevant existing posts/pages, written with descriptive anchor text (not "click here"). Also add a link TO the new article from 2–3 related existing posts (mine only, or tiny edits to others) and from `pages/muse-ai-tokens.js` when relevant. Check every `/blog/...` link resolves. |
| External links | Only to sources you used. Official sources preferred. |
| FAQ | End the body with `## Frequently asked questions` and 5–7 `### Question?` headings, each followed by a 1–3 sentence plain-text answer. The template turns this into FAQPage structured data automatically, so **keep exactly this heading text and format**, and no markdown formatting inside the answers except links. |
| Images | Markdown renderer has no image support and no tables. Use lists instead of tables. The only image is the banner (see section 5). |
| Duplicates | Never publish two pages targeting the same keyword. |

---

## 4. Frontmatter template

Create `content/blog/<slug>.md`:

```
---
title: <max 48 chars, main keyword first>
description: <140-155 chars>
date: YYYY-MM-DD
updated: YYYY-MM-DD
keywords: main keyword, sub keyword 1, sub keyword 2, ...
image: /blog/<slug>.jpg
image_alt: <short plain description of the banner>
cta_query: <store search term, optional>
cta_label: <one friendly line for the end box, optional>
---
```

Notes:
- `draft: true` keeps a post unpublished.
- `cta_query` creates a box at the end linking to `/?q=<term>#catalog`. For Muse topics prefer linking to `/muse-ai-tokens` inside the text and set `cta_query: muse`.
- **All posts are served at the domain root: `https://digiverse.top/<slug>` (no `/blog/` in the URL).** This is automatic. `next.config.js` reads the file names in `content/blog/` and creates the rewrite and the 308 redirect from the old `/blog/<slug>` URL. Nothing to configure per post.
- Internal links between posts must use `/<slug>`, never `/blog/<slug>`. Only the blog index page lives at `/blog`.
- The slug must not equal an existing page or product slug (a file in `pages/` with that name is skipped by the config). Pick a specific, keyword-based slug.
- The banner file still lives in `public/blog/<slug>.jpg` (it is an asset, not a page link).
- Locale note: posts are English-only. The template already makes `/ar/...` and `/ru/...` copies canonical to the English page. Do not change that.

---

## 5. Banner image (every article gets one)

- File: `public/blog/<slug>.jpg`, exactly **1200 x 630**, JPEG, **under 60 KB** (aim 40–50 KB, progressive, quality about 70). It is served from Vercel's static CDN, so no database or extra hosting.
- Same file is the Open Graph / Twitter card image. The template already sets width/height, `fetchPriority="high"` and `alt`.
- Design: dark navy gradient background, big readable title (2 lines max), a short subtitle, small `DIGIVERSE.TOP` chip, and a simple abstract graphic on the right. Keep important text inside the left 60% so it is not cropped.
- **Never** use other companies' logos, mascots or screenshots. Original shapes only.
- Always open the generated image and check text does not overlap shapes.
- Generator: Python Pillow, draw at 2x and downsample (LANCZOS) for sharp edges. Fonts available at `/usr/share/fonts/opentype/inter/Inter-Bold.otf` and `Inter-Medium.otf`.

Minimal approach:

```python
from PIL import Image, ImageDraw, ImageFont
W,H,S=1200,630,2
img=Image.new("RGB",(W*S,H*S),(9,12,28)); d=ImageDraw.Draw(img)
# 1) vertical gradient  2) blurred glow circle on the right  3) simple node/graphic
# 4) title text left, subtitle, DIGIVERSE.TOP chip
img.resize((W,H),Image.LANCZOS).save("public/blog/<slug>.jpg",quality=70,optimize=True,progressive=True)
```

---

## 6. Technical checklist before pushing

1. `npx next build` passes with no errors.
2. Run `npx next start -p <port>` and curl the page. Confirm:
   - `<title>` is under 60 chars with the brand suffix and has the main keyword
   - one `<h1>`, meta description present
   - `<link rel="canonical">` is the English URL of the post
   - `og:image` points to the banner (`https://digiverse.top/blog/<slug>.jpg`) and `twitter:card` is `summary_large_image`
   - JSON-LD has `Article`, `BreadcrumbList` and `FAQPage` (7 questions if you wrote 7)
   - the banner `<img>` has width/height/alt
   - the contents list and heading ids appear when there are 5+ H2s
3. The post appears on `/blog` and in `/sitemap.xml`.
4. All internal links resolve (no 404).
5. Re-read the text for: wrong facts, made-up numbers, broken sentences, leftover placeholders, repeated words, unexplained jargon.
6. Commit, `git fetch origin main`, rebase if needed, push.
7. Tell the owner to open Google Search Console, run URL Inspection on the new URL and click Request indexing.

---

## 7. After publishing

- Add internal links from older related posts to the new one.
- Re-check time-sensitive facts monthly and bump `updated:` when you do.
- Do not keep editing the title, slug or URL after Google has indexed the page. Changing them resets what Google has learned.
- Backlinks matter most for ranking: share the article in relevant communities, Telegram channel, forums and social posts. Pinterest links are nofollow, so they bring traffic, not ranking power.

---

## 8. Quick mistakes list (all of these were found and fixed before)

- Title too long, so Google cuts it off.
- Dated titles ("November 2026") that go stale.
- Article with no links pointing to it.
- English article published under `/ar` and `/ru` with Arabic/Russian language tags and RTL layout.
- Unverified claims about companies, prices or features presented as fact.
- Delivery time or price written differently on different pages.
- Big or heavy banner images, or a banner with overlapping text.
- Copying a competitor's structure and wording instead of answering the searcher better.

