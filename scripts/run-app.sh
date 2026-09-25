#!/usr/bin/env bash
# Set up and launch vibeCheck for local development.
# Installs workspace dependencies, compiles both packages, and starts the app
# through Brazil. Safe to run repeatedly.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$script_dir"

if ! command -v brazil-build >/dev/null 2>&1; then
  echo "error: brazil-build is not on PATH. Run this from a Brazil workspace." >&2
  exit 1
fi

echo "==> Installing workspace dependencies (internal registry)"
brazil-build install

echo "==> Building desktop and backend packages"
brazil-build build

echo "==> Launching the app"
exec ./node_modules/.bin/electron .
