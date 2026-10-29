import { ExtensionStorage } from '@bacons/apple-targets';
import { SNAPSHOT_KEY, WIDGET_APP_GROUP, serializeSnapshot, type WidgetSnapshot } from './widgetSnapshot';

// The iPhone side of the widget: writes the snapshot into the App Group the widget reads, and asks the widget to refresh.
// In a build that does not contain the widget (an older app, or before the first widget build) the library's native part is missing and these calls do nothing.
const storage = new ExtensionStorage(WIDGET_APP_GROUP);

export const widgetsSupported = true;

// A snapshot to show, or null to erase it (signing out) so the widget goes back to "open FitNFree".
export function publishWidgetSnapshot(snapshot: WidgetSnapshot | null): void {
  storage.set(SNAPSHOT_KEY, snapshot ? serializeSnapshot(snapshot) : undefined);
  ExtensionStorage.reloadWidget();
}
