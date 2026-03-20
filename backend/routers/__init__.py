"""
backend/routers/__init__.py
===========================
Router collection and registration for the Merbana FastAPI backend.

This module collects all API routers and provides a registration
function for the main FastAPI application.
"""

from typing import List, Tuple

from fastapi import APIRouter

from .users import router as users_router
from .categories import router as categories_router
from .products import router as products_router
from .orders import router as orders_router
from .register import router as register_router
from .debtors import router as debtors_router
from .settings import router as settings_router
from .activity import router as activity_router

# Collect all routers with their prefixes
routers: List[Tuple[APIRouter, str, List[str]]] = [
    (users_router, "/users", ["Users"]),
    (categories_router, "/categories", ["Categories"]),
    (products_router, "/products", ["Products"]),
    (orders_router, "/orders", ["Orders"]),
    (register_router, "/register", ["Register"]),
    (debtors_router, "/debtors", ["Debtors"]),
    (settings_router, "/settings", ["Settings"]),
    (activity_router, "/activity", ["Activity"]),
]


def register_routers(app) -> None:
    """
    Register all API routers with the FastAPI application.

    Args:
        app: FastAPI application instance
    """
    for router, prefix, tags in routers:
        app.include_router(
            router,
            prefix=f"/api{prefix}",
            tags=tags,
        )


__all__ = [
    "routers",
    "register_routers",
    "users_router",
    "categories_router",
    "products_router",
    "orders_router",
    "register_router",
    "debtors_router",
    "settings_router",
    "activity_router",
]
