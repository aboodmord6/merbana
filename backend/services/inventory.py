"""
backend/services/inventory.py
=============================
Stock management and daily reset service.

Provides functions for:
- Adjusting stock levels (increment/decrement)
- Bulk stock updates
- Daily stock reset (set tracked products to 0)
- Checking and running daily reset based on settings
"""

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from ..models import Product, StoreSettings
from ..errors import NotFoundError
from .activity import log_activity


def adjust_stock(
    db: Session,
    product_id: str,
    quantity_delta: int,
    reason: Optional[str] = None,
    user_id: Optional[str] = None,
    user_name: str = "System",
) -> Product:
    """
    Increment or decrement stock for a product.

    Args:
        db: Database session
        product_id: Product ID
        quantity_delta: Quantity to add (positive) or remove (negative)
        reason: Optional reason for the adjustment
        user_id: User ID making the adjustment (for logging)
        user_name: User name making the adjustment (for logging)

    Returns:
        Updated Product instance

    Raises:
        NotFoundError: If product not found
    """
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise NotFoundError(f"Product with id '{product_id}' not found")

    # Only adjust stock if track_stock is enabled
    if product.track_stock:
        if product.stock is None:
            product.stock = 0
        product.stock += quantity_delta

        # Ensure stock doesn't go negative
        if product.stock < 0:
            product.stock = 0

        # Log the stock change
        action = f"Stock adjusted for '{product.name}': {quantity_delta:+d}"
        if reason:
            action += f" ({reason})"
        log_activity(db, user_id, user_name, action)

    return product


def bulk_set_stock(
    db: Session,
    updates: list,
    user_id: Optional[str] = None,
    user_name: str = "System",
) -> List[Product]:
    """
    Set absolute stock values for multiple products.

    Args:
        db: Database session
        updates: List of StockAdjustment with product_id and quantity_delta
                 (quantity_delta is treated as absolute value here)
        user_id: User ID making the adjustment (for logging)
        user_name: User name making the adjustment (for logging)

    Returns:
        List of updated Product instances

    Note:
        This function sets the stock to the specified value (not delta).
        To increment/decrement, use adjust_stock.
    """
    updated_products = []

    for update in updates:
        product = db.query(Product).filter(Product.id == update.product_id).first()
        if not product:
            raise NotFoundError(f"Product with id '{update.product_id}' not found")

        if product.track_stock:
            old_stock = product.stock or 0
            product.stock = max(0, update.quantity_delta)  # Treat as absolute value
            updated_products.append(product)

            # Log the stock change
            action = f"Stock set for '{product.name}': {old_stock} -> {product.stock}"
            log_activity(db, user_id, user_name, action)

    return updated_products


def reset_all_stock(
    db: Session,
    user_id: Optional[str] = None,
    user_name: str = "System",
) -> int:
    """
    Reset all tracked products to stock=0.

    Args:
        db: Database session
        user_id: User ID making the reset (for logging)
        user_name: User name making the reset (for logging)

    Returns:
        Number of products reset
    """
    # Find all products with track_stock=True
    products = db.query(Product).filter(Product.track_stock == True).all()

    count = 0
    for product in products:
        if product.stock != 0:
            old_stock = product.stock or 0
            product.stock = 0
            count += 1

            # Log individual stock changes
            action = f"Daily reset: Stock reset for '{product.name}': {old_stock} -> 0"
            log_activity(db, user_id, user_name, action)

    # Log the overall reset
    if count > 0:
        action = f"Daily stock reset completed: {count} products reset to 0"
        log_activity(db, user_id, user_name, action)

    return count


def should_run_daily_reset(settings: StoreSettings) -> bool:
    """
    Check if daily stock reset should run based on last_stock_reset.

    Args:
        settings: StoreSettings instance

    Returns:
        True if reset should run, False otherwise
    """
    if not settings.last_stock_reset:
        return True

    # Parse the last_stock_reset (stored in JavaScript toDateString format)
    # Format: "Mon Mar 17 2026"
    try:
        last_reset_date = datetime.strptime(settings.last_stock_reset, "%a %b %d %Y")
        today = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        # Compare dates only (ignore time)
        return last_reset_date.date() < today.date()
    except ValueError:
        # If parsing fails, assume reset is needed
        return True


def check_daily_reset(
    db: Session,
    user_id: Optional[str] = None,
    user_name: str = "System",
) -> bool:
    """
    Check if daily reset is needed and execute it.

    Args:
        db: Database session
        user_id: User ID (for logging)
        user_name: User name (for logging)

    Returns:
        True if reset was executed, False if not needed
    """
    from ..models import StoreSettings

    # Get settings (should be singleton)
    settings = db.query(StoreSettings).first()
    if not settings:
        # Create default settings if not exists
        settings = StoreSettings(
            id=1,
            company_name="",
            last_stock_reset=None,
        )
        db.add(settings)
        db.flush()

    if should_run_daily_reset(settings):
        # Run the reset
        count = reset_all_stock(db, user_id, user_name)

        # Update the last_stock_reset timestamp
        # Use JavaScript toDateString() format: "Mon Mar 17 2026"
        settings.last_stock_reset = datetime.now(timezone.utc).strftime("%a %b %d %Y")

        # Log the daily reset check
        action = f"Daily stock reset check: Reset executed for {count} products"
        log_activity(db, user_id, user_name, action)

        return True

    return False
