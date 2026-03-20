# Backend Architecture

## Overview

The Merbana backend is a FastAPI application that serves as the single source of truth for all application data. It replaces the previous JSON-based persistence layer with SQLAlchemy ORM and SQLite.

## Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| HTTP Framework | FastAPI | >=0.104.0 |
| ASGI Server | Uvicorn | >=0.24.0 |
| ORM | SQLAlchemy | >=2.0.0 |
| Validation | Pydantic | >=2.5.0 |
| Database | SQLite | - |

## Directory Structure

```
backend/
├── __init__.py          # Package marker
├── app.py               # FastAPI app factory and lifespan
├── config.py            # Application configuration
├── database.py          # SQLAlchemy engine, session, init_db
├── db_types.py          # Custom SQLAlchemy types
├── dependencies.py      # Dependency injection helpers
├── errors.py            # Error codes and exception classes
├── models.py            # SQLAlchemy ORM models
├── paths.py             # Path resolution utilities
├── routers/             # API route handlers
│   ├── __init__.py      # Router registration
│   ├── users.py         # /api/users/*
│   ├── categories.py    # /api/categories/*
│   ├── products.py     # /api/products/*
│   ├── orders.py       # /api/orders/*
│   ├── register.py     # /api/register/*
│   ├── debtors.py      # /api/debtors/*
│   ├── settings.py     # /api/settings/*
│   └── activity.py     # /api/activity/*
├── schemas/             # Pydantic request/response models
│   ├── __init__.py     # Schema exports
│   ├── common.py       # Shared types (UUIDstr, TimestampStr)
│   ├── errors.py       # ErrorResponse, ErrorDetail
│   ├── users.py        # User schemas
│   ├── categories.py  # Category schemas
│   ├── products.py    # Product schemas
│   ├── orders.py     # Order schemas
│   ├── register.py   # CashTransaction schemas
│   ├── debtors.py    # Debtor schemas
│   ├── settings.py   # Settings schemas
│   └── activity.py   # ActivityLog schemas
├── services/            # Business logic layer
│   ├── __init__.py     # Service exports
│   ├── activity.py     # Activity logging
│   ├── inventory.py    # Stock management, daily reset
│   ├── orders.py      # Order creation/deletion
│   ├── register.py    # Cash transactions
│   ├── settings.py    # Settings management
│   └── categories.py  # Category operations
└── tests/               # pytest test suite
    ├── __init__.py
    ├── conftest.py     # Fixtures
    ├── test_database.py
    ├── test_paths.py
    ├── test_services.py
    └── test_routers.py
```

## Running in Development Mode

### Prerequisites

```bash
pip install -r requirements.txt
```

### Start the Server

```bash
# Build the frontend first
npm run build

# Start the FastAPI server
python -m uvicorn backend.app:app --reload --port 8741
```

The server will be available at `http://127.0.0.1:8741`

### API Documentation

- Swagger UI: `http://127.0.0.1:8741/docs`
- ReDoc: `http://127.0.0.1:8741/redoc`

## Database

### Location

| Platform | Path |
|----------|------|
| Linux | `~/.local/share/merbana/merbana.db` |
| macOS | `~/.local/share/merbana/merbana.db` |
| Windows | `%APPDATA%/merbana/merbana.db` |

### SQLite Pragmas

The database is configured with:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
```

### Schema

See `backend/models.py` for all SQLAlchemy models:

- `StoreUser` - Application users
- `Category` - Product categories
- `Product` / `ProductSize` - Products with size variants
- `Order` / `OrderItem` - Customer orders
- `CashTransaction` - Register operations
- `Debtor` - Debt tracking
- `StoreSettings` - Singleton settings
- `PasswordRequirement` - Security settings
- `ActivityLog` - Audit trail

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MERBANA_PORT` | `8741` | Server port |

## API Endpoints Summary

| Entity | Endpoints | Base Path |
|--------|-----------|-----------|
| Health | 1 | `/api/health` |
| Users | 5 | `/api/users` |
| Categories | 5 | `/api/categories` |
| Products | 7 | `/api/products` |
| Orders | 5 | `/api/orders` |
| Register | 5 | `/api/register` |
| Debtors | 6 | `/api/debtors` |
| Settings | 4 | `/api/settings` |
| Activity | 1 | `/api/activity` |

See `Documentation/API_Route_Contract.md` for full endpoint documentation.

## Architecture Decisions

### Synchronous SQLAlchemy

The backend uses synchronous SQLAlchemy (not async). This is intentional for a desktop application where SQLite is sufficient and async adds complexity without benefit.

### Service Layer Pattern

Business logic that involves multiple entities (creating orders, closing shifts) is encapsulated in service functions (`backend/services/`). Route handlers are thin and delegate to services.

### Same-Origin Serving

The FastAPI app serves both the API (`/api/*`) and the SPA (`/*` catch-all to `index.html`) from the same port. This avoids CORS complexity for a local desktop app.

### Source of Truth

The backend is the only write path. The frontend never writes to the SQLite file directly.

## Error Handling

All errors follow a standard format:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "details": null
}
```

Error codes:

| Code | HTTP Status |
|------|-------------|
| `VALIDATION_ERROR` | 422 |
| `NOT_FOUND` | 404 |
| `CONFLICT` | 409 |
| `DUPLICATE_ID` | 409 |
| `INTERNAL_ERROR` | 500 |

## Running Tests

```bash
cd backend
pytest tests/ -v
```

Tests use an in-memory SQLite database for isolation.

## Building and Running on Linux

Use `Deployment/build_linux.py` to package the app into a single Linux binary.

### Prerequisites (Ubuntu/Debian, GTK backend)

Prefer the full installer script because it auto-detects distro package names:

```bash
bash Deployment/2_build_liunx.sh
```

If installing manually, use the correct WebKit package for your distro version.

```bash
sudo apt update
sudo apt install -y \
  python3-gi python3-gi-cairo gir1.2-gtk-3.0 \
  libgtk-3-dev nodejs npm
```

WebKit packages by distro:

- Ubuntu 24.04 / Debian 13: `gir1.2-webkitgtk-6.0 libwebkitgtk-6.0-dev`
- Ubuntu 22.04 / Debian 12: `gir1.2-webkit2-4.1 libwebkit2gtk-4.1-dev`
- Ubuntu 20.04 / Debian 11: `gir1.2-webkit2-4.0 libwebkit2gtk-4.0-dev`

Install project dependencies:

```bash
pip install -r requirements.txt
pip install pyinstaller pywebview
npm ci
```

### Build

```bash
python3 Deployment/build_linux.py
```

Optional flags:

```bash
# Reuse existing dist/ output
python3 Deployment/build_linux.py --skip-frontend

# Use Qt backend instead of GTK
python3 Deployment/build_linux.py --backend qt
```

### Run

```bash
./dist_linux/Merbana
```

### Required DB Migration Step (before app startup)

Run Alembic against the target SQLite database before first startup on that database:

```bash
MERBANA_DB_URL='sqlite:////ABS/PATH/merbana.db' \
python3 -m alembic -c Deployment/backend/alembic.ini upgrade head
```

Backup these files before migration: `merbana.db`, `merbana.db-wal`, `merbana.db-shm`.

### Build Output

The Linux build includes:
- Frontend `dist/` folder
- Backend package
- Required hidden imports for pywebview/SQLAlchemy