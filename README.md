# CloudClear AI

CloudClear AI is a research prototype for exploring cloud detection and image
inpainting workflows for optical satellite imagery. It combines a multi-page
web interface, a Node.js API and background worker, and a Python inference
service.

> **Project status:** The application pipeline is implemented, but this is not
> a validated operational satellite-imagery product. Cloud detection currently
> uses a brightness/saturation heuristic. LaMa is the only selectable option
> backed by a pretrained neural network; the other options use classical
> OpenCV inpainting. See [Inference capabilities](#inference-capabilities) for
> details.

## Contents

- [What's included](#whats-included)
- [Architecture](#architecture)
- [Inference capabilities](#inference-capabilities)
- [Requirements](#requirements)
- [Run with Docker](#run-with-docker)
- [Run locally](#run-locally)
- [Configuration](#configuration)
- [API and service endpoints](#api-and-service-endpoints)
- [Development](#development)

## What’s included

- A static, multi-page frontend for authentication, projects, image
  experiments, model selection, results, and settings.
- An Express REST API with authentication, project and image management,
  experiment history, dashboard summaries, notifications, and admin routes.
- MongoDB-backed persistence and Redis/BullMQ queues for image processing and
  email jobs.
- A separate BullMQ worker, Socket.IO progress updates, Cloudinary upload
  integration, and Swagger/OpenAPI documentation.
- A FastAPI inference service with authenticated prediction and evaluation
  endpoints.

## Architecture

```text
Browser ── REST / Socket.IO ──> Express API ──> MongoDB
                                    │
                                    ├── Redis / BullMQ ──> Background worker
                                    │                           │
                                    └───────────────────────────┴──> FastAPI AI service
```

The frontend is served as static files and is not included as a service in
`docker-compose.yml`. MongoDB is also external to the Compose stack: provide a
MongoDB URI that is reachable from the backend container.

## Inference capabilities

The AI service accepts `GAN`, `Diffusion`, `LaMa`, and `U-Net` as model names.
Their current implementations are:

| Selection | Current implementation |
|---|---|
| `LaMa` | Pretrained LaMa inpainting model running on CPU. If the model cannot be loaded, inference falls back to OpenCV inpainting. |
| `GAN` | OpenCV Telea inpainting; this is not a GAN. |
| `Diffusion` | Two passes of OpenCV Telea inpainting; this is not a diffusion model. |
| `U-Net` | OpenCV Telea inpainting; this is not a U-Net. |

Cloud regions are estimated with a classical HSV brightness and
low-saturation heuristic, not a trained cloud-segmentation model. Results
should be treated as experimental, especially on real satellite imagery.

`POST /predict` processes an image and returns the reconstructed image, a
confidence map, and processing metadata. Reference metrics such as PSNR and
SSIM are not reported for this endpoint because a matching cloud-free
ground-truth image is not available.

`POST /evaluate` starts with a supplied clean image, adds a synthetic cloud,
and calculates PSNR, SSIM, RMSE, MAE, and mask IoU against the known original
and synthetic mask. These metrics are for this controlled synthetic test and
do not establish performance on naturally cloudy imagery.

## Requirements

- Node.js 18 or later and npm
- Python 3.11 for the inference service
- MongoDB (local or hosted) with a reachable connection URI
- Redis 7 or later
- Docker Engine with Docker Compose, if using the containerized setup
- Cloudinary and SMTP credentials for the corresponding upload and email
  features

LaMa model weights (approximately 196 MB) are downloaded when available,
either during the container build or on the first local inference, and require
internet access. PyTorch is installed separately from the Python requirements
when running the AI service locally.

## Run with Docker

1. Create environment files from the templates:

   ```powershell
   Copy-Item backend/.env.example backend/.env
   Copy-Item ai-service/.env.example ai-service/.env
   ```

2. Configure `backend/.env`. Set `MONGO_URI` to a MongoDB instance reachable
   from Docker, and replace the example JWT and email-token secrets with
   strong, unique values.

3. Set a strong `CLOUDVISION_API_KEY` in `ai-service/.env`. Set the same value
   as `AI_SERVICE_API_KEY` in `backend/.env`.

4. Start the backend, worker, Redis, and AI service:

   ```powershell
   docker compose up --build
   ```

The services are available at:

- API health: <http://localhost:5000/api/v1/health>
- Swagger UI: <http://localhost:5000/api-docs>
- AI service health: <http://localhost:8000/health>

To stop the stack, run `docker compose down`. Redis data is stored in a named
Docker volume and is retained unless that volume is explicitly removed.

## Run locally

Start Redis and make sure MongoDB is accessible before starting the
application. Configure the same environment variables described in
[Configuration](#configuration).

### 1. Start the backend API

```powershell
Copy-Item backend/.env.example backend/.env
Set-Location backend
npm ci
npm run dev
```

### 2. Start the background worker

In a second terminal:

```powershell
Set-Location backend
npm run dev:worker
```

Both the API and worker are needed for queued image-processing and email jobs.

### 3. Start the AI service

In a third terminal:

```powershell
Set-Location ai-service
Copy-Item .env.example .env
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Set `CLOUDVISION_API_KEY` in `ai-service/.env` and the matching
`AI_SERVICE_API_KEY` in `backend/.env`. For CPU-only local development, use
the PyTorch CPU package as shown above.

### 4. Serve the frontend

The frontend is static. From the repository root, run:

```powershell
python -m http.server 5500 --directory frontend
```

Open <http://localhost:5500>. The frontend API URL is set in
`frontend/config.js` and defaults to `http://localhost:5000/api/v1`.

## Configuration

The templates contain the full variable list and example values:

- [`backend/.env.example`](backend/.env.example)
- [`ai-service/.env.example`](ai-service/.env.example)

Important backend settings:

| Variable | Purpose |
|---|---|
| `MONGO_URI` | MongoDB connection string; required by the API. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `EMAIL_TOKEN_SECRET` | Signing secrets; all are required and must be replaced for any shared deployment. |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Redis connection for queues and real-time messaging. |
| `AI_SERVICE_BASE_URL`, `AI_SERVICE_API_KEY` | AI service URL and shared API key. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Image storage integration. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Email delivery settings. |
| `PORT`, `API_PREFIX`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | HTTP server, API prefix, and rate-limit configuration. |
| `CLIENT_URL` | Frontend origin used by Socket.IO and email verification/reset links. |

Do not commit `.env` files or production credentials. The API requires the
MongoDB URI and token secrets to start. Configure Redis, Cloudinary, SMTP, and
the AI service for the features that depend on them.

## API and service endpoints

The REST API prefix defaults to `/api/v1`; interactive documentation is served
at `/api-docs`.

| Resource | Route prefix | Examples of functionality |
|---|---|---|
| Health | `/health` | API health and uptime |
| Authentication | `/auth` | Registration, login, token refresh, email verification, password reset |
| Users | `/users` | Profile, avatar, password, account management |
| Projects | `/projects` | Create and manage projects |
| Images | `/images` | Upload and manage project images |
| Experiments | `/experiments` | Queue image processing and view experiment history |
| Dashboard | `/dashboard` | Summary metrics and recent activity |
| Notifications | `/notifications` | List and manage notifications |
| Administration | `/admin` | Administrative operations |

The AI service exposes `GET /health`, `POST /predict`, and `POST /evaluate`.
The prediction and evaluation endpoints require the `X-API-KEY` header.

## Development

Run these commands from `backend/`:

| Command | Description |
|---|---|
| `npm run dev` | Start the API with automatic restart. |
| `npm start` | Start the API. |
| `npm run dev:worker` | Start the background worker with automatic restart. |
| `npm run worker` | Start the background worker. |
| `npm test` | Run the Jest test suite. |
| `npm run lint` | Run ESLint on `src/`. |

Keep API and worker processes running during end-to-end workflows. The
frontend's API base URL is configured in `frontend/config.js`.

## Repository layout

```text
.
├── ai-service/       # FastAPI inference service and image-processing code
├── backend/
│   ├── src/
│   │   ├── config/   # Environment, database, Redis, logging, storage
│   │   ├── controllers/
│   │   ├── jobs/     # Background job processors
│   │   ├── models/   # Mongoose schemas
│   │   ├── queues/
│   │   ├── routes/
│   │   ├── services/
│   │   └── worker.js
│   └── package.json
├── frontend/
│   ├── css/
│   ├── js/
│   ├── app.html
│   ├── dashboard.html
│   ├── index.html
│   ├── login.html
│   └── register.html
└── docker-compose.yml
```

## License

No license is currently specified in this repository. Contact the maintainers
before redistributing or using the project beyond the permissions provided by
its dependencies.
