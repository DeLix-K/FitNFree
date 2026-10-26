import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { addPhoto, newFileName, parseIndex, removePhoto, serializeIndex, type PhotoMeta, type PhotoStore, type Pose } from './photoIndex';

// Progress photos, kept ONLY on this phone: the picture files go in the app's private document folder and the list that says which is which
// goes in the app's own storage. Nothing here talks to the network, and no photo is ever sent to the database, a server or an AI service.
// (Where the phone backs up app data to the person's own iCloud or computer, the photos may be included in that backup; they are never sent to us.)

const INDEX_KEY = 'fitnfree.progressPhotos.index.v1';
const folder = () => new Directory(Paths.document, 'progress-photos');

// One change at a time, so two quick taps cannot overwrite each other's list.
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(job: () => Promise<T>): Promise<T> => {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
};

const fileOf = (photo: Pick<PhotoMeta, 'file'>) => new File(folder(), photo.file);

async function readIndex(): Promise<PhotoMeta[]> {
  return parseIndex(await AsyncStorage.getItem(INDEX_KEY));
}

export const progressPhotos: PhotoStore = {
  available: true,

  // The list, minus any entry whose file has gone (for example if the system cleared it); the list is tidied to match.
  list: () =>
    serial(async () => {
      const all = await readIndex();
      const present = all.filter((p) => {
        try {
          return fileOf(p).exists;
        } catch {
          return false;
        }
      });
      if (present.length !== all.length) await AsyncStorage.setItem(INDEX_KEY, serializeIndex(present));
      return present;
    }),

  // Copies the picture into the private folder (the picker's own copy is a temporary file) and adds it to the list.
  add: (sourceUri, taken, pose: Pose) =>
    serial(async () => {
      const all = await readIndex();
      const file = newFileName(pose, taken);
      const meta: PhotoMeta = { id: file.replace(/\.jpg$/, ''), taken, pose, file, addedAt: new Date().toISOString() };
      const next = addPhoto(all, meta); // throws if the list is full
      folder().create({ idempotent: true, intermediates: true });
      const dest = fileOf(meta);
      new File(sourceUri).copy(dest, { overwrite: false });
      try {
        await AsyncStorage.setItem(INDEX_KEY, serializeIndex(next));
      } catch (e) {
        try {
          dest.delete();
        } catch {
          /* nothing more to do */
        }
        throw e;
      }
      try {
        // Tidy the temporary copy, but only if it is in the app's cache folder; never delete a file from the person's library.
        const source = new File(sourceUri);
        if (sourceUri.startsWith(Paths.cache.uri) && source.exists) source.delete();
      } catch {
        /* the system clears the cache itself */
      }
      return next;
    }),

  // Deletes the picture, then takes it off the list.
  remove: (id) =>
    serial(async () => {
      const all = await readIndex();
      const target = all.find((p) => p.id === id);
      if (target) {
        const f = fileOf(target);
        if (f.exists) f.delete();
      }
      const next = removePhoto(all, id);
      await AsyncStorage.setItem(INDEX_KEY, serializeIndex(next));
      return next;
    }),

  uriFor: (photo) => fileOf(photo).uri,
};
