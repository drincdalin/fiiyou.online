import { FONT_STACKS, THEME_DEFAULTS } from './theme.js';
import { onColor, VERIFIED_BLUE } from './appTheme.js';
import { profileUrl } from './storyImage.js';
import { renderDesktop } from './desktopImage.js';
import { createCss, createFx, createTextStyler } from './customCssRender.js';

/* ======================================================================
   promoImage.js: share cards (1080 x 1920).

   Every card is a zoomed-in piece of the real profile page: the same
   frame, the same titled card panels, the same theme (colours, borders,
   radius, shadow, glass blur, fonts) and the same call-to-action pill as
   the full profile export. Nothing here is a separate "marketing" look.

   The profile's "Fine-tune" rules (customCss) are drawn on every card:
   frame, avatar, name plate (and the stat tiles), music player and cards get
   their colours, borders, radius, padding, opacity, tilt, shadow and filter;
   text gets font, size, weight, case and letter-spacing; "Whole page" applies
   its filter / opacity to the whole image. Padding, radius and borders are
   scaled up the same way the theme's own values are for a story.

   Templates:
     card  - avatar (exact 220:250 ratio), name plate, stats, music, guestbook
     top8  - the top friends card, 2 x 4 slots, open slots are dashed
     vibe  - the music player, big, plus who is listening
     wall  - one guestbook entry as it appears on the wall
     full  - the whole profile, laid out exactly like the desktop page
             (desktopImage.js: sidebar + cards, stickers included). It is as
             tall as the profile is, not 1080 x 1920.
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

// The profile avatar is always a 5:6 box (same as .avatar on the page). Never stretch or re-crop it.
const AVATAR_W = 5;
const AVATAR_H = 6;
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
    hint: 'Your whole profile, laid out exactly like the desktop page.',
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
    customCss = [],
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

  /* ---- full profile: the desktop page, as an image ------------------- */

  if (template === 'full') {
    return renderDesktop({
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
      customCss,
      slug,
      fontFamily,
    });
  }

  const t = { ...THEME_DEFAULTS, ...(theme || {}) };

  const css = createCss(customCss);
  const nameStack = canvasStack(t.name_font, fontFamily);
  const bodyStack = canvasStack(t.font, fontFamily);
  const styler = createTextStyler({ bodyStack, nameStack });

  try {
    await document.fonts.ready;

    const loads = [400, 500, 600, 700, 800]
      .map((weight) => document.fonts.load(`${weight} 30px ${bodyStack}`))
      .concat(document.fonts.load(`800 52px ${nameStack}`));

    // fonts picked in Fine-tune
    for (const stack of css.families()) {
      for (const weight of [400, 500, 600, 700, 800]) {
        loads.push(document.fonts.load(`${weight} 30px ${stack}`));
      }
    }

    await Promise.all(loads);
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
  let g = styler.patch(out.getContext('2d')); // `let`: Fine-tune effects draw on a layer, then swap back

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

  /* ---- Fine-tune: what each rule target ends up with ----
     The page's px values are scaled the way the theme's own are for a story:
     radius x1.5, border width x1.8, padding x1.4. */

  const edgeFor = (sel) => {
    const base = {
      frame: { bw: lw, color: t.border_color, r: r1, pad: clamp(Math.round(step * 3 * 1.3), 24, 40), bg: [t.frame_color, frameAlpha] },
      card: { bw: lw, color: t.border_color, r: r2, pad: clamp(Math.round(step * 2 * 1.4), 20, 32), bg: [t.card_color, cardAlpha] },
      avatar: { bw: lw, color: t.accent_color, r: r2, pad: 0, bg: null },
    };

    base.nameplate = base.card;
    base.player = base.card;

    const d = base[sel];
    const b = css.box(sel);

    return {
      b,
      bw: b.borderWidth != null ? (b.borderWidth === 0 ? 0 : Math.max(2, Math.round(b.borderWidth * 1.8))) : d.bw,
      style: b.borderStyle || t.border_style || 'solid',
      color: b.borderColor || d.color,
      r: b.radius != null ? clamp(b.radius * 1.5, 0, 64) : d.r,
      pad: b.padding != null ? clamp(Math.round(b.padding * 1.4), 0, 64) : d.pad,
      bg: b.bg ? [b.bg.hex, b.bg.a] : d.bg,
    };
  };

  const fpad = edgeFor('frame').pad;
  const cpad = edgeFor('card').pad;

  let IW = FW - fpad * 2; // width inside the frame (changes with the fill scale, see the layout step)
  let CIW = IW - cpad * 2; // width inside a card
  const GAP = 18; // gap between cards

  let ink = t.text_color; // changes per region when Fine-tune sets a text colour (see setText)
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

  /* ---- Fine-tune text: the rules of one region (card, name plate, player) become the active text style ---- */

  const themeFs = num(t.font_size, 15);

  function setText(sel) {
    if (!sel || !css.has) {
      styler.set(null);
      ink = t.text_color;
      return;
    }

    const x = css.text(sel);

    ink = x.color ? rgba(x.color.hex, x.color.a) : t.text_color;

    styler.set({
      family: x.family,
      weight: x.weight,
      tt: x.tt,
      ls: x.ls * 1.7,
      scale: x.size ? clamp(x.size / themeFs, 0.75, 1.35) : 1, // the layout is fixed, so sizes can only grow or shrink a little
    });
  }

  const mkLayer = (width, height) => {
    const canvas = mk(width, height);
    const getContext = canvas.getContext.bind(canvas);

    canvas.getContext = (...args) => styler.patch(getContext(...args));

    return canvas;
  };

  const fx = createFx({
    getG: () => g,
    setG: (value) => {
      g = value;
    },
    mk: mkLayer,
    colors: { border: t.border_color, accent: t.accent_color },
    unit: 2, // story px per page px for shadow and blur sizes
    full: true, // panel() draws the full-canvas glass with the transform reset, so layers cover the whole canvas
  });

  /* ---- drawing primitives -------------------------------------------- */

  function panel(x, y, w, h, radius, color, alpha) {
    g.save();
    rr(g, x, y, w, h, radius);
    g.clip();

    if (glass) {
      const m = g.getTransform();

      g.setTransform(1, 0, 0, 1, 0, 0); // the glass is a full-canvas picture, so it ignores the fill scale
      g.drawImage(glass, 0, 0, W, H);
      g.setTransform(m);
    }

    g.fillStyle = rgba(color, alpha);
    g.fillRect(x, y, w, h);
    g.restore();
  }

  function outline(x, y, w, h, radius, color, width = lw, style = t.border_style || 'solid') {
    if (!width) return;

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

  const capCache = new Map();

  const capOf = (font) => {
    const key = `${font}|${styler.key()}`;

    if (!capCache.has(key)) {
      g.font = font;

      const measured = g.measureText('H').actualBoundingBoxAscent;
      const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(g.font)?.[1]) || 30;

      capCache.set(key, measured || px * 0.7);
    }

    return capCache.get(key);
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

  /** The profile owner's avatar: always the 220:250 box, accent outline (or whatever Fine-tune says). */
  const ownerAvatar = (x, y, width) => {
    const E = edgeFor('avatar');
    const height = avatarHeightFor(width);

    fx.group({ x, y, w: width, h: height, r: E.r }, E.b, () => {
      pic(avatar, x, y, width, height, E.r, initial(dispName), E.color, E.bw);
    });
  };

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

  // A card's box, then everything drawn until the next card, is one Fine-tune layer (tilt, opacity, filter, shadow).
  let cardHandle = null;
  let cardIsOpen = false;

  function closeCard() {
    if (!cardIsOpen) return;

    fx.end(cardHandle);

    cardHandle = null;
    cardIsOpen = false;
  }

  /** kind = which rule target styles this box: 'card' | 'nameplate' | 'player'. */
  function cardBox(x, y, w, h, title, rightText, kind = 'card') {
    closeCard();

    const E = edgeFor(kind);

    cardHandle = fx.begin({ x, y, w, h, r: E.r }, E.b, E.b.shadow);
    cardIsOpen = true;

    setText(kind);

    panel(x, y, w, h, E.r, E.bg[0], E.bg[1]);
    outline(x, y, w, h, E.r, E.color, E.bw, E.style);

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
    setText('nameplate');

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
    let AW = Math.round(IW * (side ? 0.58 : 0.7)); // share of the (scaled) frame width

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
            // with music, two stats share one tile so the cover keeps room
            musicH = AH - Math.min(stats.length, 1) * (baseStatH + GAP);

            if (stats.length && musicH < 240) musicH = 0;
          }

          const statCount = stats.length;
          const statH = statCount
            ? musicH
              ? baseStatH
              : Math.floor((AH - (statCount - 1) * GAP) / statCount)
            : 0;

          let yy = y;

          const combined = hasMusic && stats.length > 1;

          if (combined) {
            cardBox(sx, yy, sw, baseStatH, undefined, undefined, 'nameplate');

            const colW = sw / stats.length;

            stats.forEach((stat, n) => {
              const mid = sx + colW * n + colW / 2;
              const size = fitSize(stat.n, colW - cpad, 80, 30, 800, nameStack);

              put(stat.n, mid, yy + baseStatH * 0.4, `800 ${size}px ${nameStack}`, ink, 'center');
              put(stat.l, mid, yy + baseStatH * 0.76, `500 26px ${bodyStack}`, soft, 'center');

              if (n) {
                g.fillStyle = rgba(t.border_color, 0.9);
                g.fillRect(sx + colW * n, yy + 28, Math.max(1, Math.min(lw, 2)), baseStatH - 56);
              }
            });

            yy += baseStatH + GAP;
          } else stats.forEach((stat) => {
            cardBox(sx, yy, sw, statH, undefined, undefined, 'nameplate');

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

            cardBox(sx, my, sw, musicH, undefined, undefined, 'player');

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

        cardBox(x, py, IW, plateH, undefined, undefined, 'nameplate');

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
    setText('card');

    const title = titleOf('top_friends', 'Top 8');
    const filled = friends.length;
    const open = Math.max(0, 8 - filled);

    // Friends and the first open slot get tall rows; the rest of the open slots are slim, so a short list still looks full.
    const slimH = 92;
    const big = filled + (open ? 1 : 0);
    const avail = maxH - cpad * 2 - TITLE_H;
    const rowH = clamp(Math.floor((avail - Math.max(0, open - 1) * slimH) / Math.max(1, big)), 112, 200);

    const rows = [
      ...friends.map((friend, index) => ({ friend, index, h: rowH })),
      ...Array.from({ length: open }, (_, j) => ({ friend: null, index: filled + j, h: j === 0 ? rowH : slimH })),
    ];

    const h = cpad * 2 + TITLE_H + rows.reduce((sum, row) => sum + row.h, 0);

    return {
      h,

      draw(x, y) {
        cardBox(x, y, IW, h, title, `${filled}/8`);

        let yy = y + cpad + TITLE_H;
        const rx = x + cpad;

        rows.forEach((row, n) => {
          const d = row.h - 28;
          const cy = yy + row.h / 2;
          const rankW = 78;

          if (n > 0) {
            g.fillStyle = rgba(t.border_color, 0.9);
            g.fillRect(rx, yy, CIW, Math.max(1, Math.min(lw, 2)));
          }

          // number one gets a soft accent wash
          if (row.friend && row.index === 0) {
            rr(g, rx - 8, yy + 6, CIW + 16, row.h - 12, r3);
            g.fillStyle = rgba(t.accent_color, 0.12);
            g.fill();
          }

          const rankSize = clamp(Math.round(row.h * 0.36), 34, 64);

          put(
            String(row.index + 1),
            rx + rankW / 2,
            cy,
            `800 ${rankSize}px ${nameStack}`,
            row.friend ? accentText : faint,
            'center'
          );

          const ax = rx + rankW + 4;
          const tx = ax + d + 26;
          const tw = rx + CIW - tx;
          const ns = row.h >= 112 && row.friend ? clamp(Math.round(row.h * 0.24), 30, 46) : row.friend ? 34 : clamp(Math.round(row.h * 0.26), 28, 44);
          const us = Math.round(ns * 0.76);

          if (row.friend) {
            const f = row.friend;

            pic(friendImgs[row.index], ax, cy - d / 2, d, d, d / 2, initial(f.name || f.username));

            const nameFont = `700 ${ns}px ${bodyStack}`;

            g.font = nameFont;
            put(ellipsize(g, f.name || f.username || '', tw), tx, f.username ? cy - ns * 0.62 : cy, nameFont, ink);

            if (f.username) {
              const userFont = `400 ${us}px ${bodyStack}`;

              g.font = userFont;
              put(ellipsize(g, `@${f.username}`, tw), tx, cy + ns * 0.62, userFont, soft);
            }

            yy += row.h;
            return;
          }

          // open slot: dashed circle
          g.save();
          g.strokeStyle = rgba(t.accent_color, 0.65);
          g.lineWidth = 3;
          g.setLineDash([10, 8]);
          g.beginPath();
          g.arc(ax + d / 2, cy, d / 2 - 1.5, 0, Math.PI * 2);
          g.stroke();
          g.restore();

          put('+', ax + d / 2, cy, `800 ${Math.round(d * 0.4)}px ${nameStack}`, accentText, 'center');

          const first = row.index === filled;
          const openFont = `700 ${ns}px ${bodyStack}`;

          g.font = openFont;

          if (first) {
            put(ellipsize(g, 'Could be you', tw), tx, cy - ns * 0.62, openFont, accentText);
            put('Open slot', tx, cy + ns * 0.62, `400 ${us}px ${bodyStack}`, soft);
          } else {
            put('Open', tx, cy, openFont, faint);
          }

          yy += row.h;
        });
      },
    };
  }

  /* ==================================================================
     On repeat
     ================================================================== */

  function buildVibe(maxH) {
    setText('player');

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
    const gapControls = 40;
    const controlsH = 150; // progress bar + prev / play / next

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
        cardBox(x, y, IW, playerH, undefined, undefined, 'player');

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

        // progress bar, then prev / play / next, like the page's mini player
        const barY = yy + 8;

        rr(g, x + cpad, barY - 6, CIW, 12, 6);
        g.fillStyle = rgba(t.text_color, 0.18);
        g.fill();

        rr(g, x + cpad, barY - 6, CIW * 0.38, 12, 6);
        g.fillStyle = t.accent_color;
        g.fill();

        g.beginPath();
        g.arc(x + cpad + CIW * 0.38, barY, 14, 0, Math.PI * 2);
        g.fillStyle = t.accent_color;
        g.fill();

        const cy = yy + 24 + 26 + 48;
        const mx = x + IW / 2;

        g.beginPath();
        g.arc(mx, cy, 48, 0, Math.PI * 2);
        g.fillStyle = t.accent_color;
        g.fill();

        g.beginPath();
        g.moveTo(mx - 14 + 4, cy - 24);
        g.lineTo(mx + 24 + 4, cy);
        g.lineTo(mx - 14 + 4, cy + 24);
        g.closePath();
        g.fillStyle = onAccent;
        g.fill();

        g.fillStyle = ink;

        // previous: bar + triangle pointing left
        g.beginPath();
        g.rect(mx - 170 - 20, cy - 18, 6, 36);
        g.moveTo(mx - 170 + 20, cy - 18);
        g.lineTo(mx - 170 + 20, cy + 18);
        g.lineTo(mx - 170 - 14, cy);
        g.closePath();
        g.fill();

        // next: triangle pointing right + bar
        g.beginPath();
        g.rect(mx + 170 + 14, cy - 18, 6, 36);
        g.moveTo(mx + 170 - 20, cy - 18);
        g.lineTo(mx + 170 - 20, cy + 18);
        g.lineTo(mx + 170 + 14, cy);
        g.closePath();
        g.fill();

        /* owner */
        const oy = y + playerH + GAP;

        cardBox(x, oy, IW, ownerH, undefined, undefined, 'nameplate');

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
    setText('card');

    const body = String(entry.body || '').trim();
    const length = body.length;

    const AV = 104;
    const authorGap = 30;

    const oAW = 92;
    const oAH = avatarHeightFor(oAW);
    const ownerH = oAH + 36;

    const inputH = 64;
    const inputBlock = inputH + 36; // the real "Write something… / Send" row under the message

    const fixed = cpad * 2 + TITLE_H + AV + authorGap + inputBlock;
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

        /* the page's own input: invites the viewer to sign it */
        const bxw = 150;
        const iwid = CIW - bxw - 14;
        const iyy = y + cardH - cpad - inputH;

        g.fillStyle = rgba(t.border_color, 0.9);
        g.fillRect(ax, iyy - 18, CIW, Math.max(1, Math.min(lw, 2)));

        panel(ax, iyy, iwid, inputH, r3, t.card_color, 0.9);
        outline(ax, iyy, iwid, inputH, r3, t.border_color, Math.min(lw, 2));
        put('Write something…', ax + 22, iyy + inputH / 2, `500 ${base}px ${bodyStack}`, faint);

        rr(g, ax + iwid + 14, iyy, bxw, inputH, r3);
        g.fillStyle = t.accent_color;
        g.fill();
        put('Send', ax + iwid + 14 + bxw / 2, iyy + inputH / 2, `700 ${base}px ${bodyStack}`, onAccent, 'center');

        /* whose wall it is */
        const oy = y + cardH + GAP;

        cardBox(x, oy, IW, ownerH, undefined, undefined, 'nameplate');

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

  /* ---- layout: build, scale up to fill the story, centre in the safe area ---- */

  const maxContent = SAFE_BOT - SAFE_TOP - CTA_H - CTA_GAP - fpad * 2;
  const builders = { card: buildCard, top8: buildTop8, vibe: buildVibe, wall: buildWall };

  // A short layout (one message, a few friends) is built on a narrower virtual width and drawn scaled up, so
  // type and pictures grow together and the frame uses the story instead of floating in it.
  const MAX_FILL = { card: 1.25, top8: 1.3, vibe: 1.2, wall: 1.3 }[template];

  let k = 1;
  let built;

  for (let i = 0; i < 7; i++) {
    IW = (FW - fpad * 2) / k;
    CIW = IW - cpad * 2;
    built = builders[template](maxContent / k);

    const total = built.h * k;

    if (total > maxContent) {
      k = Math.max(0.5, k * (maxContent / total) * 0.985);
    } else if (total < maxContent * 0.9 && k < MAX_FILL - 0.01) {
      k = Math.min(MAX_FILL, k * (maxContent / total));
    } else {
      break;
    }
  }

  const frameH = Math.min(maxContent + fpad * 2, built.h * k + fpad * 2);
  const groupH = frameH + CTA_GAP + CTA_H;

  const FX = SIDE;
  const FY = Math.round(SAFE_TOP + (SAFE_BOT - SAFE_TOP - groupH) / 2);

  setText(null);

  // The frame and everything in it share one layer, so the frame's tilt / filter / opacity apply to all of it.
  const FRE = edgeFor('frame');
  const frameHandle = fx.begin({ x: FX, y: FY, w: FW, h: frameH, r: FRE.r }, FRE.b, FRE.b.shadow ?? t.shadow);

  panel(FX, FY, FW, frameH, FRE.r, FRE.bg[0], FRE.bg[1]);
  outline(FX, FY, FW, frameH, FRE.r, FRE.color, FRE.bw, FRE.style);

  g.save();
  g.translate(FX + fpad, FY + fpad);
  g.scale(k, k);
  built.draw(0, 0);
  closeCard();
  g.restore();

  fx.end(frameHandle);

  // "Whole page": filter / opacity cover everything drawn so far (the call-to-action below is not part of the profile).
  fx.wholeCanvas(css.box('page'));
  setText(null);

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
