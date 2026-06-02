"""In-memory cache for user preferences — avoids DB query on every request."""

import logging
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("sesame.user_pref")


class UserPrefs(NamedTuple):
    preferred_channel_id: int | None
    load_balance_enabled: bool
    default_model: str | None


_DEFAULT_PREFS = UserPrefs(None, True, None)

_user_prefs: dict[str, UserPrefs] = {}


async def load_user_prefs(db: AsyncSession) -> None:
    """Load all user preferences into memory on startup."""
    from app.models.db_models import User

    try:
        result = await db.execute(
            select(User.user_id, User.preferred_channel_id, User.load_balance_enabled, User.default_model)
        )
        for row in result.all():
            _user_prefs[row[0]] = UserPrefs(
                preferred_channel_id=row[1],
                load_balance_enabled=row[2] if row[2] is not None else True,
                default_model=row[3],
            )
    except Exception as e:
        logger.error(f"Failed to load user preferences: {e}")
        raise


def get_user_prefs(user_id: str) -> UserPrefs:
    """Returns UserPrefs(preferred_channel_id, load_balance_enabled, default_model). Default: (None, True, None)."""
    return _user_prefs.get(user_id, _DEFAULT_PREFS)


def set_user_prefs(user_id: str, preferred_channel_id: int | None, load_balance_enabled: bool, default_model: str | None = None) -> None:
    _user_prefs[user_id] = UserPrefs(preferred_channel_id, load_balance_enabled, default_model)


def remove_user_prefs(user_id: str) -> None:
    _user_prefs.pop(user_id, None)
