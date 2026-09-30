# Jesun.Code spec v1.5: the site builds itself

Status: ROADMAP rung, scoped 2026-09-30 by Anvil. Founder directive
(2026-09-29): a static site generator written in Jesun.Code itself that
emits the whole `docs/` tree (pages, blog, brand kit, sitemap.xml,
robots.txt, JSON-LD, llms.txt, icons). Founder's law: one language, all
solutions. The Python bridge carries no domain logic: `sitegen` is pure
text generation. The single raw primitive it imports is `os.makedirs`
(through the same `builtins` boundary the `react` and `php` scaffolders
drew in v1.4), used only to create parent folders, because
`write ... to file` requires the parent folder to exist (spec v0.4).
Every rule, every error, every emitted byte is Jesun.Code.

Honest framing: the generator runs on the `jesun` interpreter
(bootstrap or self-hosted). It emits the `docs/` tree to a build folder;
the live Pages deployment stays the founder-escalated pipeline item and
is unchanged by this work.

## 1. What the generator is (and is not)

The generator is `packages/sitegen/sitegen.jc`, a jpm package used with
`bring in "sitegen"`. It does not invent the site's content. Page bodies
are HTML strings authored per `docs/DESIGN-SYSTEM.md` (tokens,
components, the add-a-page recipe). The generator composes the chrome
around them: doctype, head with SEO plumbing, nav, footer, JSON-LD,
plus the machine files (sitemap.xml, robots.txt, llms.txt) and the blog
index. The design-system tokens live in the authored CSS; the generator
emits links to it, never the tokens themselves.

Why this split: the acceptance for v1.5 is a page-for-page diff against
the hand-built rebrand (commit f7be3f8). A generator that also rewrote
prose would make that diff meaningless. Chrome generation is mechanical
and diffable; prose stays human.

## 2. Page model

A page is a table with these keys:

- `path`: relative path under the build base, e.g. `"faq.html"` or
  `"blog/index.html"`. Sandboxed: must be relative, must not contain
  `..`, must end in `.html` (see section 7).
- `title`: page `<title>`, text, required.
- `description`: meta description, text, required.
- `canonical`: full canonical URL, text, required.
- `body`: the page's `<main>` content (plus any page-specific sections
  outside `<main>`, e.g. a hero above the fold), HTML text, required.
- `nav`: which nav variant, `"root"` (homepage, anchor links) or
  `"sub"` (relative links). Optional, defaults to `"root"`.
- `root_prefix`: `"./"` for root pages, `"../"` for pages one level
  down, e.g. the blog index. Optional, defaults from nav.
- `jsonld`: a pre-rendered JSON-LD string for the page, or `nothing`.
  Optional. The generator injects it verbatim; it does not build JSON
  (the `template` and `html` packages escape; JSON stays authored so
  `softwareVersion` strings are exact).
- Chrome overrides (all optional; added during the docs/ migration so
  the generator reproduces the hand-built tree byte for byte):
  - `nav_links`: list of `{label, href}` link tables replacing the
    nav variant's link set (the rebrand ships five hand-tuned sets).
  - `version`: page-level version pill, defaults to the site version
    (the migration used it to carry stale `v1.3.0` pills byte-faithfully
    before the deliberate bump to `v1.4.0`).
  - `github_svg`: `true` gives the nav GitHub CTA the inline Octocat
    svg the homepage ships; default is the plain text button.
  - `og_title`, `og_description`, `twitter_title`,
    `twitter_description`, `twitter_card`: per-page SEO overrides,
    defaulting to title/description/`"summary"`.
  - `og_type`: Open Graph type, defaults to `"website"` (`"article"`
    on blog posts, `"profile"` on the about page).
  - `article_date`: emits `<meta property="article:published_time">`
    when present.
  - `no_twitter_meta`: `true` omits the twitter:title/description tags
    (blog posts and the FAQ ship only the card).
  - `tagline`: footer tagline override; `foot_stroke`: `true` gives the
    footer brand mark the white-stroke svg variant; `foot_product`,
    `foot_resources`, `foot_project`: link-table lists replacing the
    footer columns (per-page relative hrefs).
  - `dup_head_icons`, `gap_after_body_tag`, `gap_before_jsonld`: `true`
    reproduces hand-built whitespace/duplication warts byte-faithfully
    (kept honest: each is one flag in page data, deletable in one line).

A site is a table with these keys:

- `base`: build folder, e.g. `"./build"`. Sandboxed the same way as
  page paths: relative, no `..`.
- `name`: site name for the nav brand, e.g. `"Jesun<em>.Code</em>"`.
- `site_url`: base URL, e.g. `"https://jesunahmadushno.github.io/jesun-code"`.
- `version`: version pill text, e.g. `"v1.4.0"`.
- `github_url`: repository URL for the nav CTA and footer.
- `pages`: a list of page tables, in build order.
- `posts`: a list of blog-post tables (title, date, slug, summary),
  newest first, for the blog index. Optional.
- `llms`: a table (name, summary, sections) for llms.txt. Optional.

## 3. Chrome builders (pure Jesun.Code)

All builders return text. All user-facing content is escaped with
`escape_html` from the `html` package; `body` and `jsonld` pass through
raw because they are authored HTML (the diff acceptance requires byte
fidelity, so the generator must never re-escape authored markup).

- `sitegen_head with page and site`: the full `<head>` block. Meta
  charset, viewport, title, description, Open Graph (type website,
  site_name, title, description, url = site_url + page path),
  Twitter card (summary), canonical, theme-color `#0C9463`,
  favicon/app-icon links (svg + 32 + 16 + apple-touch) prefixed with
  `root_prefix + "assets/icons/"`, stylesheet
  `root_prefix + "assets/style.css"`, and the `jsonld` script block
  when present.
- `sitegen_nav with page and site`: the `<header class="nav">` block.
  Brand mark (the Forest `>_ ` svg, aria-hidden), brand name, nav
  links (root variant: `#language`, `#brains`, `blog/`, `faq.html`,
  `about.html`, `community.html`, `brand/`, `#install`, `#roadmap`;
  sub variant: `../` home, `../#language`, `../#install`,
  `../faq.html`, `../about.html`, `../community.html`,
  `../brand/`), version pill, GitHub CTA, mobile toggle button.
  The link sets are data (a table in the package), not two templates.
- `sitegen_footer with site`: the `<footer>` block: brand + tagline
  ("The programming language that reads like plain English. Designed
  and built by Jesun Ahmad Ushno. MIT licensed. Amazing is the
  minimum."), three columns (Product, Resources, Project) with the
  same links the rebrand ships, and the copyright line.
- `sitegen_page with page and site`: the full document:
  `<!DOCTYPE html>\n<html lang="en">\n` + head + nav + body + footer +
  the JSON-LD script block when the page has one +
  `<script src="{root_prefix}assets/app.js"></script>` (the nav toggle
  lives in `assets/app.js`) + `</body>\n</html>\n`.

## 4. Blog index builder

- `sitegen_blog_index with posts and site`: renders the blog landing
  `<main>` from post tables. Each card: date, title linked to
  `slug + ".html"`, summary. The card markup is one authored template
  string in the package; posts supply only the four fields. Returns
  the body HTML so it can feed `sitegen_page` like any other page.

Post tables need `title`, `date` (text, e.g. `"2026-09-26"`), `slug`
(e.g. `"v1.4.0-interop"`), `summary`. Missing `slug` or `date` is a
failure (section 7); the index must never link to a page that cannot
exist.

## 5. Machine files

- `sitegen_sitemap with pages and site`: `sitemap.xml` listing every
  page path as `site_url + "/" + path`, with `<lastmod>` from the
  page's `date` key when present. XML prolog verbatim; URLs escaped
  for XML (`&amp;` only; URLs in this tree contain no other specials).
- `sitegen_robots with site`: `robots.txt`: `User-agent: *`,
  `Allow: /`, `Sitemap: <site_url>/sitemap.xml`.
- `sitegen_llms with site`: `llms.txt` from the site's `llms` table:
  `# <name>`, `> <summary>`, then `## ` section headers with their
  bodies. Plain text, no HTML.

## 6. The build driver

- `sitegen_build with site`: validates the site table, renders every
  page, creates parent folders (`os.makedirs` via the bridge,
  `exist_ok=true`), writes each file with `write ... to file`,
  writes `sitemap.xml`, `robots.txt`, `llms.txt` at the base, and
  gives back the list of written paths. It prints one line per file
  (`show`) so a run is auditable: `"wrote " + path`.

The driver is idempotent: rebuilding the same site table gives
byte-identical output. Byte identity is a v1.5 invariant and is tested
(see section 8).

## 7. Failure shapes (plain English, line numbers, no tracebacks)

`sitegen` adds no new syntax and no new keywords, so there is nothing
to fuzz at the grammar level. Its contract is the failure table; every
row is a differential test in `tests/test_sitegen.py`:

1. Site `base` missing or not text: "the site needs a base folder, but
   this one is missing."
2. `base` contains `..` or is absolute: "the base folder has to stay
   inside this folder; `..` and absolute paths are not allowed."
3. `pages` empty: "the site has no pages to build."
4. Page `title` missing/empty: "a page is missing its title."
5. Page `description` missing: "a page is missing its description."
6. Page `body` missing: "a page is missing its body."
7. Page `path` with `..`, absolute, or not ending in `.html`:
   "the page path has to be a relative .html path inside the site."
8. Blog post missing `slug` or `date`: "a blog post is missing its
   slug or its date."

Path sandbox detail: the check runs before any write, and `makedirs`
never receives a path that failed the check. No `..` traversal, ever.

## 8. Tests

`tests/test_sitegen.py`, differential like `test_interop.py`: every
case runs through both interpreters (`jesun.py` and `jesun.jc`) via
`InlineSandbox` and must agree byte for byte. Coverage: each builder's
output shape (doctype, head tags, nav links both variants, footer
columns), each failure row, the sandbox, sitemap/robots/llms.txt text,
the blog index card markup, and build idempotency (build twice into
two folders, outputs byte-identical).

## 9. Example

`examples/sitegen_demo.jc`: builds a three-page sample site
(home + faq + blog index with two posts) into `./sitegen_demo_out`
through the interpreter, prints the written paths, and asserts the
head carries the title and the sitemap lists all three pages. The demo
is the v1.5 proof of life; it must also pass through the self-hosted
interpreter.

## 10. Milestone acceptance (v1.5 ships only when all hold)

1. Page-for-page diff of the 13 rebrand pages: generator output with
   the authored bodies equals the hand-built files byte for byte.
2. Every page returns 200 from a local server; zero broken internal
   links (the DESIGN-SYSTEM.md link-check snippet).
3. No stale version strings; no em dashes (the same QA checklist).
4. All SEO/AEO/GEO plumbing intact: per-page title/meta, OG/Twitter
   cards, canonicals, sitemap.xml, robots.txt, llms.txt, JSON-LD,
   FAQ page, semantic HTML.

When those hold, the `docs/` tree flips to generated output, the
version bumps to v1.5.0, the Linux binary rebuilds, and the release
cuts with the Linux binary. Until then, v1.5 is one shipped sprint
(this one: spec + core package + differential suite + demo) and the
page-migration sprint stays next.

## 11. Amendments

### 2026-09-30: machine-file fidelity (found in re-verification)

Re-running the migration driver through both interpreters on
2026-09-30 reproduced all 14 pages byte-identically, but the three
machine files diverged from the hand-built tree: the generator's
`sitemap.xml` used a derived `<lastmod>` format while the hand-built
file carries authored `<changefreq>`/`<priority>` entries; `robots.txt`
missed its trailing newline; `llms.txt` was a stub because the
extractor never fed the hand-built document in. The package now models
what the hand-built tree actually says:

- `sitegen_sitemap with pages and site`: when the site carries
  `sitemap_urls` (a list of tables with `url`, `changefreq`,
  `priority`), it renders one single-line `<url>` per entry, in order,
  escaping `&` as `&amp;`. Without `sitemap_urls` it falls back to the
  derived format (loc + `<lastmod>` from the page `date`). The file
  ends with a newline.
- `sitegen_robots with site`: unchanged shape, now ends with a newline.
- `sitegen_llms with site`: when the site carries `llms_body`
  (authored text, carried verbatim like `jsonld`), it is returned as
  is. Without it, the structured path (`llms_name`, `summary`,
  `llms_sections`) still builds a fresh document.
- The site data model (section 2) uses the flat keys `llms_name`,
  `summary`, `llms_sections`, plus `llms_body` and `sitemap_urls`;
  there is no `llms` table.
- Deliberate improvement 3 (logged, same as 1 and 2): the v0.4.0 post
  shipped a doubled footer (one copy carried in the body with a stale
  v1.3.0 span, one from the chrome). The extractor now ends the body
  at the first `<footer>` and parses the chrome footer from the last
  one, so the page emits a single footer with the current version.

Milestone acceptance item 1 now covers all 17 generated files (14
pages plus sitemap.xml, robots.txt, llms.txt).
