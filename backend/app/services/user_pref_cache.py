"""In-memory cache for user preferences — avoids DB query on every request."""

_user_prefs: dict[str, tuple[int | None, bool]] = {}  # user_id -> (preferred_channel_id, load_balance_enabled)


async def load_user_prefs(db) -> None:
    """Load all user preferences into memory on startup."""
    from app.models.db_models import User
    from sqlalchemy import select

    result = await db.execute(select(User.user_id, User.preferred_channel_id, User.load_balance_enabled))
    for row in result.all():
        _user_prefs[row[0]] = (row[1], row[2] if row[2] is not None else True)


def get_user_prefs(user_id: str) -> tuple[int | None, bool]:
    """Returns (preferred_channel_id, load_balance_enabled). Default: (None, True)."""
    return _user_prefs.get(user_id, (None, True))


def set_user_prefs(user_id: str, preferred_channel_id: int | None, load_balance_enabled: bool) -> None:
    _user_prefs[user_id] = (preferred_channel_id, load_balance_enabled)


def remove_user_prefs(user_id: str) -> None:
    _user_prefs.pop(user_id, None)
