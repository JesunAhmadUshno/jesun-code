#!/bin/sh
# Fixture mind for agent-to-agent calls.
# Call 1 (writer): asks the researcher for the date.
# Call 2 (researcher): answers with the date.
# Call 3 (writer): writes the brief using the researcher's answer.
cat > /dev/null
n=$(cat "$MIND_COUNT_FILE" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$MIND_COUNT_FILE"
case "$n" in
  1) printf 'CALL: researcher("find the date")\n' ;;
  2) printf 'Sep 30\n' ;;
  *) printf 'Brief: Sep 30.\n' ;;
esac
