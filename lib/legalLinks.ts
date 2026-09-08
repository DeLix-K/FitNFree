import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';

// Reads the URLs set in app.json's `extra` block (see docs/store-listing.md
// for where these are hosted) rather than hardcoding them here, so a future
// domain change is a one-line app.json edit, not a code change.
const extra = Constants.expoConfig?.extra as
  | { privacyPolicyUrl?: string; termsUrl?: string; supportUrl?: string }
  | undefined;

export const LEGAL_LINKS = {
  privacyPolicy: extra?.privacyPolicyUrl ?? null,
  terms: extra?.termsUrl ?? null,
  support: extra?.supportUrl ?? null,
};

// Opens in an in-app Safari/Chrome tab (not the full auth-session flow --
// there's no return deep link to wait for here, just a page to read).
export async function openLegalLink(url: string | null): Promise<void> {
  if (!url) return;
  await WebBrowser.openBrowserAsync(url);
}
