#!/usr/bin/env bash
# Set up and launch vibeCheck for local development.
# Installs workspace dependencies, compiles both packages, and starts the app.
# Safe to run repeatedly.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$script_dir"

echo "==> Installing workspace dependencies"
npm ci

echo "==> Building desktop and backend packages"
npm run build

echo "==> Launching the app"
exec ./node_modules/.bin/electron .
