#!/bin/sh
# Fixture mind: never answers, only calls tools. Used to test step exhaustion.
cat > /dev/null
printf 'CALL: read_logs()\n'
