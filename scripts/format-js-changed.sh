#!/bin/bash
set -e
#git diff - name-only HEAD | grep ".*\.js" | xargs prettier - write
prettier js/sightreader.js --write
