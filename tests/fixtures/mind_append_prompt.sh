#!/bin/sh
# Fixture mind: appends each received prompt to a log file, then answers.
cat >> "$MIND_PROMPT_FILE"
printf '\n--- prompt boundary ---\n' >> "$MIND_PROMPT_FILE"
printf 'ok\n'
