# Quatern

PyWebView + FastAPI + SQLite + React 19 + Tailwind CSS v4 desktop application for modern retail shops.

## Package Manager & Toolchain

- Always use **`pnpm`** exclusively for all frontend operations. Never use `npm` or `yarn`.
- Use Python 3.12+ (or `uv`) for backend packages (`requirements.txt`).

## Development Commands

- `python desktop.py` (or `pnpm desktop`) - Launch standalone native PyWebView desktop application
- `python desktop.py --dev` (or `pnpm desktop:dev`) - Launch desktop app connected to Vite hot reload
- `pnpm dev` - Start Vite dev server for frontend
- `pnpm api` - Start FastAPI backend server on port 8000
- `pnpm build` - Build the production frontend bundle to `dist/`
- `pnpm package` - Compile standalone desktop executable to `release/Quatern/`
- `pnpm format` - Format source files

## Architecture

- `desktop.py` - PyWebView native desktop launcher (spawns FastAPI daemon and WebView2 window)
- `backend/` - FastAPI backend with SQLite engine, ESC/POS printing, and SHA-256 PIN security
- `src/` - React 19 frontend with Linear/Stripe financial aesthetic
- `src/lib/api.ts` - Universal desktop bridge communicating with FastAPI `/api` endpoints and local fallback
- `src/lib/money.ts` - All currency arithmetic in integer paise
