#!/bin/sh
# Fixture mind for the doctor.jc demo: investigates with both tools,
# then gives a one-line diagnosis.
cat > /dev/null
n=$(cat "$MIND_COUNT_FILE" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$MIND_COUNT_FILE"
if [ "$n" -eq 1 ]; then
  printf 'CALL: disk_report()\n'
elif [ "$n" -eq 2 ]; then
  printf 'CALL: load_report()\n'
else
  printf 'All clear: plenty of free disk and the load is light. Nothing to fix.\n'
fi
