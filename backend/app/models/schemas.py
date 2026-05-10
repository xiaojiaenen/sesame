from pydantic import BaseModel, Field


# --- Chat Completion ---

class ChatMessage(BaseModel):
    role: str
    content: str | list | None = None
    name: str | None = None
    tool_calls: list | None = None
    tool_call_id: str | None = None


class ChatCompletionRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    stream: bool = False
    temperature: float | None = None
    top_p: float | None = None
    max_tokens: int | None = None
    stop: str | list[str] | None = None


class ChatCompletionChoice(BaseModel):
    index: int = 0
    message: ChatMessage
    finish_reason: str | None = "stop"


class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: list[ChatCompletionChoice]
    usage: Usage = Usage()


# --- Admin ---

class SessionSubmitRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    cookie: str = Field(..., min_length=1)
    expire_days: int | None = None
    model_list: str | None = None


class SessionInfo(BaseModel):
    user_id: str
    status: str
    model_list: str | None = None
    expire_at: str | None = None
    last_used_at: str | None = None


class ModelMappingRequest(BaseModel):
    external_model: str = Field(..., min_length=1, max_length=64)
    internal_model: str = Field(..., min_length=1, max_length=64)
    fallback_models: list[str] | None = None


class ModelMappingInfo(BaseModel):
    external_model: str
    internal_model: str
    fallback_models: list[str] | None = None


# --- Health ---

class HealthResponse(BaseModel):
    status: str
    version: str
    database: str
    cache: str


# --- Auth ---

class UserCreate(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=4)
    role: str = Field(default="user", pattern="^(admin|user)$")


class UserLogin(BaseModel):
    user_id: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserInfo(BaseModel):
    user_id: str
    role: str
    is_active: bool
    session_status: str | None = None


# --- API Key ---

class ApiKeyCreate(BaseModel):
    name: str | None = None
    allowed_models: list[str] | None = None
    max_qpm: int = Field(default=60, ge=1, le=10000)
    expire_days: int | None = None


class ApiKeyResponse(BaseModel):
    id: int
    key_prefix: str
    name: str | None
    allowed_models: list[str] | None
    max_qpm: int
    is_active: bool
    expire_at: str | None
    created_at: str | None
    last_used_at: str | None


class ApiKeyCreated(ApiKeyResponse):
    api_key: str  # Only returned on creation


class ApiKeyUpdate(BaseModel):
    name: str | None = None
    allowed_models: list[str] | None = None
    max_qpm: int | None = Field(default=None, ge=1, le=10000)
    is_active: bool | None = None


# --- Cookie ---

class CookieSubmit(BaseModel):
    cookie: str = Field(..., min_length=1)
    expire_days: int | None = None


class CookieInfo(BaseModel):
    status: str
    expire_at: str | None
    cookie_preview: str  # Masked


