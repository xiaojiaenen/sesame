from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    enterprise_ai_url: str = "https://agents.gree.com"
    encryption_key: str = ""
    database_url: str = "sqlite+aiosqlite:///./data/sesame.db"
    default_cookie_expire_days: int = 7
    validate_cookie_on_submit: bool = True
    validate_cookie_url: str = ""  # Override URL for cookie validation, empty = use enterprise_ai_url
    # Auto-init admin user
    admin_user: str = "admin"
    admin_password: str = ""  # Must be set via env var
    # SSO auto-login config
    sso_login_url: str = ""  # e.g. https://sso.example.com/cas/login
    sso_username_field: str = "username"
    sso_password_field: str = "password"
    sso_extra_fields: str = ""  # comma-separated key=value pairs
    version: str = "1.1.0"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
