#!/bin/sh
# Fixture mind: first call asks for a tool that does not exist,
# second call answers plainly.
cat > /dev/null
n=$(cat "$MIND_COUNT_FILE" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$MIND_COUNT_FILE"
if [ "$n" -eq 1 ]; then
  printf 'CALL: nope()\n'
else
  printf 'done\n'
fi
