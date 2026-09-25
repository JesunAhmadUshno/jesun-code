#!/bin/sh
# Fixture mind for the agent_scout.jc demo: uses both tools across three asks.
cat > /dev/null
n=$(cat "$MIND_COUNT_FILE" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$MIND_COUNT_FILE"
case "$n" in
  1) printf 'CALL: read_notes()\n' ;;
  2) printf 'Launch date: Sep 30.\n' ;;
  3) printf 'CALL: read_risks()\n' ;;
  4) printf 'Risks: venue not booked; budget approval pending.\n' ;;
  *) printf 'Sep 30, as established above.\n' ;;
esac
