# Quatern

An open-source, offline-first desktop POS, inventory, CRM, and forecasting platform for retail businesses built with **PyWebView + FastAPI + SQLite** (with native React 19 + Tailwind CSS v4 frontend).

---

## Features

- **Billing & POS**: High-speed SKU/barcode entry, deterministic integer-paise calculations, GST rates (0%, 5%, 12%, 18%, 28%), line & bill discounts, split/cash/UPI/card payments.
- **Dual-mode Receipt Printing**: ESC/POS thermal printing (58mm & 80mm format toggle) via native backend generator + system print/PDF fallback.
- **WhatsApp & SMS Receipts**: 1-click WhatsApp customer receipts via `wa.me` links, with pluggable support for Meta Cloud API and Indian DLT SMS gateways.
- **Inventory Ledger**: Real-time stock decrement on billing, reorder alerts, supplier purchase order tracking, and cost price updates.
- **CRM & Consent-guarded Marketing**: Customer database with explicit marketing opt-in enforcement, tag segmentation, and approval workflows before dispatch.
- **Visual Analytics & Forecasting**: Interactive moving average (7/14/30 days) and exponential smoothing demand curves to estimate stock velocity.
- **Local SQLite Engine**: ACID-compliant transactions with auto-migrations and zero mandatory cloud subscriptions.
- **Access Control**: Lightweight Owner PIN mode — keep cashier checkout frictionless while guarding profit margins, cost prices, and audit logs.
- **AI Business Intelligence**: Offline local GGUF Gemma 4 E2B copilot and heuristic engine providing live margins, sales metrics, and retail suggestions.

---

## Development Setup

> **Note**: Always use `pnpm` for frontend operations and Python 3.12+ for the backend.

### Prerequisites

1. **Node.js** (v20+) and **pnpm** (v10+):
   ```powershell
   pnpm --version
   ```
2. **Python** (3.10+) with `uv` or `pip`:
   ```powershell
   uv venv
   uv pip install -r requirements.txt
   ```

### Running Quatern

- **Launch Full Desktop App** (PyWebView + FastAPI + SQLite):
  ```powershell
  python desktop.py
  # or via pnpm shortcut:
  pnpm desktop
  ```

- **Live Development Mode** (PyWebView with Vite hot-reload & FastAPI):
  ```powershell
  # Terminal 1: Start Vite
  pnpm dev

  # Terminal 2: Launch Desktop window pointing to Vite
  python desktop.py --dev
  ```

- **Web Browser Only Mode**:
  ```powershell
  # Terminal 1: Run FastAPI backend
  pnpm api

  # Terminal 2: Run Vite dev server
  pnpm dev
  ```

- **Package Standalone Executable (No Python/Node required for end-users)**:
  ```powershell
  pnpm package
  ```
  Generates `release/Quatern/Quatern.exe`. End users can run this executable directly on any 64-bit Windows machine.

---

## Project Structure

```
quatern/
├── backend/                    # FastAPI Desktop Backend
│   ├── main.py                 # FastAPI application & API endpoints
│   ├── db.py                   # SQLite engine, auto-seeding & migrations
│   ├── models.py               # Pydantic domain models
│   ├── escpos.py               # 58mm/80mm thermal receipt generator
│   └── ocr.py                  # Extensible AI invoice OCR parser
├── desktop.py                  # PyWebView desktop window launcher
├── requirements.txt            # Python dependencies (fastapi, pywebview, uvicorn)
├── src/                        # React 19 Frontend
│   ├── App.tsx                 # Core app shell with PIN security guard
│   ├── ui.tsx                  # Design system primitives & SVG icon set
│   ├── lib/
│   │   ├── money.ts            # Integer paise financial calculations
│   │   ├── forecast.ts         # Moving average & exponential smoothing
│   │   ├── store.ts            # State reducer with SQLite hydration
│   │   └── api.ts              # Universal desktop API bridge & WhatsApp adapter
│   └── views/
│       ├── Billing.tsx         # POS, barcode scanning & thermal print
│       ├── Dashboard.tsx       # Sales trends, alerts & bestsellers
│       ├── Inventory.tsx       # Stock levels & purchase recording
│       ├── Customers.tsx       # Profiles, consent & segmentation
│       ├── Campaigns.tsx       # Approval workflow & message templates
│       ├── Forecast.tsx        # Demand prediction visualizer
│       └── Audit.tsx           # Audit log, SQLite status & PIN setup
├── vite.config.ts              # Vite 8 with Tailwind CSS v4
└── package.json                # Scripts & frontend dependencies
```
