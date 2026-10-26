import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';
import type { ComponentType } from 'react';
import { Platform } from 'react-native';
import { scrubBreadcrumb, scrubEvent } from './sentryScrub';

// Crash and error reporting (Sentry). Kept deliberately small and quiet:
//  - It does nothing unless EXPO_PUBLIC_SENTRY_DSN is set (the DSN is public by design), and never in development or on the web
//    (the web app's content-security policy does not allow Sentry anyway).
//  - Errors and native crashes only: no performance traces, session replay, profiling, logs, screenshots or session tracking.
//  - No user identity is attached, no IP address is collected, and request bodies, cookies and headers are removed.
//    Emails and sign-in tokens are blanked out of messages, and console output and URL query strings are dropped from breadcrumbs,
//    because they could contain what a user typed to the AI coach or meal and health details.
// This matters for the App Store "App Privacy" answers: it collects Crash Data (diagnostics), not linked to the user, not for tracking.

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
export const errorReportingEnabled = !!dsn && !__DEV__ && Platform.OS !== 'web';

export function initErrorReporting(): void {
  if (!errorReportingEnabled) return;
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    enableAutoSessionTracking: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    maxBreadcrumbs: 30,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });

  // Which over-the-air update was running, so a bad update can be recognised and rolled back.
  Sentry.setTag('expo-update-id', Updates.updateId ?? 'embedded');
  Sentry.setTag('expo-is-embedded-update', String(Updates.isEmbeddedLaunch));
  Sentry.setTag('expo-channel', Updates.channel ?? 'none');
  Sentry.setTag('expo-runtime-version', Updates.runtimeVersion ?? 'unknown');

  // One-off check for a preview build: set EXPO_PUBLIC_SENTRY_SELFTEST=1 for that build only, then confirm the event appears.
  if (process.env.EXPO_PUBLIC_SENTRY_SELFTEST === '1') Sentry.captureMessage('FitNFree Sentry self-test');
}

// Wraps the root component so React render errors are reported too. A no-op when reporting is off.
export function withErrorReporting<P extends object>(component: ComponentType<P>): ComponentType<P> {
  // Sentry.wrap is typed for components with loose props; the wrapped component keeps the original props at runtime.
  return errorReportingEnabled ? (Sentry.wrap(component as ComponentType<Record<string, unknown>>) as unknown as ComponentType<P>) : component;
}
