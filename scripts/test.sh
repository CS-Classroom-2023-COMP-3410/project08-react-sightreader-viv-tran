#!/bin/bash
set -e
. .env/bin/activate
./check-py.sh
./check-js.sh
./check-html.sh
