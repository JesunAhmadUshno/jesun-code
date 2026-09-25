#!/bin/sh
# Fixture mind for the agent-depth cap: every agent calls the next one,
# so a calls b calls c calls d calls e, past the 3-level maximum.
cat > /dev/null
n=$(cat "$MIND_COUNT_FILE" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$MIND_COUNT_FILE"
case "$n" in
  1) printf 'CALL: b("go")\n' ;;
  2) printf 'CALL: c("go")\n' ;;
  3) printf 'CALL: d("go")\n' ;;
  4) printf 'CALL: e("go")\n' ;;
  *) printf 'too far\n' ;;
esac
