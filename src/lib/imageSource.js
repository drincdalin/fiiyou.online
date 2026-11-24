/** Decode an image file for canvas work in Safari/iOS, including camera files that
 *  createImageBitmap cannot open. Returns a drawable source plus its real size.
 *
 *  Order matters on iPhones: HEIC camera files and photos with an EXIF rotation often fail in
 *  createImageBitmap (or ignore the orientation option), while the normal <img> decoder handles
 *  them. The <img> path is also the fallback when the Canvas APIs are missing entirely. */
export async function loadImageSource(file) {
  if (typeof createImageBitmap === 'function') {
    for (const options of [{ imageOrientation: 'from-image' }, undefined]) {
      try {
        const bmp = await createImageBitmap(file, options);
        if (bmp.width && bmp.height) {
          return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close?.() };
        }
        bmp.close?.();                       // 0x0 bitmap: try the next decoder
      } catch { /* unsupported option / undecodable camera file */ }
    }
  }

  const url = URL.createObjectURL(file);
  const img = new Image();
  const ready = new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('decode failed'));
  });
  img.decoding = 'async';                    // no await img.decode(): Safari can reject it for images that load fine
  img.src = url;
  try {
    await ready;
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty image');
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('That photo could not be read. On iPhone, choose a JPEG or take the photo again.');
  }
}
