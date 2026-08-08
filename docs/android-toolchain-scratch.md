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
- Downloaded Gradle 8.9 and generated `android/gradlew` and wrapper metadata.
- Initially observed transient Maven Central HTTP 429 responses during plugin
  resolution. The mirror workaround was removed after dependency artifacts were
  cached; Gradle now uses only `google()` and `mavenCentral()`.
- Before mirror removal, `./gradlew assembleDebug` installed the missing Build
  Tools 34 transitively and completed successfully. After removal, a later
  canonical-repository retry was blocked by Maven Central's HTTP 429 rate limit;
  offline mode could not satisfy uncached plugin artifacts.
- Attempted to boot `ship_api35` with hardware acceleration first; the emulator
  reported that `/dev/kvm` is owned by group `kvm` but the `ubuntu` user is not
  a member. Retried with `-accel off`; the software emulator reached partial
  Android boot but package-manager/activity services remained unavailable and
  `adb install` did not complete. The emulator was stopped after this attempt.
- Follow-up fix: applied `sudo usermod -aG kvm ubuntu` and
  `sudo chmod 660 /dev/kvm`. Existing shells were refreshed with `sg kvm -c`.
  `sg kvm -c 'emulator -accel-check'` now reports:
  `KVM (version 12) is installed and usable.`
