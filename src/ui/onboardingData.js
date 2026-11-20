// Onboarding choices and the small pure helpers behind them (no React here, so they are unit-tested in tests/client/onboardingData.test.mjs).

/** One-tap answers for "How are you today?". The person can still write their own. All fit the 80 character headline limit. */
export const MOODS = ['Chilling', 'Out and about', 'Making stuff', 'Studying', 'Into music', 'Bored, talk to me'];

/** Tap-to-pick interests. They become one sentence in the About card, so nobody has to type a paragraph. */
export const INTERESTS = [
  { id: 'music', label: 'Music' }, { id: 'photo', label: 'Photography' }, { id: 'gaming', label: 'Gaming' }, { id: 'sports', label: 'Sports' },
  { id: 'art', label: 'Art' }, { id: 'code', label: 'Coding' }, { id: 'books', label: 'Books' }, { id: 'film', label: 'Film' },
  { id: 'cooking', label: 'Cooking' }, { id: 'hiking', label: 'Hiking' }, { id: 'cycling', label: 'Cycling' }, { id: 'animals', label: 'Animals' },
];

/** Ready-made looks offered in onboarding (ids from themes.js). The first one is the default. The full list lives in Customize. */
export const VIBE_IDS = ['mono', 'aero', 'tokyo', 'catppuccin', 'rosepine', 'paper', 'terminal', 'vapor'];

/** ['a'] -> 'a', ['a','b'] -> 'a and b', ['a','b','c'] -> 'a, b and c' */
export const joinNatural = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** The About card text: one sentence from the picked interests, then anything the person wrote themselves. Capped at the card's 600 characters. */
export function composeAbout(labels, extra = '', max = 600) {
  const picked = labels.length ? `Into ${joinNatural(labels.map((l) => l.toLowerCase()))}.` : '';
  return [picked, String(extra || '').trim()].filter(Boolean).join('\n\n').slice(0, max);
}

const norm = (c) => String(c || '').trim().toLowerCase();
/** Which preset is this theme? Compared on the three colours that define a look. null for a custom or empty theme. */
export function matchPreset(presets, theme) {
  const t = theme || {};
  if (!t.accent_color || !t.bg_color || !t.card_color) return null;
  return presets.find((p) => norm(p.theme.accent_color) === norm(t.accent_color) && norm(p.theme.bg_color) === norm(t.bg_color) && norm(p.theme.card_color) === norm(t.card_color))?.id ?? null;
}
