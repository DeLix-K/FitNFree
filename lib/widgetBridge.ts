import type { WidgetSnapshot } from './widgetSnapshot';

// Home-screen widgets are only built for iPhone so far (the iPhone version is lib/widgetBridge.ios.ts); everywhere else these do nothing.
export const widgetsSupported = false;

export function publishWidgetSnapshot(snapshot: WidgetSnapshot | null): void {
  void snapshot;
}
