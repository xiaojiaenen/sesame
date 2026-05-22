"""In-memory cache for user preferences — avoids DB query on every request."""

_user_prefs: dict[str, tuple[int | None, bool, str | None]] = {}  # user_id -> (preferred_channel_id, load_balance, default_model)


async def load_user_prefs(db) -> None:
    """Load all user preferences into memory on startup."""
    from app.models.db_models import User
    from sqlalchemy import select

    result = await db.execute(select(User.user_id, User.preferred_channel_id, User.load_balance_enabled, User.default_model))
    for row in result.all():
        _user_prefs[row[0]] = (row[1], row[2] if row[2] is not None else True, row[3])


def get_user_prefs(user_id: str) -> tuple[int | None, bool, str | None]:
    """Returns (preferred_channel_id, load_balance_enabled, default_model). Default: (None, True, None)."""
    return _user_prefs.get(user_id, (None, True, None))


def set_user_prefs(user_id: str, preferred_channel_id: int | None, load_balance_enabled: bool, default_model: str | None = None) -> None:
    _user_prefs[user_id] = (preferred_channel_id, load_balance_enabled, default_model)


def remove_user_prefs(user_id: str) -> None:
    _user_prefs.pop(user_id, None)
