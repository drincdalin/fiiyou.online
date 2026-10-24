-- =====================================================================
-- Local MySpace backend — 0001: tables, validators, triggers
-- Target: Supabase (Postgres + Auth). Run in order: 0001 -> 0004.
-- =====================================================================

-- ---------- localities (Beiuș + surrounding villages) ----------
create table public.localities (
  id    int generated always as identity primary key,
  slug  text not null unique,
  name  text not null,
  lat   double precision,
  lng   double precision,
  check ((lat is null) = (lng is null))
);

-- ---------- validators (used in CHECK constraints) ----------
create function public.is_hex_color(v text) returns boolean
language sql immutable as $$
  select coalesce(v ~ '^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$', false)
$$;

create function public.is_media_path(v text) returns boolean
language sql immutable as $$
  select coalesce(v ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$', false)
$$;

-- Profile theme: only whitelisted keys/values. No raw CSS on purpose (XSS).
create function public.is_valid_theme(t jsonb) returns boolean
language plpgsql immutable as $$
declare k text; v jsonb; s text;
begin
  if t is null or jsonb_typeof(t) <> 'object' then return false; end if;
  if length(t::text) > 2048 then return false; end if;
  for k, v in select key, value from jsonb_each(t) loop
    s := v #>> '{}';
    if jsonb_typeof(v) <> 'string' then return false; end if;
    case k
      when 'bg_color','text_color','link_color','accent_color','border_color' then
        if not public.is_hex_color(s) then return false; end if;
      when 'bg_image' then
        if not public.is_media_path(s) then return false; end if;
      when 'bg_repeat' then
        if s not in ('repeat','repeat-x','repeat-y','no-repeat','cover') then return false; end if;
      when 'font' then
        if s not in ('default','serif','sans','mono','pixel','verdana','comic') then return false; end if;
      when 'cursor' then
        if s not in ('default','crosshair','pointer','help') then return false; end if;
      else
        return false;
    end case;
  end loop;
  return true;
end $$;

-- Per-card style (the "chaotic profile" knobs)
create function public.is_valid_card_style(t jsonb) returns boolean
language plpgsql immutable as $$
declare k text; v jsonb; s text;
begin
  if t is null or jsonb_typeof(t) <> 'object' then return false; end if;
  if length(t::text) > 1024 then return false; end if;
  for k, v in select key, value from jsonb_each(t) loop
    s := v #>> '{}';
    case k
      when 'bg_color','text_color','border_color' then
        if jsonb_typeof(v) <> 'string' or not public.is_hex_color(s) then return false; end if;
      when 'border_style' then
        if jsonb_typeof(v) <> 'string'
           or s not in ('none','solid','dashed','dotted','double','outset','inset') then return false; end if;
      when 'border_width' then
        if jsonb_typeof(v) <> 'number' or s::numeric not between 0 and 8 then return false; end if;
      when 'shadow' then
        if jsonb_typeof(v) <> 'boolean' then return false; end if;
      else
        return false;
    end case;
  end loop;
  return true;
end $$;

-- Card content: generic shape checks. Content is ALWAYS plain text/data —
-- the frontend must never render it as HTML.
create function public.is_valid_card_content(c jsonb) returns boolean
language plpgsql immutable as $$
declare el jsonb; s text;
begin
  if c is null or jsonb_typeof(c) <> 'object' then return false; end if;
  if length(c::text) > 8000 then return false; end if;
  if length(coalesce(c->>'body','')) > 3000 then return false; end if;

  if c ? 'images' then
    if jsonb_typeof(c->'images') <> 'array' or jsonb_array_length(c->'images') > 12 then return false; end if;
    for el in select value from jsonb_array_elements(c->'images') loop
      if jsonb_typeof(el) <> 'string' or not public.is_media_path(el #>> '{}') then return false; end if;
    end loop;
  end if;

  if c ? 'links' then
    if jsonb_typeof(c->'links') <> 'array' or jsonb_array_length(c->'links') > 20 then return false; end if;
    for el in select value from jsonb_array_elements(c->'links') loop
      if jsonb_typeof(el) <> 'object' then return false; end if;
      if coalesce(el->>'url','') !~ '^https?://[^[:space:]]+$' or length(el->>'url') > 500 then return false; end if;
      if length(coalesce(el->>'label','')) > 60 then return false; end if;
    end loop;
  end if;

  if c ? 'url' then
    if jsonb_typeof(c->'url') <> 'string' or (c->>'url') !~ '^https?://[^[:space:]]+$' or length(c->>'url') > 500 then return false; end if;
  end if;

  if c ? 'interests' then
    if jsonb_typeof(c->'interests') <> 'array' or jsonb_array_length(c->'interests') > 30 then return false; end if;
    for el in select value from jsonb_array_elements(c->'interests') loop
      if jsonb_typeof(el) <> 'string' or length(el #>> '{}') > 40 then return false; end if;
    end loop;
  end if;
  return true;
end $$;

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- Cheap spam brake: tg args = (max_rows, window, author_column)
create function public.enforce_rate_limit() returns trigger
language plpgsql as $$
declare n int;
begin
  execute format('select count(*) from %I.%I where %I = $1 and created_at > now() - $2::interval',
                 tg_table_schema, tg_table_name, tg_argv[2])
    into n using (to_jsonb(new)->>tg_argv[2])::uuid, tg_argv[1];
  if n >= tg_argv[0]::int then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------- profiles ----------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 50),
  headline     text check (char_length(headline) <= 80),      -- "mood"/status line
  bio          text check (char_length(bio) <= 500),
  locality_id  int references public.localities(id) on delete set null,
  avatar_path  text check (avatar_path is null or public.is_media_path(avatar_path)),
  show_on_map  boolean not null default false,                -- opt-in, friends only
  wall_policy  text not null default 'everyone' check (wall_policy in ('everyone','friends','nobody')),
  theme        jsonb not null default '{}'::jsonb check (public.is_valid_theme(theme)),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index profiles_locality_idx on public.profiles(locality_id);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- profile cards (free-position blocks on a profile canvas) ----------
-- Canvas is a logical 1000-wide space; frontend scales it.
create table public.profile_cards (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type       text not null check (type in
             ('about','text','image','gallery','links','interests','music','top_friends','guestbook')),
  title      text check (char_length(title) <= 60),
  content    jsonb not null default '{}'::jsonb check (public.is_valid_card_content(content)),
  style      jsonb not null default '{}'::jsonb check (public.is_valid_card_style(style)),
  x          int  not null default 0   check (x between 0 and 5000),
  y          int  not null default 0   check (y between 0 and 5000),
  w          int  not null default 300 check (w between 40 and 2000),
  h          int  not null default 200 check (h between 40 and 2000),
  z          int  not null default 0   check (z between 0 and 1000),
  rotation   numeric(5,2) not null default 0 check (rotation between -45 and 45),
  visible    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profile_cards_profile_idx on public.profile_cards(profile_id);
create trigger profile_cards_touch before update on public.profile_cards
  for each row execute function public.touch_updated_at();

create function public.limit_cards_per_profile() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.profile_cards where profile_id = new.profile_id) >= 30 then
    raise exception 'card_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger profile_cards_limit before insert on public.profile_cards
  for each row execute function public.limit_cards_per_profile();

-- ---------- friendships (pending/accepted; decline = delete row) ----------
create table public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null constraint friendships_requester_id_fkey references public.profiles(id) on delete cascade,
  addressee_id uuid not null constraint friendships_addressee_id_fkey references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
create unique index friendships_pair_uq on public.friendships
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships(addressee_id, status);
create index friendships_requester_idx on public.friendships(requester_id, status);
create trigger friendships_rate before insert on public.friendships
  for each row execute function public.enforce_rate_limit('30', '1 hour', 'requester_id');

-- ---------- top friends (MySpace "Top 8") ----------
create table public.top_friends (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  friend_id  uuid not null references public.profiles(id) on delete cascade,
  rank       smallint not null check (rank between 1 and 8),
  primary key (profile_id, rank),
  unique (profile_id, friend_id)
);

-- ---------- blocks & reports ----------
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('profile','post','post_comment','wall_comment')),
  target_id   uuid not null,
  reason      text not null check (char_length(reason) between 1 and 500),
  status      text not null default 'open' check (status in ('open','reviewed','dismissed')),
  created_at  timestamptz not null default now()
);
create trigger reports_rate before insert on public.reports
  for each row execute function public.enforce_rate_limit('10', '1 hour', 'reporter_id');

-- ---------- guestbook / wall ----------
create table public.wall_comments (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,  -- wall owner
  author_id  uuid not null constraint wall_comments_author_id_fkey references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index wall_comments_idx on public.wall_comments(profile_id, created_at desc);
create trigger wall_comments_rate before insert on public.wall_comments
  for each row execute function public.enforce_rate_limit('20', '1 hour', 'author_id');

-- ---------- local posts (statuses, events, questions to neighbours) ----------
create table public.posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null constraint posts_author_id_fkey references public.profiles(id) on delete cascade,
  locality_id int references public.localities(id) on delete set null,
  kind        text not null default 'status' check (kind in ('status','event','ask')),
  body        text not null check (char_length(body) between 1 and 1000),
  image_path  text check (image_path is null or public.is_media_path(image_path)),
  event_at    timestamptz,
  event_place text check (char_length(event_place) <= 120),
  visibility  text not null default 'public' check (visibility in ('public','friends')),
  created_at  timestamptz not null default now(),
  check (kind <> 'event' or event_at is not null)
);
create index posts_created_idx  on public.posts(created_at desc);
create index posts_locality_idx on public.posts(locality_id, created_at desc);
create index posts_event_idx    on public.posts(event_at) where kind = 'event';
create trigger posts_rate before insert on public.posts
  for each row execute function public.enforce_rate_limit('10', '1 hour', 'author_id');

create table public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null constraint post_comments_author_id_fkey references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index post_comments_idx on public.post_comments(post_id, created_at);
create trigger post_comments_rate before insert on public.post_comments
  for each row execute function public.enforce_rate_limit('30', '1 hour', 'author_id');

-- ---------- helper predicates (SECURITY DEFINER so RLS can use them) ----------
create function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;

create function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
  )
$$;

create function public.can_post_on_wall(p_wall uuid, p_author uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare pol text;
begin
  if p_author is null then return false; end if;
  if public.is_blocked_between(p_wall, p_author) then return false; end if;
  if p_wall = p_author then return true; end if;
  select wall_policy into pol from public.profiles where id = p_wall;
  return pol = 'everyone' or (pol = 'friends' and public.are_friends(p_wall, p_author));
end $$;

-- ---------- new user -> profile + starter cards ----------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare u text := lower(coalesce(new.raw_user_meta_data->>'username', ''));
begin
  if u !~ '^[a-z0-9_]{3,24}$' or exists (select 1 from public.profiles where username = u) then
    u := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, u, left(coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), u), 50));

  insert into public.profile_cards (profile_id, type, title, content, x, y, w, h, z, rotation) values
    (new.id, 'about',       'About me',   '{"body":""}',   20,  20, 460, 260, 1,  0),
    (new.id, 'top_friends', 'Top 8',      '{}',           500,  40, 480, 300, 2,  1.5),
    (new.id, 'gallery',     'Pics',       '{"images":[]}', 40, 300, 440, 280, 3, -1),
    (new.id, 'guestbook',   'Guestbook',  '{}',           520, 360, 460, 320, 4,  0.5);
  return new;
end $$;
-- NOTE: created on auth.users (Supabase allows this from the SQL editor).
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- blocking severs ties ----------
create function public.on_block_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships
   where (requester_id = new.blocker_id and addressee_id = new.blocked_id)
      or (requester_id = new.blocked_id and addressee_id = new.blocker_id);
  delete from public.top_friends
   where (profile_id = new.blocker_id and friend_id = new.blocked_id)
      or (profile_id = new.blocked_id and friend_id = new.blocker_id);
  return new;
end $$;
create trigger blocks_sever after insert on public.blocks
  for each row execute function public.on_block_created();
