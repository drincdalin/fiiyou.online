#!/usr/bin/env bash
# Rebuilds a throwaway local DB with mocked Supabase auth/storage, applies the
# migrations, then runs tests/10_tests.sql. Usage: sudo -u postgres ./run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=vtest
# roles are cluster-wide: create them first so a fresh Postgres works too
psql -q -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end \$\$"
psql -q -c "drop database if exists $DB" -c "create database $DB"
psql -q -d $DB -c "grant usage on schema public to anon, authenticated" -c "alter default privileges in schema public grant all on tables to authenticated"
for f in tests/00_mock_supabase.sql migrations/0001_schema.sql migrations/0002_functions.sql \
         migrations/0003_policies.sql migrations/0004_storage.sql migrations/0005_theme_v2.sql migrations/0006_stickers_theme_v3.sql migrations/0007_profile_music.sql migrations/0008_repair_old_themes.sql migrations/0009_music_audio.sql migrations/0010_custom_fonts.sql migrations/0011_social_layer.sql migrations/0012_real_places.sql migrations/0013_custom_style.sql migrations/0014_export_everything.sql migrations/0015_admin.sql migrations/0016_get_post.sql migrations/0017_likers_and_views.sql migrations/0018_ubuntu_font.sql migrations/0019_chat_replies.sql migrations/0020_notifications.sql migrations/0021_push.sql seed.sql; do
  psql -v ON_ERROR_STOP=1 -q -d $DB -f "$f"
done
psql -q -d $DB -c 'grant select on public.localities to anon'
psql -v ON_ERROR_STOP=1 -d $DB -f tests/10_tests.sql
# 0022 (spam guard) rate-limits the bulk inserts in 10_tests.sql, so it is applied after them, then tested on its own
for f in migrations/0022_spam_and_bans.sql migrations/0023_media_read_scope.sql migrations/0024_onboarding_and_search.sql \
         migrations/0025_wall_notifications.sql migrations/0026_hashtags.sql migrations/0027_message_edit_delete.sql migrations/0028_comment_likes_replies_mentions.sql migrations/0029_search_schedule_pins_images.sql; do
  psql -v ON_ERROR_STOP=1 -q -d $DB -f "$f"
done
psql -v ON_ERROR_STOP=1 -d $DB -f tests/20_media_scope.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/30_onboarding_search.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/40_search_schedule_pins.sql
