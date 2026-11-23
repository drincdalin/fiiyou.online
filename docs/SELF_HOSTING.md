# Self-hosting fiiyou

The frontend stays on **Vercel**. The backend (Postgres, Auth, Storage, Realtime, Edge Functions, Studio) runs on the Ubuntu host at `/srv/fiiyou/supabase` and is published only through a **Cloudflare Tunnel** at `https://api.fiiyou.online`.

No inbound ports are open. Only `cloudflared` talks to the API gateway, and the gateway itself listens on `127.0.0.1:8000`.

## Layout

```text
/srv/fiiyou/supabase            Supabase docker compose stack (v0.8.4)
  .env                          all secrets; chmod 600; never commit
  docker-compose.yml            upstream file, do not edit
  docker-compose.local.yml      our overrides: localhost ports, function secrets, template server
  volumes/db/data               Postgres data
  volumes/storage               uploaded files (file backend, no MinIO)
  volumes/functions             send-push, send-moderation-email
  volumes/templates             confirmation / recovery / magic-link HTML
/srv/fiiyou/ops/backup.sh       daily pg_dump + storage + .env
/srv/backups                    local backup target; copy off the machine
```

## Start, stop, status

```bash
cd /srv/fiiyou/supabase
sh run.sh start
sh run.sh status
sh run.sh logs auth
sh run.sh restart
sh run.sh stop
```

`run.sh start` waits for health checks. `docker compose ps` must show `db`, `auth`, `rest`, `storage`, `realtime`, `functions`, `api-gw` and `templates-server` healthy.

## Ports

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Only these may be published, and only on loopback:

```text
supabase-envoy      127.0.0.1:8000->8000/tcp
supabase-supavisor  127.0.0.1:5432->5432/tcp, 127.0.0.1:6543->6543/tcp
```

## Configuration

Everything is in `.env`. The values that matter for this app:

| Variable | Value |
|---|---|
| `SUPABASE_PUBLIC_URL` | `https://api.fiiyou.online` |
| `API_EXTERNAL_URL` | `https://api.fiiyou.online/auth/v1` |
| `SITE_URL` | `https://app.fiiyou.online` |
| `ADDITIONAL_REDIRECT_URLS` | app URLs plus localhost |
| `PROXY_DOMAIN` | `api.fiiyou.online` |
| `ENABLE_EMAIL_SIGNUP` | `true` |
| `ENABLE_EMAIL_AUTOCONFIRM` | `false` (profile is created on confirmation, migration 0043) |
| `ENABLE_ANONYMOUS_USERS` / `ENABLE_PHONE_*` | `false` |
| `FUNCTIONS_VERIFY_JWT` | `false` (both functions use `x-webhook-secret`) |
| `SMTP_*` | Resend, port 465, sender `noreply@fiiyou.online` |
| `VAPID_*` | Web Push pair; public half must equal `VITE_VAPID_PUBLIC_KEY` in Vercel |
| `WEBHOOK_SECRET` | matches `push_webhooks.sql` |
| `MOD_WEBHOOK_SECRET` | matches `moderation_webhook.sql` and the cron job |

`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `JWT_KEYS` and `JWT_JWKS` stay empty. The app uses the legacy HS256 `ANON_KEY` / `SERVICE_ROLE_KEY`; the compose file has defaults for the rest.

## Email templates

GoTrue does not read template files from disk. It fetches them over HTTP from the `templates-server` (Caddy) container, configured in `docker-compose.local.yml`. The files are copies of `supabase/templates/*.html` and must stay in sync:

```bash
cp supabase/templates/*.html /srv/fiiyou/supabase/volumes/templates/
docker compose up -d --force-recreate --no-deps auth
```

## Database migrations

Run once, in order, against the self-hosted database:

```bash
cd /srv/fiiyou/supabase
for f in /path/to/fiiyou/supabase/migrations/*.sql; do
  echo "==> $(basename "$f")"
  docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f" || break
done
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /path/to/fiiyou/supabase/seed.sql
docker exec -i supabase-db psql -U postgres -d postgres < /path/to/fiiyou/supabase/audit_rls.sql
```

The audit must end with `summary | OK`. `0044_realtime_friendships.sql` adds `friendships` to the realtime publication (the friend-request badge never updated before it).

## Edge Functions

Files are mounted from `volumes/functions/`. Secrets come from `.env` through `docker-compose.local.yml`.

```bash
docker compose up -d --force-recreate --no-deps functions
docker compose logs -f functions
curl -s https://api.fiiyou.online/functions/v1/send-push | jq
```

## Database webhooks

`push_webhooks.sql`, `moderation_webhook.sql` and `moderation_retry_cron.sql` call `http://api-gw:8000/...` from inside the stack, so they keep working when the tunnel is down. Replace the placeholder secrets in those files with the values from `.env` before running them, and never commit the filled-in versions.

## Cloudflare Tunnel

```bash
cloudflared tunnel list
sudo systemctl status cloudflared
```

Ingress: `api.fiiyou.online` → `http://127.0.0.1:8000`. SSL mode **Full**. A WAF rule blocks everything except `/auth/v1/`, `/rest/v1/`, `/graphql/v1`, `/realtime/v1/`, `/storage/v1/`, `/functions/v1/` and `/.well-known/`, which keeps Studio and `/pg/` off the internet.

Studio stays private:

```bash
ssh -L 8000:127.0.0.1:8000 dr-dalin@<host>
# then open http://127.0.0.1:8000/ with DASHBOARD_USERNAME / DASHBOARD_PASSWORD
```

## Dashboard from outside the LAN

The dashboard listens on `127.0.0.1:8090` and uses HTTP Basic auth. Do not expose that port directly; put **Cloudflare Access** in front of it, so only your email can open it and no port is opened.

1. Add a DNS route for the dashboard through the existing tunnel:

```bash
cloudflared tunnel route dns fiiyou dashboard.fiiyou.online
```

2. Add this rule to `/etc/cloudflared/config.yml`, **above** the `http_status:404` catch-all:

```yaml
  - hostname: dashboard.fiiyou.online
    service: http://127.0.0.1:8090
    originRequest:
      connectTimeout: 30s
      httpHostHeader: dashboard.fiiyou.online
```

```bash
sudo cloudflared tunnel ingress validate
sudo systemctl restart cloudflared
```

3. **The WAF must allow the dashboard.** The API-only rule currently blocks `/` on every hostname, which is why `http://dashboard.fiiyou.online` shows Cloudflare's "Sorry, you have been blocked" page. In **Security → WAF → Custom rules**, either scope the existing API block to `http.host eq "api.fiiyou.online"`, or add a rule above it:

   - Name: `dashboard allow`
   - Expression: `http.host eq "dashboard.fiiyou.online"`
   - Action: **Skip** → *All remaining custom rules* (use *Managed rules* too only if the block came from a managed rule; the dashboard has its own Basic auth and Access gate).

   Then open `https://dashboard.fiiyou.online`, not the `http://` address.

4. In Cloudflare: **Zero Trust → Access → Applications → Add an application → Self-hosted**.
   - Name: `fiiyou dashboard`
   - Public hostname: `dashboard.fiiyou.online`
   - Session duration: 24 hours
   - Policy: **Allow**, Include → **Emails** → your email address. Add a second policy only if someone else needs it.

5. Open `https://dashboard.fiiyou.online` from mobile data. Cloudflare asks for a one-time email code, then the dashboard asks for `DASH_USER` / `DASH_PASS`.

The Cloudflare Access policy is the real gate; the dashboard's Basic auth remains as a second layer. If Access is not configured, do not route the hostname at all.

Alternatives if you prefer no Cloudflare dependency:

- **Tailscale**: install it on the server and the laptop, then `tailscale serve --bg 8090` and open the tailnet URL.
- **SSH tunnel**: install `openssh-server`, then `ssh -L 8090:127.0.0.1:8090 dr-dalin@<host>` and open `http://127.0.0.1:8090` on the laptop.

## GIFs and the invite contest

GIF search uses **GifJif**, a keyless, CORS-enabled API (`https://gifjif.com`). No API key is needed. The Content-Security-Policy allows `gifjif.com` for images and connections. A GIF is stored as a short `fiiyou:gif:` message/comment body that contains only the provider path, so the normal spam-link rules do not treat it as a link and the app can never be pointed at an arbitrary remote image. Posts and stickers still accept uploaded GIF files through the normal media pipeline.

Invite tracking is in migration `0047_invites.sql`:

- `invite_visits` records one row per browser, per inviter, per week. The browser key is a random id in `localStorage`; no IP address or fingerprint is stored.
- `referrals` records a confirmed account once, resolved from the `invited_by` sign-up metadata through a trigger on `auth.users`.
- Existing `invited_by` metadata is backfilled by the migration.
- The contest week starts Monday, `Europe/Bucharest`. The dashboard's **Invites** tab shows visits, confirmed sign-ups, conversion, all-time totals and recent referrals.

Run migration 0047 before deploying the frontend that calls `record_invite_visit`.

## Backups

`/srv/fiiyou/ops/backup.sh` writes a compressed `pg_dump`, a tarball of `volumes/storage` and a copy of `.env` to `/srv/backups`, keeping 14 days. A systemd timer runs it at 03:30.

A backup on the same LUKS volume is not a backup: copy `/srv/backups` to an external disk or off-site (restic/rclone). Encrypt anything that leaves the machine, because `.env` is in there.

Restore into a scratch database first:

```bash
docker exec supabase-db createdb -U postgres restore_test
docker exec -i supabase-db pg_restore -U postgres -d restore_test < /srv/backups/db/fiiyou-YYYY-MM-DD-HHMM.dump
```

## Cutover checklist

1. Rotate every secret that was ever printed or committed; the stack was re-initialised for this reason.
2. `pg_dump` the cloud database, restore it here, then run any migrations added since.
3. Copy the `media` and `fonts` buckets from cloud Storage into `volumes/storage`.
4. Update the Vercel environment: `VITE_SUPABASE_URL=https://api.fiiyou.online`, new `VITE_SUPABASE_ANON_KEY`, new `VITE_VAPID_PUBLIC_KEY`; redeploy (Vite bakes them in).
5. Existing sessions do not carry over: users sign in once. Password hashes do carry over.
6. `public/sw.js` `VERSION` and the signed-URL cache key in `src/api/media.js` are bumped so old cloud URLs are not reused.
