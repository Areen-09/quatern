# Quatern

<div align="center">

![Quatern Logo](public/icon.png)

### Modern, Offline-First Desktop POS & Retail Management System

**PyWebView (WebView2) · FastAPI · SQLite · React 19 · Tailwind CSS v4**

[![GitHub Release](https://img.shields.io/github/v/release/Areen-09/quatern?color=16a34a&label=Release)](https://github.com/Areen-09/quatern/releases/latest)
[![Platform](https://img.shields.io/badge/Platform-Windows%20x64-0284c7)](#download-and-installation)
[![License](https://img.shields.io/badge/License-MIT-amber)](#license)
[![Architecture](https://img.shields.io/badge/Offline-100%25%20Local%20SQLite-4f46e5)](#architecture)

[**Download Latest Release (Windows x64)**](https://github.com/Areen-09/quatern/releases/latest) · [**Features**](#features) · [**Quick Start**](#developer-quickstart) · [**Architecture**](#architecture)

</div>

---

## Overview

**Quatern** is a modern, high-speed retail desktop application designed for retail shops, grocery stores, boutiques, chemists, and general merchants. 

Unlike traditional bulky cloud POS systems that require costly subscriptions, continuous internet connectivity, and external servers, Quatern is **100% offline-first**. All store data — products, transactions, customer records, and credit ledgers — resides securely on the local computer in an encrypted SQLite database.

---

## Highlights

- ⚡ **High-Speed Checkout**: Lightning-fast barcode/SKU scanning, keyboard-first navigation, and real-time total calculations.
- 💰 **Paise-Accurate Accounting**: Zero floating-point drift. All financial arithmetic is performed in integer paise with automatic rounding.
- 🧾 **Flexible Receipt Generation**: 
  - ESC/POS thermal printing (58mm and 80mm format toggle).
  - Canvas-based visual bill images for direct clipboard copy and 1-click WhatsApp delivery (`wa.me`).
  - Native printable PDF and browser print previews.
- 📋 **Udhaar / Credit Ledger**: Dedicated tracking for pending customer udhaar, partial payment settlements, and 1-click WhatsApp payment reminders.
- 📦 **Inventory & Purchase Orders**: Automatic real-time stock decrements upon sale, low-stock reorder thresholds, and supplier replenishment logs.
- 👥 **Consent-Enforced CRM**: Customer purchase history and tagged campaign segments that strictly enforce privacy and marketing opt-ins.
- 📊 **Visual Demand Forecasting**: Moving-average (7/14/30 days) and exponential smoothing algorithms to forecast inventory turnover and prevent stockouts.
- 📥 **Excel / CSV Migration**: Seamless product and customer bulk import with automated column mapping, preview validations, and conflict resolution (upsert or skip).
- 🤖 **AI Retail Copilot**: Offline heuristic and local LLM (GGUF Gemma) business intelligence copilot answering sales inquiries, margins, and restocking queries.
- 🔒 **Owner Security PIN**: Restrict cashiers from viewing supplier costs, net profit margins, raw audit trails, or resetting store data.

---

## Download & Installation

For store owners and cashiers — **no programming or terminal commands required**:

1. Go to the [**Quatern Releases**](https://github.com/Areen-09/quatern/releases/latest) page.
2. Download `Quatern-Windows-x64.zip`.
3. Extract the ZIP folder on your Windows computer.
4. Double-click **`Quatern.exe`** to launch.

> **System Requirements**: 64-bit Windows 10 or Windows 11. Built with native Microsoft WebView2 runtime (pre-installed on modern Windows).

---

## Core Modules

| Module | Description | Key Capabilities |
| :--- | :--- | :--- |
| **New Bill (POS)** | Checkout terminal | Barcode lookup, item discounts, bill discounts, GST (0%, 5%, 12%, 18%, 28%), Cash / UPI / Card / Udhaar payments |
| **Bills & History** | Transaction record | Past invoice search, date filters, printable thermal bills, digital signatures, invoice deletion with auto stock rollback |
| **Pending Udhaar** | Credit management | Outstanding balance tracker, customer phone directory, 1-click WhatsApp reminder message generator, settlement modal |
| **Inventory** | Stock control | Live quantities, SKU management, unit types, purchase order cost tracking, low-stock indicators |
| **Customers** | CRM & Loyalty | Contact management, consent opt-in flags, purchase history, custom segmentation tags |
| **Campaigns** | Customer marketing | WhatsApp and SMS marketing drafts, segment filtering, approval gatekeeper before dispatch |
| **AI Assistant** | Business copilot | Instant natural-language querying of inventory metrics, top-selling items, revenue velocity, and restocking advice |
| **Forecast** | Demand analytics | Historical daily revenue curve, 7/14/30-day moving average, exponential smoothing velocity |
| **Data & Settings** | Administration | Store profile, GSTIN configuration, Excel/CSV importer, digital signature canvas, Owner PIN, and audit trail |

---

## Architecture

Quatern pairs the speed and portability of a modern Python runtime with the fluid, high-density interface of React 19:

```
┌──────────────────────────────────────────────────────────────┐
│                    Quatern Desktop Window                    │
│             (Microsoft WebView2 / PyWebView)                 │
└───────────────┬───────────────────────────────┬──────────────┘
                │                               │
         (HTTP localhost)                 (State Sync)
                │                               │
┌───────────────▼──────────────┐ ┌──────────────▼──────────────┐
│       FastAPI Daemon         │ │       React 19 Frontend      │
│   (uvicorn background thread)│ │   (Tailwind CSS v4 + Vite)  │
├──────────────────────────────┤ ├──────────────────────────────┤
│ • SQLite engine (WAL mode)   │ │ • Universal API client bridge│
│ • ESC/POS binary generator   │ │ • Integer paise math library │
│ • SHA-256 PIN security       │ │ • Custom modal system        │
│ • Local LLM / AI Copilot     │ │ • Excel / CSV Parser (xlsx)  │
└───────────────┬──────────────┘ └──────────────────────────────┘
                │
┌───────────────▼──────────────┐
│       quatern.db (SQLite)    │
│  %LOCALAPPDATA%/Quatern/     │
└──────────────────────────────┘
```

### Key Architectural Tenets:
1. **Paise Representation**: All financial amounts are stored and calculated as integers representing paise (`100 paise = ₹1.00`). Floating-point arithmetic is strictly banned across the application.
2. **Local Storage Fallback**: The frontend communicates transparently with the local FastAPI backend. If the backend is initializing, the app safely falls back to local storage without losing UI responsiveness.
3. **Zero Native Popups**: Standard browser alerts (`alert()`, `confirm()`, `prompt()`) are eliminated in favor of unified, accessible React `<Modal>` components.
4. **Mark-of-the-Web Safe**: Bundled with a specialized `Quatern.exe.config` enabling `<loadFromRemoteSources enabled="true" />` to prevent Windows `.NET` assembly blocks on downloaded executables.

---

## Developer Quickstart

### Prerequisites
- **Node.js** (v20+) & **pnpm** (v10+):
  ```bash
  corepack enable
  corepack prepare pnpm@latest --activate
  ```
- **Python** (3.12+ recommended) with `uv` or `pip`:
  ```bash
  python --version
  ```

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/Areen-09/quatern.git
cd quatern

# Install frontend dependencies (always use pnpm)
pnpm install

# Setup Python virtual environment
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Run in Development Mode
```bash
# Option A: Standalone PyWebView connected to Vite HMR
pnpm desktop:dev

# Option B: Run separate web services (browser testing)
# Terminal 1:
pnpm dev

# Terminal 2:
pnpm api
```

### 3. Build & Package Standalone Windows Executable
```bash
# Compiles React bundle and packages release/Quatern/Quatern.exe via PyInstaller
pnpm package
```

The resulting distribution folder in `release/Quatern/` contains the fully standalone executable, complete with icon branding, embedded Python runtime, and frontend assets.

---

## Keyboard Shortcuts (POS)

| Shortcut | Action |
| :--- | :--- |
| **Enter** (in search) | Select first matching product and add to current bill |
| **Tab** / **Shift + Tab** | Move between quantity, discount, and payment inputs |
| **Ctrl + V** | Paste copied bill image directly into WhatsApp Web / Desktop |
| **Esc** | Close any open modal dialog or cancel action |

---

## Contributing

Contributions, feature requests, and bug reports are welcome!

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/amazing-feature`).
3. Format source files using `pnpm format`.
4. Commit your changes (`git commit -m 'feat: add amazing feature'`).
5. Push to the branch (`git push origin feature/amazing-feature`).
6. Open a Pull Request.

---

## License

Distributed under the **MIT License**. See `LICENSE` for more information.
