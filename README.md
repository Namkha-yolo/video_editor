# ClipVibe

AI-powered mood-driven video color grading. Upload videos, pick a mood, and ClipVibe uses Claude (LLM) to intelligently color grade each clip so they all share the same cinematic feel — regardless of how different they originally looked.

## How It Works

```
Upload clips → Pick a mood → AI analyzes each clip → Claude generates
per-clip grading instructions → FFmpeg applies the grades → Download
```

The key differentiator: Claude doesn't apply a flat filter. It receives each clip's visual properties (brightness, contrast, dominant colors) and adapts the grading so a dark indoor clip and a bright outdoor clip both converge to the same mood through different adjustments.

## Architecture

```
┌─────────────┐       ┌──────────────┐       ┌────────────────┐
│   Client    │──────▶│   Server     │──────▶│  AI Pipeline   │
│  React/Vite │◀──────│  Express     │◀──────│  FastAPI       │
│  :5173      │  WS   │  :3001       │       │  :8000         │
└─────────────┘       └─────┬──────--┘       └────────────────┘
                            │
                 ┌──────────┼─────────-─┐
                 │          │           │
           ┌─────┴──┐  ┌────┴───┐  ┌────┴────┐
           │ Redis  │  │Supabase│  │ Claude  │
           │ :6379  │  │ (cloud)│  │  (API)  │
           └────────┘  └────────┘  └─────────┘
```

| Service | Role |
|---------|------|
| **Client** | React frontend — upload UI, mood picker, progress view, export page |
| **Server** | Express API — auth, file handling, job orchestration, Claude integration |
| **AI Pipeline** | FastAPI — video analysis (OpenCV) and color grading execution (FFmpeg) |
| **Redis** | Job queue storage for BullMQ |
| **Supabase** | Auth (Google/GitHub OAuth), PostgreSQL database, file storage |
| **Claude** | LLM that translates mood + clip analysis into per-clip FFmpeg filter params |

## Tech Stack

### Frontend (`client/`)
| Tool | Purpose |
|------|---------|
| React 18 + TypeScript | UI framework with type safety |
| Vite | Dev server with hot reload + production bundler |
| Tailwind CSS | Utility-first styling with custom mood color palette |
| Zustand | Lightweight global state management |
| React Router | Client-side page routing |
| Axios | HTTP client with automatic auth token injection |
| Supabase JS | Auth and file upload from the browser |
| react-dropzone | Drag-and-drop file upload |
| video.js | Video playback for previewing graded clips |
| Framer Motion | Page transitions and UI animations |
| Socket.io Client | Real-time job progress updates via WebSocket |

### Backend (`server/`)
| Tool | Purpose |
|------|---------|
| Express | HTTP API framework |
| Supabase JS (service role) | Server-side DB queries and storage operations |
| Anthropic SDK | Claude API calls for mood-to-grading translation |
| BullMQ | Redis-backed async job queue |
| ioredis | Redis client |
| Socket.io | WebSocket server for real-time progress |
| Zod | Request validation |
| Helmet | Security headers |
| Multer | File upload parsing |

### AI Pipeline (`ai-pipeline/`)
| Tool | Purpose |
|------|---------|
| FastAPI + Uvicorn | Python API framework + server |
| OpenCV | Frame extraction and visual analysis |
| NumPy | Fast numerical computation on pixel data |
| FFmpeg (system) | Video color grading and metadata extraction |

### Infrastructure
| Tool | Purpose |
|------|---------|
| Supabase | Auth, PostgreSQL database, file storage (cloud) |
| Render | Production hosting for server + AI pipeline |
| Docker Compose | Local development environment |
| Redis | Job queue backend |
| pnpm | Monorepo package manager |

## Project Structure

```
clipvibe/
├── client/                          # Frontend (React)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx        # Google/GitHub OAuth
│   │   │   ├── DashboardPage.tsx    # Job history + re-download
│   │   │   ├── UploadPage.tsx       # Drag-drop video upload
│   │   │   ├── MoodPage.tsx         # 6-mood selection grid
│   │   │   ├── ProcessingPage.tsx   # Real-time job progress
│   │   │   └── ExportPage.tsx       # Before/after preview + download
│   │   ├── components/
│   │   │   └── Layout.tsx           # Shared navbar + auth guard
│   │   ├── lib/
│   │   │   ├── supabase.ts          # Supabase client (auth + storage)
│   │   │   └── api.ts               # Axios with auto auth token
│   │   ├── store/
│   │   │   ├── authStore.ts         # User session state
│   │   │   └── projectStore.ts      # Clips, mood, job state
│   │   ├── types/env.d.ts           # Vite env variable types
│   │   ├── App.tsx                  # Route definitions
│   │   ├── main.tsx                 # Entry point
│   │   └── index.css                # Tailwind imports
│   ├── Dockerfile
│   ├── vite.config.ts               # Dev server + API proxy
│   ├── tailwind.config.js           # Custom mood color palette
│   └── package.json
│
├── server/                          # Backend (Express)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── upload.ts            # POST /api/upload
│   │   │   ├── clips.ts            # GET/DELETE /api/clips
│   │   │   ├── moods.ts            # GET /api/moods
│   │   │   └── jobs.ts             # CRUD /api/jobs + download
│   │   ├── services/
│   │   │   ├── moodEngine.ts       # Claude API → FFmpeg filter params
│   │   │   ├── videoProcessor.ts   # Clip analysis + grading orchestration
│   │   │   └── jobQueue.ts         # BullMQ worker + WebSocket events
│   │   ├── middleware/auth.ts       # Supabase JWT verification
│   │   ├── config/
│   │   │   ├── supabase.ts         # Supabase admin client
│   │   │   └── redis.ts            # Redis connection
│   │   └── index.ts                # Express app + Socket.io setup
│   ├── Dockerfile
│   └── package.json
│
├── ai-pipeline/                     # AI/ML Service (FastAPI)
│   ├── api.py                       # POST /analyze + POST /grade
│   ├── services/
│   │   ├── analyzer.py             # OpenCV visual analysis
│   │   └── grader.py               # FFmpeg color grading execution
│   ├── utils/ffmpeg.py             # FFprobe/FFmpeg wrappers
│   ├── requirements.txt
│   └── Dockerfile
│
├── shared/types/                    # Shared TypeScript types
│   ├── clip.ts                     # Clip, ClipAnalysis
│   ├── mood.ts                     # Mood, MoodPreset
│   ├── job.ts                      # Job, JobStatus
│   ├── user.ts                     # User
│   └── index.ts                    # Re-exports
│
├── docker-compose.yml
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── package.json
├── .env.example
└── .gitignore
```

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker and Docker Compose
- A [Supabase](https://supabase.com) project with Google and GitHub OAuth enabled

### Setup

1. Clone and install dependencies:
```bash
git clone <repo-url>
cd clipvibe
pnpm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Fill in your Supabase URL, keys, and Anthropic API key
```

3. Build and start all services:
```bash
docker compose up --build
```

4. Open the app:
```
http://localhost:5173
```

### Running Individual Services (without Docker)

```bash
# Frontend
pnpm dev:client

# Backend (requires FFmpeg installed locally)
pnpm dev:server

# AI Pipeline (requires FFmpeg and Python 3.11)
cd ai-pipeline
pip install -r requirements.txt
uvicorn api:app --reload --port 8000
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | No | Health check |
| GET | `/api/moods` | No | List available mood presets |
| POST | `/api/upload` | Yes | Upload video clip(s) |
| GET | `/api/clips` | Yes | List user's uploaded clips |
| DELETE | `/api/clips/:id` | Yes | Delete a clip |
| POST | `/api/jobs` | Yes | Create a grading job (mood + clip IDs) |
| GET | `/api/jobs` | Yes | List user's jobs |
| GET | `/api/jobs/:id` | Yes | Get job status and output URLs |
| GET | `/api/jobs/:id/download` | Yes | Download graded clips (zip) |

### AI Pipeline Endpoints (internal)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/analyze` | Analyze clip visual properties |
| POST | `/grade` | Apply FFmpeg color grading to clip |

## Moods

| Mood | Color | Description |
|------|-------|-------------|
| Nostalgic | `#D4A574` | Warm tones, soft contrast, faded highlights |
| Cinematic | `#4A6FA5` | Cool shadows, high contrast, desaturated |
| Hype | `#FF6B6B` | High saturation, vibrant, punchy contrast |
| Chill | `#7EC8AC` | Soft tones, low contrast, gentle warmth |
| Dreamy | `#B490CA` | Pastel tints, lifted shadows, soft glow |
| Energetic | `#FFB347` | Warm highlights, boosted saturation, sharp |

## Team Roles & Work Breakdown

Member 1 - Suhyeon yoo
Member 2 - XinBao Chen
Member 3 - Namkha Oedzer
Member 4 - Jianhua Deng



### Member 1 — Frontend (`client/`)

**Owns:** Everything the user sees and interacts with.

**Setup:**
```bash
cd client
pnpm install
pnpm dev          # starts Vite at localhost:5173
```

**Files and what to build in each:**

| File | Status | What to implement |
|------|--------|-------------------|
| `src/pages/LoginPage.tsx` | Skeleton | Add Google + GitHub sign-in buttons using `supabase.auth.signInWithOAuth({ provider: "google" })`. Handle auth redirect. Redirect to `/dashboard` on success. |
| `src/pages/DashboardPage.tsx` | Skeleton | Fetch `GET /api/jobs` using the api client (`import api from "@/lib/api"`). Display job cards showing mood, date, status, number of clips. Add "Re-download" button (links to export page) and "Re-run" button (links to mood page with same clips). |
| `src/pages/UploadPage.tsx` | Skeleton | Build drag-and-drop zone using `react-dropzone`. Accept mp4/mov/webm, max 500MB per file. Upload files to Supabase Storage using `supabase.storage.from("clips").upload(...)`. Show per-file progress bars. Show video thumbnail previews. Store clips in `projectStore`. "Next" button navigates to `/mood`. |
| `src/pages/MoodPage.tsx` | Skeleton | Build a 6-card grid (one per mood). Each card shows mood name, hex color swatch from `tailwind.config.js` mood colors, and a short description. Clicking a card selects it (highlight with border/glow). "Start Grading" button calls `api.post("/api/jobs", { mood, clip_ids })`, gets back a job ID, navigates to `/processing/{jobId}`. |
| `src/pages/ProcessingPage.tsx` | Skeleton | Read `jobId` from URL params. Connect to WebSocket using `socket.io-client`. Emit `subscribe` event with the job ID. Listen for `progress` events. Display a multi-step progress indicator: Queued → Analyzing → Grading → Complete. Show per-clip status if available. When status is "complete", navigate to `/export/{jobId}`. |
| `src/pages/ExportPage.tsx` | Skeleton | Fetch `GET /api/jobs/{jobId}` to get output URLs. Show before/after video comparison per clip using `video.js` (original on left, graded on right). "Download" button per clip. "Download All" button calls `GET /api/jobs/{jobId}/download` for a zip. "Try Different Mood" button navigates back to `/mood`. |
| `src/components/Layout.tsx` | Skeleton | Build the navbar: ClipVibe logo on the left, navigation links (Dashboard, New Project), user avatar + logout button on the right. Add an auth guard — if `authStore.user` is null, redirect to `/login`. Wrap in `<Outlet />` for page content. |
| `src/store/authStore.ts` | Done | Wire up to Supabase auth listener. In `App.tsx` or `Layout.tsx`, call `supabase.auth.onAuthStateChange((event, session) => { setUser(session?.user) })` on mount. This keeps the store in sync with the logged-in user. |
| `src/store/projectStore.ts` | Done | Use from UploadPage (add/remove clips), MoodPage (set selected mood), and ProcessingPage (set current job). Already has all the setters. |
| `src/lib/supabase.ts` | Done | No changes needed. Import and use `supabase` anywhere. |
| `src/lib/api.ts` | Done | No changes needed. Import and use `api.get(...)`, `api.post(...)` anywhere. Auth token is injected automatically. |
| `src/types/env.d.ts` | Done | No changes needed. Provides autocomplete for `import.meta.env.VITE_SUPABASE_URL`. |

**Key libraries to learn:**
- `react-dropzone` — [docs](https://react-dropzone.js.org/) — for the upload drag-drop zone
- `@supabase/supabase-js` — [docs](https://supabase.com/docs/reference/javascript) — for auth and file upload
- `video.js` — [docs](https://videojs.com/guides) — for the export page video player
- `framer-motion` — [docs](https://www.framer.com/motion/) — for animations and transitions
- `socket.io-client` — [docs](https://socket.io/docs/v4/client-api/) — for real-time progress updates
- `zustand` — [docs](https://zustand-demo.pmnd.rs/) — for global state

---

### Member 2 — Backend (`server/`)

**Owns:** All API logic, Claude integration, job orchestration.

**Setup:**
```bash
cd server
pnpm install
pnpm dev          # starts Express at localhost:3001 (needs Redis running)
```

**Files and what to build in each:**

| File | Status | What to implement |
|------|--------|-------------------|
| `src/routes/upload.ts` | Skeleton | Add `multer` middleware for file parsing. Validate file type (mp4/mov/webm) and size (500MB max). Upload file to Supabase Storage: `supabase.storage.from("clips").upload(path, buffer)`. Run FFprobe to extract metadata (duration, resolution, fps) — call the AI pipeline or use a local wrapper. Insert clip record into Supabase DB: `supabase.from("clips").insert({...})`. Return the clip object. |
| `src/routes/clips.ts` | Skeleton | **GET /**: Query `supabase.from("clips").select("*").eq("user_id", user.id)`. Return clips array. **DELETE /:id**: Verify clip belongs to user. Delete from Supabase Storage: `supabase.storage.from("clips").remove([path])`. Delete from DB: `supabase.from("clips").delete().eq("id", id)`. |
| `src/routes/moods.ts` | Skeleton | Import mood presets from `moodEngine.ts`. Return them as JSON. No auth needed — this is public info. |
| `src/routes/jobs.ts` | Skeleton | **POST /**: Validate body with Zod (`{ mood: MoodEnum, clip_ids: string[] }`). Verify all clip_ids belong to the user. Insert job into DB with status "queued". Add job to BullMQ queue: `queue.add("grade", { jobId, mood, clip_ids })`. Return `{ job_id }`. **GET /**: Query user's jobs from DB, ordered by date descending. **GET /:id**: Return single job with output URLs (generate signed URLs from Supabase Storage). **GET /:id/download**: Generate signed download URLs for all output files. Optionally zip them. |
| `src/services/moodEngine.ts` | Empty | Define the 6 mood presets as objects matching the `MoodPreset` type. Build the Claude prompt function: takes `{ mood: string, clips: ClipAnalysis[] }`, returns a structured prompt asking Claude for per-clip FFmpeg filter parameters. Call `anthropic.messages.create(...)` with the prompt. Parse Claude's response into structured filter params (JSON). Return an array of `{ clip_id, filters: string }` where filters is the FFmpeg `-vf` filter chain string. |
| `src/services/videoProcessor.ts` | Empty | Orchestrator function that takes a job and processes it end-to-end: (1) Download each clip from Supabase Storage to a temp directory. (2) Call AI pipeline `POST /analyze` for each clip — sends the file, gets back ClipAnalysis. (3) Pass all analyses + mood to `moodEngine` — gets back per-clip FFmpeg filters. (4) Call AI pipeline `POST /grade` for each clip — sends the file + filters, gets back graded file. (5) Upload each graded file to Supabase Storage output bucket. (6) Update job record in DB with output paths and status "complete". (7) Clean up temp files. |
| `src/services/jobQueue.ts` | Empty | Create BullMQ `Queue` and `Worker`. The worker calls `videoProcessor` for each job. Emit WebSocket events at each step: `io.to("job:{jobId}").emit("progress", { step, clip, total })`. Steps: "analyzing" (with clip index), "grading" (with clip index), "complete". Handle errors: catch failures, update job status to "failed", emit error event. Configure concurrency (e.g., process 2 jobs at a time). |
| `src/middleware/auth.ts` | Done | No changes needed. Add `requireAuth` to any route that needs protection. Access the user via `(req as any).user`. |
| `src/config/supabase.ts` | Done | No changes needed. Import `supabase` for all DB and storage operations. |
| `src/config/redis.ts` | Done | No changes needed. Used internally by BullMQ. |
| `src/index.ts` | Done | Add WebSocket handlers: when a client emits `subscribe` with a job ID, add the socket to room `job:{jobId}`. When client disconnects, clean up. |

**Key libraries to learn:**
- `@anthropic-ai/sdk` — [docs](https://docs.anthropic.com/en/api/client-sdks) — for calling Claude
- `bullmq` — [docs](https://docs.bullmq.io/) — for job queue and workers
- `@supabase/supabase-js` — [docs](https://supabase.com/docs/reference/javascript) — for DB + storage (server-side)
- `zod` — [docs](https://zod.dev/) — for request validation
- `multer` — [docs](https://github.com/expressjs/multer) — for file upload handling
- `socket.io` — [docs](https://socket.io/docs/v4/server-api/) — for emitting progress events

---

### Member 3 — AI/ML (`ai-pipeline/`)

**Owns:** Video analysis and FFmpeg color grading execution.

**Setup:**
```bash
cd ai-pipeline
python -m venv .venv
source .venv/bin/activate        # macOS/Linux
# .venv\Scripts\activate         # Windows
pip install -r requirements.txt

# Install FFmpeg on your system:
# macOS:   brew install ffmpeg
# Ubuntu:  sudo apt install ffmpeg
# Windows: download from https://ffmpeg.org/download.html

uvicorn api:app --reload --port 8000
```

**Files and what to build in each:**

| File | Status | What to implement |
|------|--------|-------------------|
| `api.py` | Skeleton | Define Pydantic request/response models. Wire `/analyze` endpoint to `analyzer.analyze_clip()`. Wire `/grade` endpoint to `grader.grade_clip()`. Handle file downloads from Supabase Storage (receive a URL or file path, download to temp dir, process, return result). Add error handling for corrupt/unsupported files. |
| `services/analyzer.py` | Empty | `analyze_clip(file_path) -> ClipAnalysis`. Open video with OpenCV (`cv2.VideoCapture`). Sample frames (e.g. every 30th frame to save time). For each sampled frame: compute mean brightness (`np.mean(frame) / 255`), compute dominant colors (k-means clustering on pixel data with `k=5`), compute contrast (`np.std(frame) / 255`). Average results across all sampled frames. Estimate color temperature from the blue-to-red channel ratio. Return structured analysis. |
| `services/grader.py` | Empty | `grade_clip(file_path, filters) -> output_path`. Receive the input file path and an FFmpeg filter chain string (e.g. `eq=brightness=0.1:saturation=1.3,colortemperature=temperature=5500,vignette=PI/4`). Build the FFmpeg command: `ffmpeg -i input.mp4 -vf "{filters}" -c:a copy output.mp4`. Run via `subprocess.run()` with timeout. Validate output file exists and has non-zero size. Return the output file path. |
| `utils/ffmpeg.py` | Empty | Two wrapper functions: (1) `probe(file_path) -> dict` — runs `ffprobe -v quiet -print_format json -show_streams {file}`, parses JSON output, returns metadata (duration, width, height, fps, codec). (2) `apply_filters(input_path, output_path, filter_string) -> bool` — runs `ffmpeg -i {input} -vf "{filters}" -c:a copy {output}`, handles errors and timeouts, returns success boolean. |
| `routes/__init__.py` | Empty | Optional: move endpoint logic here if `api.py` gets too large. |

**Key libraries to learn:**
- `opencv-python` (cv2) — [docs](https://docs.opencv.org/4.x/d6/d00/tutorial_py_root.html) — for reading video frames
- `numpy` — [docs](https://numpy.org/doc/stable/) — for pixel math (brightness, colors, contrast)
- `fastapi` — [docs](https://fastapi.tiangolo.com/) — for the API endpoints
- `subprocess` (stdlib) — for running FFmpeg commands
- FFmpeg filters — [reference](https://ffmpeg.org/ffmpeg-filters.html) — for `eq`, `colorbalance`, `colortemperature`, `vignette`, `curves`

**FFmpeg filter quick reference for grading:**
```bash
# Brightness, contrast, saturation
-vf "eq=brightness=0.1:contrast=1.2:saturation=0.9"

# Color temperature (Kelvin — lower=warm, higher=cool)
-vf "colortemperature=temperature=5500"

# Color balance (per-channel in shadows/midtones/highlights)
-vf "colorbalance=rs=0.1:gs=-0.05:bh=0.1"

# Vignette (darken edges)
-vf "vignette=PI/4"

# Film grain
-vf "noise=c0s=10:c0f=t"

# Chain multiple filters with commas
-vf "eq=brightness=0.1:saturation=1.3,colortemperature=temperature=5500,vignette=PI/4"
```

---

### Member 4 — Infra & Integration (`shared/`, Docker, Supabase)

**Owns:** Shared types, Supabase project setup, Docker, deployment, glue between layers.

**Setup:**
```bash
# Root level
pnpm install

# Start all services
docker compose up

# Or start individually
pnpm dev:client
pnpm dev:server
cd ai-pipeline && uvicorn api:app --reload --port 8000
```

**Files and what to build in each:**

| File | Status | What to implement |
|------|--------|-------------------|
| `shared/types/clip.ts` | Done | Update if the team needs additional fields (e.g., `thumbnail_url`, `storage_path`). Keep in sync with the Supabase `clips` table schema. |
| `shared/types/mood.ts` | Done | Update if mood presets gain new parameters. |
| `shared/types/job.ts` | Done | Update if jobs need more fields (e.g., `error_message`, `progress_percent`). Keep in sync with the Supabase `jobs` table schema. |
| `shared/types/user.ts` | Done | Update if user profile gains new fields. |
| `shared/types/index.ts` | Done | Re-exports all types. Update when new type files are added. |
| `docker-compose.yml` | Done | Maintain as services evolve. Add environment variables when new secrets are needed. Tune resource limits for production. |
| `.env.example` | Done | Keep updated as new env vars are added. This is the team's reference for what secrets they need. |

**Supabase project setup (manual, one-time):**

1. Create a project at [supabase.com](https://supabase.com)
2. Enable auth providers:
   - Go to Authentication → Providers
   - Enable Google (needs Google Cloud OAuth credentials)
   - Enable GitHub (needs GitHub OAuth app)
3. Create storage buckets:
   - `clips` — for uploaded originals (private, authenticated access)
   - `outputs` — for graded results (private, authenticated access)
4. Create database tables:
```sql
-- clips table
create table clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  file_size bigint not null,
  duration float,
  width int,
  height int,
  fps float,
  created_at timestamptz default now()
);

-- jobs table
create table jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  mood text not null,
  status text not null default 'queued',
  clip_ids uuid[] not null,
  output_paths text[] default '{}',
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Row Level Security (users can only see their own data)
alter table clips enable row level security;
create policy "Users see own clips" on clips
  for all using (auth.uid() = user_id);

alter table jobs enable row level security;
create policy "Users see own jobs" on jobs
  for all using (auth.uid() = user_id);
```
5. Share the project URL, anon key, and service role key with the team (via `.env`)

**Deployment to Render:**
- Create a Web Service for `server/` (Node.js, build command: `pnpm install && pnpm build`, start command: `node dist/index.js`)
- Create a Web Service for `ai-pipeline/` (Python, build command: `pip install -r requirements.txt`, start command: `uvicorn api:app --host 0.0.0.0 --port $PORT`)
- Create a Static Site for `client/` (build command: `pnpm install && pnpm build`, publish directory: `dist/`)
- Create a Redis instance for the job queue
- Set all environment variables in Render dashboard

---

## Dependencies Between Team Members

```
Member 4 (Infra) ──── does first ───--─┐
   Sets up Supabase project            │
   Creates DB tables + storage         │
   Shares .env keys with team          │
                                       ▼
Member 1 (Frontend) ◄──── needs Supabase keys for auth
   Can build all pages independently
   Needs API endpoints for real data ──── needs Member 2

Member 2 (Backend) ◄──── needs Supabase tables from Member 4
   Can build routes + moodEngine independently
   Needs /analyze and /grade endpoints ──── needs Member 3

Member 3 (AI/ML)
   Fully independent — only needs FFmpeg + sample video files
   Can develop and test locally from day one
```

## Suggested Timeline

**Week 1 — Foundation (everyone works in parallel)**
- Jianhua Deng (4): Supabase project, DB tables, storage buckets, share keys
- Namkha Oedzer (3): `ffmpeg.py` wrappers + `analyzer.py` (test with sample clips)
- XinBao Chen (2): `moods.ts` presets + `upload.ts` route
- Suhyeon yoo (1): `LoginPage` + `Layout` + auth flow
- Khadim Thiam - market research

**Week 2 — Core features (parallel)**
- Namkha Oedzer (3): `grader.py` (FFmpeg color grading)
- XinBao Chen  (2): `moodEngine.ts` (Claude API) + `jobQueue.ts` (BullMQ worker)
- Suhyeon yoo (1): `UploadPage` + `MoodPage`
- Jianhua Deng (4): Finalize shared types + test Docker setup end-to-end
- Khadim Thiam - product research

**Week 3 — Integration & output (connect everything)**
- XinBao Chen  (2): `videoProcessor.ts` + `jobs.ts` routes fully working + WebSocket events
- Suhyeon yoo (1): `ProcessingPage` + `ExportPage` + `DashboardPage`
- Namkha Oedzer (3): Edge cases (corrupt files, long videos, timeout handling)
- Jianhua Deng (4): Deploy staging to Render, test full flow
- Khadim Thiam (1): confused role?

**Week 4 — Polish**
- All: Error handling, loading states, mobile responsiveness
- XinBao Chen  (2): Rate limiting, input sanitization
- Jianhua Deng (4): Cleanup cron for expired files, monitoring
- Khadim Thiam (1) - New Files `client/src/pages/MoodPage.css` Modified files `client/src/pages/MoodPage.tsx` — replaced the empty  stub with the full implementation   
- All: Testing, bug fixes, demo prep

## Processing Pipeline

```
1. User uploads clips → stored in Supabase Storage
2. User selects mood → POST /api/jobs
3. Server enqueues job in BullMQ
4. Worker pulls job from queue:
   a. Downloads clips from Supabase Storage
   b. Sends each clip to AI pipeline /analyze
      → OpenCV extracts brightness, colors, contrast
   c. Sends analysis + mood to Claude API
      → Claude returns per-clip FFmpeg filter params
   d. Sends each clip + filters to AI pipeline /grade
      → FFmpeg applies color grading
   e. Uploads graded clips to Supabase Storage
   f. Updates job status in database
5. WebSocket pushes progress to client at each step
6. User previews and downloads graded clips
```

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `VITE_SUPABASE_URL` | Client + Server | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Client | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server + AI Pipeline | Supabase admin key (never expose to client) |
| `PORT` | Server | Express port (default 3001) |
| `REDIS_URL` | Server | Redis connection string |
| `ANTHROPIC_API_KEY` | Server | Claude API key |
| `AI_PIPELINE_URL` | Server | FastAPI service URL |
