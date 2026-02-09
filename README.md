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

The app deploys to GitHub Pages via the `Deploy to GitHub Pages` workflow. To use Nakama there (so the hosted site can sync):

- **Variables:** `VITE_NAKAMA_HOST`, `VITE_NAKAMA_PORT`, `VITE_NAKAMA_SCHEME`
- **Secret:** `VITE_NAKAMA_SERVER_KEY`

Add them under **Settings → Secrets and variables → Actions**. If you don’t set them, the live site still works in local-only mode.

---

Built with React and Vite.
