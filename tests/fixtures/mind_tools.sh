#!/bin/sh
# Fixture mind: first call emits a tool CALL, second call gives the answer.
# Counts invocations in $MIND_COUNT_FILE.
cat > /dev/null
n=$(cat "$MIND_COUNT_FILE" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$MIND_COUNT_FILE"
if [ "$n" -eq 1 ]; then
  printf 'CALL: read_logs()\n'
else
  printf 'the disk is full\n'
fi
