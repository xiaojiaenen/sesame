-- Sesame Gateway - MySQL Schema
-- For production use, replace SQLite with MySQL

CREATE TABLE IF NOT EXISTS session_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    external_model VARCHAR(64),
    model VARCHAR(64),
    stream TINYINT(1),
    status_code INT,
    duration_ms INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_session_logs_user_id (user_id),
    INDEX ix_session_logs_created_at (created_at),
    INDEX ix_session_logs_external_model (external_model)
);

CREATE TABLE IF NOT EXISTS model_mapping (
    id INT AUTO_INCREMENT PRIMARY KEY,
    external_model VARCHAR(64) UNIQUE NOT NULL,
    internal_model VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    cookie_encrypted TEXT,
    status ENUM('active', 'expired', 'revoked') DEFAULT 'active',
    expire_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,
    INDEX ix_user_sessions_user_status (user_id, status)
);

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(128) NOT NULL,
    role ENUM('admin', 'user') DEFAULT 'user',
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_keys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    key_hash VARCHAR(128) UNIQUE NOT NULL,
    key_prefix VARCHAR(12) NOT NULL,
    name VARCHAR(64),
    user_id VARCHAR(64) NOT NULL,
    allowed_models TEXT,
    max_qpm INT DEFAULT 60,
    is_active BOOLEAN DEFAULT TRUE,
    expire_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME,
    INDEX ix_api_keys_key_hash (key_hash),
    INDEX ix_api_keys_user_id (user_id)
);

CREATE TABLE IF NOT EXISTS rate_limit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    key_id INT NOT NULL,
    minute_ts INT NOT NULL,
    request_count INT DEFAULT 1,
    UNIQUE INDEX ix_rate_limit_key_minute (key_id, minute_ts)
);

CREATE TABLE IF NOT EXISTS proxy_routes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    path VARCHAR(128) UNIQUE NOT NULL,
    backend_path VARCHAR(256) NOT NULL,
    method VARCHAR(10) DEFAULT 'POST',
    is_streamable BOOLEAN DEFAULT FALSE,
    is_enabled BOOLEAN DEFAULT TRUE,
    description VARCHAR(128),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
