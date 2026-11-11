#!/usr/bin/env bash
# Build the latest debug APK, install it on the emulator (starting it if needed) and launch OurDay.
#   ./scripts/run-on-emulator.sh          build + install + launch
#   ./scripts/run-on-emulator.sh --reset  also wipe the app's data first (fresh sign-in screen)
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
scripts/emulator.sh
./gradlew :app:installDebug -q
[ "${1:-}" = "--reset" ] && adb shell pm clear "$APP_ID" >/dev/null
adb shell am start -n "$APP_ID/com.ourday.app.MainActivity" >/dev/null
echo "OurDay is running on the emulator."
