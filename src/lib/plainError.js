// Turns what the database, storage, auth or the network says into a sentence a person can act on.
// Nothing technical (table names, constraint names, SQL words) is ever shown. Unknown technical text becomes a calm generic sentence.
// Messages that are already human ("That username is taken.") pass through unchanged.

const GENERIC = 'Something went wrong on our side. Please try again in a moment.';

// custom errors raised by our own database rules: the message IS the code
const CODES = {
  rate_limit: 'You are doing that a little too fast. Wait a moment and try again.',
  card_limit: 'You have reached the limit of cards and stickers on your profile. Remove one to add another.',
  photo_limit: 'You have reached the limit of photos. Delete one to add another.',
  too_many_pins: 'You have pinned too many messages in this chat. Unpin one first.',
  too_many_scheduled: 'You have too many scheduled posts. Delete or publish one first.',
  banned: 'This account cannot be used.',
  forbidden: 'You are not allowed to do that.',
  not_authenticated: 'Your session ended. Please sign in again.',
  cannot_delete_self: 'You cannot do that to your own account.',
  bad_layout: 'That layout is not allowed.', bad_parent: 'That change is not allowed.', bad_status: 'That change is not allowed right now.', bad_type: 'That type is not allowed.',
};

// the name of the rule that was broken -> what to tell the person
const CHECKS = [
  [/^profile_cards_(x|y)_check$/, 'A card or sticker was placed too far off the page. Drag it back onto the page and save again.'],
  [/^profile_cards_(w|h)_check$/, 'A card or sticker is too small or too big. Resize it and save again.'],
  [/^profile_cards_rotation_check$/, 'A sticker is rotated too far. Reduce the rotation and save again.'],
  [/^profile_cards_z_check$/, 'Too many things are stacked on top of each other. Send one to the back and save again.'],
  [/^profile_cards_title_check$/, 'A card title is too long. Use 60 characters or fewer.'],
  [/^profile_cards_content_check$/, 'A card has text, a link or a list that is too long or not allowed. Shorten it and save again.'],
  [/^profile_cards_style_check$/, 'A card has a style value that is not allowed. Reset that style and save again.'],
  [/^profile_cards_type_check$/, 'That kind of card is not available.'],
  [/^profiles_username_check$/, 'Usernames are 3 to 24 characters: lowercase letters, numbers and underscores.'],
  [/^profiles_display_name_check$/, 'Your name must be 1 to 50 characters.'],
  [/^profiles_headline_check$/, 'Your headline can be up to 80 characters.'],
  [/^profiles_bio_check$/, 'Your bio can be up to 500 characters.'],
  [/^profiles_custom_css_check$/, 'Your custom CSS contains something that is not allowed. Remove the last thing you added.'],
  [/^profiles_theme_check$/, 'A theme value is not allowed. Reset the last colour or setting you changed.'],
  [/^profiles_music_check$/, 'The music link is not valid.'],
  [/^profiles_github_repo_format$/, 'Write the GitHub repository as owner/name.'],
  [/^profiles_wall_policy_check$/, 'That guestbook setting is not available.'],
  [/^(posts|scheduled_posts)_body_check$/, 'A post must be between 1 and 1000 characters.'],
  [/^(posts|scheduled_posts)_title_check$/, 'A title can be up to 100 characters.'],
  [/^(posts|scheduled_posts)_event_place_check$/, 'The place can be up to 120 characters.'],
  [/^(posts|scheduled_posts)_check$/, 'An event needs a date and time.'],
  [/^(posts|scheduled_posts)_extra_images/, 'A post can have up to 4 photos.'],
  [/^scheduled_posts_publish_at_check$/, 'Choose a time within the next year.'],
  [/^messages_body_check$/, 'A message must be between 1 and 1000 characters.'],
  [/^(post_comments|wall_comments)_body_check$/, 'A comment must be between 1 and 500 characters.'],
  [/^photos_caption_check$/, 'A caption can be up to 300 characters.'],
  [/^places_name_check$/, 'A place name must be between 2 and 80 characters.'],
  [/^places_description_check$/, 'A place description can be up to 300 characters.'],
  [/^places_(lat|lng)_check$/, 'That location is not valid.'],
  [/^reports_reason_check$/, 'Please write a reason of up to 500 characters.'],
  [/^post_tags_tag_check$/, 'Hashtags are 2 to 32 letters, numbers or underscores, and cannot be only numbers.'],
  [/^top_friends_rank_check$/, 'You can have up to 8 top friends.'],
  [/(path|avatar_path|image_path)_check$/, 'That file could not be used. Upload it again.'],
];
const UNIQUES = [
  [/^profiles_username_key$/, 'That username is already taken.'],
  [/^top_friends_/, 'That person is already in your top friends.'],
  [/^push_subscriptions_/, 'This device is already registered.'],
];
const PATTERNS = [
  [/row-level security|permission denied|insufficient[_ ]privilege|not allowed to/i, 'You are not allowed to do that.'],
  [/jwt expired|invalid jwt|jwt|auth session missing|refresh token|not logged in|invalid claim/i, 'Your session ended. Please sign in again.'],
  [/invalid login credentials/i, 'Wrong email or password.'],
  [/email not confirmed/i, 'Please confirm your email first. Check your inbox.'],
  [/user already registered|already been registered/i, 'There is already an account with that email.'],
  [/over_email_send_rate_limit|email rate limit/i, 'Too many emails were sent. Try again in a little while.'],
  [/captcha/i, 'The security check failed. Please try again.'],
  [/payload too large|exceeded the maximum allowed size|file size|entity too large|413/i, 'That file is too big.'],
  [/invalid mime type|mime type .* not supported|unsupported media/i, 'That file type is not supported.'],
  [/resource already exists/i, 'That file already exists. Please try again.'],
  [/bucket not found|object not found|not found/i, 'That could not be found. It may have been removed.'],
  [/statement timeout|canceling statement|timeout/i, 'That took too long. Please try again.'],
  [/too many requests|429/i, 'Too many requests. Wait a moment and try again.'],
  [/value too long|too long for type/i, 'Something you wrote is too long.'],
  [/invalid input syntax|invalid input value|malformed/i, 'Something has a value in the wrong format.'],
  [/out of range|numeric field overflow/i, 'A number is too big or too small.'],
  [/null value in column|violates not-null/i, 'Something required is missing. Please fill everything in and try again.'],
  [/foreign key/i, 'That item no longer exists. Refresh the page and try again.'],
  [/json object requested|multiple \(or no\) rows|pgrst116/i, 'That item could not be found. It may have been removed.'],
  [/could not find the (function|table)|schema cache|does not exist|pgrst20[25]/i, 'This feature is not available yet. Please try again later.'],
];
// words that only appear in technical messages: never show these to a person
const TECHNICAL = /violates|constraint|relation "|column "|\bsql\b|sqlstate|postgres|pgrst|syntax error|duplicate key|function public\.|schema|\bpg_|rpc\b|stack|typeerror|referenceerror|cannot read prop|undefined|is not a function|unexpected token|\b[0-9a-z]{5}\b: /i;

export function plainError(input, fallback = GENERIC) {
  const raw = String(input?.message ?? input ?? '').trim();
  const code = String(input?.code ?? '');
  if (!raw) return fallback;
  if (CODES[raw]) return CODES[raw];
  const named = raw.match(/violates (?:check|unique|foreign key) constraint "([^"]+)"/i)?.[1] || raw.match(/constraint "([^"]+)"/i)?.[1];
  if (/violates check constraint/i.test(raw) || code === '23514') {
    for (const [re, text] of CHECKS) if (named && re.test(named)) return text;
    return 'One of the values is not allowed. Check what you entered and try again.';
  }
  if (/duplicate key|already exists/i.test(raw) && (code === '23505' || /duplicate key/i.test(raw))) {
    for (const [re, text] of UNIQUES) if (named && re.test(named)) return text;
    return 'That already exists.';
  }
  for (const [re, text] of PATTERNS) if (re.test(raw)) return text;
  const first = Object.keys(CODES).find((k) => new RegExp(`\\b${k}\\b`).test(raw));   // e.g. "P0001: rate_limit"
  if (first) return CODES[first];
  if (TECHNICAL.test(raw) || raw.length > 240) return fallback;
  return raw;   // already written for people
}
