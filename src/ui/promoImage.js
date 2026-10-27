import { FONT_STACKS, THEME_DEFAULTS } from './theme.js';
import { onColor, VERIFIED_BLUE } from './appTheme.js';
import { profileUrl, renderStory } from './storyImage.js';

/* ======================================================================
   promoImage.js: share cards (1080 x 1920).

   Every card is a zoomed-in piece of the real profile page: the same
   frame, the same titled card panels, the same theme (colours, borders,
   radius, shadow, glass blur, fonts) and the same call-to-action pill as
   the full profile export. Nothing here is a separate "marketing" look.

   Templates:
     card  - avatar (exact 220:250 ratio), name plate, stats, music, guestbook
     top8  - the top friends card, 2 x 4 slots, open slots are dashed
     vibe  - the music player, big, plus who is listening
     wall  - one guestbook entry as it appears on the wall
     full  - the whole profile. Delegates to renderStory so the output is
             identical to the profile story export (stickers included).
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

// Instagram / TikTok cover roughly the top and bottom 190px of a story.
const SAFE_TOP = 190;
const SAFE_BOT = 1730;

const SIDE = 48;
const FW = W - SIDE * 2;

const CTA_H = 104;
const CTA_GAP = 32;

// The profile avatar is always a 220 x 250 box. Never stretch or re-crop it.
const AVATAR_W = 220;
const AVATAR_H = 250;
const avatarHeightFor = (width) => Math.round((width * AVATAR_H) / AVATAR_W);

const TEMPLATE_IDS = ['card', 'top8', 'vibe', 'wall', 'full'];

/* ------------------------------------------------------------ templates */

export const PROMO_TEMPLATES = [
  {
    id: 'card',
    label: 'Say hi',
    hint: 'Your avatar, name and stats, with a spot to say hi.',
    needs: () => true,
  },
  {
    id: 'top8',
    label: 'My top 8',
    hint: 'Your top friends card, open slots included.',
    needs: (d) => d.topFriends.length > 0,
  },
  {
    id: 'vibe',
    label: 'On repeat',
    hint: 'Your music player, blown up.',
    needs: (d) => !!(d.music && (d.music.title || d.music.artist)),
  },
  {
    id: 'wall',
    label: 'Left on my wall',
    hint: 'One real guestbook message.',
    needs: (d) => d.guestbook.length > 0,
  },
  {
    id: 'full',
    label: 'Full profile',
    hint: 'Your whole profile, exactly as it looks on fiiyou.',
    needs: () => true,
  },
];

export const availablePromos = (data = {}) => {
  const d = { music: null, topFriends: [], guestbook: [], ...data };
  return PROMO_TEMPLATES.filter((p) => p.needs(d));
};

export const promoShareText = (template, slug) => {
  const url = profileUrl(slug);

  return (
    {
      card: `Come say hi on fiiyou → ${url}`,
      top8: `This is my top 8. Who’s on yours? ${url}`,
      vibe: `What I’m listening to right now → ${url}`,
      wall: `Someone left this on my wall. Sign it too → ${url}`,
      full: `My fiiyou profile → ${url}`,
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

// Cover-fit that crops from the source rect (no resampling of a pre-scaled
// copy) and keeps tiny pixel-art avatars crisp when they are scaled up.
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

/** Cheap blur that works everywhere: shrink, then scale back up smoothed. */
function shrinkBlur(source, factor) {
  const canvas = mk(
    Math.max(1, Math.round(W / factor)),
    Math.max(1, Math.round(H / factor))
  );
  const context = canvas.getContext('2d');

  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  return canvas;
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
    stickers = [],
    guestIndex,
    slug = args.profile?.username,
    fontFamily = null,
  } = args;

  if (!profile) {
    throw new Error('renderPromo requires a profile object');
  }

  if (!TEMPLATE_IDS.includes(template)) {
    throw new Error(`Unknown promo template: ${template}`);
  }

  /* ---- full profile: exactly the story export ------------------------ */

  if (template === 'full') {
    return renderStory({
      profile,
      theme,
      avatarSrc,
      bgSrc,
      music,
      interests,
      cards,
      photos,
      topFriends,
      guestbook,
      stickers,
      slug,
      fontFamily,
    });
  }

  const t = { ...THEME_DEFAULTS, ...(theme || {}) };

  const nameStack = canvasStack(t.name_font, fontFamily);
  const bodyStack = canvasStack(t.font, fontFamily);

  try {
    await document.fonts.ready;

    await Promise.all(
      [400, 500, 600, 700, 800]
        .map((weight) => document.fonts.load(`${weight} 30px ${bodyStack}`))
        .concat(document.fonts.load(`800 52px ${nameStack}`))
    );
  } catch {
    // Font loading is best-effort.
  }

  /* ---- data ---------------------------------------------------------- */

  const hasMusic = !!(music && (music.title || music.artist));
  const friends = topFriends.slice(0, 8);

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

  const [avatar, bg, cover, entryImg, friendImgs] = await Promise.all([
    loadImg(avatarSrc),
    loadImg(bgSrc),
    template === 'vibe' || template === 'card' ? loadImg(music?.coverSrc) : null,
    loadImg(entry?.src),
    Promise.all(
      (template === 'top8' ? friends : []).map((friend) => loadImg(friend.src))
    ),
  ]);

  const out = mk(W, H);
  const g = out.getContext('2d');

  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';

  /* ---- theme metrics (same maths as the profile story export) -------- */

  const bw = clamp(num(t.border_width, 1), 0, 6);
  const lw = bw === 0 ? 0 : Math.max(2, Math.round(bw * 1.8));

  const step = num(t.step, 8);

  const r1 = clamp(num(t.radius, 14) * 1.5, 0, 64);
  const r2 = Math.max(0, r1 - step * 1.5);
  const r3 = Math.max(0, r1 - step * 3);

  const base = clamp(Math.round(num(t.font_size, 15) * 1.7), 22, 32);

  const cardAlpha = clamp(num(t.card_opacity, 100) / 100, 0, 1);
  const frameAlpha = clamp(num(t.frame_opacity, 100) / 100, 0, 1);
  const blurPx = num(t.blur, 0);
  const overlay = clamp(num(t.overlay, 0) / 100, 0, 1);

  const fpad = clamp(Math.round(step * 3 * 1.3), 24, 40);
  const cpad = clamp(Math.round(step * 2 * 1.4), 20, 32);

  const IW = FW - fpad * 2; // width inside the frame
  const CIW = IW - cpad * 2; // width inside a card
  const GAP = 18; // gap between cards

  const ink = t.text_color;
  const soft = rgba(t.text_color, 0.62);
  const faint = rgba(t.text_color, 0.4);

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

  const handleStr = `@${profile.username}${
    profile.locality ? `  ·  ${profile.locality}` : ''
  }`;

  // accent colour nudged toward the text colour until it is readable on cards
  const accentText = (() => {
    const accent = rgbOf(t.accent_color);
    const textColor = rgbOf(t.text_color);
    const background = rgbOf(t.card_color);

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

  const titleOf = (type, fallback) =>
    cards.find((card) => card.type === type)?.title || fallback;

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

  /* ---- backdrop: the profile background, panels blur it like glass --- */

  const useCoverBackdrop = template === 'vibe' && cover;
  const backdropImage = useCoverBackdrop ? cover : bg;

  const baseBg = mk(W, H);

  {
    const b = baseBg.getContext('2d');

    b.fillStyle = t.bg_color;
    b.fillRect(0, 0, W, H);

    if (backdropImage) {
      if (useCoverBackdrop) {
        b.drawImage(blurCover(cover, 44), 0, 0);
      } else {
        drawCover(b, backdropImage, 0, 0, W, H);
      }
    }

    const dim = useCoverBackdrop ? Math.max(overlay, 0.4) : overlay;

    if (dim) {
      b.fillStyle = `rgba(0,0,0,${dim})`;
      b.fillRect(0, 0, W, H);
    }
  }

  g.drawImage(baseBg, 0, 0);

  const glass =
    backdropImage && blurPx > 0
      ? shrinkBlur(baseBg, clamp(blurPx * 0.9 + 2, 3, 24))
      : null;

  /* ---- drawing primitives -------------------------------------------- */

  function panel(x, y, w, h, radius, color, alpha) {
    g.save();
    rr(g, x, y, w, h, radius);
    g.clip();

    if (glass) g.drawImage(glass, 0, 0, W, H);

    g.fillStyle = rgba(color, alpha);
    g.fillRect(x, y, w, h);
    g.restore();
  }

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

  /** Box shadow outside the frame only, so the glass underneath stays clean. */
  function frameShadow(x, y, w, h, radius) {
    if (!t.shadow || t.shadow === 'none') return;

    const OFF = 4000;

    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    rrp(g, x, y, w, h, radius);
    g.clip('evenodd');

    g.beginPath();
    rrp(g, x - OFF, y, w, h, radius);

    if (t.shadow === 'hard') {
      g.shadowColor = t.border_color;
      g.shadowBlur = 0;
      g.shadowOffsetX = OFF + 12;
      g.shadowOffsetY = 12;
    } else {
      g.shadowColor = 'rgba(0,0,0,0.45)';
      g.shadowBlur = 60;
      g.shadowOffsetX = OFF;
      g.shadowOffsetY = 22;
    }

    g.fillStyle = '#000';
    g.fill();
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

  /** Draws text with its capital-letter height centred on cy. */
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
      if (line) {
        put(line, x, y + index * lineHeight + lineHeight / 2, font, color, align);
      }
    });
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

  /** Picture in a rounded box. Cover-fit, never stretched. */
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

  /** The profile owner's avatar: always the 220:250 box, accent outline. */
  const ownerAvatar = (x, y, width) =>
    pic(
      avatar,
      x,
      y,
      width,
      avatarHeightFor(width),
      r2,
      initial(dispName),
      t.accent_color,
      lw
    );

  /** Display name + verified badge, fitted to maxWidth. */
  function fitName(maxWidth, start, min) {
    const badge = !!profile.verified;
    const font = (size) => `800 ${size}px ${nameStack}`;
    const extra = (size) =>
      badge ? Math.round(size * 0.22) + Math.round(size * 0.5) : 0;

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

    return {
      size,
      total: textWidth + extra(size),

      draw(x, cy) {
        put(value, x, cy, font(size), ink);

        if (badge) {
          const badgeSize = Math.round(size * 0.5);
          const badgeGap = Math.round(size * 0.22);

          checkBadge(x + textWidth + badgeGap + badgeSize / 2, cy, badgeSize / 2);
        }
      },
    };
  }

  /* ---- card chrome: same as a profile card (panel, border, title) ---- */

  const TITLE_SIZE = Math.round(base * 1.15);
  const TITLE_H = Math.round(TITLE_SIZE * 1.25) + 10;

  function cardBox(x, y, w, h, title, rightText) {
    panel(x, y, w, h, r2, t.card_color, cardAlpha);
    outline(x, y, w, h, r2, t.border_color);

    if (!title) return;

    const font = `700 ${TITLE_SIZE}px ${bodyStack}`;
    const cy = y + cpad + Math.round(TITLE_SIZE * 0.6);

    let room = w - cpad * 2;

    if (rightText) {
      const rightFont = `600 ${Math.round(TITLE_SIZE * 0.78)}px ${bodyStack}`;

      g.font = rightFont;
      room -= g.measureText(rightText).width + 24;

      put(rightText, x + w - cpad, cy, rightFont, soft, 'right');
    }

    g.font = font;
    put(ellipsize(g, title, room), x + cpad, cy, font, ink);
  }

  /* ==================================================================
     Say hi
     ================================================================== */

  function buildCard(maxH) {
    const side = stats.length > 0 || hasMusic;

    // name plate
    const nameFit = fitName(CIW, 80, 40);
    const nameH = Math.round(nameFit.size * 1.2);

    const handleSize = 32;
    const handleH = 44;

    const headlineSize = 36;
    const headlineLH = 50;

    g.font = `500 ${headlineSize}px ${bodyStack}`;

    const headlineLines = profile.headline
      ? wrap(g, profile.headline, CIW, 3)
      : [];

    const plateH =
      cpad +
      nameH +
      6 +
      handleH +
      (headlineLines.length ? 14 + headlineLines.length * headlineLH : 0) +
      cpad;

    // guestbook prompt
    const inputH = 64;
    const guestH = cpad * 2 + TITLE_H + inputH;

    // avatar width: as big as the budget allows, ratio is fixed
    let AW = side ? 600 : 640;

    while (
      AW > 360 &&
      avatarHeightFor(AW) + GAP + plateH + GAP + guestH > maxH
    ) {
      AW -= 20;
    }

    const AH = avatarHeightFor(AW);

    return {
      h: AH + GAP + plateH + GAP + guestH,

      draw(x, y) {
        /* avatar + side column */
        const ax = side ? x : x + Math.round((IW - AW) / 2);

        ownerAvatar(ax, y, AW);

        if (side) {
          const sx = x + AW + GAP;
          const sw = IW - AW - GAP;

          const baseStatH = 150;

          let musicH = 0;

          if (hasMusic) {
            musicH = AH - stats.length * (baseStatH + GAP);

            if (stats.length && musicH < 240) musicH = 0;
          }

          const statCount = stats.length;
          const statH = statCount
            ? musicH
              ? baseStatH
              : Math.floor((AH - (statCount - 1) * GAP) / statCount)
            : 0;

          let yy = y;

          stats.forEach((stat) => {
            cardBox(sx, yy, sw, statH);

            const size = fitSize(
              stat.n,
              sw - cpad * 2,
              Math.min(96, Math.round(statH * 0.5)),
              32,
              800,
              nameStack
            );

            put(stat.n, sx + sw / 2, yy + statH * 0.4, `800 ${size}px ${nameStack}`, ink, 'center');
            put(stat.l, sx + sw / 2, yy + statH * 0.76, `500 28px ${bodyStack}`, soft, 'center');

            yy += statH + GAP;
          });

          if (musicH) {
            const my = y + AH - musicH;
            const pad = 16;

            cardBox(sx, my, sw, musicH);

            const textBlock = 12 + 34 + 30;
            const cs = Math.min(sw - pad * 2, musicH - pad * 2 - textBlock);

            if (cs >= 100) {
              pic(cover, sx + pad, my + pad, cs, cs, r3, '♪', t.border_color, Math.min(lw, 3));

              const tFont = `700 28px ${bodyStack}`;
              const aFont = `500 24px ${bodyStack}`;

              g.font = tFont;
              put(
                ellipsize(g, music.title || 'Unknown title', sw - pad * 2),
                sx + pad,
                my + pad + cs + 12 + 17,
                tFont,
                ink
              );

              if (music.artist) {
                g.font = aFont;
                put(
                  ellipsize(g, music.artist, sw - pad * 2),
                  sx + pad,
                  my + pad + cs + 12 + 34 + 15,
                  aFont,
                  soft
                );
              }
            }
          }
        }

        /* name plate */
        const py = y + AH + GAP;

        cardBox(x, py, IW, plateH);

        const mid = x + IW / 2;
        const nameCy = py + cpad + nameH / 2;

        nameFit.draw(mid - nameFit.total / 2, nameCy);

        g.font = `600 ${handleSize}px ${bodyStack}`;

        put(
          ellipsize(g, handleStr, CIW),
          mid,
          py + cpad + nameH + 6 + handleH / 2,
          `600 ${handleSize}px ${bodyStack}`,
          soft,
          'center'
        );

        para(
          headlineLines,
          mid,
          py + cpad + nameH + 6 + handleH + 14,
          headlineLH,
          `500 ${headlineSize}px ${bodyStack}`,
          rgba(t.text_color, 0.85),
          'center'
        );

        /* guestbook prompt: how the empty wall looks on the real page */
        const gy = py + plateH + GAP;

        cardBox(x, gy, IW, guestH, titleOf('guestbook', 'Guestbook'));

        const bx = 150;
        const iw = CIW - bx - 14;
        const iy = gy + cpad + TITLE_H;

        panel(x + cpad, iy, iw, inputH, r3, t.card_color, 0.9);
        outline(x + cpad, iy, iw, inputH, r3, t.border_color, Math.min(lw, 2));

        put('Write something…', x + cpad + 22, iy + inputH / 2, `500 ${base}px ${bodyStack}`, faint);

        rr(g, x + cpad + iw + 14, iy, bx, inputH, r3);
        g.fillStyle = t.accent_color;
        g.fill();

        put('Send', x + cpad + iw + 14 + bx / 2, iy + inputH / 2, `700 ${base}px ${bodyStack}`, onAccent, 'center');
      },
    };
  }

  /* ==================================================================
     My top 8
     ================================================================== */

  function buildTop8(maxH) {
    const title = titleOf('top_friends', 'Top 8');
    const open = Math.max(0, 8 - friends.length);

    const cols = 2;
    const rows = 4;
    const gx = 24;
    const gy = 22;

    const cellW = Math.floor((CIW - gx) / cols);

    const rowH = clamp(
      Math.floor((maxH - cpad * 2 - TITLE_H - gy * (rows - 1)) / rows),
      110,
      200
    );

    const h = cpad * 2 + TITLE_H + rows * rowH + gy * (rows - 1);

    const ns = clamp(Math.round(rowH * 0.19), 26, 36);
    const us = Math.round(ns * 0.78);
    const tag = clamp(Math.round(rowH * 0.2), 30, 40);

    return {
      h,

      draw(x, y) {
        cardBox(x, y, IW, h, title, open ? `${open} open` : '');

        let firstOpen = true;

        for (let index = 0; index < cols * rows; index++) {
          const col = index % cols;
          const row = Math.floor(index / cols);

          const cx = x + cpad + col * (cellW + gx);
          const cy = y + cpad + TITLE_H + row * (rowH + gy);

          const tx = cx + rowH + 18;
          const tw = cellW - rowH - 18;
          const mid = cy + rowH / 2;

          const friend = friends[index];
          const radius = Math.min(r3, rowH / 2);

          if (friend) {
            pic(
              friendImgs[index],
              cx,
              cy,
              rowH,
              rowH,
              radius,
              initial(friend.name || friend.username)
            );

            // rank tag in the corner of the picture
            g.fillStyle = t.accent_color;
            g.fillRect(cx, cy, tag, tag);

            put(String(index + 1), cx + tag / 2, cy + tag / 2, `800 ${Math.round(tag * 0.58)}px ${nameStack}`, onAccent, 'center');

            const nameFont = `600 ${ns}px ${bodyStack}`;

            g.font = nameFont;
            put(
              ellipsize(g, friend.name || friend.username || '', tw),
              tx,
              friend.username ? mid - ns * 0.62 : mid,
              nameFont,
              ink
            );

            if (friend.username) {
              const userFont = `400 ${us}px ${bodyStack}`;

              g.font = userFont;
              put(ellipsize(g, `@${friend.username}`, tw), tx, mid + ns * 0.62, userFont, soft);
            }

            continue;
          }

          // open slot: dashed tile
          g.save();
          g.strokeStyle = rgba(t.accent_color, 0.65);
          g.lineWidth = 3;
          g.setLineDash([10, 8]);
          rr(g, cx + 1.5, cy + 1.5, rowH - 3, rowH - 3, Math.max(0, radius - 1.5));
          g.stroke();
          g.restore();

          put('+', cx + rowH / 2, cy + rowH / 2, `800 ${Math.round(rowH * 0.36)}px ${nameStack}`, accentText, 'center');

          const isFirst = firstOpen;
          firstOpen = false;

          const openFont = `600 ${ns}px ${bodyStack}`;

          g.font = openFont;
          put(
            ellipsize(g, isFirst ? 'Could be you' : 'Open', tw),
            tx,
            mid - ns * 0.62,
            openFont,
            isFirst ? accentText : soft
          );

          put(`#${index + 1}`, tx, mid + ns * 0.62, `400 ${us}px ${bodyStack}`, faint);
        }
      },
    };
  }

  /* ==================================================================
     On repeat
     ================================================================== */

  function buildVibe(maxH) {
    const titleSize = 58;
    const titleLH = 66;

    g.font = `800 ${titleSize}px ${nameStack}`;

    const titleLines = wrap(g, music.title || 'Unknown title', CIW, 2);

    const artistSize = 36;
    const artistBox = 48;

    g.font = `500 ${artistSize}px ${bodyStack}`;

    const artist = music.artist ? ellipsize(g, music.artist, CIW) : '';

    const gapCover = 30;
    const gapArtist = 8;
    const gapControls = 34;
    const controlsH = 84;

    const textH = titleLines.length * titleLH;

    const fixed =
      cpad * 2 +
      gapCover +
      textH +
      (artist ? gapArtist + artistBox : 0) +
      gapControls +
      controlsH;

    // who is listening
    const oAW = 96;
    const oAH = avatarHeightFor(oAW);
    const ownerH = oAH + 36;

    const cs = clamp(maxH - ownerH - GAP - fixed, 360, CIW);
    const playerH = fixed + cs;

    return {
      h: playerH + GAP + ownerH,

      draw(x, y) {
        cardBox(x, y, IW, playerH);

        let yy = y + cpad;

        pic(
          cover,
          x + cpad + (CIW - cs) / 2,
          yy,
          cs,
          cs,
          r3,
          '♪',
          t.border_color,
          Math.min(lw, 3)
        );

        yy += cs + gapCover;

        para(
          titleLines,
          x + cpad,
          yy,
          titleLH,
          `800 ${titleSize}px ${nameStack}`,
          ink
        );

        yy += textH;

        if (artist) {
          yy += gapArtist;
          put(artist, x + cpad, yy + artistBox / 2, `500 ${artistSize}px ${bodyStack}`, soft);
          yy += artistBox;
        }

        yy += gapControls;

        // controls row: play button + progress, like the real mini player
        const cy = yy + controlsH / 2;
        const pr = controlsH / 2;
        const px = x + cpad + pr;

        g.beginPath();
        g.arc(px, cy, pr, 0, Math.PI * 2);
        g.fillStyle = t.accent_color;
        g.fill();

        g.beginPath();
        g.moveTo(px - 11 + 3, cy - 18);
        g.lineTo(px + 19 + 3, cy);
        g.lineTo(px - 11 + 3, cy + 18);
        g.closePath();
        g.fillStyle = onAccent;
        g.fill();

        const bx = x + cpad + pr * 2 + 28;
        const bwid = x + IW - cpad - bx;

        rr(g, bx, cy - 5, bwid, 10, 5);
        g.fillStyle = rgba(t.text_color, 0.18);
        g.fill();

        rr(g, bx, cy - 5, bwid * 0.38, 10, 5);
        g.fillStyle = t.accent_color;
        g.fill();

        /* owner */
        const oy = y + playerH + GAP;

        cardBox(x, oy, IW, ownerH);

        ownerAvatar(x + 18, oy + 18, oAW);

        const tx = x + 18 + oAW + 24;
        const nameFit = fitName(x + IW - cpad - tx, 42, 28);

        nameFit.draw(tx, oy + ownerH / 2 - 20);

        g.font = `500 30px ${bodyStack}`;
        put(
          ellipsize(g, `@${profile.username}`, x + IW - cpad - tx),
          tx,
          oy + ownerH / 2 + 24,
          `500 30px ${bodyStack}`,
          soft
        );
      },
    };
  }

  /* ==================================================================
     Left on my wall
     ================================================================== */

  function buildWall(maxH) {
    const body = String(entry.body || '').trim();
    const length = body.length;

    const AV = 104;
    const authorGap = 30;

    const oAW = 92;
    const oAH = avatarHeightFor(oAW);
    const ownerH = oAH + 36;

    const fixed = cpad * 2 + TITLE_H + AV + authorGap;
    const textRoom = maxH - ownerH - GAP - fixed - 10;

    const display = length <= 24;
    const stack = display ? nameStack : bodyStack;
    const weight = display ? 800 : 500;

    let size = length <= 14 ? 132 : length <= 40 ? 96 : length <= 90 ? 68 : 52;
    let lines;
    let lineH;

    for (;;) {
      g.font = `${weight} ${size}px ${stack}`;
      lines = wrap(g, body, CIW, 99);
      lineH = Math.round(size * 1.25);

      if (lines.length * lineH <= textRoom || size <= 30) break;

      size -= 2;
    }

    const maxLines = Math.max(1, Math.floor(textRoom / lineH));

    if (lines.length > maxLines) lines = wrap(g, body, CIW, maxLines);

    const textH = lines.length * lineH;
    const cardH = Math.max(420, fixed + textH + 10);

    return {
      h: cardH + GAP + ownerH,

      draw(x, y) {
        cardBox(x, y, IW, cardH, titleOf('guestbook', 'Guestbook'));

        const ay = y + cpad + TITLE_H;
        const ax = x + cpad;

        pic(
          entryImg,
          ax,
          ay,
          AV,
          AV,
          AV / 2,
          initial(entry.name || entry.username)
        );

        const tx = ax + AV + 22;
        const room = x + IW - cpad - tx;

        const nameFont = `700 40px ${bodyStack}`;
        const nameValue = entry.name || entry.username || 'Someone';

        g.font = nameFont;

        if (entry.username) {
          put(ellipsize(g, nameValue, room), tx, ay + AV / 2 - 22, nameFont, ink);

          g.font = `400 30px ${bodyStack}`;
          put(
            ellipsize(g, `@${entry.username}`, room),
            tx,
            ay + AV / 2 + 24,
            `400 30px ${bodyStack}`,
            soft
          );
        } else {
          put(ellipsize(g, nameValue, room), tx, ay + AV / 2, nameFont, ink);
        }

        para(
          lines,
          ax,
          ay + AV + authorGap,
          lineH,
          `${weight} ${size}px ${stack}`,
          ink
        );

        /* whose wall it is */
        const oy = y + cardH + GAP;

        cardBox(x, oy, IW, ownerH);

        ownerAvatar(x + 18, oy + 18, oAW);

        const ox = x + 18 + oAW + 24;
        const orm = x + IW - cpad - ox;
        const nameFit = fitName(orm, 40, 28);

        nameFit.draw(ox, oy + ownerH / 2 - 20);

        g.font = `500 30px ${bodyStack}`;
        put(
          ellipsize(g, `on @${profile.username}'s wall`, orm),
          ox,
          oy + ownerH / 2 + 24,
          `500 30px ${bodyStack}`,
          soft
        );
      },
    };
  }

  /* ---- layout: build, fit, centre in the safe area ------------------- */

  const maxContent = SAFE_BOT - SAFE_TOP - CTA_H - CTA_GAP - fpad * 2;

  const built = { card: buildCard, top8: buildTop8, vibe: buildVibe, wall: buildWall }[
    template
  ](maxContent);

  const frameH = Math.min(maxContent + fpad * 2, built.h + fpad * 2);
  const groupH = frameH + CTA_GAP + CTA_H;

  const FX = SIDE;
  const FY = Math.round(SAFE_TOP + (SAFE_BOT - SAFE_TOP - groupH) / 2);

  frameShadow(FX, FY, FW, frameH, r1);
  panel(FX, FY, FW, frameH, r1, t.frame_color, frameAlpha);
  outline(FX, FY, FW, frameH, r1, t.border_color);

  built.draw(FX + fpad, FY + fpad);

  /* ---- call to action: same quiet pill as the full profile export ---- */

  {
    const labels = {
      card: 'Find me on fiiyou',
      top8: 'Make your own top 8',
      vibe: 'Listen with me on fiiyou',
      wall: 'Sign my guestbook',
    };

    const label = labels[template] || 'Find me on fiiyou';
    const url = profileUrl(slug).replace(/^https?:\/\//, '');

    const f1 = `700 32px ${nameStack}`;
    const f2 = `500 23px ${bodyStack}`;

    g.font = f1;
    const w1 = g.measureText(label).width;

    g.font = f2;
    const w2 = Math.min(g.measureText(url).width, FW - 140);

    const cw = clamp(Math.max(w1, w2) + 100, 480, FW);
    const cx = Math.round((W - cw) / 2);
    const cy = FY + frameH + CTA_GAP;
    const cr = Math.min(CTA_H / 2, Math.max(r1, 12));

    panel(cx, cy, cw, CTA_H, cr, t.frame_color, Math.max(frameAlpha, 0.6));
    outline(cx, cy, cw, CTA_H, cr, rgba(t.accent_color, 0.4), Math.min(lw || 2, 2));

    put(label, W / 2, cy + CTA_H * 0.37, f1, rgba(t.text_color, 0.9), 'center');

    g.font = f2;
    put(ellipsize(g, url, FW - 140), W / 2, cy + CTA_H * 0.71, f2, rgba(t.text_color, 0.5), 'center');
  }

  return out;
}
