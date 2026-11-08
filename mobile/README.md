# HuskyHealth iOS companion (Expo, local build)

Native companion to the HuskyHealth website. Same engine (`../web/js/engine.js`, `features.js`, `view.js`), same ASCII panels, but it reads **HealthKit directly**: real workouts with their types, heart rate, resting HR, HRV, VO2 max, effort.

Built from the Colère Nu Expo setup (SDK 58, expo-router, local Expo modules):

- `modules/health-kit`: Swift HealthKit module (`HealthCore.swift`): queries, the convenience-mode drop, background delivery, on-phone history.
- `modules/duo-display`: the iPhone Duo display module, from Colère Nu.

## Privacy

- Everything is computed on the phone. History (`History` screen) is a file on the phone with complete file protection. No accounts.
- Convenience mode (off by default): pair with the code from the website's Settings. When the Watch saves a workout, HealthKit wakes the app in the background and it posts the workout (type + heart rate) to the relay, which encrypts it to the browser's key and keeps only ciphertext, in memory, until collected (max 24 h). Nothing is stored on the Pi.

## Run on the simulator

```bash
npm install --prefer-offline
npx expo prebuild --platform ios
cd ios && LANG=en_US.UTF-8 pod install && cd ..
LANG=en_US.UTF-8 xcodebuild -workspace ios/HuskyHealth.xcworkspace -scheme HuskyHealth -configuration Release \
  -destination "platform=iOS Simulator,name=iPhone Duo" -derivedDataPath ios/build
xcrun simctl install booted ios/build/Build/Products/Release-iphonesimulator/HuskyHealth.app
```

Tap **Demo workout** to add a 45-minute squash session to the simulator's Health.

## Run on your iPhone

Open `ios/HuskyHealth.xcworkspace` in Xcode, select your iPhone, set Signing & Capabilities → Team to your Apple ID (HealthKit capability is already in `app.json`), and Run. Then Settings → General → Background App Refresh → HuskyHealth on, so background sync works.
