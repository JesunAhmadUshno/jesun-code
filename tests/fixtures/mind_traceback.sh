#!/bin/sh
# Fixture mind: exits 1 with a Python-style traceback on stderr.
cat > /dev/null
printf 'Traceback (most recent call last):\n  File "x", line 1\nValueError: boom\n' >&2
exit 1
