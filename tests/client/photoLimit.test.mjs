import test from 'node:test'; import assert from 'node:assert/strict';
import { MAX_PHOTOS, photosLeft, isOverPhotoLimit, fitPhotos, photoLimitNote, addedPhotosMessage } from '../../src/lib/photoLimit.js';
import { plainError } from '../../src/lib/plainError.js';

test('the limit is 15 photos', () => { assert.equal(MAX_PHOTOS, 15); });

test('photosLeft counts the free slots and never goes below zero', () => {
  assert.equal(photosLeft(0), 15); assert.equal(photosLeft(14), 1); assert.equal(photosLeft(15), 0);
  assert.equal(photosLeft(40), 0);                                   // an older profile above the limit
  assert.equal(photosLeft(undefined), 15); assert.equal(photosLeft(null), 15); assert.equal(photosLeft('x'), 15); assert.equal(photosLeft(-3), 15);
});

test('isOverPhotoLimit is only true above 15, not at 15', () => {
  assert.equal(isOverPhotoLimit(15), false); assert.equal(isOverPhotoLimit(16), true); assert.equal(isOverPhotoLimit(0), false);
});

test('fitPhotos keeps the first files that fit and counts the rest', () => {
  const files = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(fitPhotos(files, 0), { take: files, skipped: 0, room: 15 });
  assert.deepEqual(fitPhotos(files, 10), { take: files, skipped: 0, room: 5 });        // exactly fills the gallery
  assert.deepEqual(fitPhotos(files, 12), { take: ['a', 'b', 'c'], skipped: 2, room: 3 });
  assert.deepEqual(fitPhotos(files, 15), { take: [], skipped: 5, room: 0 });
  assert.deepEqual(fitPhotos(files, 22), { take: [], skipped: 5, room: 0 });            // over the limit: nothing is added, nothing breaks
  assert.deepEqual(fitPhotos([], 3), { take: [], skipped: 0, room: 12 });
  assert.deepEqual(fitPhotos(null, 3), { take: [], skipped: 0, room: 12 });
});

test('fitPhotos accepts a FileList-like (array-like) pick', () => {
  const list = { 0: 'a', 1: 'b', length: 2 };
  assert.deepEqual(fitPhotos(list, 14), { take: ['a'], skipped: 1, room: 1 });
});

test('photoLimitNote is empty while there is room, and explains the full and over-limit cases', () => {
  assert.equal(photoLimitNote(0), ''); assert.equal(photoLimitNote(14), '');
  assert.match(photoLimitNote(15), /15 of 15/);
  const over = photoLimitNote(17);
  assert.match(over, /17 photos/); assert.match(over, /over the limit of 15/); assert.match(over, /kept/);
});

test('addedPhotosMessage says when some files were left out', () => {
  assert.equal(addedPhotosMessage(1, 1), 'Photo added');
  assert.equal(addedPhotosMessage(3, 3), 'Photos added');
  assert.match(addedPhotosMessage(2, 5), /Added 2 of 5 photos/);
});

test('the photo_limit code from the database reads as a sentence that names the limit', () => {
  assert.match(plainError(new Error('photo_limit')), /up to 15 photos/);
  assert.match(plainError({ message: 'photo_limit', code: 'P0001' }), /up to 15 photos/);
});
