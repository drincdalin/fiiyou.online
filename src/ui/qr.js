import qrcode from 'qrcode-generator';

/** QR code as plain data (no HTML ever): { size, path } where path is one SVG path of black squares in a size x size grid. */
export function qrData(text) {
  const qr = qrcode(0, 'M'); qr.addData(String(text)); qr.make();
  const size = qr.getModuleCount(); let path = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size;) {
      if (!qr.isDark(r, c)) { c++; continue; }
      let len = 1; while (c + len < size && qr.isDark(r, c + len)) len++;   // merge a horizontal run into one rectangle
      path += `M${c} ${r}h${len}v1h-${len}z`; c += len;
    }
  }
  return { size, path, dark: (r, c) => qr.isDark(r, c) };
}

/** PNG of the QR code with a white quiet zone (scans better than a transparent one). */
export function qrPng(text, { px = 1024, margin = 4 } = {}) {
  const { size, dark } = qrData(text); const cell = Math.floor(px / (size + margin * 2)); const side = cell * (size + margin * 2);
  const c = document.createElement('canvas'); c.width = c.height = side; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, side, side); g.fillStyle = '#000';
  for (let r = 0; r < size; r++) for (let q = 0; q < size; q++) if (dark(r, q)) g.fillRect((q + margin) * cell, (r + margin) * cell, cell, cell);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not create the image.'))), 'image/png'));
}
