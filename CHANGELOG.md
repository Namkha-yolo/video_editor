# Changelog

Notable changes to ClipVibe. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Procedural 3D LUT generator (`ai-pipeline/scripts/build_luts.py`) and six committed mood LUTs at 33³ resolution.
- `ai-pipeline/services/mood_grades.py` for per-mood vignette/grain config.
- `ai-pipeline/services/grader.py::ExposureAdjustment` for structured per-clip exposure correction.
- `server/src/services/moodEngine.ts::buildExposureAdjustment` — deterministic per-clip math (no external API calls).
- Real implementation of `client/src/pages/ProcessingPage.tsx` with Socket.IO progress + auto-navigate to export on complete.
- Inline feedback (success + error) on Login and Signup pages.
- `CORS_ALLOWED_ORIGINS` env var; server, Socket.IO, and AI pipeline now read it.
- Graceful SIGTERM/SIGINT shutdown that drains BullMQ, closes Socket.IO/HTTP, and quits Redis within a 25 s deadline.
- gitleaks pre-commit hook (`.gitleaks.toml`, `.pre-commit-config.yaml`).
- CI verifies committed LUTs match the generator output.

### Changed

- `/grade` accepts `{ signed_url, mood, brightness, contrast, saturation }` instead of a free-form FFmpeg filter string.
- `/probe` accepts `{ signed_url }` like `/analyze`/`/grade`; the upload path no longer ships a 50 MB FormData copy through the server.
- `server/src/routes/upload.ts` uploads to Supabase first, then probes via signed URL.
- `server/src/routes/jobs.ts` returns `output_download_url` per clip, signed with Supabase's `{ download: filename }` option so browsers actually save files.
- AI pipeline `Dockerfile` runs as non-root user `clipvibe` (uid 10001).
- Server `cors()` and Socket.IO CORS replaced with origin allowlist; default fails closed in production.
- Signup minimum password length raised from 6 to 12 characters.
- Upload thumbnail seeks past frame 0 (10 % of duration, capped at 0.5 s) and uses JPEG quality 0.8.
- `ai-pipeline/api.py` CORS middleware is opt-in via env (no wildcard).

### Removed

- `@anthropic-ai/sdk` dependency.
- `ANTHROPIC_API_KEY` from `.env.example`, `docker-compose.yml`, and CI.
- Claude rate limiters from `server/src/services/rateLimiters.ts` (job-creation limiter retained).
- `generateGradingFilters`, `buildAdaptiveFallbackFilters`, `buildFallbackFilters`, `ClaudeRateLimitError`.
- Scratch scripts under `server/`: `demo-claude.ts`, `test-claude.ts`, `test-moodengine.ts`, `test-week3.ts`, `test-rate-limit.ts`, `test-supabase.ts`, `test-api-manual.ts`, `create-test-job.ts`, `TEST-API-GUIDE.md`.
- Stale `.ts` duplicates of test files in `server/tests/` (the `.mjs` files are what the runner imports).
- `server/package-lock.json` (the workspace uses pnpm; the npm lockfile was a drift hazard).
- Broken `lint` scripts from `server/package.json`, `client/package.json`, root `package.json` (eslint was never installed).

### Fixed

- `client/src/pages/UploadPage.tsx` was pushing each successful upload into the project store twice.
- `client/src/pages/ExportPage.tsx` Download buttons opened videos in a new tab instead of saving (cross-origin `download` attribute is ignored without `Content-Disposition: attachment`).
- `URL.createObjectURL` from upload thumbnail preview was never revoked.
- `client/src/pages/ProcessingPage.tsx` was a stub that left users staring at a TODO after starting a job.
- Login and Signup pages used `alert()` for errors and `window.open(..., "width=500,height=700")` for navigation between them — both blocked by most browsers.

### Security

- Removed the FFmpeg-filter-injection surface: the pipeline no longer accepts free-form filter strings; it builds them internally from validated structured input.
- Server, Socket.IO, and AI pipeline CORS locked down (was wildcard).
- AI pipeline runs as a non-root user.
- gitleaks blocks future commits of Anthropic-style keys and Supabase service-role JWTs.
- Graceful shutdown prevents in-flight job loss / dropped websocket clients on container restart.

### Notes

- Existing local `.env` files containing `ANTHROPIC_API_KEY` can drop that line; the server no longer reads it.
- If a Supabase service-role key was ever shared in a screenshot, paste, or log, rotate it in the Supabase dashboard. gitleaks prevents future leaks but does not retroactively rotate exposed keys.
- Tuning a mood look means editing the recipe in `ai-pipeline/scripts/build_luts.py` (`MOODS` tuple — `lift_rgb`, `gain_rgb`, `contrast`, `saturation`, `black_lift`), rerunning the script, and committing the regenerated `.cube` files. CI fails if committed LUTs don't match generator output.
