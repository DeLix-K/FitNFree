import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { ExportFile } from './dataExport';

// Hands an export file to the phone's share sheet (Save to Files, email, another app...). The file is written to the app's private cache folder first;
// nothing is uploaded by us. The cache copy stays until the next export or the next time the Export screen opens (the share sheet may still be reading
// it when this returns, on Android), so it is cleared then, and the phone may clear the cache sooner.

const folder = () => new Directory(Paths.cache, 'exports');

export function clearOldExports(): void {
  try {
    const dir = folder();
    if (dir.exists) dir.delete();
  } catch {
    /* a leftover file is harmless; it is private to the app and the system cache is cleared by the phone */
  }
}

export async function shareExport(file: ExportFile): Promise<'shared' | 'unavailable'> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  clearOldExports();
  const dir = folder();
  dir.create({ idempotent: true, intermediates: true });
  const out = new File(dir, file.name);
  out.create({ overwrite: true });
  out.write(file.text);
  await Sharing.shareAsync(out.uri, { mimeType: file.mime, UTI: file.mime === 'text/csv' ? 'public.comma-separated-values-text' : 'public.json', dialogTitle: 'Save or send your data' });
  return 'shared';
}
