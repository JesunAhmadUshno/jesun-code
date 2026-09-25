# Jesun.Code for VS Code

Language support for [Jesun.Code](https://github.com/JesunAhmadUshno/jesun-code)
(`.jc` files): syntax highlighting, snippets, and a run-file command.

## Install from source

1. Copy this folder (`editors/vscode`) somewhere, e.g. `~/.vscode/extensions/jesun-code`.
2. Reload VS Code. `.jc` files now light up.

To publish it to the marketplace later: `npm install -g @vscode/vsce && vsce package`
from this folder.

## Features

- **Highlighting** for every Jesun.Code keyword, in English and in the Bangla
  flavor (`বাংলা` mode), strings with `{interpolation}`, `note` / `মন্তব্য`
  comments, and ASCII + Bengali-digit numbers. The grammar is generated from
  the interpreter itself (`python3 build-grammar.py`), so it can never drift
  out of sync: a test fails the suite if a keyword is missing.
- **Snippets**: `show`, `if`, `repeat`, `foreach`, `func`, `askai`, `import`,
  `use`, `bangla`.
- **Run current file** (`Ctrl+Alt+R` / `Cmd+Alt+R`, or the command palette
  "Jesun.Code: Run current file"): runs through the `jesun` binary when it
  is on PATH, otherwise through `python jesun.py` next to this extension.

## Regenerating the grammar

```sh
cd editors/vscode
python3 build-grammar.py
```

This rewrites `syntaxes/jesun-code.tmLanguage.json` from `jesun.py`.
