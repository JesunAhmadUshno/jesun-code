# Jesun.Code Design System (maintainer's guide)

Version 2.0, 2026-09-28. The site's visual system lives in `docs/assets/style.css`.
Tokens are adapted from the Brimwood Innovation v1.0 brand kit, tweaked for
Jesun.Code. The public brand kit page is `docs/brand/`.

## Tokens (CSS variables in `:root`)

| Token | Hex | Use |
|---|---|---|
| `--emerald` | #0C9463 | Primary: buttons, links, accents |
| `--emerald-deep` | #075E40 | Hovers, dark bands, emphasized text |
| `--forest` | #0A3D2B | Footer, code blocks, the mark |
| `--signal` | #34E08E | Tiny highlights only. Never behind text |
| `--mint` | #DDF5E9 | Callouts, tags, soft panels, pills |
| `--ink` | #121A16 | Body text, headings |
| `--stone` | #5B6862 | Secondary text, captions |
| `--paper` | #F6F8F7 | Page background |
| `--line` | #E2E9E6 | Hairline borders |
| `--code-bg` | #0A3D2B | Code block background (Forest) |

Never introduce a new color. If a design needs one, extend this table first and
update `docs/brand/index.html` to match.

## Type

- Plus Jakarta Sans for everything, loaded from `docs/assets/fonts/PlusJakartaSans.ttf`
  via `@font-face` (variable, weights 200-800, `font-display: swap`). No web-font
  dependency for code: code uses the `ui-monospace` system stack (`--mono`).
- Display/H1: 800 weight, -0.025em tracking. Body: 17px/1.65. Captions: 600 weight Stone.

## Components (classes)

- `.nav` sticky with blur, `.brand-mark` (inline SVG mark), `.version-pill`
- `.btn`, `.btn-primary` (Emerald), `.btn-secondary` (outline), `.btn-sm`
- `.hero` (dot-grid pattern, CSS only), `.eyebrow` pill, `.term` (Forest terminal)
- `.stats` strip, `.section` / `.section.alt`, `.kicker`, `.sub`
- `.code-card` + `pre.code` (`.kw` Emerald-signal, `.st` string, `.nm` number, `.cm` comment)
- `.cheatsheet` / `.sheet-row`, `.grid` / `.card`, `.brains` / `.brain`
- `.tabs` / `.tab` / `.tab-panel`, `.copy` button, `.run-hints`
- `.timeline` / `.tl` (`.done`, `.now`, `.next`), `.cta`
- `footer` (Forest) with `.foot`, `.foot-cols`, `.foot-base`
- Interior pages: `.page`, `.page-head`, `.prose` (article typography), `.callout`,
  `.faq-list` (details accordions), `.post-item` (blog index), `.post` (blog article)
- Brand page: `.swatches` / `.swatch`, `.type-scale`, `.logo-stage`, `.clearspace`, `.downloads`
- Motion: `.reveal` (disabled under `prefers-reduced-motion`)

## Adding a page

1. Copy the head block from `about.html` (adjust title, description, OG/Twitter,
   canonical). Keep theme-color `#0C9463` and the four icon links.
2. Copy the nav header (adjust relative paths: `../` prefix for pages under a
   subdirectory). Every page links Brand in nav and footer.
3. Use `.page` + `.page-head` + `.prose` for content. Keep every JSON-LD block.
4. Add the page to `docs/sitemap.xml`. Blog posts also go in `docs/blog/index.html`.

## Hard rules

- No em dash character anywhere, in prose or in code comments. Use commas,
  colons, parentheses, or hyphens. Check with `grep -rn $'\u2014' docs/`.
- No lorem ipsum, no placeholder text. No mockups presented as done.
- Version strings: v1.3.0 is current until a release says otherwise. Never invent
  version numbers, test counts, or release URLs; copy them from the repo.
- Never restyle the mark: Forest rounded square, Signal Green `>_` glyph.
- OG/social images belong to the design team; never generate them here.
- Never touch `.github/`.

## QA checklist (run before every push)

1. `grep -rn $'\u2014' docs/` returns nothing.
2. Every `href`/`src` in every page resolves to a file that exists (relative to
   the page's directory). See the link-check snippet below.
3. No stale version strings: `grep -rn "v1\.[12]\.0" docs/*.html docs/blog/*.html`
   should only show historical mentions (roadmap, old posts), never the current
   version pill, footer, or JSON-LD `softwareVersion`.
4. No "private repo" wording: the repo is public.
5. `node --check docs/assets/app.js` passes; no console errors from missing assets.
6. sitemap.xml lists every HTML page, including `brand/`.
7. Spot-check mobile width (680px): nav toggle opens, grids collapse to one column.

Link-check snippet:

```bash
cd ~/workspace/jesun-code/docs
python3 - <<'EOF'
import re, os
from html.parser import HTMLParser
missing = []
for root, _, files in os.walk('.'):
    for f in files:
        if not f.endswith('.html'):
            continue
        p = os.path.join(root, f)
        class P(HTMLParser):
            def handle_starttag(self, tag, attrs):
                a = dict(attrs)
                for k in ('href', 'src'):
                    v = a.get(k)
                    if v and not v.startswith(('http', 'mailto:', '#', 'data:')):
                        target = os.path.normpath(os.path.join(os.path.dirname(p), v))
                        if not os.path.exists(target):
                            missing.append((p, v))
        P().feed(open(p, encoding='utf-8').read())
print("MISSING:", missing if missing else "none")
EOF
```
