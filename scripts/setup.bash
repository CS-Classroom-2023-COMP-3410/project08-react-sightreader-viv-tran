#!/bin/bash
# Creates a local PIP-aware shell.
# Call by sourcing, e.g. . ./setup.bash
VARA=$_
VARB=$0
if [ "$VARA" == "$VARB" ] && [ "$VARA" == "./setup.bash" ]
then
    echo "Please source this script. Do not execute."
    exit 1
fi
. .env/bin/activate
