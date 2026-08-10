<<<<<<< HEAD
# CloudClear AI

Generative reconstruction for LISS-IV satellite imagery — cloud removal, mask-aware inpainting and production-ready demo UI.

## Overview

CloudClear AI is a research / demo platform that demonstrates cloud detection, cloud mask generation, and generative reconstruction (inpainting) for optical Earth observation imagery (targeting ISRO's LISS-IV sensor characteristics). The repo contains a lightweight frontend for visualization and interaction, a Node.js backend that exposes API endpoints, and an AI service (Python) that runs model inference or mock simulations.

This README explains the problem statement, the high-level solution, the technology used, the repository layout, and step-by-step instructions to run and contribute.

## Problem Statement

Optical Earth observation is frequently compromised by clouds. For time-sensitive applications (agriculture, disaster response), waiting for a future revisit can be too late. The goal is to recover usable imagery by:
- Detecting cloud-covered regions precisely
- Producing pixel-accurate cloud masks
- Reconstructing masked regions using generative models (GANs, diffusion, large-mask inpainting)

The platform aims to provide a clear, auditable pipeline where reconstructed pixels are labeled and confidence metadata can be exported for downstream workflows.

## Solution Overview

- Cloud detection: a classifier/ViT or U-Net identifies cloudy pixels.
- Cloud segmentation: generate binary masks with precise boundaries (DeepLabV3+, U-Net variants).
- Mask-aware reconstruction: use inpainting approaches (LaMa, Pix2Pix, diffusion models) conditioned on unmasked context to reconstruct occluded terrain.
- Serving & demo: a FastAPI or similar inference service returns results; the frontend (`frontend/index.html`) offers an interactive demo, comparison slider, and account-based upload flow.

The repository includes a mock demo flow so contributors can view end-to-end behavior without running heavy ML models locally.

## Key Features

- Interactive demo with upload, staged progress, and comparison slider
- Model library abstraction (U-Net, DeepLabV3+, Pix2Pix, LaMa, Diffusion) represented in the UI
- Cloud detection and mask visualization
- Simple account/login demo flow integrated with the backend APIs
- Extensible AI service layout for swapping in real models

## Tech Stack

- Frontend: Vanilla HTML/CSS/JavaScript (single-page), modern CSS tokens and responsive layout
- Backend: Node.js (Express/Koa style) — code in [backend/](backend/)
- AI service: Python (FastAPI + PyTorch/other ML libs) — code in [ai-service/](ai-service/)
- Containerization: `docker-compose.yml` for local orchestration

## Repository Structure

- `docker-compose.yml` — optional local stack orchestration
- `README.md` — this document
- `ai-service/` — Python service, model code, FastAPI endpoints
  - `main.py`, `lama_model.py`, `cloud_ops.py`, `requirements.txt`, `Dockerfile`
- `backend/` — Node.js backend and API server
  - `src/` — server source
  - `controllers/`, `routes/`, `services/`, `models/`, `middlewares/` — typical MVC structure
  - `package.json`, `Dockerfile`
- `frontend/` — static website and demo
  - `index.html` — main single-file frontend UI
  - `config.js` — exposes `window.API_BASE_URL` used by the UI

You can open the main UI at: [frontend/index.html](frontend/index.html)

## Running Locally (development)

Prerequisites
- Node.js (16+ recommended)
- Python 3.9+ (if using the AI service locally)
- Docker & docker-compose (optional, recommended for consistency)

Option A — Quick demo using frontend + mock backend (no ML required)

1. Start the Node backend (development):

```bash
cd backend
npm install
# start (the exact script may be in package.json as "start" or "dev")
npm run dev
```

2. Serve static frontend files (open `frontend/index.html` in the browser) or use a static server:

```bash
# From repo root
npx http-server frontend -p 8080
# then open http://localhost:8080
```

3. Ensure `frontend/config.js` points to your backend (default is `http://localhost:5000/api/v1`). Edit if your backend runs on another port.

Option B — Full stack with AI service (local)

1. Create and activate a Python environment and install dependencies:

```bash
cd ai-service
python -m venv .venv
.venv\Scripts\activate    # Windows
pip install -r requirements.txt
```

2. Start the AI service (FastAPI) — this depends on `ai-service/main.py` and available models:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 5000
```

3. Start the Node backend and the frontend as in Option A.

Option C — Docker (recommended for reproducible runs)

```bash
docker-compose up --build
```

This should start required services (backend, ai-service) if the compose file is configured for them.

## Configuration

- `frontend/config.js` exposes `window.API_BASE_URL`. Update it to point at your running backend/FastAPI endpoint.
- Backend service environment variables are typically in `backend/config/env.js` — follow the patterns there for DB, auth, and cloud credentials.

Local AI service `.env` note:

- For local development the AI service reads `CLOUDVISION_API_KEY` from an environment file. Copy `ai-service/.env.example` to `ai-service/.env` and set a secure key, or use the provided local `.env` file. Ensure `ai-service/.env` is listed in `.gitignore` and never committed to source control. The FastAPI service expects the shared secret to be sent in requests using the header `X-API-KEY`.
## How to Contribute

1. Fork the repo and create a branch: `feature/your-feature`
2. Make focused changes; keep PRs small and documented.
3. Update or add tests where applicable.
4. Open a Pull Request with a clear description and screenshots if UI changes.

Areas that welcome contributions:
- Replace the demo mock with a real model (example: plug in a trained LaMa or diffusion checkpoint in `ai-service/`).
- Improve the mask generation step and export per-pixel confidence maps.
- Add unit/integration tests for backend endpoints in `backend/`.
- Accessibility and i18n improvements for the frontend.

## Developer notes

- The frontend is intentionally shipped as a single HTML file for ease of demonstration. Moving styles to a CSS file and extracting JS modules is a good next step.
- Inline `config.js` must be present and reachable by the browser (it defines `window.API_BASE_URL`).

## Contact & License

If you have questions or want to collaborate, contact the maintainers via the `contact@cloudclear.ai` placeholder in the UI. This repository is provided for research/demo purposes; add your preferred license file if you intend to publish or share widely.

---

Happy hacking — feel free to ask me to scaffold contributor docs, CI pipelines, or to wire a specific ML model into `ai-service/`.# CloudVision AI — Backend

Production-ready backend for **CloudVision AI**, an AI-powered cloud removal
and reconstruction platform for LISS-IV satellite imagery. This repository
covers the backend only — the frontend is a separate, already-completed
project.

## Tech Stack

- **Node.js + Express.js** — REST API
- **MongoDB Atlas + Mongoose** — primary data store
- **JWT** — access + refresh token authentication
- **Multer + Cloudinary** — file uploads and storage
- **Redis + BullMQ** — background job queues (AI inference, emails)
- **Socket.IO** — real-time job progress and notifications
- **FastAPI (Python)** — AI inference microservice (stub included, swap in real models)
- **Docker / docker-compose** — containerized local development and deployment
- **Pino** — structured logging
- **Swagger / OpenAPI** — interactive API docs

---

## Project Structure

\`\`\`
cloudvision-ai/
├── docker-compose.yml          # orchestrates mongo, redis, ai-service, backend, worker
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── app.js              # Express app assembly (middleware, routes, error handling)
│       ├── server.js           # API process entry point (HTTP server + Socket.IO)
│       ├── worker.js           # Background worker process entry point (BullMQ)
│       ├── config/             # env, db, redis, cloudinary, logger config
│       ├── models/             # Mongoose schemas
│       ├── controllers/        # Route handler logic
│       ├── routes/             # Express routers, one per feature
│       ├── middlewares/        # auth, validation, upload, error handling
│       ├── services/           # business logic reused across controllers/jobs
│       ├── validators/         # express-validator rule sets
│       ├── queues/             # BullMQ queue definitions
│       ├── jobs/               # BullMQ job processor functions
│       ├── socket/              # Socket.IO server + Redis pub/sub bridge
│       ├── swagger/            # OpenAPI spec generation
│       ├── utils/              # ApiError, ApiResponse, asyncHandler
│       ├── uploads/            # (unused at rest — uploads stream straight to Cloudinary)
│       └── logs/               # reserved for file-based log output if enabled later
└── ai-service/
    ├── Dockerfile
    ├── requirements.txt
    └── main.py                 # FastAPI inference service (STUB — see note below)
\`\`\`

### ⚠️ About `ai-service/main.py`

This is a **working stub**, not the real cloud-removal models. It downloads
the source image, stamps a "PROCESSED" label on it, and returns fixed
plausible-looking metrics. This lets the entire pipeline — upload → queue →
FastAPI call → Cloudinary → MongoDB → dashboard → notifications → real-time
progress — be tested end-to-end before the actual GAN / Diffusion / LaMa /
U-Net models are plugged in. Replace `run_inference()` with real model
inference; the request/response contract and auth check can stay as-is.

---

## Installation Guide

### Option A: Docker (recommended — runs everything at once)

**Prerequisites:** Docker + Docker Compose installed.

\`\`\`bash
# 1. Copy the env template and fill in real values (see Environment Variables below)
cp backend/.env.example backend/.env

# 2. Make sure AI_SERVICE_API_KEY in backend/.env matches API_KEY in ai-service/main.py

# 3. Start everything
docker-compose up --build
\`\`\`

- API: `http://localhost:5000/api/v1/health`
- Swagger docs: `http://localhost:5000/api-docs`
- FastAPI stub: `http://localhost:8000/health`

### Option B: Running locally without Docker

**Prerequisites:** Node.js 18+, MongoDB Atlas connection string, Redis running locally, Python 3.11+ (for the FastAPI stub).

\`\`\`bash
cd backend
npm install
cp .env.example .env
# edit .env with real MongoDB Atlas URI, JWT secrets, Cloudinary keys, SMTP creds

# Terminal 1 — API server
npm run dev

# Terminal 2 — background worker (required for AI processing + emails to actually run)
npm run dev:worker

# Terminal 3 — Redis (if not already running)
redis-server

# Terminal 4 — FastAPI stub
cd ../ai-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
\`\`\`

---

## Environment Variables

All variables are documented with examples in `backend/.env.example`. Summary:

| Variable | Description |
|---|---|
| `NODE_ENV`, `PORT`, `CLIENT_URL`, `API_PREFIX` | Basic server config |
| `MONGO_URI` | MongoDB Atlas (or local) connection string |
| `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES` | Access token signing secret + lifetime |
| `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES` | Refresh token signing secret + lifetime |
| `EMAIL_TOKEN_SECRET`, `EMAIL_TOKEN_EXPIRES` | Email verification / reset token config |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Redis connection (BullMQ + pub/sub) |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | File storage |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Outbound email |
| `AI_SERVICE_BASE_URL`, `AI_SERVICE_TIMEOUT_MS`, `AI_SERVICE_API_KEY` | FastAPI connection |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | Global rate limiting |

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the API server with auto-restart (nodemon) |
| `npm start` | Start the API server (production) |
| `npm run dev:worker` | Start the background worker with auto-restart |
| `npm run worker` | Start the background worker (production) |
| `npm run lint` | Run ESLint |
| `npm test` | Run Jest tests |

**Important:** the API server and worker are **separate processes**. Both must be running for the app to fully function — the API accepts requests and enqueues jobs; the worker is what actually processes AI inference jobs and sends emails.

---

## API Documentation

Interactive Swagger UI is available at `/api-docs` once the server is running (e.g. `http://localhost:5000/api-docs`). A representative set of routes carry full OpenAPI annotations (see `src/routes/auth.routes.js` for the pattern) — extend the same `@openapi` JSDoc block style to other route files as needed.

### Full Endpoint Reference

All endpoints are prefixed with `/api/v1`. 🔒 = requires `Authorization: Bearer <accessToken>`. 👑 = requires admin role.

#### Auth (`/auth`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register a new account |
| POST | `/auth/login` | Log in, returns access token + refresh cookie |
| POST | `/auth/logout` | Revoke refresh token, clear cookie |
| POST | `/auth/refresh` | Rotate refresh token, issue new access token |
| POST | `/auth/verify-email` | Verify email via token |
| POST | `/auth/resend-verification` | Resend verification email |
| POST | `/auth/forgot-password` | Request password reset email |
| POST | `/auth/reset-password` | Reset password via token |
| GET | `/auth/me` 🔒 | Get current user |

#### Users (`/users`)
| Method | Endpoint | Description |
|---|---|---|
| PATCH | `/users/me` 🔒 | Update profile (name) |
| PATCH | `/users/me/avatar` 🔒 | Upload/replace avatar (multipart, field: `avatar`) |
| PATCH | `/users/me/password` 🔒 | Change password |
| DELETE | `/users/me` 🔒 | Deactivate own account |

#### Projects (`/projects`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/projects` 🔒 | Create project |
| GET | `/projects` 🔒 | List projects (paginated, search, status filter) |
| GET | `/projects/:id` 🔒 | Get project |
| PATCH | `/projects/:id` 🔒 | Update project |
| DELETE | `/projects/:id` 🔒 | Delete project |

#### Images (`/images`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/images` 🔒 | Upload satellite image (multipart, field: `image`, body: `projectId`) |
| GET | `/images?projectId=` 🔒 | List images for a project |
| GET | `/images/:id` 🔒 | Get image |
| DELETE | `/images/:id` 🔒 | Delete image |

#### Experiments (`/experiments`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/experiments/process` 🔒 | Queue an AI processing job (body: `imageId`, `model`) — returns 202 |
| GET | `/experiments` 🔒 | List experiment history (filter by project/model/status, sortable) |
| GET | `/experiments/:id` 🔒 | Get experiment detail |

#### Dashboard (`/dashboard`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/dashboard/summary` 🔒 | Totals, average metrics, storage used, recent experiments |

#### Notifications (`/notifications`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/notifications` 🔒 | List notifications (paginated, unread count) |
| PATCH | `/notifications/read-all` 🔒 | Mark all as read |
| PATCH | `/notifications/:id/read` 🔒 | Mark one as read |
| DELETE | `/notifications/:id` 🔒 | Delete a notification |

#### Admin (`/admin`) — all require 👑
| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/users` | List all users (filter by role/active/search) |
| DELETE | `/admin/users/:id` | Deactivate a user |
| GET | `/admin/storage` | Platform-wide storage usage + top consumers |
| GET | `/admin/jobs` | Job status counts + recent jobs |
| GET | `/admin/logs` | Audit log (login events, admin actions, etc.) |
| GET | `/admin/ai-statistics` | Per-model usage, success rate, average metrics |

#### Health
| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Liveness check |

---

## Real-Time Events (Socket.IO)

Connect with: `io(SERVER_URL, { auth: { token: accessToken } })`

| Event | Direction | Payload |
|---|---|---|
| `job:progress` | server → client | `{ experimentId, imageId, stage, message, timestamp }` — stage is one of: `uploading`, `preprocessing`, `cloud_detection`, `mask_generation`, `running_ai`, `generating_output`, `saving_results`, `completed` |
| `job:failed` | server → client | `{ experimentId, imageId, errorMessage, timestamp }` |
| `notification:new` | server → client | Full Notification document |

---

## Security Features

- Helmet, CORS (credentialed, origin-locked), HPP, mongo-sanitize, xss-clean
- Per-route rate limiting (stricter on auth endpoints)
- JWT access + rotating refresh tokens (hashed at rest, single-use, theft-detectable via reuse)
- bcrypt password hashing (cost factor 12)
- Role-based authorization (`user` / `admin`)
- Audit logging of security-relevant events (logins, admin actions)
- Centralized input validation (express-validator) on every mutating endpoint

---

## Architecture Notes

- **Async AI processing:** `POST /experiments/process` returns immediately (202) with a `queued` experiment. The actual inference runs in the separate worker process via BullMQ, with live progress delivered over Socket.IO regardless of which process (API or worker) triggers an event — bridged through Redis pub/sub (see `src/services/realtime.publisher.js`).
- **Emails are queued, not sent inline** — registration, verification resend, and password reset never block on SMTP; BullMQ retries automatically with exponential backoff on transient failures.
- **Uploads are memory-streamed** — Multer uses in-memory storage and Cloudinary's upload stream, so no file ever touches disk, keeping the API stateless and horizontally scalable.
=======
# liss4-cloud-removal
Full-stack Generative AI platform for cloud detection and reconstruction of LISS-IV satellite images using FastAPI, React.js, Docker, OpenCV, Rasterio, GDAL, and Deep Learning. Supports real-time inference, geospatial processing, and model performance evaluation.
>>>>>>> a1e143f8234c7ce561c34433ede37ff8ee0c2533
