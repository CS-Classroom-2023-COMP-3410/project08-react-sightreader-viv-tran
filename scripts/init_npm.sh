#!/bin/bash
cat npm-requirements.txt | sed '/^#/ d' | tr "\\n" " " | xargs npm install -g
