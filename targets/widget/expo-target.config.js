// The iPhone home-screen widget (Swift, SwiftUI + WidgetKit). Generated into the Xcode project by @bacons/apple-targets during `expo prebuild`.
// The app and the widget share ONE small piece of storage, the App Group below; the widget has no network access code and no sign-in.
// What it reads is written by lib/widgetSnapshot.ts, and FitNFreeWidget.swift mirrors that file's rules.

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'FitNFreeWidget',
  displayName: 'FitNFree',
  bundleIdentifier: '.widget',
  // Widgets that use .containerBackground need iOS 17. Phones on an older iOS simply do not offer the widget; the app is unaffected.
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
  colors: {
    $accent: '#a3e635',
    $widgetBackground: '#0a0a0a',
  },
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
