from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Index, Integer, String, Text, Float
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.utils import now_beijing


class Base(DeclarativeBase):
    pass


class SessionLog(Base):
    __tablename__ = "session_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    external_model: Mapped[str | None] = mapped_column(String(64))
    model: Mapped[str | None] = mapped_column(String(64))
    stream: Mapped[bool | None] = mapped_column(Boolean)
    status_code: Mapped[int | None] = mapped_column(Integer)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_beijing)

    __table_args__ = (
        Index("ix_session_logs_user_id", "user_id"),
        Index("ix_session_logs_created_at", "created_at"),
        Index("ix_session_logs_external_model", "external_model"),
    )


class ModelMapping(Base):
    __tablename__ = "model_mapping"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    external_model: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    internal_model: Mapped[str] = mapped_column(String(64), nullable=False)
    fallback_models: Mapped[str | None] = mapped_column(Text)  # JSON array of fallback models


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    cookie_encrypted: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        Enum("active", "expired", "revoked", name="session_status"), default="active"
    )
    expire_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_beijing)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, onupdate=now_beijing)

    __table_args__ = (Index("ix_user_sessions_user_status", "user_id", "status"),)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(
        Enum("admin", "user", name="user_role"), default="user"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    preferred_channel_id: Mapped[int | None] = mapped_column(Integer)
    load_balance_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_beijing)


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    key_encrypted: Mapped[str | None] = mapped_column(Text)
    key_prefix: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str | None] = mapped_column(String(64))
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    allowed_models: Mapped[str | None] = mapped_column(Text)
    max_qpm: Mapped[int] = mapped_column(Integer, default=60)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    expire_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_beijing)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (
        Index("ix_api_keys_key_hash", "key_hash"),
        Index("ix_api_keys_user_id", "user_id"),
    )




class Channel(Base):
    """多渠道支持 - 后端 API 渠道"""
    __tablename__ = "channels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    base_url: Mapped[str] = mapped_column(String(256), nullable=False)
    api_key: Mapped[str] = mapped_column(String(256), nullable=False, server_default="")
    auth_type: Mapped[str] = mapped_column(
        Enum("api_key", "cookie", name="channel_auth_type"), default="api_key", server_default="api_key"
    )
    models: Mapped[str | None] = mapped_column(Text)  # JSON array of supported models
    weight: Mapped[int] = mapped_column(Integer, default=1)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(
        Enum("active", "error", "disabled", name="channel_status"), default="active"
    )
    priority: Mapped[int] = mapped_column(Integer, default=0)
    max_qps: Mapped[int] = mapped_column(Integer, default=10)
    last_check: Mapped[datetime | None] = mapped_column(DateTime)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_beijing)

    __table_args__ = (
        Index("ix_channels_enabled", "is_enabled"),
        Index("ix_channels_status", "status"),
    )


class UserChannelCookie(Base):
    """用户为 cookie 类型渠道提交的 Cookie"""
    __tablename__ = "user_channel_cookies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    channel_id: Mapped[int] = mapped_column(Integer, nullable=False)
    cookie_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("active", "expired", name="ucc_status"), default="active"
    )
    expire_at: Mapped[datetime | None] = mapped_column(DateTime)
    # 自动登录凭证
    login_url: Mapped[str | None] = mapped_column(String(512))
    username: Mapped[str | None] = mapped_column(String(128))
    password_encrypted: Mapped[str | None] = mapped_column(Text)
    auto_refresh: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_beijing)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, onupdate=now_beijing)

    __table_args__ = (
        Index("ix_ucc_user_channel", "user_id", "channel_id", unique=True),
    )


class RequestLog(Base):
    """请求日志 - 记录每次 API 调用"""
    __tablename__ = "request_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    key_id: Mapped[int | None] = mapped_column(Integer)
    channel_id: Mapped[int | None] = mapped_column(Integer)
    model: Mapped[str | None] = mapped_column(String(64))  # 外部模型名（客户端发的）
    internal_model: Mapped[str | None] = mapped_column(String(64))  # 后端实际模型名
    tokens_prompt: Mapped[int] = mapped_column(Integer, default=0)
    tokens_completion: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    status_code: Mapped[int | None] = mapped_column(Integer)
    is_stream: Mapped[bool] = mapped_column(Boolean, default=False)
    api_format: Mapped[str | None] = mapped_column(String(16))  # "openai" / "anthropic"
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_beijing)

    __table_args__ = (
        Index("ix_request_logs_user_id", "user_id"),
        Index("ix_request_logs_created_at", "created_at"),
        Index("ix_request_logs_model", "model"),
        Index("ix_request_logs_key_id", "key_id"),
    )


class UsageStats(Base):
    """用量统计 - 按用户/Key/模型/日期聚合"""
    __tablename__ = "usage_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    key_id: Mapped[int | None] = mapped_column(Integer)
    model: Mapped[str | None] = mapped_column(String(64))
    date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    total_requests: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    avg_latency_ms: Mapped[float] = mapped_column(Float, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        Index("ix_usage_stats_user_date", "user_id", "date"),
        Index("ix_usage_stats_model_date", "model", "date"),
        Index("ix_usage_stats_key_date", "key_id", "date"),
        Index("uq_usage_stats_daily", "user_id", "key_id", "model", "date", unique=True),
    )
