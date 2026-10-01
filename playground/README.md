# Jesun.Code Playground (Serve M4 dogfood)

A live demo of the Serve web framework, written entirely in plain-English
Jesun.Code: `playground.jc` (one file, no Python, no JavaScript written by
hand). It serves:

- `GET /` — home page, server-rendered, zero JavaScript
- `GET /like` — a like button as an M3 live view (state on the server, pushed over SSE)
- `GET /admin/todos` — a todos app on the English data layer, with its generated admin page
- `GET /scene` — a three.js scene (spinning box) described in English, emitted as real three.js
- `POST /run` — the fenced code runner (spec v3.0 section 9, M4): post Jesun.Code
  source as the body, get the output as JSON. The source runs in a child
  process with a 5-second timeout, a fresh sandbox working folder, output
  capped at 64 KiB, and no network (unshare -n where the host allows it).
  Failures come back as plain-English text, never a traceback. Empty bodies
  are 400, bodies over 1 MiB are 413.
- `GET /run` — a human page explaining `POST /run` with a curl example.

```bash
curl -X POST --data-binary @hello.jc http://127.0.0.1:8080/run
# {"ok": true, "output": "hi\n", "timed_out": false, "net_isolated": true}
```

The marketing site stays on GitHub Pages. The playground dogfood soak
runs LOCAL on the founder's laptop first (founder decision 2026-10-01);
the public always-on host (Railway) is deferred, not cancelled.

## Run it locally

Build the native binary first (one time; `dist/` is gitignored):

```bash
./scripts/build-binary.sh
cp dist/jesun dist/jesun-linux-x64
```

Then run the playground on the binary and open http://127.0.0.1:8080/ :

```bash
./dist/jesun-linux-x64 playground/playground.jc
```

Every route must return 200:

```bash
for r in / /like /admin/todos /scene /run; do
  curl -s -o /dev/null -w "$r -> %{http_code}\n" "http://127.0.0.1:8080$r"
done
```

## Deploy to Fly.io

You need a Fly.io account (nothing is deployed until you run these).

1. Install flyctl: https://fly.io/docs/flyctl/install/
2. Sign up / log in: `fly auth signup` (or `fly auth login`)
3. From the repo root, make sure the binary exists (see above).
4. Create the app (first time only): `fly apps create jesun-code-playground`
5. Deploy: `fly deploy --config playground/fly.toml`
6. Open it: `fly open --app jesun-code-playground`

Notes:

- `fly.toml` pins `primary_region = "tor"` (Toronto, home), `shared-cpu-1x`,
  and `auto_stop_machines = false` so the dogfood host is truly always on.
  That costs a small always-on VM; flip `auto_stop_machines` to `true` if
  you would rather it sleep when idle.
- The todos sqlite file lives at `/app/playground.db` on the machine's
  ephemeral disk. If the demo data must survive restarts, add a Fly volume
  and keep the relative path (the app opens `playground.db` in its working
  directory, `/app`).
- The Dockerfile copies `dist/jesun-linux-x64`, which is gitignored, so it
  must exist on the machine you deploy from. Rebuild it after any language
  change with `./scripts/build-binary.sh`.
