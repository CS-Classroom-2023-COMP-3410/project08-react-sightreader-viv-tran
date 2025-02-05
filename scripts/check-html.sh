#!/bin/bash
echo "[$(date)] Checking HTML."
jinjalint --config jinjalint_config.py templates/ | grep -v "Bad indentation" | grep -v "An inline parent element must only contain inline children"
ret=$?
if [ "$ret" -eq "1" ]; then
    exit 0
fi
exit 1
