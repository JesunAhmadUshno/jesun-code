# Jesun.Code Playground (Serve M4 dogfood)

A live demo of the Serve web framework, written entirely in plain-English
Jesun.Code: `playground.jc` (one file, no Python, no JavaScript written by
hand). It serves:

- `GET /` — home page, server-rendered, zero JavaScript
- `GET /like` — a like button as an M3 live view (state on the server, pushed over SSE)
- `GET /admin/todos` — a todos app on the English data layer, with its generated admin page
- `GET /scene` — a three.js scene (spinning box) described in English, emitted as real three.js

The marketing site stays on GitHub Pages. This playground runs on its own
always-on host (Fly.io).

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
for r in / /like /admin/todos /scene; do
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
