from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # MySQL
    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3306
    mysql_user: str = "sesame"
    mysql_password: str = ""
    mysql_database: str = "sesame"

    # Redis
    redis_mode: str = "single"  # single | cluster
    redis_host: str = "127.0.0.1"
    redis_port: int = 6379
    redis_password: str = ""
    redis_db: int = 0
    redis_prefix: str = "sesame:"
    redis_cluster_nodes: str = ""  # cluster mode: "host1:6379,host2:6379,host3:6379"

    # Backend
    enterprise_ai_url: str = "https://agents.gree.com"
    encryption_key: str = ""
    database_url: str = ""  # deprecated, use mysql_* above
    default_cookie_expire_days: int = 7
    validate_cookie_on_submit: bool = True
    validate_cookie_url: str = ""

    # Admin
    admin_user: str = "admin"
    admin_password: str = ""

    # SSO
    sso_login_url: str = ""
    sso_username_field: str = "username"
    sso_password_field: str = "password"
    sso_extra_fields: str = ""

    version: str = "1.1.0"

    @property
    def db_url(self) -> str:
        if self.database_url:
            return self.database_url
        pwd = f":{self.mysql_password}" if self.mysql_password else ""
        return f"mysql+asyncmy://{self.mysql_user}{pwd}@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}"

    @property
    def redis_url(self) -> str:
        pwd = f":{self.redis_password}@" if self.redis_password else ""
        return f"redis://{pwd}{self.redis_host}:{self.redis_port}/{self.redis_db}"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
