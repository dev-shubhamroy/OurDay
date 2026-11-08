#!/bin/zsh
# Builds "OurDay Companion.app" with swiftc (SwiftPM/Xcode are not required).
# Output: macos/OurDayCompanion/build/OurDay Companion.app, ad-hoc signed for local use.
set -euo pipefail
cd "$(dirname "$0")/.."
APP="build/OurDay Companion.app"
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS"
swiftc -swift-version 5 -O -module-name OurDayCompanion -target arm64-apple-macos13.0 \
  Sources/CompanionCore/*.swift Sources/OurDayCompanion/*.swift -o "$APP/Contents/MacOS/OurDayCompanion"
cp Resources/Info.plist "$APP/Contents/Info.plist"
mkdir -p "$APP/Contents/Resources" && cp -R Resources/Fonts "$APP/Contents/Resources/Fonts"
# Inject the PUBLIC Supabase URL + publishable key from the git-ignored frontend env file (never a secret key).
ENVF="../../frontend/.env.local"
[ -f "$ENVF" ] || { echo "Missing $ENVF (needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY)"; exit 1; }
SB_URL=$(grep -E '^VITE_SUPABASE_URL=' "$ENVF" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | awk '{print $1}')
SB_KEY=$(grep -E '^VITE_SUPABASE_(PUBLISHABLE_KEY|ANON_KEY)=' "$ENVF" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | awk '{print $1}')
case "$SB_KEY" in sb_secret_*|*service_role*) echo "Refusing: that looks like a secret key"; exit 1;; esac
[ -n "$SB_URL" ] && [ -n "$SB_KEY" ] || { echo "Supabase URL/publishable key not found in $ENVF"; exit 1; }
/usr/libexec/PlistBuddy -c "Add :OurDaySupabaseURL string $SB_URL" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :OurDaySupabaseKey string $SB_KEY" "$APP/Contents/Info.plist"
codesign --force --sign - --identifier com.ourday.companion "$APP"
echo "Built: $PWD/$APP"
