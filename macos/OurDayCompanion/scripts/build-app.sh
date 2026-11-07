#!/bin/zsh
# Builds "OurDay Companion.app" with swiftc (SwiftPM/Xcode are not required).
# Output: macos/OurDayCompanion/build/OurDay Companion.app, ad-hoc signed for local use.
set -euo pipefail
cd "$(dirname "$0")/.."
APP="build/OurDay Companion.app"
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS"
swiftc -O -module-name OurDayCompanion -target arm64-apple-macos13.0 \
  Sources/CompanionCore/*.swift Sources/OurDayCompanion/*.swift -o "$APP/Contents/MacOS/OurDayCompanion"
cp Resources/Info.plist "$APP/Contents/Info.plist"
codesign --force --sign - --identifier com.ourday.companion "$APP"
echo "Built: $PWD/$APP"
