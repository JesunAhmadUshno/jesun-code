# jpm package: http

Plain-English web helpers.

```jesun
use "github.com/jesun/http"
bring in "http"
show http_status with "https://example.com"
page is http_get with "https://example.com"
show page
```

Functions: `http_get with url` (the page as text), `http_status with
url` (the status code, like 200). Every request gives up after 10
seconds.
