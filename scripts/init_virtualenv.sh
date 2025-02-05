#!/bin/bash
set -e

VENV=env

echo "[$(date)] Removing existing virtualenv if it exists."
[ -d $VENV ] && rm -Rf $VENV

echo "[$(date)] Creating virtual environment."
python3 -m venv $VENV

echo "[$(date)] Activating virtual environment."
. $VENV/bin/activate

echo "[$(date)] Upgrading pip."
pip install -U pip setuptools wheel

pip install Cython

echo "[$(date)] Installing pip requirements."
pip install -r pip-requirements.txt
