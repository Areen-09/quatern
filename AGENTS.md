# AGENTS.md — Quatern Engineering & Development Guide

This document establishes the architectural standards, toolchain invariants, and operational guidelines for both human developers and autonomous AI coding agents working on **Quatern**.

---

## 1. System Overview & Technology Stack

Quatern is an offline-first, single-node retail POS, inventory ledger, customer CRM, and AI analytics desktop application.

| Layer | Technology | Key Responsibility |
| :--- | :--- | :--- |
| **Desktop Shell** | PyWebView + Microsoft WebView2 | Native window container, OS integration, local URI routing |
| **Backend Engine** | FastAPI (Python 3.12+) + uvicorn | Daemon service, SQLite transactions, thermal printing, AI inference |
| **Database** | SQLite 3 (`quatern.db` in WAL mode) | ACID-compliant storage in `%LOCALAPPDATA%\Quatern\` |
| **Frontend Framework** | React 19 + Vite 8 | High-density financial dashboard, offline-first client store |
| **Styling** | Tailwind CSS v4 + Vanilla CSS | Linear/Stripe design language, stone neutral palette, zero inline styles |

---

## 2. Package Manager & Toolchain Constraints

- **Frontend Package Manager**: Always use **`pnpm`** exclusively for all frontend operations. **NEVER use `npm` or `yarn`**.
- **Formatter**: Use `oxfmt` via `pnpm format`.
- **Python Environment**: Python 3.12+ (or `uv`). Manage backend dependencies exclusively in `requirements.txt`.
- **Operating System Shell**: Windows PowerShell for terminal automation. Avoid UNIX-specific shell operators like `&&` (use `;` in PowerShell).

---

## 3. Core Architectural Invariants

### 3.1 Currency Arithmetic (Integer Paise)
- All monetary amounts in state, database, and API payloads must be represented as **integer paise** (`100 paise = ₹1.00`).
- Floating-point calculations for currency are **strictly prohibited**.
- Always import and use helper utilities from `src/lib/money.ts`:
  - `toPaise(amount: number): number` — Converts decimal rupees to integer paise.
  - `fmt(paise: number): string` — Formats integer paise into localized rupee strings (e.g., `₹1,249.50`).
  - `calcLine(line: InvoiceLine)` — Deterministic line totals with GST and discount math.
  - `paiseToWords(paise: number): string` — Generates human-readable currency strings for invoices.

### 3.2 UI Dialogs & Alerts (Zero Native Popups)
- **Do NOT use native browser popups** (`alert()`, `confirm()`, `prompt()`). In WebView2, these trigger jarring browser headers (`127.0.0.1:8000 says ...`).
- Confirmations must use the unified React `<Modal>` component from `src/ui.tsx`.
- Form feedback and non-blocking notifications must use temporary state banners or toast indicators (e.g., `setStatusMsg(...)`).

### 3.3 Form Buttons & Submissions
- In `src/ui.tsx`, the reusable `<Btn>` component defaults to `type="button"`.
- Whenever a `<Btn>` is intended to submit a `<form onSubmit={...}>`, you **MUST explicitly set `type="submit"`** and provide an `onClick={handleSubmit}` fallback to guarantee accessibility across all environments.

### 3.4 Customer Privacy & Marketing Consent
- Customers have an explicit `consent: boolean` field.
- Automated campaigns and tag segmentation must never include customers who have not opted in (`consent === true`). Always query segments through `segmentOf(state, segmentName)` in `src/lib/store.ts`.

### 3.5 Git LFS Asset Exemption
- Small icons, graphics, and static web assets under `public/` (e.g. `icon.ico`, `icon.png`) must **never be tracked by Git LFS**. They must remain standard Git binaries.
- Keep `public/** -filter -diff -merge` at the end of `.gitattributes` to prevent GitHub Actions CI from downloading text pointer stubs.

### 3.6 Standalone Portability & Security Bypass
- When compiling desktop executables, `build_desktop.py` must copy `Quatern.exe.config` containing `<loadFromRemoteSources enabled="true" />` next to `Quatern.exe`. This prevents Windows Mark-of-the-Web security blocks from breaking `.NET`/WebView2 runtime on downloaded ZIP archives.

---

## 4. Repository Structure & Key Files

```
quatern/
├── backend/
│   ├── main.py                 # FastAPI application, route controllers & static mount
│   ├── db.py                   # SQLite schema, migrations, connection pool & seeds
│   ├── models.py               # Pydantic v2 schemas and request/response models
│   ├── escpos.py               # 58mm & 80mm ESC/POS thermal printer driver
│   ├── ai.py                   # Local GGUF LLM and heuristic business intelligence
│   ├── messaging.py            # WhatsApp (wa.me & Meta Cloud) and SMS dispatch
│   └── ocr.py                  # Invoice receipt scanning parser
├── desktop.py                  # PyWebView desktop launcher (FastAPI thread + WebView2)
├── build_desktop.py            # Standalone PyInstaller packaging script
├── Quatern.exe.config          # .NET remote assembly execution configuration
├── public/
│   ├── icon.ico                # Multi-resolution Windows app icon (16px to 256px)
│   └── icon.png                # High-res brand logo
├── src/
│   ├── App.tsx                 # Core app shell, onboarding guard, PIN modal
│   ├── ui.tsx                  # Design system primitives, SVG icons, Modal, Btn
│   ├── lib/
│   │   ├── api.ts              # Universal desktop API bridge with relative URL routing
│   │   ├── store.ts            # State reducer, SQLite hydration & localStorage fallback
│   │   ├── money.ts            # Integer paise financial math
│   │   ├── billImage.ts        # Canvas-based receipt generator for WhatsApp paste
│   │   └── forecast.ts         # Demand forecasting algorithms
│   └── views/
│       ├── Onboarding.tsx      # Initial store setup wizard (profile, GST, signature)
│       ├── Billing.tsx         # Fast POS cashier terminal with barcode & split pay
│       ├── Invoices.tsx        # Bill history, thermal print preview, deletion
│       ├── PendingPayments.tsx # Udhaar credit ledger & WhatsApp payment reminders
│       ├── Inventory.tsx       # Real-time stock management & purchase orders
│       ├── Customers.tsx       # Customer records, loyalty tags & consent management
│       ├── AIAssistant.tsx     # Natural-language store analytics & copilot
│       ├── Campaigns.tsx       # WhatsApp & SMS broadcast campaigns
│       ├── Forecast.tsx        # Demand prediction visualizer
│       └── Audit.tsx           # Shop settings, Owner PIN, SQLite reset, audit logs
└── .github/workflows/
    └── release.yml             # GitHub Actions CI for automated Windows packaging
```

---

## 5. Standard Development Commands

Always run commands from the project root:

| Command | Tool | Purpose |
| :--- | :--- | :--- |
| `pnpm dev` | Vite | Start frontend dev server on port `8443` or `5173` |
| `pnpm api` | Uvicorn | Start FastAPI backend server on port `8000` |
| `pnpm desktop:dev` | Python | Launch desktop WebView2 connected to Vite hot-reload |
| `pnpm desktop` | Python | Launch full standalone desktop application |
| `pnpm build` | Vite | Build optimized frontend distribution bundle to `dist/` |
| `pnpm format` | oxfmt | Format all TypeScript, TSX, and CSS source files |
| `pnpm package` | PyInstaller | Package production Windows standalone app into `release/Quatern/` |

---

## 6. State Hydration & Synchronization Rules

1. **Dual Storage Model**:
   - Primary: SQLite database managed by FastAPI (`/api/state`).
   - Secondary: Client-side `localStorage` cache (`quatern.v2`) for instant startup.
2. **Setup Verification**:
   - The onboarding screen is shown if `!isShopConfigured`.
   - The configuration guard must check `Boolean(s.shop?.isConfigured || s.shop?.is_configured)`.
   - On completing onboarding, `onComplete()` must dispatch a state payload with `isConfigured: true`.
3. **Database Reset**:
   - Triggering "Wipe all data" sends `POST /api/state/reset`.
   - The backend truncates all application tables, initializes a clean `shop_profile` with `is_configured = 0`, clears cached PINs, and triggers client store re-seeding.
