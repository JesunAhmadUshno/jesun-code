# Jesun.Code Playground image.
# Runs the Serve dogfood app on the native Jesun.Code binary.
# The binary bundles the packages/ stdlib, so no Python is needed here.
FROM debian:bookworm-slim

WORKDIR /app

# The native binary (built with scripts/build-binary.sh, then copied to
# dist/jesun-linux-x64). Packages are bundled inside the binary.
COPY dist/jesun-linux-x64 /app/jesun
COPY playground/playground.jc /app/playground.jc

# The todos demo keeps its sqlite file in /app (ephemeral disk; add a Fly
# volume mounted at /app and keep the relative path if it must persist).
EXPOSE 8080

CMD ["/app/jesun", "/app/playground.jc"]
