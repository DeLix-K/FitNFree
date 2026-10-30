// The Apple Watch app (Swift, SwiftUI + WatchConnectivity), a companion to the iPhone app. Generated into the Xcode project by @bacons/apple-targets
// during `expo prebuild`. It shows the streak and this week's workouts and can send "log today's workout"; see lib/watchSync.ts for how it talks to the phone.
// The watch holds no sign-in, contacts no server and reads no health data, so it needs no App Group, no HealthKit and no background mode.

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: 'watch',
  name: 'FitNFreeWatch',
  displayName: 'FitNFree',
  // Apple's convention for a watch app that ships inside the iPhone app: the iPhone identifier plus ".watchkitapp".
  bundleIdentifier: '.watchkitapp',
  // watchOS 10 for NavigationStack-era SwiftUI; an older watch simply does not get the app (the iPhone app is unaffected).
  deploymentTarget: '10.0',
  // Becomes the 1024 x 1024 watch app icon (App Store needs one).
  icon: '../../assets/icon.png',
  colors: {
    $accent: '#a3e635',
  },
});
