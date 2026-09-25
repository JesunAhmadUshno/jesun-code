# Jesun.Code v0.4 Specification: files and words

## 20. Reading and writing files

```
write "hello" to file "notes.txt"
append "and more" to file "notes.txt"
read file "notes.txt" giving text
show text
```

- `write <value> to file "<path>"`: writes to the file, replacing its
  contents. The value is converted the same way `show` converts it, so
  numbers, lists, and `nothing` all work.
- `append <value> to file "<path>"`: adds to the end of the file.
- `read file "<path>" giving <name>`: reads the whole file as text and
  stores it in the name.
- The path may be any expression (a string literal or a variable), and it
  is read with UTF-8.
- Paths are resolved from the current folder and may not escape it: a path
  that climbs out with `..` fails with
  `Line N: I cannot open "...": it leaves the current folder.`
- Friendly errors, always with the line number:
  - missing file: `Line N: I could not find the file "...".`
  - a folder where a file was expected:
    `Line N: "..." is a folder, not a file.`
  - a missing parent folder on write:
    `Line N: I could not write "...": its folder does not exist.`

## 21. String interpolation

```
name is "Jesun"
show "Hello, {name}!"
show "two plus two is {2 + 2}"
```

- `{expression}` inside any string (double or single quoted) evaluates the
  expression and splices in its `show` form: numbers, lists, `true`,
  `nothing`, everything a `show` can print.
- `{{` and `}}` are literal braces: `"{{not a value}}"` prints
  `{not a value}`.
- A lone `}` stays literal. An unclosed `{` is a parse error:
  `Line N: this "{" never closes; add a "}" to finish it.` Empty braces
  are a parse error:
  `Line N: these braces are empty; put a value inside.`

## 22. jpm: Jesun.Code packages

Packages are plain Jesun.Code files other people wrote, fetched straight
from GitHub. `use` installs one; `bring in` loads it into your program.

```
use "github.com/jesun/time"
bring in "time"
show time_today()
```

### Installing: `use`

`use "<host>/<user>/<pkg>"` installs the package into
`~/.jesun-code/packages/<host>/<user>/<pkg>/` (the home folder moves with
the `JESUN_CODE_HOME` environment variable). Right now only
`github.com` is a host; it shallow-clones
`https://github.com/<user>/<pkg>` with `git clone --depth 1`
(argument list only, 120-second timeout).

- The address must be exactly three parts, each one word of letters,
  digits, dots, dashes, or underscores. Anything else fails:
  `Line N: "..." is not a package address; write it like
  "github.com/user/pkg".`
- Installing twice is fine: if the folder is already there and clean,
  `use` reuses it and moves on.
- If the folder has changes of its own (an uncommitted git checkout),
  `use` refuses rather than overwriting your edits:
  `Line N: the package "user/pkg" has local changes; move them away
  before I fetch it again.`
- Friendly errors, always with the line number:
  - no `git` on the machine:
    `Line N: I need git to fetch packages, and I cannot find it.`
  - network or repo problems:
    `Line N: I could not fetch "github.com/user/pkg"; check the address
    and your connection.`
  - a `..` or absolute trick in the address: caught by the address
    shape rule above; paths always resolve under the packages folder.

### Loading: `bring in`

`bring in "<name>"` finds the installed package by its short name and
runs its main file in your program, so the functions it defines are
ready to call. The main file is `jpm.json`'s `main` if the package
ships one (a path inside the package folder), otherwise `<name>.jc`.
Package files keep the same `..`-free path rule as everywhere else.

```
bring in "http"
page is http_get("https://example.com")
```

- Unknown package:
  `Line N: I have not fetched the package "name" yet; run
  use "github.com/user/name" first.`
- Packages run in plain Jesun.Code, so they define plain functions.
  Convention: package functions start with the package name
  (`time_today`, `http_get`, `files_exists`), so names never collide
  with yours.
- A package can `bring in` other packages too; a loop of packages that
  bring each other in stops with
  `Line N: these packages bring each other in a circle: a, b.`

### Starter packages

The repo ships three in `packages/`, each with `jpm.json`, its main
`.jc` file, and a README:

- `time`: `time_now()`, `time_today()`, `time_stamp()`,
  `time_wait(seconds)`.
- `files`: `files_exists(path)`, `files_size(path)`,
  `files_list(folder)`, `files_copy(from, to)`, `files_move(from, to)`,
  `files_delete(path)`.
- `http`: `http_get(url)`, `http_status(url)`.

### v0.5 candidates (non-goals for v0.4)

The Bangla keyword flavor, the VS Code extension, `fleet` blocks with
parallel asks.
