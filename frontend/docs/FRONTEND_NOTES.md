# CloudClear AI frontend: notes

## Run it
The backend's CORS list allows only `http://localhost:5500`, `http://127.0.0.1:5500` and `http://localhost:3000`.
Serve this folder from one of those origins (ES modules need http, not `file://`):

    cd frontend && python3 -m http.server 5500      # or VS Code Live Server on 5500

`config.js` holds `window.API_BASE_URL` (default `http://localhost:5000/api/v1`).

## Structure
| Path | Role |
|---|---|
| `index.html` | Public landing page (theme preserved, unsupported claims removed) |
| `login.html`, `register.html`, `js/auth-page.js` | Auth pages, same API contract as before |
| `app.html`, `js/app.js` | Workspace shell: auth guard, sidebar, top bar, notifications, hash router |
| `js/api.js` | Single API client: base URL, Bearer auth, JSON/multipart, error parsing, 401 -> `/auth/refresh` -> retry once |
| `js/ui.js`, `js/components.js` | Safe DOM builder (no `innerHTML` with data), toasts, dialogs, formatters |
| `js/models-data.js` | Model catalogue written from the real AI service code |
| `js/state.js` | Selected project (localStorage) and polling policy |
| `js/pages/*.js` | dashboard, projects, lab, experiments, results (gallery + studio), models, settings |
| `css/tokens.css`, `css/app.css` | Design tokens copied from the landing page; workspace styles |
| `dashboard.html` | Redirect stub to `app.html#/dashboard` (the old file was entirely commented out) |
| `tests/e2e_mock.py` | Playwright test against a mocked API (see below) |

## API contract used (read from the backend source)
Auth: `POST /auth/login|register|logout|refresh`, `GET /auth/me`. Projects: `GET|POST /projects`, `PATCH /projects/:id`.
Images: `POST /images` (multipart: `projectId` text field + `image` file, 100 MB, PNG/JPG/TIFF), `GET /images?projectId=`, `DELETE /images/:id`.
Experiments: `POST /experiments/process {imageId, model}` -> 202, `GET /experiments` (filters), `GET /experiments/:id`.
Also `GET /dashboard/summary`, `/notifications`, `PATCH /users/me`, `PATCH /users/me/password`, `DELETE /users/me`.
Experiment statuses: `queued`, `running`, `completed`, `failed`. Models: `GAN`, `Diffusion`, `LaMa`, `U-Net`.

## Behaviour worth knowing
- **Polling** (`GET /experiments/:id`): 3 s, backing off to 10 s; stops on `completed`; pauses while the tab is hidden; gives up after 15 min with a "check again" button; tolerates network errors (up to 8 in a row).
- **"Failed" is not final immediately.** The queue retries each job up to 3 times and each retry sets the status back to `running`, so the page keeps checking for 60 s after a failure before showing the final failed state. There is no retry endpoint, so the only action offered is "Start a new run".
- **Real uploads have no PSNR/SSIM/MAE/RMSE.** The worker calls the AI service `/predict`, which does not compute them. The Results page shows processing time and the mean confidence-map value, and says why the reference metrics are missing. Any of PSNR/SSIM/MAE/RMSE/IoU would appear automatically if the backend ever stores them.
- **Stage events from Socket.IO are not used.** `cloud_detection` and `mask_generation` are emitted back-to-back before the AI call starts, so they are not real progress.
- **TIFF** sources cannot be previewed in a browser, so there is no before/after slider for them. The AI service reads images as 8-bit RGB, so multi-band or 16-bit GeoTIFFs may fail.
- **Model labels:** only LaMa is a trained network. `GAN`, `Diffusion` and `U-Net` are OpenCV Telea inpainting variants. LaMa silently falls back to OpenCV if its weights cannot load, and the result does not record that.
- Mean confidence is the mean of a distance-transform map, not an accuracy measure, and is labelled that way.
- "Completed" time is the experiment's `updatedAt` (there is no `completedAt` field).

## Landing page changes
Removed or corrected: hero stats (31.4 dB, 0.94, 312 scenes), benchmark section, per-model accuracy lines, "trained and validated on seven datasets", React in the tech stack, invented team, contact form that sent nothing, mock demo with an `alert()` download, "map placeholder", `href="#"` links, military-surveillance use case, in-page login/app views (now real pages). Datasets are labelled as reference only. Reference papers link to arXiv. The only contact route is `mailto:contact@cloudclear.ai` (the address that was already on the page; please confirm it is real).

## Not done / limits
- No forgot-password or email-verification landing pages (the backend emails links to a frontend URL that this repo does not define). Settings has "Resend verification email".
- No avatar upload, project deletion (the backend leaves orphaned images/experiments), or admin screens.
- Download links add Cloudinary's `fl_attachment` flag so browsers save the file. This is untested against a live Cloudinary account; other hosts open in a new tab.
- Not tested against your real Mongo, Redis, Cloudinary or AI service.

## Backend issues noticed (not changed)
- `GET /projects?search=` builds a regex from unescaped user input.
- `DELETE /projects/:id` does not delete the project's images/experiments or their Cloudinary files.
- CORS origins are hard-coded in `app.js` (ignores `CLIENT_URL`).
- Failed experiments flip back to `running` on queue retries (see above).
- Suggested small patch: have the AI service return a `modelUsed`/`fallback` flag and store it on the experiment, so a LaMa fallback is visible.

## Tests
`tests/e2e_mock.py <path-to-this-folder>` starts a static server on :5500, intercepts the API with a mock that follows the contract above, and runs 66 checks in Chromium (auth, guard, projects, upload validation, queued/running/completed/failed flows, polling stop, 401 refresh, XSS payload, responsive overflow at 390 px). Requires `pip install playwright pillow` and a Chromium install.
The 401 "console errors" it logs are the deliberate expired-token tests.
