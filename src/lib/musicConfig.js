/* Music player settings. One place for every switch the player reads. */
export const MUSIC_CONFIG = {
  /** localStorage key for volume / mute / shuffle / repeat / vinyl. */
  storageKey: 'fiiyou.music.v1',

  /** Where the YouTube player is loaded from. youtube-nocookie = the privacy-enhanced embed (also the only frame origin the CSP allows). */
  host: 'https://www.youtube-nocookie.com',

  /** PRIVACY SWITCH. false (default): nothing is requested from YouTube, not even a thumbnail, until the visitor presses play
   *  (this is what privacy.html promises). true: profile cards fetch the cover from i.ytimg.com as soon as they render. */
  autoThumbnail: false,

  /** Where the real YouTube iframe lives while the video view is closed.
   *  true: parked off-screen (audio only, nothing visible). false: a small floating video box above the dock. */
  parkPlayerWhenHidden: true,

  /** A start that shows no sign of life after this long (ms) is reported as an error with a retry button. */
  stallMs: 14000,

  /** After a play request, a YouTube player that is still idle after this long (ms) is treated as "the browser blocked autoplay". */
  blockedMs: 3200,

  /** The bottom dock shrinks into a small spinning disc in the corner after this many ms without a touch (it keeps playing). 0 = never shrink. */
  dockIdleMs: 5000,

  /** How long (ms) loading the YouTube IFrame API may take before it counts as unreachable (ad blocker, offline). */
  apiTimeoutMs: 12000,
};
