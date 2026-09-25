#!/bin/sh
# Fixture mind: answers in two slow chunks, to prove streaming prints as they arrive.
cat > /dev/null
printf 'first chunk\n'
sleep 1
printf 'second chunk\n'
