import type { WatchRequest } from './watchSync';
import type { WidgetSnapshot } from './widgetSnapshot';

// Web and Android have no Apple Watch: these do nothing. The iPhone version is lib/watchBridge.ios.ts.
export const watchSupported = false;

export function publishWatchSnapshot(_snapshot: WidgetSnapshot | null): void {}

export function subscribeWatchRequests(_onRequest: (request: WatchRequest) => void): () => void {
  return () => {};
}
