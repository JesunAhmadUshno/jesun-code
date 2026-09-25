# Jesun.Code spec v0.5: home turf (Bangla flavor + VS Code extension)

Status: draft for implementation. v0.5 ships when both halves below are done,
tested, and the Linux binary is re-cut.

## 23. The Bangla flavor

Jesun.Code speaks Bangla. A program whose first non-blank line is

```
use bangla
```

or a line containing only

```
বাংলা
```

runs entirely in Bangla: every keyword below replaces its English twin.
The header line itself is read in English mode (so a trailing `note`
comment on it still works); everything after it is Bangla. The grammar is
unchanged, only the words change: same statement shapes, same token order,
same blocks, same plain-English errors with line numbers. Errors stay in
English in v0.5 on purpose (Bangla error text is a queued follow-up, not a
silent omission); the "Line N:" prefix and the no-traceback guarantee hold.

Mixing is not allowed: in Bangla mode the English words are ordinary names,
and in English mode the Bangla words are ordinary names. One file, one tongue.

Comments in Bangla mode start with `মন্তব্য` (the English `note` is just a
name there):

```
বাংলা
মন্তব্য নাম জিজ্ঞেস করে দেখাও
জিজ্ঞেস "তোমার নাম কী?" রেখে নাম
দেখাও "স্বাগতম, {নাম}!"
```

Identifiers may use Bangla or English letters (`নাম`, `বয়স`, `total`
are all fine). Numbers may use Bengali digits: `৫`, `৩.১৪` work because the
lexer reads Unicode decimal digits. String interpolation is unchanged:
`"স্বাগতম, {নাম}!"`.

### Keyword table

| English | Bangla | English | Bangla |
|---|---|---|---|
| show | দেখাও | of | এর |
| is | হয় | first | প্রথম |
| not | না | last | শেষ |
| true | সত্য | length | দৈর্ঘ্য |
| false | মিথ্যা | uppercase | বড়হাতা |
| nothing | ফাঁকা | lowercase | ছোটহাতা |
| ask | জিজ্ঞেস | greater | বড় |
| giving | রেখে | less | ছোট |
| if | যদি | than | চেয়ে |
| then | তাহলে | least | কমপক্ষে |
| otherwise | নইলে | most | সবচেয়ে |
| repeat | আবার | at | নম্বরে |
| times | বার | contains | আছে |
| while | যতক্ষণ | split | ভাগ |
| for | জন্য | join | জোড়া |
| each | প্রতিটি | trim | ছাঁটো |
| in | ভেতরে | by | দিয়ে |
| to | জন্যে | keys | চাবি |
| with | সহ | import | আনো |
| and | এবং | as | হিসেবে |
| or | অথবা | ai | এআই |
| give | দাও | tools | হাতিয়ার |
| back | ফেরত | within | মধ্যে |
| stop | থামো | steps | ধাপ |
| skip | এড়িয়ে | open | খোলো |
| terminal | টার্মিনাল | named | নামে |
| send | পাঠাও | read | পড়ো |
| close | বন্ধকরো | agent | এজেন্ট |
| persona | পারসোনা | remember | মনেকরো |
| always | সবসময় | forget | ভুলেযাও |
| memory | স্মৃতি | file | ফাইল |
| streaming | সরাসরি | write | লেখো |
| append | যোগকরো | use | ব্যবহার |
| bring | নিয়ে | | |

Notes on the choices: `হয়` reads naturally in `নাম হয় "জেসুন"`;
`আবার ৩ বার` reads "again 3 times"; `জন্য প্রতিটি x ভেতরে তালিকা`
reads "for each x inside the list"; `দাও ফেরত x` is "give back x";
`জিজ্ঞেস "?" রেখে নাম` is "ask ?, keeping the answer as নাম".
`use bangla` inside a Bangla file is `ব্যবহার বাংলা`, but the header
itself is always the English `use bangla` (or the lone word `বাংলা`).

### Lexer rules

- Word characters are letters, `_`, digits, and combining marks (Bangla
  vowel signs like ে and া are marks, not letters; without this `দেখাও`
  would split into pieces).
- The comment cutter honors `মন্তব্য` in Bangla mode with the same
  word-boundary rule as `note`.
- A `use "github.com/user/pkg"` line inside a Bangla file is written
  `ব্যবহার "github.com/user/pkg"`; packages themselves stay as authored
  (usually English keywords), and a Bangla program can still `আনো`
  (import) Python modules by their real names.

### Examples

```
বাংলা
মন্তব্য গুণন তালিকা
সংখ্যাগুলো হয় [১, ২, ৩, ৪, ৫]
যোগফল হয় ০
জন্য প্রতিটি ন ভেতরে সংখ্যাগুলো
    যোগফল হয় যোগফল + ন
দেখাও "যোগফল হয় {যোগফল}"
```

```
use bangla
জন্যে জোড়া সহ ক এবং খ
    দাও ফেরত ক + খ
দেখাও জোড়া সহ ২ এবং ৩
```

## 24. VS Code extension (`editors/vscode/`)

First-class editing for `.jc` files:

- `package.json`: language id `jesun-code`, extensions `.jc`, grammar,
  snippets, and a `jesun-code.runFile` command that runs the current file
  through the `jesun` binary when it is on PATH, else `python jesun.py`.
- `syntaxes/jesun-code.tmLanguage.json`: TextMate grammar. Keywords
  (English and Bangla sets, kept in sync with the interpreter by test),
  strings with interpolation braces, comments (`note`, `মন্তব্য`),
  numbers (ASCII and Bengali digits), function definitions (`to name`),
  builtins.
- `snippets/jesun-code.json`: `show`, `if/otherwise`, `repeat`, `for each`,
  `to` function, `ask ai`, `import`, `agent` skeletons.
- `language-configuration.json`: comment toggles, bracket pairs,
  indent rules for `:` blocks.
- `README.md`: install from source, usage, the run command.

Verification (no mockups): a test loads every JSON file, compiles every
grammar regex, and asserts the grammar's keyword lists exactly equal the
interpreter's `KEYWORDS` and `BANGLA_KEYWORDS` sets. If the language gains
a keyword and the grammar does not, the suite goes red.
