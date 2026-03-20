"""
backend/app.py
==============
Main FastAPI application for Merbana.

Provides API endpoints and SPA serving for the desktop application.
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import OperationalError

from .database import SessionLocal
from .errors import AppError
from .paths import get_dist_path
from .routers import register_routers
from .services.settings import get_or_create_settings

logger = logging.getLogger(__name__)


def get_port() -> int:
    """Get the port from environment variable or default."""
    return int(os.environ.get("MERBANA_PORT", "8741"))


def get_cors_origins() -> List[str]:
    """Get CORS origins based on current port."""
    port = get_port()
    return [
        f"http://localhost:{port}",
        f"http://127.0.0.1:{port}",
    ]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager for startup and shutdown."""
    logger.info("Starting Merbana application...")
    db = SessionLocal()
    try:
        get_or_create_settings(db)
        logger.info("Default settings initialized")
    except OperationalError as exc:
        logger.critical(
            "Database schema is missing or outdated. "
            "Run Alembic migrations before starting the app."
        )
        raise RuntimeError(
            "Database migration required. Run operator migration command before app startup."
        ) from exc

    finally:
        db.close()

    yield

    logger.info("Shutting down Merbana application...")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="Merbana API",
        description="FastAPI backend for Merbana POS system",
        version="1.0.0",
        lifespan=lifespan,
        redirect_slashes=False,
    )

    cors_origins = get_cors_origins()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
    )

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        """Handle custom application errors."""
        logger.error(f"AppError: {exc}")
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": str(exc), "code": exc.code, "details": exc.details},
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        """Handle unhandled exceptions."""
        logger.exception(f"Unhandled exception: {exc}")
        return JSONResponse(
            status_code=500,
            content={"error": str(exc), "code": "INTERNAL_ERROR", "details": None},
        )

    register_routers(app)

    @app.get("/api/health")
    def health_check():
        """Health check endpoint."""
        return {"status": "healthy"}

    dist_path = get_dist_path()
    index_path = os.path.join(dist_path, "index.html")

    if os.path.isfile(index_path):
        app.mount(
            "/assets",
            StaticFiles(directory=os.path.join(dist_path, "assets")),
            name="assets",
        )
        app.mount(
            "/data", StaticFiles(directory=os.path.join(dist_path, "data")), name="data"
        )
        logger.info(f"SPA static files mounted from {dist_path}")

        @app.get("/{path:path}")
        async def serve_spa(path: str):
            """Serve index.html for React Router paths (non-API, non-static-file paths)."""
            file_path = os.path.join(dist_path, path)
            if os.path.isfile(file_path):
                return FileResponse(file_path)
            return FileResponse(index_path)
    else:
        logger.warning(
            f"dist/index.html not found at {dist_path}, SPA serving disabled"
        )

    return app


app = create_app()
