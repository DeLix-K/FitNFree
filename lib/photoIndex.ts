// The list of progress photos kept on this phone. Pure functions with no imports, so they can be tested on their own (scripts/test-body-log.mjs).
// The photos themselves live in the app's private storage and are never uploaded; this is only the list that says which file is which.
// The list is kept in the phone's own storage, so it is read defensively: anything that does not look right is dropped, and a file name is only used
// to build a path if it is exactly the safe shape this module creates.

export type Pose = 'front' | 'side' | 'back' | 'other';
export const POSES: { value: Pose; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'side', label: 'Side' },
  { value: 'back', label: 'Back' },
  { value: 'other', label: 'Other' },
];

export type PhotoMeta = {
  id: string;
  taken: string; // YYYY-MM-DD, the day the photo is about
  pose: Pose;
  file: string; // file name inside the private photos folder
  addedAt: string; // ISO time
};

// What the screen needs from the photo store. The real one (lib/progressPhotos.ts) keeps files in the app's private storage on the phone;
// the screen takes this as a prop so it can be shown with an in-memory store.
export type PhotoStore = {
  available: boolean; // false in a browser, where nothing can be kept privately on the device
  list: () => Promise<PhotoMeta[]>;
  add: (sourceUri: string, taken: string, pose: Pose) => Promise<PhotoMeta[]>;
  remove: (id: string) => Promise<PhotoMeta[]>;
  uriFor: (photo: PhotoMeta) => string;
};

export const MAX_PHOTOS = 300;
const FILE_RE = /^(front|side|back|other)-\d{8}-[0-9a-f]{8}\.jpg$/;
export const isSafeFileName = (s: unknown): s is string => typeof s === 'string' && FILE_RE.test(s);

const isDate = (s: unknown): s is string => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d && y >= 2000 && y <= 2100;
};

// A new file name: pose, the date without dashes, and 8 random hex characters. `random` is a number from 0 up to but not including 1.
export function newFileName(pose: Pose, taken: string, random: () => number = Math.random): string {
  const hex = Array.from({ length: 8 }, () => Math.floor(random() * 16).toString(16)).join('');
  return `${pose}-${taken.replace(/-/g, '')}-${hex}.jpg`;
}

export function parseIndex(raw: string | null | undefined): PhotoMeta[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const out: PhotoMeta[] = [];
  for (const x of data) {
    if (!x || typeof x !== 'object') continue;
    const m = x as Record<string, unknown>;
    if (typeof m.id !== 'string' || !/^[A-Za-z0-9-]{1,40}$/.test(m.id) || seen.has(m.id)) continue;
    if (!isDate(m.taken) || !isSafeFileName(m.file) || typeof m.addedAt !== 'string') continue;
    if (!POSES.some((p) => p.value === m.pose)) continue;
    seen.add(m.id);
    out.push({ id: m.id, taken: m.taken, pose: m.pose as Pose, file: m.file, addedAt: m.addedAt.slice(0, 40) });
    if (out.length >= MAX_PHOTOS) break;
  }
  return sortPhotos(out);
}

export const serializeIndex = (list: PhotoMeta[]): string => JSON.stringify(list.slice(0, MAX_PHOTOS));

// Newest day first; within a day, front, side, back, other.
export function sortPhotos(list: PhotoMeta[]): PhotoMeta[] {
  const order = (p: Pose) => POSES.findIndex((x) => x.value === p);
  return [...list].sort((a, b) => (a.taken < b.taken ? 1 : a.taken > b.taken ? -1 : order(a.pose) - order(b.pose) || (a.addedAt < b.addedAt ? 1 : -1)));
}

export function addPhoto(list: PhotoMeta[], meta: PhotoMeta): PhotoMeta[] {
  if (list.length >= MAX_PHOTOS) throw new Error(`You can keep up to ${MAX_PHOTOS} photos. Delete some old ones first.`);
  if (list.some((p) => p.id === meta.id || p.file === meta.file)) throw new Error('That photo is already in the list.');
  return sortPhotos([...list, meta]);
}

export const removePhoto = (list: PhotoMeta[], id: string): PhotoMeta[] => list.filter((p) => p.id !== id);

export function groupByDate(list: PhotoMeta[]): { date: string; photos: PhotoMeta[] }[] {
  const groups = new Map<string, PhotoMeta[]>();
  for (const p of sortPhotos(list)) groups.set(p.taken, [...(groups.get(p.taken) ?? []), p]);
  return [...groups.entries()].map(([date, photos]) => ({ date, photos }));
}

// The earliest and the latest photo of the same pose, for a before-and-after. Null unless there are two different days.
export function comparisonPair(list: PhotoMeta[], pose: Pose): { before: PhotoMeta; after: PhotoMeta } | null {
  const same = list.filter((p) => p.pose === pose).sort((a, b) => (a.taken < b.taken ? -1 : a.taken > b.taken ? 1 : a.addedAt < b.addedAt ? -1 : 1));
  if (same.length < 2) return null;
  const before = same[0];
  const after = same[same.length - 1];
  return before.taken === after.taken ? null : { before, after };
}

// Poses that have a before-and-after available.
export const comparablePoses = (list: PhotoMeta[]): Pose[] => POSES.map((p) => p.value).filter((p) => comparisonPair(list, p) !== null);
