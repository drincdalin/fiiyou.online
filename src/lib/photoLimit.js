// The photo gallery holds at most MAX_PHOTOS pictures per profile.
// Keep this equal to the number in the database trigger limit_photos() (supabase/migrations/0058_photo_limit_15.sql);
// the database is the real enforcement, this file only lets the screens stop early and explain themselves.
export const MAX_PHOTOS = 15;

const n = (count) => Math.max(0, Math.floor(Number(count) || 0));

/** How many more photos can be added. Never negative: a profile that already has more than the limit has 0 left. */
export const photosLeft = (count) => Math.max(0, MAX_PHOTOS - n(count));

/** A profile that was created before the limit can hold more than MAX_PHOTOS. Those photos are kept, nothing more can be added. */
export const isOverPhotoLimit = (count) => n(count) > MAX_PHOTOS;

/** Splits a multi-file pick into the files that still fit and the number that do not.
 *  The first files of the pick are the ones that are kept. */
export function fitPhotos(files, count) {
  const list = Array.from(files || []);
  const room = photosLeft(count);
  return { take: list.slice(0, room), skipped: Math.max(0, list.length - room), room };
}

/** One sentence for the screen when no more photos can be added; '' while there is still room. */
export function photoLimitNote(count) {
  const c = n(count);
  if (c > MAX_PHOTOS) return `You have ${c} photos, which is over the limit of ${MAX_PHOTOS}. Your photos are kept, but you cannot add new ones until you delete some.`;
  if (c === MAX_PHOTOS) return `You have ${MAX_PHOTOS} of ${MAX_PHOTOS} photos. Delete one to add another.`;
  return '';
}

/** The message shown after a multi-file pick: what was added, and why some files were left out. */
export function addedPhotosMessage(added, picked) {
  const a = n(added), p = n(picked);
  if (a < p) return `Added ${a} of ${p} photos. The limit is ${MAX_PHOTOS} photos, so the rest were not added.`;
  return a === 1 ? 'Photo added' : 'Photos added';
}
