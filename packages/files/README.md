# jpm package: files

Plain-English file helpers, beyond the built-in `read file` and
`write to file`.

```jesun
use "github.com/jesun/files"
bring in "files"
if files_exists with "notes.txt" then
    size is files_size with "notes.txt"
    show "notes.txt is {size} bytes long"
names is files_list with "."
show names
```

Functions: `files_exists with path` (true/false), `files_size with
path` (bytes, 0 when missing), `files_list with folder` (names in the
folder), `files_copy with source and target`, `files_move with source
and target`, `files_delete with path` (quiet when missing).
