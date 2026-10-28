import type { ExportFile } from './dataExport';

// On the web the file is made in the browser and downloaded; nothing is uploaded.
export function clearOldExports(): void {}

export async function shareExport(file: ExportFile): Promise<'shared' | 'unavailable'> {
  const url = URL.createObjectURL(new Blob([file.text], { type: `${file.mime};charset=utf-8` }));
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  return 'shared';
}
