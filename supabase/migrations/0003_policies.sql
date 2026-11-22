-- =====================================================================
-- 0003: Row Level Security
-- Everything requires login. Blocks hide people from each other everywhere.
-- =====================================================================

alter table public.localities    enable row level security;
alter table public.profiles      enable row level security;
alter table public.profile_cards enable row level security;
alter table public.friendships   enable row level security;
alter table public.top_friends   enable row level security;
alter table public.blocks        enable row level security;
alter table public.reports       enable row level security;
alter table public.wall_comments enable row level security;
alter table public.posts         enable row level security;
alter table public.post_comments enable row level security;

-- localities: readable by anyone (signup form), edited only via dashboard/service role
create policy localities_read on public.localities for select to anon, authenticated using (true);

-- profiles
create policy profiles_read on public.profiles for select to authenticated
  using (not public.is_blocked_between((select auth.uid()), id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- insert: only via handle_new_user trigger. delete: only via delete_my_account().

-- cards
create policy cards_read on public.profile_cards for select to authenticated
  using (profile_id = (select auth.uid())
         or (visible and not public.is_blocked_between((select auth.uid()), profile_id)));
create policy cards_insert_own on public.profile_cards for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy cards_update_own on public.profile_cards for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy cards_delete_own on public.profile_cards for delete to authenticated
  using (profile_id = (select auth.uid()));

-- friendships: read-only for the two parties; writes via RPC
create policy friendships_read on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- top friends: read follows profile visibility; writes via set_top_friends()
create policy top_friends_read on public.top_friends for select to authenticated
  using (not public.is_blocked_between((select auth.uid()), profile_id));

-- blocks: you only ever see your own (never who blocked you)
create policy blocks_read   on public.blocks for select to authenticated using (blocker_id = (select auth.uid()));
create policy blocks_insert on public.blocks for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy blocks_delete on public.blocks for delete to authenticated using (blocker_id = (select auth.uid()));

-- reports: write-only for users; read them in the dashboard
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));

-- wall / guestbook
create policy wall_read on public.wall_comments for select to authenticated
  using (not public.is_blocked_between((select auth.uid()), profile_id)
         and not public.is_blocked_between((select auth.uid()), author_id));
create policy wall_insert on public.wall_comments for insert to authenticated
  with check (author_id = (select auth.uid())
              and public.can_post_on_wall(profile_id, (select auth.uid())));
create policy wall_delete on public.wall_comments for delete to authenticated
  using (author_id = (select auth.uid()) or profile_id = (select auth.uid()));

-- posts
create policy posts_read on public.posts for select to authenticated
  using (author_id = (select auth.uid())
         or (not public.is_blocked_between((select auth.uid()), author_id)
             and (visibility = 'public' or public.are_friends((select auth.uid()), author_id))));
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy posts_update on public.posts for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy posts_delete on public.posts for delete to authenticated
  using (author_id = (select auth.uid()));

-- post comments: visibility is inherited from the post (the subquery runs through posts RLS)
create policy post_comments_read on public.post_comments for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id)
         and not public.is_blocked_between((select auth.uid()), author_id));
create policy post_comments_insert on public.post_comments for insert to authenticated
  with check (author_id = (select auth.uid())
              and exists (select 1 from public.posts p where p.id = post_id));
create policy post_comments_delete on public.post_comments for delete to authenticated
  using (author_id = (select auth.uid())
         or exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));
