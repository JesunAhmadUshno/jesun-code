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

## 22. jpm: Jesun.Code packages (next sprint)

`use "github.com/user/pkg"` installs a Jesun.Code package from GitHub into
`~/.jesun-code/packages/` (redirectable with `JESUN_CODE_HOME`), then
makes its files importable by name. Design sketch for the next shift:
shallow `git clone` (arg list, timeout), refusal to re-clone over
uncommitted local changes, plain-English errors for unknown repos and
network failures, and the same `..`-free path rule inside package dirs.
Starter packages to ship: `http`, `files`, `time`.

### v0.5 candidates (non-goals for v0.4)

The Bangla keyword flavor, the VS Code extension, `fleet` blocks with
parallel asks.
