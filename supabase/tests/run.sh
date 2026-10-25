#!/usr/bin/env bash
# Rebuilds a throwaway local DB with mocked Supabase auth/storage, applies the
# migrations, then runs tests/10_tests.sql. Usage: sudo -u postgres ./run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=vtest
psql -q -c "drop database if exists $DB" -c "create database $DB"
psql -q -d $DB -c "grant usage on schema public to anon, authenticated" -c "alter default privileges in schema public grant all on tables to authenticated"
for f in tests/00_mock_supabase.sql migrations/0001_schema.sql migrations/0002_functions.sql \
         migrations/0003_policies.sql migrations/0004_storage.sql migrations/0005_theme_v2.sql migrations/0006_stickers_theme_v3.sql migrations/0007_profile_music.sql migrations/0008_repair_old_themes.sql migrations/0009_music_audio.sql migrations/0010_social_layer.sql seed.sql; do
  psql -v ON_ERROR_STOP=1 -q -d $DB -f "$f"
done
psql -q -d $DB -c 'grant select on public.localities to anon'
psql -v ON_ERROR_STOP=1 -d $DB -f tests/10_tests.sql
