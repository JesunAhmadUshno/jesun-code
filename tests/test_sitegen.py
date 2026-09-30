"""v1.5 site generator milestone: differential tests for the sitegen package.

Every case runs through the bootstrap interpreter AND the self-hosted
Jesun.Code walker; the outputs must match byte for byte. No new syntax
lands in v1.5, so grammar-fuzzer coverage is unchanged; the contract is
the builder output shapes, the failure table (spec v1.5 section 7), the
path sandbox, and build idempotency.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from selfhost_harness import InlineSandbox, LINE_RE  # noqa: E402

HDR = 'bring in "sitegen"\n'


class SitegenCase(unittest.TestCase):
    def check(self, src, expected):
        box = InlineSandbox()
        try:
            boot, selfhost = box.run(src)
        finally:
            box.close()
        self.assertEqual(
            (selfhost[0], LINE_RE.sub("Line N", selfhost[1])),
            (boot[0], LINE_RE.sub("Line N", boot[1])),
            f"differ:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
        )
        self.assertEqual(boot[0], 0, f"bootstrap failed: {boot!r}")
        self.assertEqual(boot[1], expected)

    def check_fails(self, src, message):
        box = InlineSandbox()
        try:
            boot, selfhost = box.run(src)
        finally:
            box.close()
        self.assertEqual(
            (selfhost[0], LINE_RE.sub("Line N", selfhost[1])),
            (boot[0], LINE_RE.sub("Line N", boot[1])),
            f"differ:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
        )
        self.assertNotEqual(boot[0], 0, f"expected failure: {boot!r}")
        self.assertIn(message, boot[1])


class HeadTest(SitegenCase):

    def test_head_exact(self):
        self.check(
            'bring in "sitegen"\npage is a new table\npage["path"] is "faq.html"\npage["title"] is "FAQ"\npage["description"] is "Questions."\npage["canonical"] is "https://example.com/faq.html"\npage["body"] is "<main><h1>FAQ</h1></main>"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com"\nshow sitegen_head with page and site\n',
            '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>FAQ</title>\n<meta name="description" content="Questions.">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="Jesun.Code">\n<meta property="og:title" content="FAQ">\n<meta property="og:description" content="Questions.">\n<meta property="og:url" content="https://example.com/faq.html">\n<meta name="twitter:card" content="summary">\n<meta name="twitter:title" content="FAQ">\n<meta name="twitter:description" content="Questions.">\n<link rel="canonical" href="https://example.com/faq.html">\n<meta name="theme-color" content="#0C9463">\n<link rel="icon" type="image/svg+xml" href="./assets/icons/favicon.svg">\n<link rel="icon" type="image/png" sizes="32x32" href="./assets/icons/favicon-32.png">\n<link rel="icon" type="image/png" sizes="16x16" href="./assets/icons/favicon-16.png">\n<link rel="apple-touch-icon" sizes="180x180" href="./assets/icons/apple-touch-icon.png">\n<link rel="stylesheet" href="./assets/style.css">\n',
        )

    def test_head_sub_prefix(self):
        self.check(
            'bring in "sitegen"\npage is a new table\npage["path"] is "faq.html"\npage["title"] is "FAQ"\npage["description"] is "Questions."\npage["canonical"] is "https://example.com/faq.html"\npage["body"] is "<main><h1>FAQ</h1></main>"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com"\npage["root_prefix"] is "../"\nshow sitegen_head with page and site\n',
            '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>FAQ</title>\n<meta name="description" content="Questions.">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="Jesun.Code">\n<meta property="og:title" content="FAQ">\n<meta property="og:description" content="Questions.">\n<meta property="og:url" content="https://example.com/faq.html">\n<meta name="twitter:card" content="summary">\n<meta name="twitter:title" content="FAQ">\n<meta name="twitter:description" content="Questions.">\n<link rel="canonical" href="https://example.com/faq.html">\n<meta name="theme-color" content="#0C9463">\n<link rel="icon" type="image/svg+xml" href="../assets/icons/favicon.svg">\n<link rel="icon" type="image/png" sizes="32x32" href="../assets/icons/favicon-32.png">\n<link rel="icon" type="image/png" sizes="16x16" href="../assets/icons/favicon-16.png">\n<link rel="apple-touch-icon" sizes="180x180" href="../assets/icons/apple-touch-icon.png">\n<link rel="stylesheet" href="../assets/style.css">\n',
        )

    def test_head_og_url_override(self):
        self.check(
            'bring in "sitegen"\npage is a new table\npage["path"] is "faq.html"\npage["title"] is "FAQ"\npage["description"] is "Questions."\npage["canonical"] is "https://example.com/faq.html"\npage["body"] is "<main><h1>FAQ</h1></main>"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com"\npage["og_url"] is "https://example.com/custom"\nshow sitegen_head with page and site\n',
            '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>FAQ</title>\n<meta name="description" content="Questions.">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="Jesun.Code">\n<meta property="og:title" content="FAQ">\n<meta property="og:description" content="Questions.">\n<meta property="og:url" content="https://example.com/custom">\n<meta name="twitter:card" content="summary">\n<meta name="twitter:title" content="FAQ">\n<meta name="twitter:description" content="Questions.">\n<link rel="canonical" href="https://example.com/faq.html">\n<meta name="theme-color" content="#0C9463">\n<link rel="icon" type="image/svg+xml" href="./assets/icons/favicon.svg">\n<link rel="icon" type="image/png" sizes="32x32" href="./assets/icons/favicon-32.png">\n<link rel="icon" type="image/png" sizes="16x16" href="./assets/icons/favicon-16.png">\n<link rel="apple-touch-icon" sizes="180x180" href="./assets/icons/apple-touch-icon.png">\n<link rel="stylesheet" href="./assets/style.css">\n',
        )


class NavTest(SitegenCase):

    def test_nav_root_exact(self):
        self.check(
            'bring in "sitegen"\npage is a new table\npage["path"] is "faq.html"\npage["title"] is "FAQ"\npage["description"] is "Questions."\npage["canonical"] is "https://example.com/faq.html"\npage["body"] is "<main><h1>FAQ</h1></main>"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com"\nshow sitegen_nav with page and site\n',
            '<header class="nav" id="nav">\n  <div class="nav-inner">\n    <a class="brand" href="./" aria-label="Jesun.Code home">\n      <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#0A3D2B"/><text x="20" y="27" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-weight="700" font-size="17" fill="#34E08E">&gt;_</text></svg></span>\n      <span class="brand-name">Jesun<em>.Code</em></span>\n    </a>\n    <nav class="nav-links" aria-label="Primary">\n      <a href="#language">Language</a>\n      <a href="#brains">AI Brains</a>\n      <a href="blog/">Blog</a>\n      <a href="faq.html">FAQ</a>\n      <a href="about.html">About</a>\n      <a href="community.html">Community</a>\n      <a href="brand/">Brand</a>\n      <a href="#install">Install</a>\n      <a href="#roadmap">Roadmap</a>\n    </nav>\n    <div class="nav-cta">\n      <span class="version-pill">v1.4.0</span>\n      <a class="btn btn-secondary btn-sm" href="https://github.com/JesunAhmadUshno/jesun-code" target="_blank" rel="noopener">GitHub</a>\n    </div>\n    <button class="nav-toggle" id="navToggle" aria-label="Menu" aria-expanded="false">\n      <span></span><span></span><span></span>\n    </button>\n  </div>\n</header>\n',
        )

    def test_nav_sub_custom(self):
        self.check(
            'bring in "sitegen"\npage is a new table\npage["path"] is "blog/index.html"\npage["title"] is "Blog"\npage["description"] is "Notes."\npage["canonical"] is "https://example.com/blog/"\npage["body"] is "<main>blog</main>"\npage["nav"] is "sub"\npage["root_prefix"] is "../"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com"\nsite["name"] is "Jesun<em>.Code</em>"\nsite["version"] is "v9.9.9"\nsite["github_url"] is "https://github.com/example/repo"\nshow sitegen_nav with page and site\n',
            '<header class="nav" id="nav">\n  <div class="nav-inner">\n    <a class="brand" href="../" aria-label="Jesun.Code home">\n      <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#0A3D2B"/><text x="20" y="27" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-weight="700" font-size="17" fill="#34E08E">&gt;_</text></svg></span>\n      <span class="brand-name">Jesun<em>.Code</em></span>\n    </a>\n    <nav class="nav-links" aria-label="Primary">\n      <a href="../">Home</a>\n      <a href="../#language">Language</a>\n      <a href="../#install">Install</a>\n      <a href="../faq.html">FAQ</a>\n      <a href="../about.html">About</a>\n      <a href="../community.html">Community</a>\n      <a href="../brand/">Brand</a>\n    </nav>\n    <div class="nav-cta">\n      <span class="version-pill">v9.9.9</span>\n      <a class="btn btn-secondary btn-sm" href="https://github.com/example/repo" target="_blank" rel="noopener">GitHub</a>\n    </div>\n    <button class="nav-toggle" id="navToggle" aria-label="Menu" aria-expanded="false">\n      <span></span><span></span><span></span>\n    </button>\n  </div>\n</header>\n',
        )

    def test_nav_bad_variant_fails(self):
        self.check_fails(
            'bring in "sitegen"\npage is a new table\npage["path"] is "faq.html"\npage["title"] is "FAQ"\npage["description"] is "Questions."\npage["canonical"] is "https://example.com/faq.html"\npage["body"] is "<main><h1>FAQ</h1></main>"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com"\npage["nav"] is "sideways"\nshow sitegen_nav with page and site\n',
            'the page nav has to be "root" or "sub".',
        )


class FooterTest(SitegenCase):

    def test_footer_exact(self):
        self.check(
            'bring in "sitegen"\npage is a new table\npage["path"] is "faq.html"\npage["title"] is "FAQ"\npage["description"] is "Questions."\npage["canonical"] is "https://example.com/faq.html"\npage["body"] is "<main><h1>FAQ</h1></main>"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com"\nshow sitegen_footer with site\n',
            '<footer>\n  <div class="foot">\n    <div>\n      <div class="foot-brand">\n        <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#0A3D2B"/><text x="20" y="27" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-weight="700" font-size="17" fill="#34E08E">&gt;_</text></svg></span>\n        <span>Jesun<em>.Code</em></span>\n      </div>\n      <p class="foot-tag">The programming language that reads like plain English. Designed and built by Jesun Ahmad Ushno. MIT licensed. Amazing is the minimum.</p>\n    </div>\n    <div class="foot-cols">\n      <div>\n        <h4>Product</h4>\n        <a href="#language">Language</a>\n        <a href="#brains">AI Brains</a>\n        <a href="#install">Install</a>\n        <a href="#roadmap">Roadmap</a>\n      </div>\n      <div>\n        <h4>Resources</h4>\n        <a href="blog/">Blog</a>\n        <a href="faq.html">FAQ</a>\n        <a href="brand/">Brand kit</a>\n        <a href="https://github.com/JesunAhmadUshno/jesun-code/releases" target="_blank" rel="noopener">Releases</a>\n      </div>\n      <div>\n        <h4>Project</h4>\n        <a href="about.html">About</a>\n        <a href="community.html">Community</a>\n        <a href="https://github.com/JesunAhmadUshno/jesun-code" target="_blank" rel="noopener">GitHub</a>\n        <a href="https://github.com/JesunAhmadUshno/jesun-code/blob/main/ROADMAP.md" target="_blank" rel="noopener">Roadmap doc</a>\n      </div>\n    </div>\n  </div>\n  <div class="foot-base">\n    <div class="foot-base-inner">\n      <span>Jesun.Code v1.4.0. MIT licensed.</span>\n      <span>Ship it. Verify it. Log it.</span>\n    </div>\n  </div>\n</footer>\n',
        )

    def test_footer_custom_version(self):
        self.check(
            'bring in "sitegen"\npage is a new table\npage["path"] is "faq.html"\npage["title"] is "FAQ"\npage["description"] is "Questions."\npage["canonical"] is "https://example.com/faq.html"\npage["body"] is "<main><h1>FAQ</h1></main>"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com"\nsite["version"] is "v9.9.9"\nshow sitegen_footer with site\n',
            '<footer>\n  <div class="foot">\n    <div>\n      <div class="foot-brand">\n        <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#0A3D2B"/><text x="20" y="27" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-weight="700" font-size="17" fill="#34E08E">&gt;_</text></svg></span>\n        <span>Jesun<em>.Code</em></span>\n      </div>\n      <p class="foot-tag">The programming language that reads like plain English. Designed and built by Jesun Ahmad Ushno. MIT licensed. Amazing is the minimum.</p>\n    </div>\n    <div class="foot-cols">\n      <div>\n        <h4>Product</h4>\n        <a href="#language">Language</a>\n        <a href="#brains">AI Brains</a>\n        <a href="#install">Install</a>\n        <a href="#roadmap">Roadmap</a>\n      </div>\n      <div>\n        <h4>Resources</h4>\n        <a href="blog/">Blog</a>\n        <a href="faq.html">FAQ</a>\n        <a href="brand/">Brand kit</a>\n        <a href="https://github.com/JesunAhmadUshno/jesun-code/releases" target="_blank" rel="noopener">Releases</a>\n      </div>\n      <div>\n        <h4>Project</h4>\n        <a href="about.html">About</a>\n        <a href="community.html">Community</a>\n        <a href="https://github.com/JesunAhmadUshno/jesun-code" target="_blank" rel="noopener">GitHub</a>\n        <a href="https://github.com/JesunAhmadUshno/jesun-code/blob/main/ROADMAP.md" target="_blank" rel="noopener">Roadmap doc</a>\n      </div>\n    </div>\n  </div>\n  <div class="foot-base">\n    <div class="foot-base-inner">\n      <span>Jesun.Code v9.9.9. MIT licensed.</span>\n      <span>Ship it. Verify it. Log it.</span>\n    </div>\n  </div>\n</footer>\n',
        )


class PageTest(SitegenCase):

    def test_page_full_document(self):
        self.check(
            'bring in "sitegen"\npage is a new table\npage["path"] is "faq.html"\npage["title"] is "FAQ"\npage["description"] is "Questions."\npage["canonical"] is "https://example.com/faq.html"\npage["body"] is "<main><h1>FAQ</h1></main>"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com"\nshow sitegen_page with page and site\n',
            '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>FAQ</title>\n<meta name="description" content="Questions.">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="Jesun.Code">\n<meta property="og:title" content="FAQ">\n<meta property="og:description" content="Questions.">\n<meta property="og:url" content="https://example.com/faq.html">\n<meta name="twitter:card" content="summary">\n<meta name="twitter:title" content="FAQ">\n<meta name="twitter:description" content="Questions.">\n<link rel="canonical" href="https://example.com/faq.html">\n<meta name="theme-color" content="#0C9463">\n<link rel="icon" type="image/svg+xml" href="./assets/icons/favicon.svg">\n<link rel="icon" type="image/png" sizes="32x32" href="./assets/icons/favicon-32.png">\n<link rel="icon" type="image/png" sizes="16x16" href="./assets/icons/favicon-16.png">\n<link rel="apple-touch-icon" sizes="180x180" href="./assets/icons/apple-touch-icon.png">\n<link rel="stylesheet" href="./assets/style.css">\n</head>\n<body>\n<header class="nav" id="nav">\n  <div class="nav-inner">\n    <a class="brand" href="./" aria-label="Jesun.Code home">\n      <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#0A3D2B"/><text x="20" y="27" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-weight="700" font-size="17" fill="#34E08E">&gt;_</text></svg></span>\n      <span class="brand-name">Jesun<em>.Code</em></span>\n    </a>\n    <nav class="nav-links" aria-label="Primary">\n      <a href="#language">Language</a>\n      <a href="#brains">AI Brains</a>\n      <a href="blog/">Blog</a>\n      <a href="faq.html">FAQ</a>\n      <a href="about.html">About</a>\n      <a href="community.html">Community</a>\n      <a href="brand/">Brand</a>\n      <a href="#install">Install</a>\n      <a href="#roadmap">Roadmap</a>\n    </nav>\n    <div class="nav-cta">\n      <span class="version-pill">v1.4.0</span>\n      <a class="btn btn-secondary btn-sm" href="https://github.com/JesunAhmadUshno/jesun-code" target="_blank" rel="noopener">GitHub</a>\n    </div>\n    <button class="nav-toggle" id="navToggle" aria-label="Menu" aria-expanded="false">\n      <span></span><span></span><span></span>\n    </button>\n  </div>\n</header>\n<main><h1>FAQ</h1></main>\n<footer>\n  <div class="foot">\n    <div>\n      <div class="foot-brand">\n        <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#0A3D2B"/><text x="20" y="27" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-weight="700" font-size="17" fill="#34E08E">&gt;_</text></svg></span>\n        <span>Jesun<em>.Code</em></span>\n      </div>\n      <p class="foot-tag">The programming language that reads like plain English. Designed and built by Jesun Ahmad Ushno. MIT licensed. Amazing is the minimum.</p>\n    </div>\n    <div class="foot-cols">\n      <div>\n        <h4>Product</h4>\n        <a href="#language">Language</a>\n        <a href="#brains">AI Brains</a>\n        <a href="#install">Install</a>\n        <a href="#roadmap">Roadmap</a>\n      </div>\n      <div>\n        <h4>Resources</h4>\n        <a href="blog/">Blog</a>\n        <a href="faq.html">FAQ</a>\n        <a href="brand/">Brand kit</a>\n        <a href="https://github.com/JesunAhmadUshno/jesun-code/releases" target="_blank" rel="noopener">Releases</a>\n      </div>\n      <div>\n        <h4>Project</h4>\n        <a href="about.html">About</a>\n        <a href="community.html">Community</a>\n        <a href="https://github.com/JesunAhmadUshno/jesun-code" target="_blank" rel="noopener">GitHub</a>\n        <a href="https://github.com/JesunAhmadUshno/jesun-code/blob/main/ROADMAP.md" target="_blank" rel="noopener">Roadmap doc</a>\n      </div>\n    </div>\n  </div>\n  <div class="foot-base">\n    <div class="foot-base-inner">\n      <span>Jesun.Code v1.4.0. MIT licensed.</span>\n      <span>Ship it. Verify it. Log it.</span>\n    </div>\n  </div>\n</footer>\n<script src="./assets/app.js"></script>\n</body>\n</html>\n',
        )

    def test_page_jsonld_verbatim(self):
        self.check(
            'bring in "sitegen"\npage is a new table\npage["path"] is "faq.html"\npage["title"] is "FAQ"\npage["description"] is "Questions."\npage["canonical"] is "https://example.com/faq.html"\npage["body"] is "<main><h1>FAQ</h1></main>"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com"\npage["jsonld"] is "{{\\"@type\\": \\"WebSite\\"}}"\nshow sitegen_page with page and site\n',
            '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>FAQ</title>\n<meta name="description" content="Questions.">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="Jesun.Code">\n<meta property="og:title" content="FAQ">\n<meta property="og:description" content="Questions.">\n<meta property="og:url" content="https://example.com/faq.html">\n<meta name="twitter:card" content="summary">\n<meta name="twitter:title" content="FAQ">\n<meta name="twitter:description" content="Questions.">\n<link rel="canonical" href="https://example.com/faq.html">\n<meta name="theme-color" content="#0C9463">\n<link rel="icon" type="image/svg+xml" href="./assets/icons/favicon.svg">\n<link rel="icon" type="image/png" sizes="32x32" href="./assets/icons/favicon-32.png">\n<link rel="icon" type="image/png" sizes="16x16" href="./assets/icons/favicon-16.png">\n<link rel="apple-touch-icon" sizes="180x180" href="./assets/icons/apple-touch-icon.png">\n<link rel="stylesheet" href="./assets/style.css">\n</head>\n<body>\n<header class="nav" id="nav">\n  <div class="nav-inner">\n    <a class="brand" href="./" aria-label="Jesun.Code home">\n      <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#0A3D2B"/><text x="20" y="27" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-weight="700" font-size="17" fill="#34E08E">&gt;_</text></svg></span>\n      <span class="brand-name">Jesun<em>.Code</em></span>\n    </a>\n    <nav class="nav-links" aria-label="Primary">\n      <a href="#language">Language</a>\n      <a href="#brains">AI Brains</a>\n      <a href="blog/">Blog</a>\n      <a href="faq.html">FAQ</a>\n      <a href="about.html">About</a>\n      <a href="community.html">Community</a>\n      <a href="brand/">Brand</a>\n      <a href="#install">Install</a>\n      <a href="#roadmap">Roadmap</a>\n    </nav>\n    <div class="nav-cta">\n      <span class="version-pill">v1.4.0</span>\n      <a class="btn btn-secondary btn-sm" href="https://github.com/JesunAhmadUshno/jesun-code" target="_blank" rel="noopener">GitHub</a>\n    </div>\n    <button class="nav-toggle" id="navToggle" aria-label="Menu" aria-expanded="false">\n      <span></span><span></span><span></span>\n    </button>\n  </div>\n</header>\n<main><h1>FAQ</h1></main>\n<footer>\n  <div class="foot">\n    <div>\n      <div class="foot-brand">\n        <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#0A3D2B"/><text x="20" y="27" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-weight="700" font-size="17" fill="#34E08E">&gt;_</text></svg></span>\n        <span>Jesun<em>.Code</em></span>\n      </div>\n      <p class="foot-tag">The programming language that reads like plain English. Designed and built by Jesun Ahmad Ushno. MIT licensed. Amazing is the minimum.</p>\n    </div>\n    <div class="foot-cols">\n      <div>\n        <h4>Product</h4>\n        <a href="#language">Language</a>\n        <a href="#brains">AI Brains</a>\n        <a href="#install">Install</a>\n        <a href="#roadmap">Roadmap</a>\n      </div>\n      <div>\n        <h4>Resources</h4>\n        <a href="blog/">Blog</a>\n        <a href="faq.html">FAQ</a>\n        <a href="brand/">Brand kit</a>\n        <a href="https://github.com/JesunAhmadUshno/jesun-code/releases" target="_blank" rel="noopener">Releases</a>\n      </div>\n      <div>\n        <h4>Project</h4>\n        <a href="about.html">About</a>\n        <a href="community.html">Community</a>\n        <a href="https://github.com/JesunAhmadUshno/jesun-code" target="_blank" rel="noopener">GitHub</a>\n        <a href="https://github.com/JesunAhmadUshno/jesun-code/blob/main/ROADMAP.md" target="_blank" rel="noopener">Roadmap doc</a>\n      </div>\n    </div>\n  </div>\n  <div class="foot-base">\n    <div class="foot-base-inner">\n      <span>Jesun.Code v1.4.0. MIT licensed.</span>\n      <span>Ship it. Verify it. Log it.</span>\n    </div>\n  </div>\n</footer>\n<script type="application/ld+json">\n{"@type": "WebSite"}\n</script>\n<script src="./assets/app.js"></script>\n</body>\n</html>\n',
        )


class BlogTest(SitegenCase):

    def test_blog_index_exact(self):
        self.check(
            'bring in "sitegen"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com/"\nsite["summary"] is "Plain summary."\nsite["llms_name"] is "Jesun.Code"\ns1 is a new table\ns1["heading"] is "Install"\ns1["body"] is "Grab the binary."\nsite["llms_sections"] is [s1]\np1 is a new table\np1["title"] is "First <post>"\np1["date"] is "2026-09-30"\np1["slug"] is "first-post"\np1["summary"] is "<code>hello</code>"\np2 is a new table\np2["title"] is "Second"\np2["date"] is "2026-09-29"\np2["slug"] is "second"\nidx is sitegen_blog_index with [p1, p2] and site\nshow idx\n',
            '  <div class="page-head">\n    <p class="kicker">The Smithy</p>\n    <h1>Notes from the Language Smith.</h1>\n    <p class="lede">Release announcements, tutorials, and design notes on how Jesun.Code thinks. Written by Anvil, for humans first.</p>\n  </div>\n  <div class="prose">\n    <article class="post-item">\n      <time datetime="2026-09-30">2026-09-30</time>\n      <h2><a href="first-post.html">First &lt;post&gt;</a></h2>\n      <p><code>hello</code></p>\n    </article>\n    <article class="post-item">\n      <time datetime="2026-09-29">2026-09-29</time>\n      <h2><a href="second.html">Second</a></h2>\n    </article>\n  </div>\n',
        )

    def test_blog_post_missing_slug_fails(self):
        self.check_fails(
            'bring in "sitegen"\npost is a new table\npost["title"] is "T"\npost["date"] is "2026-09-30"\nsite is a new table\nshow sitegen_blog_index with [post] and site\n',
            'the post slug is missing.',
        )

    def test_blog_post_missing_date_fails(self):
        self.check_fails(
            'bring in "sitegen"\npost is a new table\npost["title"] is "T"\npost["slug"] is "s"\nsite is a new table\nshow sitegen_blog_index with [post] and site\n',
            'the post date is missing.',
        )


class MachineFilesTest(SitegenCase):

    def test_sitemap_exact(self):
        self.check(
            'bring in "sitegen"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com/"\nsite["summary"] is "Plain summary."\nsite["llms_name"] is "Jesun.Code"\ns1 is a new table\ns1["heading"] is "Install"\ns1["body"] is "Grab the binary."\nsite["llms_sections"] is [s1]\np1 is a new table\np1["title"] is "First <post>"\np1["date"] is "2026-09-30"\np1["slug"] is "first-post"\np1["summary"] is "<code>hello</code>"\np2 is a new table\np2["title"] is "Second"\np2["date"] is "2026-09-29"\np2["slug"] is "second"\npg is a new table\npg["path"] is "index.html"\npg["title"] is "Home"\npg["description"] is "Home page."\npg["canonical"] is "https://example.com/"\npg["body"] is "<main>hi</main>"\npg["date"] is "2026-09-30"\npg2 is a new table\npg2["path"] is "faq.html"\npg2["title"] is "FAQ"\npg2["description"] is "Q."\npg2["canonical"] is "https://example.com/faq.html"\npg2["body"] is "<main>q</main>"\nsm is sitegen_sitemap with [pg, pg2] and site\nshow sm\n',
            '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://example.com/index.html</loc>\n    <lastmod>2026-09-30</lastmod>\n  </url>\n  <url>\n    <loc>https://example.com/faq.html</loc>\n  </url>\n</urlset>\n',
        )

    def test_robots_exact(self):
        self.check(
            'bring in "sitegen"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com/"\nsite["summary"] is "Plain summary."\nsite["llms_name"] is "Jesun.Code"\ns1 is a new table\ns1["heading"] is "Install"\ns1["body"] is "Grab the binary."\nsite["llms_sections"] is [s1]\np1 is a new table\np1["title"] is "First <post>"\np1["date"] is "2026-09-30"\np1["slug"] is "first-post"\np1["summary"] is "<code>hello</code>"\np2 is a new table\np2["title"] is "Second"\np2["date"] is "2026-09-29"\np2["slug"] is "second"\nrb is sitegen_robots with site\nshow rb\n',
            'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n',
        )

    def test_llms_exact(self):
        self.check(
            'bring in "sitegen"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com/"\nsite["summary"] is "Plain summary."\nsite["llms_name"] is "Jesun.Code"\ns1 is a new table\ns1["heading"] is "Install"\ns1["body"] is "Grab the binary."\nsite["llms_sections"] is [s1]\np1 is a new table\np1["title"] is "First <post>"\np1["date"] is "2026-09-30"\np1["slug"] is "first-post"\np1["summary"] is "<code>hello</code>"\np2 is a new table\np2["title"] is "Second"\np2["date"] is "2026-09-29"\np2["slug"] is "second"\nll is sitegen_llms with site\nshow ll\n',
            '# Jesun.Code\n\n> Plain summary.\n\n## Install\n\nGrab the binary.\n\n',
        )

    def test_robots_missing_site_url_fails(self):
        self.check_fails(
            'bring in "sitegen"\nsite is a new table\nsite["base"] is "x"\nshow sitegen_robots with site\n',
            'the site is missing its site_url.',
        )


class SandboxTest(SitegenCase):

    def test_base_dotdot_fails(self):
        self.check_fails(
            'bring in "sitegen"\nsite is a new table\nsite["base"] is "../evil"\nsite["site_url"] is "https://example.com"\npage is a new table\npage["path"] is "faq.html"\npage["title"] is "FAQ"\npage["description"] is "Questions."\npage["canonical"] is "https://example.com/faq.html"\npage["body"] is "<main><h1>FAQ</h1></main>"\nsite["pages"] is [page]\nshow sitegen_build with site\n',
            'the site base folder has to stay inside the site; ".." is not allowed.',
        )

    def test_base_absolute_fails(self):
        self.check_fails(
            'bring in "sitegen"\nsite is a new table\nsite["base"] is "/tmp/evil"\nsite["site_url"] is "https://example.com"\npage is a new table\npage["path"] is "faq.html"\npage["title"] is "FAQ"\npage["description"] is "Questions."\npage["canonical"] is "https://example.com/faq.html"\npage["body"] is "<main><h1>FAQ</h1></main>"\nsite["pages"] is [page]\nshow sitegen_build with site\n',
            'the site base folder has to be a relative path inside the site; absolute paths are not allowed.',
        )

    def test_page_path_dotdot_fails(self):
        self.check_fails(
            'bring in "sitegen"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com"\npage is a new table\npage["path"] is "../evil.html"\npage["title"] is "FAQ"\npage["description"] is "Questions."\npage["canonical"] is "https://example.com/faq.html"\npage["body"] is "<main><h1>FAQ</h1></main>"\nsite["pages"] is [page]\nshow sitegen_build with site\n',
            'the page path has to stay inside the site; ".." is not allowed.',
        )

    def test_page_path_not_html_fails(self):
        self.check_fails(
            'bring in "sitegen"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com"\npage is a new table\npage["path"] is "faq.txt"\npage["title"] is "FAQ"\npage["description"] is "Questions."\npage["canonical"] is "https://example.com/faq.html"\npage["body"] is "<main><h1>FAQ</h1></main>"\nsite["pages"] is [page]\nshow sitegen_build with site\n',
            'the page path has to end in .html.',
        )

    def test_page_missing_title_fails(self):
        self.check_fails(
            'bring in "sitegen"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com"\npage is a new table\npage["path"] is "faq.html"\npage["description"] is "Questions."\npage["canonical"] is "https://example.com/faq.html"\npage["body"] is "<main><h1>FAQ</h1></main>"\nsite["pages"] is [page]\nshow sitegen_build with site\n',
            'the page title is missing.',
        )

    def test_page_missing_body_fails(self):
        self.check_fails(
            'bring in "sitegen"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com"\npage is a new table\npage["path"] is "faq.html"\npage["title"] is "FAQ"\npage["description"] is "Questions."\npage["canonical"] is "https://example.com/faq.html"\nsite["pages"] is [page]\nshow sitegen_build with site\n',
            'the page body is missing.',
        )

    def test_empty_pages_fails(self):
        self.check_fails(
            'bring in "sitegen"\nsite is a new table\nsite["base"] is "x"\nsite["site_url"] is "https://example.com"\nsite["pages"] is []\nshow sitegen_build with site\n',
            'the site has no pages to build.',
        )

    def test_site_not_table_fails(self):
        self.check_fails(
            'bring in "sitegen"\nshow sitegen_build with "nope"\n',
            'the site has to be a table, but this is "nope".',
        )


class BuildTest(SitegenCase):
    DEMO = (
        HDR
        + 'home is a new table\n'
        + 'home["path"] is "index.html"\n'
        + 'home["title"] is "Home"\n'
        + 'home["description"] is "Home."\n'
        + 'home["canonical"] is "https://example.com/"\n'
        + 'home["body"] is "<main>hi</main>"\n'
        + 'sub is a new table\n'
        + 'sub["path"] is "docs/guide.html"\n'
        + 'sub["title"] is "Guide"\n'
        + 'sub["description"] is "Guide."\n'
        + 'sub["canonical"] is "https://example.com/docs/guide.html"\n'
        + 'sub["body"] is "<main>guide</main>"\n'
        + 'site is a new table\n'
        + 'site["base"] is "sgb_out"\n'
        + 'site["site_url"] is "https://example.com/"\n'
        + 'site["version"] is "v1.5.0"\n'
        + 'site["pages"] is [home, sub]\n'
        + 'written is sitegen_build with site\n'
        + 'show length of written\n'
    )

    def test_build_writes_all_files(self):
        box = InlineSandbox()
        try:
            boot, selfhost = box.run(self.DEMO)
            self.assertEqual(
                (selfhost[0], LINE_RE.sub("Line N", selfhost[1])),
                (boot[0], LINE_RE.sub("Line N", boot[1])),
                f"differ:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
            )
            self.assertEqual(boot[0], 0, f"bootstrap failed: {boot!r}")
            self.assertEqual(
                boot[1],
                "wrote sgb_out/index.html\n"
                "wrote sgb_out/docs/guide.html\n"
                "wrote sgb_out/sitemap.xml\n"
                "wrote sgb_out/robots.txt\n"
                "wrote sgb_out/llms.txt\n"
                "5\n",
            )
            boot_files = None
            for leg in (box.boot_dir, box.self_dir):
                got = {}
                for name in ("index.html", "docs/guide.html", "sitemap.xml", "robots.txt", "llms.txt"):
                    with open(os.path.join(leg, "sgb_out", name), "rb") as handle:
                        got[name] = handle.read()
                self.assertTrue(got["index.html"].startswith(b"<!DOCTYPE html>"))
                self.assertIn(b"<title>Home</title>", got["index.html"])
                self.assertIn(b"docs/guide.html", got["sitemap.xml"])
                if boot_files is None:
                    boot_files = got
                else:
                    self.assertEqual(got, boot_files)
        finally:
            box.close()

    def test_build_idempotent(self):
        src = (
            self.DEMO.replace("sgb_out", "idem_a").replace("show length of written\n", "")
            + 'read file "idem_a/index.html" giving first_pass\n'
            + 'again is sitegen_build with site\n'
            + 'read file "idem_a/index.html" giving second_pass\n'
            + 'show first_pass is second_pass\n'
        )
        box = InlineSandbox()
        try:
            boot, selfhost = box.run(src)
        finally:
            box.close()
        self.assertEqual(
            (selfhost[0], LINE_RE.sub("Line N", selfhost[1])),
            (boot[0], LINE_RE.sub("Line N", boot[1])),
            f"differ:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
        )
        self.assertEqual(boot[0], 0, f"bootstrap failed: {boot!r}")
        self.assertTrue(boot[1].rstrip("\n").endswith("true"))


if __name__ == "__main__":
    unittest.main()
