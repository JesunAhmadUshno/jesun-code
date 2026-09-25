#!/bin/sh
# Fixture mind: first tries a tool that was NOT listed, then answers.
cat > /dev/null
n=$(cat "$MIND_COUNT_FILE" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$MIND_COUNT_FILE"
if [ "$n" -eq 1 ]; then
  printf 'CALL: secret()\n'
else
  printf 'done\n'
fi
