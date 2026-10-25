-- 0013: the data export now covers everything the app stores about you (photos, messages, places, likes too).
create or replace function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated'; end if;
  return jsonb_build_object(
    'fiiyou_export', 1, 'exported_at', now(),
    'profile',       (select to_jsonb(p) - 'is_official' from public.profiles p where p.id = me),
    'cards',         (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.profile_cards c where c.profile_id = me),
    'photos',        (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.photos x where x.owner_id = me),
    'top_friends',   (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.top_friends t where t.profile_id = me),
    'friendships',   (select coalesce(jsonb_agg(to_jsonb(f)), '[]') from public.friendships f where me in (f.requester_id, f.addressee_id)),
    'posts',         (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.posts p where p.author_id = me),
    'post_comments', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.post_comments c where c.author_id = me),
    'post_likes',    (select coalesce(jsonb_agg(to_jsonb(l)), '[]') from public.post_likes l where l.user_id = me),
    'photo_likes',   (select coalesce(jsonb_agg(to_jsonb(l)), '[]') from public.photo_likes l where l.user_id = me),
    'wall_written',  (select coalesce(jsonb_agg(to_jsonb(w)), '[]') from public.wall_comments w where w.author_id = me),
    'wall_received', (select coalesce(jsonb_agg(to_jsonb(w)), '[]') from public.wall_comments w where w.profile_id = me),
    'messages',      (select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]') from public.messages m where me in (m.sender_id, m.recipient_id)),
    'places_created',(select coalesce(jsonb_agg(to_jsonb(pl)), '[]') from public.places pl where pl.created_by = me),
    'blocks',        (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.blocks b where b.blocker_id = me),
    'reports_filed', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.reports r where r.reporter_id = me)
  );
end $$;
