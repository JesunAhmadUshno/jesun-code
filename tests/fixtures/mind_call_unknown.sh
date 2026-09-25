#!/bin/sh
# Fixture mind: first call tries a tool the agent does not have,
# second call gives the final answer.
cat > /dev/null
n=$(cat "$MIND_COUNT_FILE" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$MIND_COUNT_FILE"
if [ "$n" -eq 1 ]; then
  printf 'CALL: secret()\n'
else
  printf 'fine, no secrets needed\n'
fi
