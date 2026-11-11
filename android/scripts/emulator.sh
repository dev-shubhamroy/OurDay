#!/usr/bin/env bash
# Starts the OurDay emulator (Pixel 7, Android 15) if it is not already running, and waits until it has booted.
# DNS is set explicitly because the emulator otherwise often has no internet on macOS.
set -euo pipefail
source "$(dirname "$0")/env.sh"
if ! adb devices | grep -q "emulator-.*device$"; then
  echo "Starting $AVD_NAME …"
  nohup emulator -avd "$AVD_NAME" -netdelay none -netspeed full -gpu auto -dns-server 8.8.8.8,1.1.1.1 >/tmp/ourday-emulator.log 2>&1 &
  disown
  adb wait-for-device
fi
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 3; done
echo "Emulator is ready."
