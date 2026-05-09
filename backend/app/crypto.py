import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import settings

_key: bytes | None = None


def _get_key() -> bytes:
    global _key
    if _key is None:
        if not settings.encryption_key:
            raise RuntimeError("ENCRYPTION_KEY is not set")
        _key = base64.b64decode(settings.encryption_key)
        if len(_key) != 32:
            raise RuntimeError("ENCRYPTION_KEY must be 32 bytes (base64 encoded)")
    return _key


def encrypt(plaintext: str) -> str:
    key = _get_key()
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ct).decode()


def decrypt(ciphertext: str) -> str:
    key = _get_key()
    data = base64.b64decode(ciphertext)
    nonce, ct = data[:12], data[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ct, None).decode()
