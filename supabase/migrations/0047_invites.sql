-- 0047: invite attribution and weekly invite contest.
--
-- Two separate facts are recorded:
--   invite_visits : someone opened /invite/<username>. One row per browser per inviter per week.
--   referrals     : a confirmed account was created through /invite/<username>.
-- The visit key is a random local id, never an IP address. Both tables are invisible to clients;
-- the visit RPC is the only write, and the dashboard reads them directly as supabase_admin.

create table if not exists public.invite_visits (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  visitor_key text not null check (visitor_key ~ '^[A-Za-z0-9_-]{8,64}$'),
  week_start date not null default (date_trunc('week', now() at time zone 'Europe/Bucharest'))::date,
  created_at timestamptz not null default now(),
  unique (inviter_id, visitor_key, week_start)
);
create index if not exists invite_visits_inviter_idx on public.invite_visits (inviter_id, created_at desc);
create index if not exists invite_visits_week_idx on public.invite_visits (week_start, inviter_id);

create table if not exists public.referrals (
  invitee_id uuid primary key references auth.users(id) on delete cascade,
  inviter_id uuid references public.profiles(id) on delete set null,
  inviter_username text,
  created_at timestamptz not null default now()
);
create index if not exists referrals_inviter_idx on public.referrals (inviter_id, created_at desc);

-- A confirmed account whose sign-up metadata names an inviter becomes a referral exactly once.
create or replace function public.record_referral() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uname text := lower(coalesce(new.raw_user_meta_data->>'invited_by', ''));
  inviter uuid;
begin
  if new.email_confirmed_at is null or uname = '' then return new; end if;
  select id into inviter from public.profiles where username = uname and id <> new.id;
  if inviter is null then return new; end if;
  insert into public.referrals (invitee_id, inviter_id, inviter_username, created_at)
  values (new.id, inviter, uname, coalesce(new.email_confirmed_at, now()))
  on conflict (invitee_id) do nothing;
  return new;
end $$;

drop trigger if exists referrals_after_confirm on auth.users;
create trigger referrals_after_confirm
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.record_referral();

-- Existing accounts: keep the attribution that is already in their sign-up metadata.
insert into public.referrals (invitee_id, inviter_id, inviter_username, created_at)
select u.id, p.id, lower(u.raw_user_meta_data->>'invited_by'), coalesce(u.email_confirmed_at, u.created_at)
  from auth.users u
  join public.profiles p on p.username = lower(u.raw_user_meta_data->>'invited_by') and p.id <> u.id
 where u.email_confirmed_at is not null
   and coalesce(u.raw_user_meta_data->>'invited_by', '') <> ''
on conflict (invitee_id) do nothing;

-- Called once when an invite address is opened. Never raises: a broken analytics write must not break the page.
create or replace function public.record_invite_visit(p_username text, p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare inviter uuid;
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{8,64}$' then return; end if;
  if p_username is null or p_username !~ '^[a-z0-9_]{3,24}$' then return; end if;
  select id into inviter from public.profiles where username = lower(p_username);
  if inviter is null then return; end if;
  insert into public.invite_visits (inviter_id, visitor_key)
  values (inviter, p_key)
  on conflict (inviter_id, visitor_key, week_start) do nothing;
exception when others then
  null;
end $$;

alter table public.invite_visits enable row level security;
alter table public.referrals enable row level security;
revoke all on public.invite_visits from anon, authenticated;
revoke all on public.referrals from anon, authenticated;
revoke all on function public.record_referral() from public;
revoke all on function public.record_invite_visit(text, text) from public;
grant execute on function public.record_invite_visit(text, text) to anon, authenticated;
