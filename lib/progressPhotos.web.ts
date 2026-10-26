import type { PhotoStore } from './photoIndex';

// In a browser there is no private place on the device to keep photos, so progress photos are a phone-app feature and this store is empty.
// (Nothing is uploaded to make up for it.)
const unavailable = () => Promise.reject(new Error('Progress photos are kept only on your phone, so they are available in the iPhone and Android app.'));

export const progressPhotos: PhotoStore = {
  available: false,
  list: () => Promise.resolve([]),
  add: unavailable,
  remove: unavailable,
  uriFor: () => '',
};
