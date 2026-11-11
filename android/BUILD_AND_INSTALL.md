# Build and install

## 1. Prerequisites
- JDK 17, Android SDK platform 35 + build-tools 35 (Android Studio Koala or newer installs these), no other tooling. Gradle is provided by the wrapper (`./gradlew`).
- Open the `android/` folder in Android Studio ("Open"), or use the command line below.

## 2. Configure Supabase (public values only)
Create `android/local.properties` (git-ignored; see [.env.example](.env.example)):

```
sdk.dir=/path/to/Android/sdk
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-KEY
```

These are the same two public values the web app uses (`frontend/.env.local`). **Never** put the service-role key, the database password or SMTP credentials anywhere in the Android project. Without these two values the app builds but shows a setup message on the sign-in screen.

## 3. Build
```bash
cd android
./gradlew :domain:test :app:testDebugUnitTest   # unit tests
./gradlew :app:lintDebug                          # lint
./gradlew :app:assembleDebug                      # debug APK
```
The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

## 3b. Run on the emulator (no phone needed)
One-time setup is done on this Mac: Android Emulator + the Android 15 (Google APIs, arm64) system image are installed in `~/Library/Android/sdk`, and an AVD named **OurDay_Pixel** (Pixel 7, 1080x2400, 3 GB RAM) exists in `~/.android/avd`.
```bash
cd android
./scripts/run-on-emulator.sh            # start the emulator if needed, build the latest debug APK, install it, launch OurDay
./scripts/run-on-emulator.sh --reset    # same, but wipe the app's data first (fresh sign-in screen)
./scripts/emulator.sh                   # just start/reopen the emulator and wait for boot
```
Open the emulator again later with `./scripts/emulator.sh` (it boots from a saved snapshot in a few seconds). After any code change run `./scripts/run-on-emulator.sh`. In Android Studio you can instead pick **OurDay_Pixel** in Device Manager and press Run. The emulator uses DNS 8.8.8.8/1.1.1.1 (set in the script) because it otherwise often has no internet on macOS. The emulator window is the real native app, not a browser.

**Widget on the emulator:** supported (Pixel Launcher). Sign in first, then long-press an empty spot on the home screen → Widgets → OurDay → drag **OurDay · Today** onto the screen. Before sign-in it shows "Open OurDay to sign in and sync."

**What you can test on the emulator now:** sign-in with your real account (real Supabase), Today/Tasks/Habits/Shared/More, Partner Mode, RANA, offline mode (turn on airplane mode in the emulator, edit tasks, turn it off and watch the sync strip), the widget and completing a task from it, the notification permission prompt and channels (Settings → Apps → OurDay → Notifications), the 9:30 PM check-in (set the emulator clock past 21:30), tapping notifications/deep links (`adb shell am start -a android.intent.action.VIEW -d ourday://habits`). **Needs real server notifications:** the 15-minute notification check only shows rows the backend creates (a deadline reminder, a partner's shared-task request or reminder), so create a deadline a few minutes away or have your partner send a reminder, then pull to refresh. **Needs Firebase:** instant push (FCM) cannot work without your `google-services.json`, the applied device-token migration and the deployed sender.

## 4. Install on your phone
1. On the phone: Settings → About phone → tap Build number 7 times, then Settings → System → Developer options → turn on USB debugging.
2. Connect the phone, accept the prompt, then: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`
   (or copy the APK to the phone and open it; allow "install unknown apps" for your file manager).
3. Open OurDay, sign in with your existing OurDay email and password.
4. Allow notifications when asked (Android 13+).

## 4b. Add the home-screen widget
Long-press an empty spot on the home screen → **Widgets** → **OurDay** → drag **OurDay · Today** onto the screen; resize it (3x2 compact, taller for more rows). Tap its header to open OurDay, tap a task to open it, tap the circle to complete it. It shows your tasks for today, how many are left and your next deadline.

## 4c. Notifications on this phone
1. Allow notifications when asked (Settings → Notifications shows the status).
2. **Turn off "Phone notifications" in the OurDay web app on this phone** (otherwise each notification appears twice: once from the web app, once from this app).
3. Keep "Show OurDay notifications on this phone" on (Settings → Notifications). New server notifications appear within about 15 minutes, sooner when you open the app.
4. Android Settings → Apps → OurDay → Battery → **Unrestricted**, so Android doesn't delay the background check.

## 5. Optional: instant push (FCM) — exact steps
1. Firebase console → **Add project** (free Spark plan, analytics optional) → **Add app → Android**, package name `com.ourday.app.debug` (debug builds) → download **google-services.json** into `android/app/` (git-ignored; never commit it). Rebuild: the Google Services plugin is applied only when that file exists.
2. Firebase console → Project settings → **Service accounts** → **Generate new private key** (a JSON file; keep it secret, never in the app or Git).
3. Apply the prepared migration (needs your approval): `supabase db push --remote=<project-ref>` applies `20261112100000_android_device_tokens.sql`.
4. Set the server secrets and deploy the sender (needs your approval):
   `supabase secrets set --remote=<ref> FCM_PROJECT_ID=<firebase-project-id> FCM_SERVICE_ACCOUNT_JSON="$(cat service-account.json)"`
   `supabase functions deploy send-push --remote=<ref> --no-verify-jwt --use-api`
5. Install the rebuilt APK, sign in, and check the registration: `select count(*) from public.device_tokens;` should be 1. The app then marks FCM active and stops its 15-minute check.
6. Delivery is verified only when a real notification arrives on the phone with the app closed. Nothing here has been verified that way yet.

## 6. Release build
`./gradlew :app:assembleRelease` produces an **unsigned**, minified APK. Signing (a keystore you create and keep out of Git) is not configured in this repository. R8/minify is configured but the release build has not been run on a device.
