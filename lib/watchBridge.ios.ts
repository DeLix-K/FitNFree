import { buildWatchContext, parseWatchRequest, type WatchRequest } from './watchSync';
import type { WidgetSnapshot } from './widgetSnapshot';

// The iPhone side of the Apple Watch link (react-native-watch-connectivity, Apple's WatchConnectivity). The library is loaded on first use inside
// try/catch: in a build that does not contain it (an older app receiving this JavaScript) these calls do nothing instead of crashing at start-up.
type WatchLib = typeof import('react-native-watch-connectivity');

let lib: WatchLib | null | undefined;
function watchLib(): WatchLib | null {
  if (lib === undefined) {
    try {
      lib = require('react-native-watch-connectivity') as WatchLib;
    } catch {
      lib = null;
    }
  }
  return lib;
}

export const watchSupported = true;

// Hands the watch the latest snapshot (or, with null, the "signed out" state). The watch keeps the newest one; if no watch is paired it is a no-op.
export function publishWatchSnapshot(snapshot: WidgetSnapshot | null): void {
  const wc = watchLib();
  if (!wc) return;
  try {
    wc.updateApplicationContext(buildWatchContext(snapshot));
  } catch {
    // Not paired or the session is not ready: the next refresh sends it again.
  }
}

// Calls `onRequest` for each well-formed request the watch sends. Requests that arrived before this was called are delivered first
// (the library holds them until someone listens). Returns the function that stops listening.
export function subscribeWatchRequests(onRequest: (request: WatchRequest) => void): () => void {
  const wc = watchLib();
  if (!wc) return () => {};
  try {
    return wc.watchEvents.addListener('user-info', (items) => {
      for (const item of items) {
        const request = parseWatchRequest(item);
        if (request) onRequest(request);
      }
    });
  } catch {
    return () => {};
  }
}
