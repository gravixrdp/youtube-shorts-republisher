# AI Agents Shared Changelog

Use this file as the single coordination source between Codex and Antigravity.

## Coordination Protocol (must follow)
1. Read this file before changing code.
2. Add one new entry at top of `Changes Log` after finishing work.
3. Keep entries short and factual: what changed, files, services, verification.
4. For VPS with 50GB disk, avoid large temp files and duplicate build artifacts.

## VPS Snapshot
- IP: `210.79.129.69`
- OS: Ubuntu Linux
- Storage: `48G total`, `6.4G used`, `42G free` (14% used) as of `2026-02-21 18:31 UTC`

## Runtime Source Of Truth
- Active services:
  - `youtube-shorts-republisher-web.service`
  - `youtube-shorts-republisher-scheduler.service`
- Legacy service `youtube-shorts-republisher.service` is disabled to prevent port 3000 conflicts.

---

## Changes Log (newest first)

### 2026-02-21 22:16 UTC — Codex
- Switched AI enhancement pipeline to Gemini API (replaced old `z-ai-web-dev-sdk` chat flow):
  - Rebuilt `src/lib/ai-enhancement.ts` to use Google Gemini REST `generateContent`.
  - Added runtime config support via DB config keys:
    - `gemini_api_key`
    - `gemini_model`
  - Added model fallback chain in code: preferred model -> `gemini-2.5-flash` -> `gemini-2.5-flash-lite`.
  - Added stronger viral-focused prompts for:
    - title generation
    - description generation
    - hashtag generation
  - Added robust hashtag sanitization and fallback behavior.
- Model compatibility test (live with provided key):
  - `gemini-2.5-flash` => working
  - `gemini-2.5-flash-lite` => working
  - `gemini-2.0-flash` => quota not available for this key
  - Default model set to `gemini-2.5-flash`.
- Fixed Gemini 2.5 truncation issue:
  - Root cause: long internal thinking caused `finishReason: MAX_TOKENS` and incomplete JSON.
  - Fix: set `thinkingBudget: 0` in generation config to force compact final JSON output.
- SEO upload improvement:
  - AI-generated hashtags are now merged into YouTube upload tags (sanitized + deduplicated), not only appended in description.
  - Files:
    - `src/app/api/youtube/route.ts`
    - `src/app/api/scheduler/route.ts`
- Config UI updates:
  - Added Gemini fields in Config tab:
    - `Gemini API Key`
    - `Gemini Model`
  - File: `src/app/page.tsx`
- Runtime config state updated:
  - `ai_enhancement_enabled=true`
  - `gemini_model=gemini-2.5-flash`
  - `gemini_api_key` saved (length verified)
- Verification:
  - `npm run build` passed.
  - Services restarted (`web` + `scheduler`) and healthy.
  - Live function tests with Bun:
    - `enhanceContent(...)` returned viral title/description/hashtags JSON
    - `generateHashtags(...)` returned hashtag list

### 2026-02-21 21:45 UTC — Codex
- Live scheduler verification for user-reported `03:15` slot:
  - Checked runtime clock and found server running in `UTC`, while user expectation was local-time behavior.
  - Added timezone-aware scheduling using config key `scheduler_timezone` (default fallback `UTC`) so upload slots can run in local timezone.
  - Set runtime `scheduler_timezone=Asia/Kolkata` for this deployment and re-tested with `upload_time_morning=03:15`.
  - Result at `2026-02-21 21:45 UTC` (`2026-02-22 03:15 IST`):
    - Scheduler log: `Matched configured slot (morning@03:15) [tz=Asia/Kolkata]`
    - Auto upload triggered and succeeded (`uUZit73uyKA`).
    - `scheduler_state.uploads_today` incremented to `1`.
- Files updated:
  - `mini-services/scheduler/index.ts` (timezone-aware slot matching)
  - `src/app/page.tsx` (added `Scheduler Timezone` config option)
  - `supabase-schema.sql` (default config key seed `scheduler_timezone`)
- Deployment/verification:
  - `npm run build` passed.
  - Services restarted (`youtube-shorts-republisher-web.service`, `youtube-shorts-republisher-scheduler.service`).
  - Confirmed `/status` includes `scheduler_timezone` and automation config.

### 2026-02-21 21:28 UTC — Codex
- Added missing upload timing controls in UI (`Config` tab):
  - `Uploads/Day` selector (global scheduler limit key: `uploads_per_day`)
  - `Morning Time (UTC)` (`upload_time_morning`)
  - `Evening Time (UTC)` (`upload_time_evening`)
  - Existing `Enable Automation` toggle kept and now paired clearly with schedule slots.
  - File: `src/app/page.tsx`
- Fixed scheduler automation behavior to use configurable times (not hardcoded 09:00/18:00 only):
  - Replaced fixed cron slots with per-minute UTC slot checker.
  - Reads `upload_time_morning` + `upload_time_evening` from config and triggers only on matching minute.
  - Added per-day trigger-key guard to prevent duplicate trigger in same slot/minute.
  - File: `mini-services/scheduler/index.ts`
- Investigated and fixed download failures:
  - Root cause found in logs: old `yt-dlp` (`2024.04.09`) causing `nsig extraction failed` and HTTP 403.
  - Installed latest binary at `/home/ubuntu/.local/bin/yt-dlp` (`2026.02.21`).
  - Updated downloader to prefer local latest binary via env/default path.
  - Switched temp download path to stable writable dir `/tmp/youtube-shorts-republisher`.
  - Added primary + fallback download strategy with clearer combined error messages.
  - File: `src/lib/youtube/video-handler.ts`
- Improved error visibility/monitoring in logs:
  - Added explicit download/validation/upload log writes for `process` workflow.
  - Added scheduler-side download/validation/upload success/error logs too.
  - Files:
    - `src/app/api/youtube/route.ts`
    - `src/app/api/scheduler/route.ts`
- Verification:
  - `npm run build` passed.
  - Services restarted and active:
    - `youtube-shorts-republisher-web.service`
    - `youtube-shorts-republisher-scheduler.service`
  - Health/API checks:
    - `GET /` => `200`
    - `GET /health` on scheduler => healthy
    - `GET /status` on scheduler returns config including automation + timing keys
  - Download retest:
    - `POST /api/youtube` action `download` succeeded for pending short with valid file + validation response.

### 2026-02-21 20:52 UTC — Codex
- Implemented explicit channel tables in Supabase for clear DB visibility (instead of only JSON in `config`):
  - Added real tables:
    - `source_channels` (`channel_id`, `channel_title`, `channel_url`, `is_active`, timestamps)
    - `destination_channels` (`channel_id`, `channel_title`, `refresh_token`, timestamps)
  - Added indexes, RLS policies, and updated-at triggers for both tables.
  - Added idempotent legacy migration from config keys:
    - `youtube_source_channels` -> `source_channels`
    - `youtube_destination_channels` -> `destination_channels`
  - Added readable DB views for channel-wise understanding:
    - `source_channel_scrape_stats`
    - `destination_channel_upload_stats`
    - `shorts_channel_overview`
- Switched runtime channel storage logic to table-backed reads/writes (with safe fallback/sync to legacy config):
  - `src/lib/youtube/source-channels.ts`
  - `src/lib/youtube/destination-channels.ts`
- UI clarity update:
  - `src/app/page.tsx` videos list now shows `Source -> Destination` channel name per row.
- Schema definitions aligned:
  - `prisma/schema.prisma` now includes `SourceChannel` and `DestinationChannel` models.
  - `supabase-schema.sql` updated with new tables/indexes/views/migration SQL.
- Verification:
  - SQL migration executed successfully via `prisma db execute`.
  - `psql` checks:
    - `source_channels` row count = `1`
    - `destination_channels` row count = `1`
    - `source_channel_scrape_stats` returned source stats row.
  - `npm run build` passed.
  - Services restarted (`web` + `scheduler`) and healthy.
  - APIs passed: `/api/youtube/source-channels`, `/api/youtube/destination-channels`, `/api/scraping`.

### 2026-02-21 20:36 UTC — Codex
- Finalized manual scraping workflow and monitoring consistency for source/destination/mapping split:
  - Removed leftover stale `fetch-all-mappings` UI action path so scraping actions in UI stay source-driven/manual.
  - Added scraping monitor refresh after destination save/delete, mapping fetch/delete, manual upload, and short delete, so source stats/history update immediately after each action.
  - Kept source-level controls (`Start Scraping` / `Stop Scraping` + `Scrape Now`) as the primary scraping trigger model; scheduler remains upload-only (no auto scrape trigger).
- Data model/type alignment:
  - Updated nullable log typing for scrape runs (`upload_logs.short_id` can be `null`) in:
    - `src/lib/supabase/client.ts`
    - `src/app/page.tsx`
  - Added/strengthened composite indexes for monitoring + cleanup query paths in:
    - `prisma/schema.prisma`
    - `supabase-schema.sql`
    - Applied on live DB via `prisma db execute` (`idx_shorts_source_status`, `idx_shorts_status_uploaded_date`, `idx_shorts_source_created_at`, `idx_mappings_active_source_id`, `idx_mappings_active_source_url`)
- Build + runtime verification:
  - `npm run build` passed with `/api/scraping` route included.
  - Restarted services:
    - `youtube-shorts-republisher-web.service`
    - `youtube-shorts-republisher-scheduler.service`
  - Health checks:
    - `curl http://localhost:3000/` => `200`
    - `curl http://localhost:3000/api/scraping` => success payload
    - `curl http://localhost:3002/health` => healthy

### 2026-02-21 20:14 UTC — Codex
- Implemented source scraping control + retention workflow updates requested:
  - Added source-level scraping stop/start behavior in UI (`Stop Scraping` / `Start Scraping`) and wired it to source `is_active` state.
  - Mapping fetch buttons are now disabled when the mapped source has scraping stopped.
  - Removed per-mapping fetched/uploaded counter cards from mappings UI ("kitna scraping hua" display removed).
  - Updated copy in source tab to reflect explicit scraping control flow.
- Scraping pipeline updates:
  - Source fetch now targets larger history (`maxResults=500`) so source shorts metadata (including URLs) is pre-synced in DB more comprehensively.
  - Fetch APIs now return simpler sync messages (without exposing detailed scrape counters in user-facing toast text).
  - `fetch-all` now respects source scraping state and skips mappings whose source is paused.
- Upload/download behavior updates:
  - Video download format upgraded to highest available MP4 stream merge in `yt-dlp` (`bv*+ba`, merged mp4) for better HD quality before upload.
  - Scheduler run now processes one pending short per trigger (no multi-upload burst loop in a single run).
- 5-hour auto-delete rule for uploaded shorts:
  - Added DB cleanup logic to delete uploaded shorts older than `uploaded_cleanup_hours` (default `5`) **only if** source channel does not have multiple active destination mappings.
  - Cleanup runs via scheduler API action (`cleanup_uploaded`), after `process_next`, and in the scheduler service every 30 minutes.
  - Manual upload endpoint (`/api/youtube` process/upload) also triggers cleanup check after successful upload.
  - Verified behavior with smoke tests:
    - uploaded short with single active mapping -> deleted after cleanup window.
    - uploaded short with multiple active mappings on same source -> retained.
- Files touched:
  - `src/app/page.tsx`
  - `src/app/api/videos/route.ts`
  - `src/app/api/scheduler/route.ts`
  - `src/app/api/youtube/route.ts`
  - `src/lib/supabase/database.ts`
  - `src/lib/youtube/scraper.ts`
  - `src/lib/youtube/video-handler.ts`
  - `mini-services/scheduler/index.ts`
- Verification:
  - `npm run build` passed.
  - `youtube-shorts-republisher-web.service` + `youtube-shorts-republisher-scheduler.service` active after restart.
  - `GET /` returned `200`; scheduler `/health` returned healthy.

### 2026-02-21 19:58 UTC — Codex
- Fixed destination-channel OAuth connect failure caused by host/state-cookie mismatch:
  - Updated `src/app/api/youtube/oauth/start/route.ts` to canonicalize OAuth start host to configured redirect-domain host before issuing Google auth redirect.
  - Added one-time canonical redirect guard (`__canonical=1`) to prevent redirect loops in proxy/host-detection edge cases.
  - Added helper to resolve requested origin from request headers (`Host` / `X-Forwarded-*`) instead of relying only on `request.nextUrl.origin`.
- Improved callback failure clarity:
  - Updated `src/app/api/youtube/oauth/callback/route.ts` invalid-state message to explicitly instruct using configured domain (not raw IP).
- Verification:
  - `npm run build` passed.
  - `youtube-shorts-republisher-web.service` and `youtube-shorts-republisher-scheduler.service` active after restart.
  - OAuth start now behaves correctly:
    - `http://210.79.129.69:3000/api/youtube/oauth/start` -> one redirect to `...nip.io.../oauth/start?__canonical=1`
    - canonical start then returns Google OAuth redirect with `yt_oauth_state` cookie set on canonical host.

### 2026-02-21 19:37 UTC — Codex
- Implemented separated channel management model in UI + API:
  - New dedicated tabs in `src/app/page.tsx`: `Sources`, `Destinations`, and `Mappings` (mapping now links selected source + destination).
  - Updated `src/components/sidebar-nav.tsx` nav items to include `Sources` and `Destinations`.
  - Added source channel CRUD dialog + cards in `src/app/page.tsx`.
  - Added destination channel title edit + delete with cleanup controls in `src/app/page.tsx`.
- Added Source Channels backend support:
  - New storage helper `src/lib/youtube/source-channels.ts` (config-backed structured source records).
  - New route `src/app/api/youtube/source-channels/route.ts` (GET/POST/PUT/DELETE).
- Added relational cleanup behavior so DB stays consistent on unlink/remove:
  - `src/lib/supabase/database.ts` now deletes mapped shorts + upload logs when deleting mappings.
  - Added destination cleanup helper (`deleteMappingsByTargetChannelId`) and source cleanup helper (`deleteMappingsBySourceChannel`).
  - `src/app/api/mappings/route.ts` DELETE now supports cleanup toggle and defaults to mapped-shorts cleanup.
  - `src/app/api/youtube/destination-channels/route.ts` DELETE now cleans related mappings/shorts by default; route now also supports POST/PUT.
  - `src/app/api/videos/route.ts` fetch stores mapping-linked `source_channel` / `target_channel` metadata.
- Deployment/runtime verification:
  - `npm run build` passed.
  - Fixed service ownership back to split units: disabled legacy `youtube-shorts-republisher.service`; restarted `youtube-shorts-republisher-web.service` and `youtube-shorts-republisher-scheduler.service`.
  - Health checks passed: `GET /` returned `200`; `GET /api/youtube/source-channels` and `GET /api/youtube/destination-channels` returned success.

### 2026-02-21 19:01 UTC — Codex
- Implemented heavy GRAVIX UI/UX redesign while preserving backend contracts/endpoints:
  - `src/app/page.tsx` (full premium layout pass across Dashboard, Mappings, Videos, Config, Logs + dialogs)
  - `src/app/globals.css` (new dark-first teal/navy tokens, typography utilities, motion/focus accessibility, shell/sidebar/card/timeline system)
  - `src/components/sidebar-nav.tsx` (semantic nav buttons, improved active/focus states, compact status footer, mobile pills)
  - `src/app/layout.tsx` (font utility hookup via `font-body`)
- Frontend state handling upgraded to split loading channels and memoized derived views:
  - `initialLoad`, granular `actionLoad` map, `connectLoad`
  - memoized filtering/stat/health/timeline derivations to avoid unnecessary rerenders
- Build/deploy command path standardized and verified:
  - `npm run build` passed
  - `.next/standalone/server.js` exists
- Production deploy completed on split services only:
  - `sudo systemctl restart youtube-shorts-republisher-web.service youtube-shorts-republisher-scheduler.service`
  - `systemctl is-active` => both `active`
  - `curl` checks => `http://localhost:3000` and `http://210.79.129.69.nip.io:3000` returned `200`

### 2026-02-21 18:36 UTC — Codex
- Google OAuth redirect fix: switched from raw IP to `nip.io` because Google blocks IP-based redirect URIs.
- Updated app config key `youtube_redirect_uri` to `http://210.79.129.69.nip.io:3000/api/youtube/oauth/callback`.
- Usage note: open app via `http://210.79.129.69.nip.io:3000/` (not raw IP) so OAuth cookies + postMessage origin match.

### 2026-02-21 18:31 UTC — Codex
- Added destination-channel OAuth connect flow (2-click popup based):
  - `src/app/api/youtube/oauth/start/route.ts`
  - `src/app/api/youtube/oauth/callback/route.ts`
- Added destination channels storage and API:
  - `src/lib/youtube/destination-channels.ts`
  - `src/app/api/youtube/destination-channels/route.ts`
- Updated mapping UI to support connect/select destination channel:
  - `src/app/page.tsx`
- Updated upload flow to use mapping-specific destination refresh token:
  - `src/app/api/youtube/route.ts`
  - `src/app/api/scheduler/route.ts`
  - `src/lib/youtube/uploader.ts`
- Added helper updates used by above flow:
  - `src/lib/supabase/database.ts` (`getChannelMappingById`)
  - `src/lib/supabase/client.ts` (missing `ShortsData` fields)
  - `src/lib/youtube/scraper.ts` (env fallback for API key)
- Synced config keys through API for runtime:
  - `youtube_client_id`, `youtube_client_secret`, `youtube_api_key`, `youtube_redirect_uri`
  - redirect URI currently: `http://210.79.129.69:3000/api/youtube/oauth/callback`
- Disabled legacy crashing service:
  - `sudo systemctl disable --now youtube-shorts-republisher.service`
- Verification:
  - `bun run lint` and `bun run build` passed
  - `web + scheduler` both active
  - `GET /api/youtube/destination-channels` returns success
  - `GET /api/youtube/oauth/start` returns `307` Google OAuth redirect

### 2026-02-21 18:23 — Antigravity
- Database tables created (`config`, `channel_mappings`, `shorts_data`, `upload_logs`, `scheduler_state`) via `supabase-schema.sql`.
- `.env` DB host/password corrected for Supabase direct host.
- Systemd service `youtube-shorts-republisher.service` created (later replaced by `-web/-scheduler` split).
- Prisma client regenerated.
- Node.js v20 installed.
- Reported full project review and production deployment checks.

---

## Important Notes
- Do not delete `.next/standalone/` after production build.
- Use only one web service on port `3000` (currently `youtube-shorts-republisher-web.service`).
- Keep artifact churn low because VPS disk is limited.
