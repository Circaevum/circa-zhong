# Zhong

Session management and token tracking for Circaevum Zhong administration hub.

## Setup

1. Copy `.env.example` to `.env`
2. Fill in your Nakama server details:
   - `VITE_NAKAMA_HOST` - Your Nakama server hostname
   - `VITE_NAKAMA_SERVER_KEY` - Your Nakama server key
   - `VITE_NAKAMA_PORT` - Port (default: 7350)
   - `VITE_NAKAMA_SCHEME` - http or https (default: http)

Without a valid `.env`, the Nakama sync and email login features will not work.

---

## React + Vite

This project uses React + Vite. The template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
