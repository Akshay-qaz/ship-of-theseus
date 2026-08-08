# Android toolchain setup

Date: 2026-08-08

- Confirmed Java 17 was already installed at `/usr/bin/java`.
- Downloaded Android command-line tools `commandlinetools-linux-11076708_latest.zip` from `https://dl.google.com/android/repository/`.
- Installed the SDK under `/home/ubuntu/android-sdk`.
- Accepted Android SDK licenses non-interactively with:
  `yes | sdkmanager --licenses`
- Installed:
  - `platform-tools`
  - `platforms;android-35`
  - `build-tools;35.0.0`
  - `emulator`
  - `system-images;android-35;google_apis;x86_64`
- Created AVD `ship_api35` with:
  `echo no | avdmanager create avd -n ship_api35 -k 'system-images;android-35;google_apis;x86_64' -d pixel_6 --force`
- Shell environment used:
  - `ANDROID_SDK_ROOT=/home/ubuntu/android-sdk`
  - `PATH=$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/emulator:$PATH`
- No credentials were required.
