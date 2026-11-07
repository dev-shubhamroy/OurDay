#!/bin/zsh
# Runs the pure-logic tests. Needs only the Command Line Tools.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
swiftc -swift-version 5 -O Sources/CompanionCore/*.swift Tests/*.swift -o "$OUT/core-tests"
"$OUT/core-tests"
