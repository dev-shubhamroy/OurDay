#!/bin/zsh
# Installs the app into ~/Applications (a stable path is needed for "Launch at login") and starts it.
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/build-app.sh
mkdir -p "$HOME/Applications"
pkill -x OurDayCompanion 2>/dev/null || true; sleep 1
rm -rf "$HOME/Applications/OurDay Companion.app"
cp -R "build/OurDay Companion.app" "$HOME/Applications/"
if [ $# -gt 0 ]; then open "$HOME/Applications/OurDay Companion.app" --args "$@"; else open "$HOME/Applications/OurDay Companion.app"; fi
echo "Installed to ~/Applications/OurDay Companion.app"
