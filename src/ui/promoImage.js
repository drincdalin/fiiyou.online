import { FONT_STACKS, THEME_DEFAULTS } from './theme.js';
import { onColor, VERIFIED_BLUE } from './appTheme.js';
import { profileUrl } from './storyImage.js';

/* ======================================================================
   promoImage.js — share cards that sit directly on the profile's backdrop.

   Layout (1080 × 1920):
     header   wordmark left, @handle right
     content  one of the templates below, vertically balanced in the
              open area between the header and the call to action
     footer   hairline, call-to-action text + link, round arrow button

   The profile theme drives fonts, colours, borders and radii. Avatars keep
   their exact natural aspect ratio on the intro card. Content is measured first and
   scaled or trimmed to fit, never squeezed after the fact.

   Templates:
     card  — portrait, name, headline, stats
     top8  — ranked friends, open spots inviting participation
     vibe  — album art and player
     wall  — one guestbook message in a speech bubble
     full  — compact profile with the selected sections
   ====================================================================== */

const UI_STACK =
  '"Ubuntu Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const canvasStack = (key, customFamily) =>
  key === 'custom'
    ? customFamily
      ? `"${customFamily}", ${UI_STACK}`
      : UI_STACK
    : (FONT_STACKS[key] === 'var(--ui-font)' ? UI_STACK : FONT_STACKS[key]) ||
      UI_STACK;

const W = 1080;
const H = 1920;

const MX = 84; // side margin
const CW = W - MX * 2; // content width

const HEAD_CY = 234; // vertical centre of the header row

const ROOM_TOP = 322; // open area for content
const ROOM_BOT = 1530;
const ROOM = ROOM_BOT - ROOM_TOP;

const RULE_Y = 1576; // hairline above the call to action
const BTN_R = 44;
const BTN_CY = 1658;

// Fallback aspect ratio (height / width)
const PORTRAIT = 250 / 220;

/* ------------------------------------------------------------ templates */

export const PROMO_TEMPLATES = [
  {
    id: 'card',
    label: 'Say hi',
    hint: 'A personal intro people can actually share.',
    needs: () => true,
  },
  {
    id: 'top8',
    label: 'My top 8',
    hint: 'Your people, ranked. Invite friends to compare.',
    needs: (d) => d.topFriends.length > 0,
  },
  {
    id: 'vibe',
    label: 'On repeat',
    hint: 'A snapshot of what you’re listening to lately.',
    needs: (d) => !!(d.music && (d.music.title || d.music.artist)),
  },
  {
    id: 'wall',
    label: 'Left on my wall',
    hint: 'A real message from someone who stopped by.',
    needs: (d) => d.guestbook.length > 0,
  },
  {
    id: 'full',
    label: 'Full profile',
    hint: 'A compact look at the things that make you you.',
    needs: () => true,
  },
];

export const availablePromos = (data = {}) => {
  const d = {
    music: null,
    topFriends: [],
    guestbook: [],
    ...data,
  };

  return PROMO_TEMPLATES.filter((p) => p.needs(d));
};

export const promoShareText = (template, slug) => {
  const url = profileUrl(slug);

  return (
    {
      card: `A little corner of the internet, all mine. Come say hi → ${url}`,
      top8: `Your top 8 says a lot. Who’s on yours? ${url}`,
      vibe: `Current rotation. What have you got on repeat? ${url}`,
      wall: `Someone left me this. Leave me a note too → ${url}`,
      full: `Get to know me a little better → ${url}`,
    }[template] || url
  );
};

export async function sharePromo(canvas, slug, template = 'card') {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new Error('Unable to create promo image')),
      'image/png'
    );
  });

  const file = new File([blob], `fiiyou-${template}-${slug}.png`, {
    type: 'image/png',
  });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        text: promoShareText(template, slug),
      });

      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = file.name;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);

  return 'downloaded';
}

/* -------------------------------------------------------------- helpers */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const num = (value, fallback) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const mk = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const loadImg = (src) =>
  new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }

    const image = new Image();

    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });

const rgbOf = (hex) => {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(
    String(hex || '').trim()
  );

  if (!match) return [0, 0, 0];

  let value = match[1];

  if (value.length === 3) {
    value = [...value].map((character) => character + character).join('');
  }

  const number = parseInt(value, 16);

  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
};

const rgba = (hex, alpha) => {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
};

const lumOf = ([r, g, b]) => {
  const linearize = (value) => {
    value /= 255;

    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
};

const contrastOf = (a, b) => {
  const [high, low] = [lumOf(a), lumOf(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

function rrp(g, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));

  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const rr = (g, x, y, w, h, radius) => {
  g.beginPath();
  rrp(g, x, y, w, h, radius);
};

function drawCover(g, image, x, y, w, h) {
  const scale = Math.max(w / image.width, h / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;

  g.drawImage(
    image,
    x + (w - drawWidth) / 2,
    y + (h - drawHeight) / 2,
    drawWidth,
    drawHeight
  );
}

const isPixelArt = (image) => Math.max(image.width, image.height) <= 160;

function drawCoverCrisp(g, image, x, y, w, h) {
  const scale = Math.max(w / image.width, h / image.height);
  const sourceWidth = w / scale;
  const sourceHeight = h / scale;

  g.save();

  if (scale > 1.01 && isPixelArt(image)) {
    g.imageSmoothingEnabled = false;
  }

  g.drawImage(
    image,
    (image.width - sourceWidth) / 2,
    (image.height - sourceHeight) / 2,
    sourceWidth,
    sourceHeight,
    x,
    y,
    w,
    h
  );

  g.restore();
}

const resample = (source, width, height) => {
  const canvas = mk(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
  const context = canvas.getContext('2d');

  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  return canvas;
};

const HAS_FILTER =
  typeof CanvasRenderingContext2D !== 'undefined' &&
  'filter' in CanvasRenderingContext2D.prototype;

function blurCover(image, radius) {
  const out = mk(W, H);
  const g = out.getContext('2d');

  g.imageSmoothingQuality = 'high';

  if (HAS_FILTER) {
    const pad = radius * 2;

    g.filter = `blur(${radius}px)`;
    drawCover(g, image, -pad, -pad, W + pad * 2, H + pad * 2);
    g.filter = 'none';

    return out;
  }

  const flat = mk(W, H);
  drawCover(flat.getContext('2d'), image, 0, 0, W, H);

  const floor = Math.max(24, Math.round(W / (radius * 1.2)));
  let current = flat;

  while (current.width / 2 >= floor) {
    current = resample(current, current.width / 2, current.height / 2);
  }

  while (current.width < W) {
    current = resample(
      current,
      Math.min(W, current.width * 2),
      Math.min(H, current.height * 2)
    );
  }

  g.drawImage(current, 0, 0, W, H);

  return out;
}

function ellipsize(g, value, maxWidth) {
  let text = String(value || '');

  if (g.measureText(text).width <= maxWidth) return text;

  while (text && g.measureText(`${text}…`).width > maxWidth) {
    text = text.slice(0, -1);
  }

  return `${text.trimEnd()}…`;
}

function wrap(g, value, maxWidth, maxLines) {
  const lines = [];

  for (const paragraph of String(value || '').replace(/\r/g, '').split('\n')) {
    if (!paragraph.trim()) {
      if (lines.length && lines[lines.length - 1] !== '') {
        lines.push('');
      }
      continue;
    }

    let current = '';

    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      while (g.measureText(word).width > maxWidth && word.length > 1) {
        let index = word.length;

        while (
          index > 1 &&
          g.measureText(word.slice(0, index)).width > maxWidth
        ) {
          index--;
        }

        if (current) {
          lines.push(current);
          current = '';
        }

        lines.push(word.slice(0, index));
        word = word.slice(index);
      }

      const candidate = current ? `${current} ${word}` : word;

      if (g.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }

    if (current) lines.push(current);
  }

  while (lines.length && lines[lines.length - 1] === '') {
    lines.pop();
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;

    let lastLine = lines[maxLines - 1];

    while (lastLine && g.measureText(`${lastLine}…`).width > maxWidth) {
      lastLine = lastLine.slice(0, -1);
    }

    lines[maxLines - 1] = `${lastLine.trimEnd()}…`;
  }

  return lines;
}

const compact = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number)) return '';

  if (number >= 1e6) {
    return `${(number / 1e6).toFixed(number >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  }

  if (number >= 1e4) return `${Math.round(number / 1e3)}k`;

  if (number >= 1e3) {
    return `${(number / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  }

  return String(number);
};

/* ------------------------------------------------------------------ main */

export async function renderPromo({ template = 'card', ...args }) {
  const {
    profile,
    theme,
    avatarSrc,
    bgSrc,
    music = null,
    interests = [],
    cards = [],
    photos = [],
    topFriends = [],
    guestbook = [],
    guestIndex,
    slug = args.profile?.username,
    fontFamily = null,
  } = args;

  if (!profile) {
    throw new Error('renderPromo requires a profile object');
  }

  const t = { ...THEME_DEFAULTS, ...(theme || {}) };

  const nameStack = canvasStack(t.name_font, fontFamily);
  const bodyStack = canvasStack(t.font, fontFamily);

  try {
    await document.fonts.ready;

    await Promise.all(
      [400, 500, 600, 700]
        .map((weight) => document.fonts.load(`${weight} 30px ${bodyStack}`))
        .concat(document.fonts.load(`800 52px ${nameStack}`))
    );
  } catch {
    // Font loading is best-effort.
  }

  /* ---- data ---------------------------------------------------------- */

  const hasMusic = !!(music && (music.title || music.artist));

  const friends = topFriends.slice(0, template === 'top8' ? 8 : 6);
  const gallery = photos.slice(0, 5);

  const interestOf = (items) =>
    (
      items.find((item) => item.type === 'interests')?.content?.interests ||
      interests
    ).filter(Boolean);

  const interestList = interestOf(cards);

  const entry =
    template === 'wall'
      ? (Number.isInteger(guestIndex) && guestbook[guestIndex]) ||
        guestbook.find((item) => {
          const length = String(item.body || '').trim().length;
          return length >= 2 && length <= 240;
        }) ||
        guestbook[0]
      : null;

  if (template === 'vibe' && !hasMusic) {
    throw new Error('The "vibe" promo requires music data.');
  }

  if (template === 'wall' && !entry) {
    throw new Error('The "wall" promo requires a guestbook entry.');
  }

  if (!['card', 'top8', 'vibe', 'wall', 'full'].includes(template)) {
    throw new Error(`Unknown promo template: ${template}`);
  }

  const [avatar, bg, cover, entryImg, photoImgs, friendImgs] =
    await Promise.all([
      loadImg(avatarSrc),
      loadImg(bgSrc),
      template === 'vibe' || template === 'full'
        ? loadImg(music?.coverSrc)
        : null,
      loadImg(entry?.src),
      Promise.all(gallery.map((photo) => loadImg(photo.src))),
      Promise.all(friends.map((friend) => loadImg(friend.src))),
    ]);

  const out = mk(W, H);
  const g = out.getContext('2d');

  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';

  /* ---- theme metrics ------------------------------------------------- */

  const bw = clamp(num(t.border_width, 1), 0, 6);
  const lw = bw === 0 ? 0 : Math.max(2, Math.round(bw * 1.8));

  const step = num(t.step, 8);

  const r1 = clamp(num(t.radius, 14) * 1.5, 0, 56);
  const r2 = Math.max(0, r1 - step * 1.5);
  const r3 = Math.max(0, r1 - step * 3);

  const panelAlpha = Math.max(0.92, clamp(num(t.card_opacity, 100) / 100, 0, 1));

  const ink = t.text_color;
  const soft = rgba(t.text_color, 0.62);
  const hair = rgba(t.text_color, 0.14);

  const onAccent = onColor(rgbOf(t.accent_color));

  const caseOf = (value) =>
    t.name_case === 'upper'
      ? value.toUpperCase()
      : t.name_case === 'lower'
        ? value.toLowerCase()
        : value;

  const initial = (value) =>
    String(value || '?').trim().charAt(0).toUpperCase() || '?';

  const dispName = caseOf(profile.display_name || profile.username || 'user');

  const accentText = (() => {
    const accent = rgbOf(t.accent_color);
    const textColor = rgbOf(t.text_color);
    const background = rgbOf(t.bg_color);

    let value = accent;

    for (
      let factor = 0.05;
      contrastOf(value, background) < 3.6 && factor <= 1;
      factor += 0.05
    ) {
      value = accent.map(
        (channel, index) => channel + (textColor[index] - channel) * factor
      );
    }

    return `rgb(${value.map(Math.round).join(',')})`;
  })();

  /* ---- backdrop ------------------------------------------------------ */

  g.fillStyle = t.bg_color;
  g.fillRect(0, 0, W, H);

  const backdrop = template === 'vibe' && cover ? cover : bg;

  if (backdrop) {
    g.drawImage(blurCover(backdrop, template === 'vibe' ? 44 : 14), 0, 0);

    g.fillStyle = `rgba(0,0,0,${clamp(num(t.overlay, 0) / 100, 0.3, 0.8)})`;
    g.fillRect(0, 0, W, H);
  }

  {
    const scrim = g.createLinearGradient(0, 0, 0, H);

    scrim.addColorStop(0, rgba(t.bg_color, 0.78));
    scrim.addColorStop(0.24, rgba(t.bg_color, 0));
    scrim.addColorStop(0.62, rgba(t.bg_color, 0));
    scrim.addColorStop(0.8, rgba(t.bg_color, 0.6));
    scrim.addColorStop(0.9, rgba(t.bg_color, 0.94));
    scrim.addColorStop(1, rgba(t.bg_color, 0.98));

    g.fillStyle = scrim;
    g.fillRect(0, 0, W, H);
  }

  /* ---- drawing primitives -------------------------------------------- */

  function outline(x, y, w, h, radius, color, width = lw) {
    if (!width) return;

    const style = t.border_style || 'solid';

    g.save();
    g.strokeStyle = color;
    g.lineJoin = 'round';

    const stroke = (inset, lineWidth) => {
      rr(
        g,
        x + inset,
        y + inset,
        w - inset * 2,
        h - inset * 2,
        Math.max(0, radius - inset)
      );

      g.lineWidth = lineWidth;
      g.stroke();
    };

    if (style === 'double' && width >= 3) {
      const thickness = Math.max(1, Math.round(width / 3));

      stroke(thickness / 2, thickness);
      stroke(width - thickness / 2, thickness);
    } else {
      if (style === 'dashed') {
        g.setLineDash([width * 3.5, width * 2.2]);
      } else if (style === 'dotted') {
        g.setLineDash([0.1, width * 1.8]);
        g.lineCap = 'round';
      }

      stroke(width / 2, width);
    }

    g.restore();
  }

  function dashedCircle(cx, cy, diameter, color, width = 3) {
    g.save();

    g.strokeStyle = color;
    g.lineWidth = width;
    g.setLineDash([width * 3, width * 2.4]);
    g.lineCap = 'round';

    g.beginPath();
    g.arc(cx, cy, diameter / 2 - width / 2, 0, Math.PI * 2);
    g.stroke();

    g.restore();
  }

  const capCache = new Map();

  const capOf = (font) => {
    if (!capCache.has(font)) {
      g.font = font;

      const measured = g.measureText('H').actualBoundingBoxAscent;
      const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1]) || 30;

      capCache.set(font, measured || px * 0.7);
    }

    return capCache.get(font);
  };

  const put = (value, x, cy, font, color, align = 'left') => {
    const cap = capOf(font);

    g.font = font;
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = 'alphabetic';
    g.fillText(value, x, Math.round(cy + cap / 2));
  };

  const para = (lines, x, y, lineHeight, font, color, align = 'left') => {
    lines.forEach((line, index) => {
      if (line) put(line, x, y + index * lineHeight + lineHeight / 2, font, color, align);
    });
  };

  const tracked = (value, x, cy, font, color, gap, align = 'left') => {
    g.font = font;

    const chars = [...value];
    const widths = chars.map((character) => g.measureText(character).width);
    const total =
      widths.reduce((sum, width) => sum + width, 0) + gap * (chars.length - 1);

    let cursor = align === 'center' ? x - total / 2 : x;

    const baseline = Math.round(cy + capOf(font) / 2);

    g.font = font;
    g.fillStyle = color;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';

    chars.forEach((character, index) => {
      g.fillText(character, cursor, baseline);
      cursor += widths[index] + gap;
    });

    return total;
  };

  const fitSize = (value, maxWidth, start, min, weight, stack) => {
    let size = start;

    g.font = `${weight} ${size}px ${stack}`;

    while (size > min && g.measureText(value).width > maxWidth) {
      size -= 2;
      g.font = `${weight} ${size}px ${stack}`;
    }

    return size;
  };

  const checkBadge = (cx, cy, radius) => {
    g.beginPath();
    g.arc(cx, cy, radius, 0, Math.PI * 2);
    g.fillStyle = VERIFIED_BLUE;
    g.fill();

    g.strokeStyle = '#ffffff';
    g.lineWidth = radius * 0.2;
    g.lineCap = 'round';
    g.lineJoin = 'round';

    g.beginPath();
    g.moveTo(cx - radius * 0.42, cy + radius * 0.04);
    g.lineTo(cx - radius * 0.1, cy + radius * 0.36);
    g.lineTo(cx + radius * 0.46, cy - radius * 0.3);
    g.stroke();
  };

  function pic(
    image,
    x,
    y,
    w,
    h,
    radius,
    character,
    edge = t.border_color,
    edgeWidth = Math.min(lw, 3)
  ) {
    g.save();
    rr(g, x, y, w, h, radius);
    g.clip();

    if (image) {
      drawCoverCrisp(g, image, x, y, w, h);
    } else {
      g.fillStyle = rgba(t.accent_color, 0.22);
      g.fillRect(x, y, w, h);
    }

    g.restore();

    if (!image && character) {
      put(
        character,
        x + w / 2,
        y + h / 2,
        `800 ${Math.round(Math.min(w, h) * 0.42)}px ${nameStack}`,
        ink,
        'center'
      );
    }

    outline(x, y, w, h, radius, edge, edgeWidth);
  }

  const portraitH = (width) => Math.round(width * PORTRAIT);

  function chips(labels, maxRows, fontSize, width, { color = ink, edge = t.border_color } = {}) {
    const pillHeight = Math.round(fontSize * 2);
    const padX = Math.round(fontSize * 0.9);
    const gap = Math.round(fontSize * 0.45);
    const font = `500 ${fontSize}px ${bodyStack}`;
    const radius = Math.min(r3 + 2, pillHeight / 2);

    g.font = font;

    const items = labels.map((label) => {
      const value = ellipsize(g, label, width - padX * 2);

      return { s: value, w: g.measureText(value).width + padX * 2 };
    });

    const rows = [[]];

    let x = 0;
    let shown = 0;

    for (const item of items) {
      if (x + item.w > width && rows[rows.length - 1].length) {
        if (rows.length >= maxRows) break;

        rows.push([]);
        x = 0;
      }

      rows[rows.length - 1].push(item);
      x += item.w + gap;
      shown++;
    }

    let hidden = items.length - shown;

    if (hidden > 0) {
      const last = rows[rows.length - 1];

      const rowWidth = (row) =>
        row.reduce((total, item) => total + item.w, 0) + gap * (row.length - 1);

      const moreItem = () => {
        const value = `+${hidden}`;

        return {
          s: value,
          w: g.measureText(value).width + padX * 2,
          more: true,
        };
      };

      let more = moreItem();

      while (last.length > 1 && rowWidth(last) + gap + more.w > width) {
        last.pop();
        hidden++;
        more = moreItem();
      }

      last.push(more);
    }

    return {
      h: rows.length * pillHeight + (rows.length - 1) * gap,

      draw(x0, y0) {
        rows.forEach((row, rowIndex) => {
          let px = x0;
          const py = y0 + rowIndex * (pillHeight + gap);

          for (const item of row) {
            outline(
              px,
              py,
              item.w,
              pillHeight,
              radius,
              item.more ? t.border_color : edge,
              Math.max(1, Math.min(lw, 3))
            );

            put(item.s, px + item.w / 2, py + pillHeight / 2, font, item.more ? soft : color, 'center');

            px += item.w + gap;
          }
        });
      },
    };
  }

  function nameBlock(maxWidth, start, min) {
    const badge = !!profile.verified;
    const font = (size) => `800 ${size}px ${nameStack}`;
    const extra = (size) =>
      badge ? Math.round(size * 0.22) + Math.round(size * 0.42) : 0;

    let size = start;

    g.font = font(size);

    while (
      size > min &&
      g.measureText(dispName).width + extra(size) > maxWidth
    ) {
      size -= 2;
      g.font = font(size);
    }

    const value = ellipsize(g, dispName, maxWidth - extra(size));
    const textWidth = g.measureText(value).width;
    const finalFont = font(size);
    const cap = capOf(finalFont);
    const height = Math.round(size * 1.1);
    const badgeSize = Math.round(size * 0.42);
    const badgeGap = Math.round(size * 0.22);

    return {
      h: height,

      draw(x, y) {
        const baseline = y + height / 2 + cap / 2;

        g.font = finalFont;
        g.fillStyle = ink;
        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        g.fillText(value, x, Math.round(baseline));

        if (badge) {
          checkBadge(
            x + textWidth + badgeGap + badgeSize / 2,
            baseline - cap / 2,
            badgeSize / 2
          );
        }
      },
    };
  }

  const handleText = (maxWidth, size) => {
    g.font = `500 ${size}px ${bodyStack}`;

    return ellipsize(
      g,
      `@${profile.username}${profile.locality ? `  ·  ${profile.locality}` : ''}`,
      maxWidth
    );
  };

  const stack = (items) => ({
    h: items.reduce(
      (total, item, index) => total + item.h + (index ? item.gap || 0 : 0),
      0
    ),

    draw(x, y, width) {
      let yy = y;

      items.forEach((item, index) => {
        if (index) yy += item.gap || 0;

        item.draw(x, yy, width);
        yy += item.h;
      });
    },
  });

  const eyebrow = (label, { center = false } = {}) => ({
    h: 40,

    draw(x, y, w) {
      const font = `600 30px ${bodyStack}`;
      const cy = y + 20;
      const value = label.toUpperCase();

      if (center) {
        tracked(value, x + w / 2, cy, font, accentText, 7, 'center');
        return;
      }

      g.fillStyle = t.accent_color;
      g.fillRect(x, Math.round(cy - 1.5), 48, 3);

      tracked(value, x + 48 + 22, cy, font, accentText, 7);
    },
  });

  const stats = (() => {
    const friendsCount = profile.friends ?? profile.friends_count;
    const viewsCount = profile.views;

    return [
      friendsCount != null && {
        n: compact(friendsCount),
        l: Number(friendsCount) === 1 ? 'friend' : 'friends',
      },

      viewsCount != null && {
        n: compact(viewsCount),
        l: Number(viewsCount) === 1 ? 'view' : 'views',
      },
    ].filter(Boolean);
  })();

  /* ---- Say hi (Card Template) ---------------------------------------- */

  function buildCard() {
    const eb = eyebrow('Come say hi');
    const ebGap = 28;
    const avatarGap = 32;

    // Use the exact same profile aspect ratio formula as full profile (aspect-ratio: 5/6)
    const avatarRatio = avatar ? avatar.width / avatar.height : 5 / 6;
    let aw = CW;
    let ah = Math.round(aw / avatarRatio);
    const maxAh = 620;
    if (ah > maxAh) {
      ah = maxAh;
      aw = Math.round(ah * avatarRatio);
    }

    const name = nameBlock(CW, 108, 48);
    const nameGap = 6;

    const handleSize = 32;
    const handleBox = Math.round(handleSize * 1.4);
    const handleGap = 18;
    const handle = handleText(CW, handleSize);

    const headlineSize = 38;
    const headlineLH = Math.round(headlineSize * 1.4);

    g.font = `400 ${headlineSize}px ${bodyStack}`;

    const headlineLines = profile.headline ? wrap(g, profile.headline, CW, 3) : [];
    const headlineGap = headlineLines.length ? 28 : 0;

    const statsBlockH = stats.length ? 2 + 22 + 70 + 26 : 0;

    const totalH =
      eb.h +
      ebGap +
      ah +
      avatarGap +
      name.h +
      nameGap +
      handleBox +
      handleGap +
      headlineLines.length * headlineLH +
      headlineGap +
      statsBlockH;

    return {
      h: totalH,

      draw(x, y, w) {
        let yy = y;

        eb.draw(x, yy, w);
        yy += eb.h + ebGap;

        const currentAw = Math.min(w, ah * avatarRatio);
        const currentAx = x + (w - currentAw) / 2;
        pic(
          avatar,
          currentAx,
          yy,
          currentAw,
          ah,
          Math.min(r2, currentAw / 2),
          initial(dispName),
          t.accent_color,
          lw
        );
        yy += ah + avatarGap;

        name.draw(x, yy);
        yy += name.h + nameGap;

        put(handle, x, yy + handleBox / 2, `500 ${handleSize}px ${bodyStack}`, soft);
        yy += handleBox + handleGap;

        if (headlineLines.length) {
          para(
            headlineLines,
            x,
            yy,
            headlineLH,
            `400 ${headlineSize}px ${bodyStack}`,
            rgba(t.text_color, 0.9)
          );
          yy += headlineLines.length * headlineLH + headlineGap;
        }

        if (stats.length) {
          g.fillStyle = hair;
          g.fillRect(x, yy, w, 2);
          yy += 22;

          const statNumberSize = 64;
          const statLabelSize = 28;
          const statBox = 90;

          let sx = x;
          const colW = w / stats.length;

          stats.forEach((stat) => {
            const size = fitSize(stat.n, colW, statNumberSize, 36, 800, nameStack);
            put(stat.n, sx, yy + statBox / 2, `800 ${size}px ${nameStack}`, ink);
            put(stat.l, sx, yy + statBox + 16, `500 ${statLabelSize}px ${bodyStack}`, soft);
            sx += colW;
          });
        }
      },
    };
  }

  /* ---- My top 8 ------------------------------------------------------ */

  function buildTop8() {
    const open = Math.max(0, 8 - friends.length);
    const count = friends.length + (open ? 1 : 0);
    const minGap = 56;

    const makeTitle = (scale) => {
      const size = fitSize('My top 8', CW * 0.92 * scale, 300, 36, 800, nameStack);
      const font = `800 ${size}px ${nameStack}`;
      const cap = capOf(font);
      const descender = Math.round(size * 0.22);
      const subSize = Math.max(26, Math.round(size * 0.22));
      const subBox = Math.round(subSize * 1.35);

      return {
        h: Math.round(cap) + descender + 6 + subBox,

        draw(x, y) {
          g.font = font;
          g.textAlign = 'left';
          g.textBaseline = 'alphabetic';

          const heading = 'My top ';
          const headingWidth = g.measureText(heading).width;
          const baseline = Math.round(y + cap);

          g.fillStyle = ink;
          g.fillText(heading, x, baseline);

          g.fillStyle = accentText;
          g.fillText('8', x + headingWidth, baseline);

          put(
            'Am I in yours?',
            x,
            y + Math.round(cap) + descender + 6 + subBox / 2,
            `500 ${subSize}px ${bodyStack}`,
            soft
          );
        },
      };
    };

    let title;
    let rowH = 0;

    for (const scale of [1, 0.8, 0.64, 0.52, 0.42]) {
      title = makeTitle(scale);
      rowH = Math.floor((ROOM - title.h - minGap) / count);

      if (rowH >= 150) break;
    }

    rowH = clamp(rowH, 88, 311);

    const free = ROOM - title.h - count * rowH;
    const titleGap = clamp(Math.round(free * 0.6), minGap, 170);

    const inset = Math.round(rowH * 0.115);
    const d = rowH - inset;
    const numberW = clamp(Math.round(rowH * 0.385), 56, 120);
    const textX = numberW + d + 28;

    const nameSize = clamp(Math.round(rowH * 0.17), 28, 52);
    const subSize = Math.round(nameSize * 0.78);
    const nameBox = Math.round(nameSize * 1.25);
    const subBox = Math.round(subSize * 1.25);
    const pairGap = 6;
    const pairH = nameBox + pairGap + subBox;

    const drawRow = (index, x, y) => {
      const isOpen = index >= friends.length;
      const friend = friends[index];
      const cy = y + rowH / 2;
      const ax = x + numberW;
      const ay = y + inset / 2;
      const pairTop = cy - pairH / 2;

      put(
        isOpen ? '+' : String(index + 1).padStart(2, '0'),
        x,
        cy,
        `800 ${clamp(Math.round(rowH * 0.17), 26, 52)}px ${nameStack}`,
        index === 0 && !isOpen ? accentText : rgba(t.text_color, 0.42)
      );

      if (!isOpen) {
        pic(friendImgs[index], ax, ay, d, d, d / 2, initial(friend.name || friend.username));

        g.font = `600 ${nameSize}px ${bodyStack}`;

        put(
          ellipsize(g, friend.name || friend.username || '', CW - textX),
          x + textX,
          pairTop + nameBox / 2,
          `600 ${nameSize}px ${bodyStack}`,
          ink
        );

        if (friend.username) {
          g.font = `400 ${subSize}px ${bodyStack}`;

          put(
            ellipsize(g, `@${friend.username}`, CW - textX),
            x + textX,
            pairTop + nameBox + pairGap + subBox / 2,
            `400 ${subSize}px ${bodyStack}`,
            soft
          );
        }
      } else {
        dashedCircle(ax + d / 2, ay + d / 2, d, rgba(t.accent_color, 0.7), 3);

        put('?', ax + d / 2, ay + d / 2, `800 ${Math.round(d * 0.4)}px ${nameStack}`, accentText, 'center');

        put(
          `${open} spot${open === 1 ? '' : 's'} open`,
          x + textX,
          pairTop + nameBox / 2,
          `600 ${nameSize}px ${bodyStack}`,
          ink
        );

        put(
          'Could be you',
          x + textX,
          pairTop + nameBox + pairGap + subBox / 2,
          `500 ${subSize}px ${bodyStack}`,
          accentText
        );
      }

      if (index < count - 1) {
        g.fillStyle = hair;
        g.fillRect(ax, y + rowH - 1, CW - numberW, 2);
      }
    };

    return {
      h: title.h + titleGap + count * rowH,

      draw(x, y) {
        title.draw(x, y);

        const rowsTop = y + title.h + titleGap;

        for (let index = 0; index < count; index++) {
          drawRow(index, x, rowsTop + index * rowH);
        }
      },
    };
  }

  /* ---- On repeat ----------------------------------------------------- */

  function buildVibe() {
    const eb = eyebrow('On repeat', { center: true });

    const titleSize = 62;
    const titleLH = Math.round(titleSize * 1.2);

    g.font = `800 ${titleSize}px ${nameStack}`;

    const titleLines = wrap(g, music.title || 'Unknown title', CW, 2);

    const artistSize = 40;
    const artistBox = 50;

    g.font = `500 ${artistSize}px ${bodyStack}`;

    const artist = music.artist ? ellipsize(g, music.artist, CW) : '';

    const gaps = { eyebrow: 53, title: 31, artist: 8, bar: 56, controls: 23, listener: 55 };

    const barH = 26;
    const controlsH = 94;
    const listenerH = 78;
    const titleH = titleLines.length * titleLH;

    const others =
      eb.h +
      gaps.eyebrow +
      gaps.title +
      titleH +
      (artist ? gaps.artist + artistBox : 0) +
      gaps.bar +
      barH +
      gaps.controls +
      controlsH +
      gaps.listener +
      listenerH;

    const cs = clamp(ROOM - others, 360, 618);

    const barX = MX + 82;
    const barW = CW - 164;

    const drawControls = (cx, cy) => {
      const icon = rgba(t.text_color, 0.72);

      g.fillStyle = icon;

      g.fillRect(cx - 126 - 17, cy - 17, 4, 34);
      g.beginPath();
      g.moveTo(cx - 126 + 17, cy - 17);
      g.lineTo(cx - 126 + 17, cy + 17);
      g.lineTo(cx - 126 - 13, cy);
      g.closePath();
      g.fill();

      g.fillRect(cx + 126 + 13, cy - 17, 4, 34);
      g.beginPath();
      g.moveTo(cx + 126 - 17, cy - 17);
      g.lineTo(cx + 126 - 17, cy + 17);
      g.lineTo(cx + 126 + 13, cy);
      g.closePath();
      g.fill();

      g.beginPath();
      g.arc(cx, cy, 47, 0, Math.PI * 2);
      g.fillStyle = t.accent_color;
      g.fill();

      g.beginPath();
      g.moveTo(cx - 13, cy - 19);
      g.lineTo(cx + 21, cy);
      g.lineTo(cx - 13, cy + 19);
      g.closePath();
      g.fillStyle = onAccent;
      g.fill();
    };

    const drawListener = (x, y, w) => {
      const nameFont = `600 34px ${bodyStack}`;
      const subFont = `400 27px ${bodyStack}`;
      const label = 'What are you listening to?';
      const avatarD = 78;
      const gap = 19;
      const room = w - avatarD - gap;

      g.font = nameFont;
      const name = ellipsize(g, profile.display_name || profile.username || '', room);
      const nameWidth = g.measureText(name).width;

      g.font = subFont;
      const sub = ellipsize(g, label, room);
      const subWidth = g.measureText(sub).width;

      const total = avatarD + gap + Math.max(nameWidth, subWidth);
      const left = x + (w - total) / 2;

      pic(avatar, left, y, avatarD, avatarD, avatarD / 2, initial(dispName), t.accent_color, lw);

      put(name, left + avatarD + gap, y + avatarD / 2 - 20, nameFont, ink);
      put(sub, left + avatarD + gap, y + avatarD / 2 + 20, subFont, soft);
    };

    return {
      h: others + cs,

      draw(x, y, w) {
        let yy = y;

        eb.draw(x, yy, w);
        yy += eb.h + gaps.eyebrow;

        pic(
          cover,
          x + (w - cs) / 2,
          yy,
          cs,
          cs,
          Math.min(r2, 28),
          '♪',
          t.border_color,
          Math.min(lw, 3)
        );
        yy += cs + gaps.title;

        para(titleLines, x + w / 2, yy, titleLH, `800 ${titleSize}px ${nameStack}`, ink, 'center');
        yy += titleH;

        if (artist) {
          yy += gaps.artist;
          put(artist, x + w / 2, yy + artistBox / 2, `500 ${artistSize}px ${bodyStack}`, soft, 'center');
          yy += artistBox;
        }

        yy += gaps.bar;

        const barCy = yy + barH / 2;

        rr(g, barX, barCy - 3, barW, 6, 3);
        g.fillStyle = rgba(t.text_color, 0.22);
        g.fill();

        rr(g, barX, barCy - 3, barW * 0.38, 6, 3);
        g.fillStyle = t.accent_color;
        g.fill();

        g.beginPath();
        g.arc(barX + barW * 0.38, barCy, 13, 0, Math.PI * 2);
        g.fillStyle = t.accent_color;
        g.fill();

        yy += barH + gaps.controls;

        drawControls(x + w / 2, yy + controlsH / 2);
        yy += controlsH + gaps.listener;

        drawListener(x, yy, w);
      },
    };
  }

  /* ---- Left on my wall ----------------------------------------------- */

  const QUOTE = ['.XX.XX', 'XX.XX.', 'X..X..'];

  function buildWall() {
    const eb = eyebrow('Left on my wall');

    const body = String(entry.body || '').trim();
    const length = body.length;

    const padX = 70;
    const innerW = CW - padX * 2;

    const ebGap = 72;
    const tail = 48;
    const bubbleToAuthor = 112;
    const authorD = 112;
    const authorToRule = 107;
    const ruleToOwner = 83;
    const ownerD = 120;

    const glyphTop = 22;
    const glyphU = 14;
    const glyphH = QUOTE.length * glyphU;
    const textTopGap = 32;
    const textBottomGap = 48;
    const bubbleMin = 398;

    const fixed =
      eb.h + ebGap + bubbleToAuthor + authorD + authorToRule + ruleToOwner + ownerD;

    const maxBubble = ROOM - fixed;
    const textRoom = maxBubble - (glyphTop + glyphH + textTopGap + textBottomGap);

    let size = length <= 14 ? 132 : length <= 40 ? 100 : length <= 90 ? 74 : 56;
    let lines;
    let lineH;

    for (;;) {
      g.font = `500 ${size}px ${bodyStack}`;
      lines = wrap(g, body, innerW, 99);
      lineH = Math.round(size * 1.22);

      if (lines.length * lineH <= textRoom || size <= 32) break;

      size -= 2;
    }

    const maxLines = Math.max(1, Math.floor(textRoom / lineH));

    if (lines.length > maxLines) lines = wrap(g, body, innerW, maxLines);

    const textH = lines.length * lineH;

    const bubbleH = Math.max(
      bubbleMin,
      glyphTop + glyphH + textTopGap + textH + textBottomGap
    );

    const drawBubble = (x, y) => {
      const radius = Math.min(r2, 24);

      rr(g, x, y, CW, bubbleH, radius);
      g.fillStyle = rgba(t.card_color, panelAlpha);
      g.fill();

      outline(x, y, CW, bubbleH, radius, t.border_color);

      const tx = x + 80;
      const by = y + bubbleH;
      const bar = Math.max(lw, 2);

      g.beginPath();
      g.moveTo(tx, by - bar);
      g.lineTo(tx + 72 + 1.5 * bar, by - bar);
      g.lineTo(tx, by + tail);
      g.closePath();
      g.fillStyle = rgba(t.card_color, panelAlpha);
      g.fill();

      if (lw) {
        g.save();
        g.strokeStyle = t.border_color;
        g.lineWidth = lw;
        g.lineJoin = 'miter';
        g.beginPath();
        g.moveTo(tx + lw / 2, by - bar);
        g.lineTo(tx + lw / 2, by + tail);
        g.lineTo(tx + 72 + 1.5 * bar, by - bar);
        g.stroke();
        g.restore();
      }

      g.fillStyle = t.accent_color;

      QUOTE.forEach((row, rowIndex) => {
        [...row].forEach((cell, colIndex) => {
          if (cell === 'X') {
            g.fillRect(
              x + padX + colIndex * glyphU,
              y + glyphTop + rowIndex * glyphU,
              glyphU,
              glyphU
            );
          }
        });
      });

      const areaTop = glyphTop + glyphH;
      const textTop = y + areaTop + (bubbleH - areaTop - textH) / 2;

      para(lines, x + padX, textTop, lineH, `500 ${size}px ${bodyStack}`, ink);
    };

    const drawAuthor = (x, y) => {
      const ax = x + 74;
      const nameFont = `600 44px ${bodyStack}`;
      const subFont = `400 32px ${bodyStack}`;
      const textX = ax + authorD + 20;
      const room = CW - (textX - x);
      const cy = y + authorD / 2;

      pic(entryImg, ax, y, authorD, authorD, authorD / 2, initial(entry.name || entry.username));

      g.font = nameFont;

      const name = ellipsize(g, entry.name || entry.username || 'Someone', room);

      if (entry.username) {
        put(name, textX, cy - 24, nameFont, ink);

        g.font = subFont;
        put(ellipsize(g, `@${entry.username}`, room), textX, cy + 24, subFont, soft);
      } else {
        put(name, textX, cy, nameFont, ink);
      }
    };

    const drawOwner = (x, y) => {
      const nameFont = `600 44px ${bodyStack}`;
      const subFont = `400 32px ${bodyStack}`;
      const textX = x + ownerD + 18;
      const room = CW - ownerD - 18;
      const cy = y + ownerD / 2;

      pic(avatar, x, y, ownerD, ownerD, ownerD / 2, initial(dispName), t.accent_color, Math.max(lw, 3));

      g.font = nameFont;
      put(ellipsize(g, profile.display_name || profile.username || '', room), textX, cy - 24, nameFont, ink);

      g.font = subFont;
      put(ellipsize(g, `on @${profile.username}'s wall`, room), textX, cy + 24, subFont, soft);
    };

    return {
      h: fixed + bubbleH,

      draw(x, y, w) {
        let yy = y;

        eb.draw(x, yy, w);
        yy += eb.h + ebGap;

        drawBubble(x, yy);
        yy += bubbleH + bubbleToAuthor;

        drawAuthor(x, yy);
        yy += authorD + authorToRule;

        g.fillStyle = hair;
        g.fillRect(x, yy, w, 2);
        yy += ruleToOwner;

        drawOwner(x, yy);
      },
    };
  }

  /* ---- Full profile -------------------------------------------------- */

  const RANK = {
    guestbook: 1,
    links: 2,
    top_friends: 3,
    interests: 4,
    gallery: 5,
    text: 6,
    about: 7,
  };

  const flowCards = cards.length
    ? cards
    : interests.length
      ? [
          {
            id: 'interests',
            type: 'interests',
            title: 'Interests',
            content: { interests },
          },
        ]
      : [];

  function planFull() {
    const output = [];

    if (hasMusic) {
      output.push({ key: 'music', rank: 4.5, title: 'Listening to' });
    }

    for (const card of flowCards) {
      const available = {
        about: () => String(card.content?.body || '').trim(),
        text: () => String(card.content?.body || '').trim(),
        interests: () => (card.content?.interests || []).filter(Boolean).length,
        links: () => (card.content?.links || []).length,
        gallery: () => photos.length,
        top_friends: () => topFriends.length,
        guestbook: () => guestbook.length,
      }[card.type]?.();

      if (available) {
        output.push({
          key: card.type,
          rank: RANK[card.type] ?? 0,
          title: card.title || '',
          card,
        });
      }
    }

    return output;
  }

  const fullPlan = template === 'full' ? planFull() : [];

  function buildFull(scale, drop) {
    const items = [];

    const avatarSize = Math.round(170 * scale);
    const avatarHeight = portraitH(avatarSize);
    const columnX = avatarSize + 36;
    const columnWidth = CW - columnX;

    const name = nameBlock(columnWidth, Math.round(64 * scale), 34);

    const handleSize = Math.round(30 * scale);
    const handleBox = Math.round(handleSize * 1.4);
    const handle = handleText(columnWidth, handleSize);

    items.push({
      h: avatarHeight,

      draw(x, y) {
        pic(avatar, x, y, avatarSize, avatarHeight, Math.min(r2, avatarSize / 2), initial(dispName), t.accent_color, lw);

        name.draw(x + columnX, y);

        put(
          handle,
          x + columnX,
          y + name.h + Math.round(4 * scale) + handleBox / 2,
          `500 ${handleSize}px ${bodyStack}`,
          soft
        );

        if (stats.length) {
          const statSize = Math.round(32 * scale);
          const statBox = Math.round(statSize * 1.4);

          put(
            stats.map((stat) => `${stat.n} ${stat.l}`).join('   ·   '),
            x + columnX,
            y + avatarHeight - statBox / 2,
            `600 ${statSize}px ${bodyStack}`,
            ink
          );
        }
      },
    });

    if (profile.headline) {
      const fontSize = Math.round(36 * scale);
      const lineHeight = Math.round(fontSize * 1.4);

      g.font = `400 ${fontSize}px ${bodyStack}`;

      const lines = wrap(g, profile.headline, CW, 2);

      items.push({
        gap: Math.round(22 * scale),
        h: lines.length * lineHeight,

        draw(x, y) {
          para(lines, x, y, lineHeight, `400 ${fontSize}px ${bodyStack}`, rgba(t.text_color, 0.9));
        },
      });
    }

    const dropped = new Set(
      [...fullPlan]
        .sort((a, b) => a.rank - b.rank)
        .slice(0, drop)
        .map((item) => item.key + (item.card?.id ?? ''))
    );

    const labelSize = Math.round(26 * scale);
    const labelBox = Math.round(labelSize * 1.4);
    const topPad = Math.round(24 * scale);
    const labelGap = Math.round(16 * scale);
    const sectionGap = Math.round(24 * scale);

    const section = (title, height, drawBody) => ({
      gap: sectionGap,
      h: topPad + (title ? labelBox + labelGap : 0) + height,

      draw(x, y, width) {
        g.fillStyle = hair;
        g.fillRect(x, y, width, 2);

        const labelFont = `600 ${labelSize}px ${bodyStack}`;

        if (title) {
          g.font = labelFont;
          put(ellipsize(g, title, width), x, y + topPad + labelBox / 2, labelFont, soft);
        }

        drawBody(x, y + topPad + (title ? labelBox + labelGap : 0), width);
      },
    });

    for (const item of fullPlan) {
      if (dropped.has(item.key + (item.card?.id ?? ''))) continue;

      const card = item.card;

      if (item.key === 'music') {
        const coverSize = Math.round(104 * scale);

        items.push(
          section(item.title, coverSize, (x, y, width) => {
            pic(cover, x, y, coverSize, coverSize, Math.min(r3 + 2, 16), '♪');

            const titleSize = Math.round(36 * scale);
            const artistSize = Math.round(28 * scale);
            const titleBox = Math.round(titleSize * 1.25);
            const artistBox = Math.round(artistSize * 1.25);
            const pairH = titleBox + (music.artist ? 4 + artistBox : 0);
            const textY = y + (coverSize - pairH) / 2;
            const textX = x + coverSize + 24;
            const room = width - coverSize - 24;

            g.font = `600 ${titleSize}px ${bodyStack}`;
            put(
              ellipsize(g, music.title || 'Unknown title', room),
              textX,
              textY + titleBox / 2,
              `600 ${titleSize}px ${bodyStack}`,
              ink
            );

            if (music.artist) {
              g.font = `400 ${artistSize}px ${bodyStack}`;
              put(
                ellipsize(g, music.artist, room),
                textX,
                textY + titleBox + 4 + artistBox / 2,
                `400 ${artistSize}px ${bodyStack}`,
                soft
              );
            }
          })
        );
      } else if (item.key === 'about' || item.key === 'text') {
        const fontSize = Math.round(34 * scale);
        const lineHeight = Math.round(fontSize * 1.42);

        g.font = `400 ${fontSize}px ${bodyStack}`;

        const lines = wrap(g, card.content.body, CW, 4);

        items.push(
          section(item.title, lines.length * lineHeight, (x, y) => {
            para(lines, x, y, lineHeight, `400 ${fontSize}px ${bodyStack}`, ink);
          })
        );
      } else if (item.key === 'interests') {
        const interestChips = chips(
          (card.content.interests || []).filter(Boolean),
          2,
          Math.round(28 * scale),
          CW
        );

        items.push(section(item.title, interestChips.h, (x, y) => interestChips.draw(x, y)));
      } else if (item.key === 'links') {
        const linkChips = chips(
          (card.content.links || [])
            .map(
              (link) =>
                link.label ||
                String(link.url || '')
                  .replace(/^https?:\/\//, '')
                  .replace(/\/$/, '')
            )
            .filter(Boolean),
          2,
          Math.round(28 * scale),
          CW,
          { color: t.link_color, edge: rgba(t.link_color, 0.55) }
        );

        items.push(section(item.title, linkChips.h, (x, y) => linkChips.draw(x, y)));
      } else if (item.key === 'gallery') {
        const count = gallery.length;
        const gap = 14;
        const tileSize = Math.floor((CW - gap * 4) / 5);
        const extra = photos.length - count;
        const radius = Math.min(r3 + 2, 16);

        items.push(
          section(item.title, tileSize, (x, y) => {
            for (let index = 0; index < count; index++) {
              const tileX = x + index * (tileSize + gap);

              pic(photoImgs[index], tileX, y, tileSize, tileSize, radius, '');

              if (extra > 0 && index === count - 1) {
                g.save();
                rr(g, tileX, y, tileSize, tileSize, radius);
                g.clip();
                g.fillStyle = 'rgba(0,0,0,0.58)';
                g.fillRect(tileX, y, tileSize, tileSize);
                g.restore();

                put(
                  `+${extra}`,
                  tileX + tileSize / 2,
                  y + tileSize / 2,
                  `800 ${Math.round(40 * scale)}px ${nameStack}`,
                  '#fff',
                  'center'
                );
              }
            }
          })
        );
      } else if (item.key === 'top_friends') {
        const count = Math.min(friends.length, 6);
        const tileSize = Math.round(112 * scale);
        const gap = Math.floor((CW - 6 * tileSize) / 5);
        const nameSize = Math.round(26 * scale);
        const nameBox = Math.round(nameSize * 1.4);

        items.push(
          section(item.title, tileSize + 10 + nameBox, (x, y) => {
            for (let index = 0; index < count; index++) {
              const tileX = x + index * (tileSize + gap);
              const friend = friends[index];

              pic(friendImgs[index], tileX, y, tileSize, tileSize, tileSize / 2, initial(friend.name || friend.username));

              g.font = `500 ${nameSize}px ${bodyStack}`;

              put(
                ellipsize(g, friend.name || friend.username || '', tileSize + gap - 6),
                tileX,
                y + tileSize + 10 + nameBox / 2,
                `500 ${nameSize}px ${bodyStack}`,
                soft
              );
            }
          })
        );
      } else if (item.key === 'guestbook') {
        const entries = guestbook.slice(0, 2);
        const avatarD = Math.round(56 * scale);
        const nameSize = Math.round(30 * scale);
        const bodySize = Math.round(32 * scale);
        const lineHeight = Math.round(bodySize * 1.38);
        const nameBox = Math.round(nameSize * 1.3);

        g.font = `400 ${bodySize}px ${bodyStack}`;

        const bodies = entries.map((guest) => wrap(g, guest.body, CW - avatarD - 20, 2));

        const entryGap = Math.round(20 * scale);

        const heights = entries.map((_, index) =>
          Math.max(avatarD, nameBox + 4 + bodies[index].length * lineHeight)
        );

        items.push(
          section(
            item.title,
            heights.reduce((total, height) => total + height, 0) +
              entryGap * (entries.length - 1),
            (x, y) => {
              let yy = y;

              entries.forEach((guest, index) => {
                pic(null, x, yy, avatarD, avatarD, avatarD / 2, initial(guest.name || guest.username));

                g.font = `600 ${nameSize}px ${bodyStack}`;

                put(
                  ellipsize(g, guest.name || guest.username || 'Someone', CW - avatarD - 20),
                  x + avatarD + 20,
                  yy + nameBox / 2,
                  `600 ${nameSize}px ${bodyStack}`,
                  ink
                );

                para(
                  bodies[index],
                  x + avatarD + 20,
                  yy + nameBox + 4,
                  lineHeight,
                  `400 ${bodySize}px ${bodyStack}`,
                  rgba(t.text_color, 0.88)
                );

                yy += heights[index] + entryGap;
              });
            }
          )
        );
      }
    }

    return stack(items);
  }

  /* ---- pick and fit the content -------------------------------------- */

  const FULL_SCALES = [1.25, 1.18, 1.12, 1.06, 1, 0.94, 0.88, 0.82, 0.76, 0.7, 0.64, 0.58];

  let built = null;

  if (template === 'full') {
    search: for (let drop = 0; drop <= fullPlan.length; drop++) {
      for (const scale of FULL_SCALES) {
        built = buildFull(scale, drop);

        if (built.h <= ROOM) break search;
      }
    }
  } else {
    built = { card: buildCard, top8: buildTop8, vibe: buildVibe, wall: buildWall }[template]();
  }

  /* ---- chrome: header and call to action ----------------------------- */

  function drawHeader() {
    put('fiiyou', MX, HEAD_CY, `800 46px ${nameStack}`, ink);

    g.font = `500 30px ${bodyStack}`;

    put(
      ellipsize(g, `@${profile.username}`, CW * 0.5),
      MX + CW,
      HEAD_CY,
      `500 30px ${bodyStack}`,
      soft,
      'right'
    );
  }

  function drawFooter() {
    const labels = {
      card: 'Find me on fiiyou',
      top8: 'Make your own top 8',
      vibe: 'Listen with me on fiiyou',
      wall: 'Sign my guestbook',
      full: 'Get to know me',
    };

    const label = labels[template] || 'Visit my profile';
    const url = profileUrl(slug).replace(/^https?:\/\//, '');
    const textWidth = CW - BTN_R * 2 - 32;

    g.fillStyle = hair;
    g.fillRect(MX, RULE_Y, CW, 2);

    const size = fitSize(label, textWidth, 44, 28, 700, nameStack);
    const labelFont = `700 ${size}px ${nameStack}`;

    g.font = labelFont;
    put(ellipsize(g, label, textWidth), MX, BTN_CY - 28, labelFont, ink);

    g.font = `500 26px ${bodyStack}`;
    put(ellipsize(g, url, textWidth), MX, BTN_CY + 26, `500 26px ${bodyStack}`, soft);

    const cx = MX + CW - BTN_R;

    g.beginPath();
    g.arc(cx, BTN_CY, BTN_R, 0, Math.PI * 2);
    g.fillStyle = t.accent_color;
    g.fill();

    g.save();
    g.strokeStyle = onAccent;
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.lineJoin = 'round';

    g.beginPath();
    g.moveTo(cx - 18, BTN_CY);
    g.lineTo(cx + 18, BTN_CY);
    g.moveTo(cx + 4, BTN_CY - 14);
    g.lineTo(cx + 18, BTN_CY);
    g.lineTo(cx + 4, BTN_CY + 14);
    g.stroke();
    g.restore();
  }

  /* ---- render -------------------------------------------------------- */

  drawHeader();

  const top = Math.round(ROOM_TOP + Math.max(0, ROOM - built.h) * 0.45);

  built.draw(MX, top, CW);

  drawFooter();

  return out;
}
