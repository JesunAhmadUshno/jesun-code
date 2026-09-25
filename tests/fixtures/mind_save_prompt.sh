#!/bin/sh
# Fixture mind: saves the full prompt it received, then answers one line.
cat > "$MIND_PROMPT_FILE"
printf 'understood\n'
