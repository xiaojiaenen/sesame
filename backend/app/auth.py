import logging
from dataclasses import dataclass

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.services.apikey_service import validate_key
from app.services.auth_service import decode_access_token

logger = logging.getLogger("sesame.auth")

bearer_scheme = HTTPBearer(auto_error=False)

DEFAULT_MAX_QPM = 60


@dataclass
class AuthUser:
    user_id: str
    role: str = "user"
    key_id: int | None = None
    max_qpm: int = DEFAULT_MAX_QPM


async def get_api_key_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthUser:
    """Authenticate via API Key (Bearer sk-sesame-xxx)."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    token = credentials.credentials

    if token.startswith("sk-sesame-"):
        try:
            key_info = await validate_key(token)
        except Exception as e:
            logger.error(f"API key validation failed (possible Redis issue): {e}")
            raise HTTPException(status_code=503, detail="Authentication service unavailable")
        if not key_info:
            raise HTTPException(status_code=401, detail="Invalid or expired API key")

        return AuthUser(
            user_id=key_info["user_id"],
            role=key_info.get("role", "user"),
            key_id=key_info["key_id"],
            max_qpm=key_info.get("max_qpm", DEFAULT_MAX_QPM),
        )

    raise HTTPException(status_code=401, detail="Invalid token format")


async def get_jwt_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthUser:
    """Authenticate via JWT (for user portal)."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired JWT")

    return AuthUser(user_id=payload["user_id"], role=payload.get("role", "user"))


async def get_admin_user(
    auth: AuthUser = Depends(get_jwt_user),
) -> AuthUser:
    """Require admin role."""
    if auth.role != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return auth
