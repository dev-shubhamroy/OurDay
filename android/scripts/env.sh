# Source me: points at the toolchain installed for this project (JDK 17 + Android SDK). Edit if you use Android Studio's own.
export JAVA_HOME="${JAVA_HOME:-$HOME/.ourday-toolchain/jdk-17.0.21+9/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
AVD_NAME="${AVD_NAME:-OurDay_Pixel}"
APP_ID="com.ourday.app.debug"
