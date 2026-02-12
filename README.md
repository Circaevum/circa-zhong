# Zhong (中)

**Quarterly development dashboard** for Circaevum — a hex-grid hub for projects, versions, and session tracking. The center hex is Zhong (executive oversight); the rest are YANG/YIN projects with IDs, status, and a **Worldline** (feature history).

## What it does

- **Hex grid** — One center (Zhong) plus 36 project slots in rings. Each slot has a type (Web, Database, API, Unity, etc.), status, and optional **project code** (e.g. `26Q1W22` = 2026 Q1, Web, project 22).
- **Worldline** — Per-project timeline of updates: version strings (`c26Q1F121`), commit, repo path, description. Add knots as you ship.
- **Session & token tracking** — In development, syncs with Cursor session data; per-project token stats show up in the panel.
- **Sync** — Use it **local-only** (device auth, no account) or **sign in with email** to sync projects to Nakama so the same data appears everywhere (including GitHub Pages if you wire it up).

## Running it

### Local

1. `npm install` then `npm run dev`.
2. Optional: copy `.env.example` to `.env` and set `VITE_NAKAMA_HOST`, `VITE_NAKAMA_SERVER_KEY` (and optionally `VITE_NAKAMA_SCHEME`, `VITE_NAKAMA_PORT`). Without these, the app runs in local-only mode (no cloud sync, no email login).

### GitHub Pages

The app deploys via the **Deploy to GitHub Pages** workflow (it runs `npm run build` and deploys the `dist/` output). For the site to work, **Pages must use that workflow**, not the raw branch:

1. Repo **Settings → Pages** (under "Code and automation").
2. Under **Build and deployment**, set **Source** to **GitHub Actions** (not "Deploy from a branch").  
   If it’s set to a branch, GitHub serves the source files and the app stays blank.

To use Nakama on the live site (so the hosted app can sync):

- **Variables:** `VITE_NAKAMA_HOST`, `VITE_NAKAMA_PORT`, `VITE_NAKAMA_SCHEME`
- **Secret:** `VITE_NAKAMA_SERVER_KEY`

Add them under **Settings → Secrets and variables → Actions**. If you don’t set them, the live site still works in local-only mode.

## Connecting to Nakama

Nakama provides **device auth** (anonymous) and **email sign-in** so projects and worldlines sync across devices. When configured, the app shows **Status: ✓ Synced** in the header.

### Local

- Copy `.env.example` to `.env`.
- Set at least: `VITE_NAKAMA_HOST`, `VITE_NAKAMA_SERVER_KEY`.
- Optional: `VITE_NAKAMA_SCHEME` (e.g. `https`), `VITE_NAKAMA_PORT` (e.g. `443`). Defaults are `http` and `7350`.

### Production (GitHub Pages)

- **Variables:** `VITE_NAKAMA_HOST` (e.g. `nakama.circaevum.com`), `VITE_NAKAMA_PORT` (`443`), `VITE_NAKAMA_SCHEME` (`https`).
- **Secret:** `VITE_NAKAMA_SERVER_KEY` (same key as on the Nakama server).
- Redeploy after changing Actions variables so the build gets the new values.

### Notes

- **CORS:** The app origin is `https://circaevum.github.io`. The Nakama server (or its reverse proxy) must allow this origin. If both Nakama and the proxy send `Access-Control-Allow-Origin`, the browser will reject the response (“multiple values”). Fix by having the proxy strip Nakama’s CORS headers and send a single origin (see `docs/nginx-cors-snippet.conf` and `docs/NAKAMA-HTTPS-SETUP-PROGRESS.md`).
- **HTTPS:** Production uses `https://nakama.circaevum.com` (nginx + Let’s Encrypt on the droplet, proxying to Nakama). Full server setup (DNS, cert, nginx, CORS) is documented in `docs/NAKAMA-HTTPS-SETUP-PROGRESS.md`.

---

Built with React and Vite.
