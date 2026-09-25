# jpm package: time

Plain-English clock helpers.

```jesun
use "github.com/jesun/time"
bring in "time"
show "It is " + time_now + " on " + time_today
time_wait with 2
```

Functions: `time_now` (clock time like "14:03:22"), `time_today`
(date like "2026-09-25"), `time_stamp` (seconds since 1970),
`time_wait with seconds` (pause that long).
