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
- Maven Central is persistently rate-limited from this box's egress IP:
  `repo1.maven.org` and `repo.maven.apache.org` return HTTP 429. The Android
  build uses Google's official byte-for-byte Central mirror,
  `https://maven-central.storage-download.googleapis.com/maven2`, ordered
  before `mavenCentral()` (with `google()` first).
- Gradle dependency verification is enabled in strict mode with SHA-256
  checksums recorded in `android/gradle/verification-metadata.xml`. No
  signature verification is enabled.
- Attempted to boot `ship_api35` with hardware acceleration first; the emulator
  reported that `/dev/kvm` is owned by group `kvm` but the `ubuntu` user is not
  a member. Retried with `-accel off`; the software emulator reached partial
  Android boot but package-manager/activity services remained unavailable and
  `adb install` did not complete. The emulator was stopped after this attempt.
- Follow-up fix: applied `sudo usermod -aG kvm ubuntu` and
  `sudo chmod 660 /dev/kvm`. Existing shells were refreshed with `sg kvm -c`.
  `sg kvm -c 'emulator -accel-check'` now reports:
  `KVM (version 12) is installed and usable.`
