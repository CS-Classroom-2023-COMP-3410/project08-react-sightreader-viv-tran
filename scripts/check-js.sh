#!/bin/bash
# Install jshint with:
#   sudo apt-get install npm nodejs-legacy
#   sudo npm install -g jshint
set -e
echo "[$(date)] Checking Javascript."
jshint -c jshint.rc js/sightreader.js
