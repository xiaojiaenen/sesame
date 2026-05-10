# Sesame Gateway 生产部署教程

## 架构概览

```
                    ┌──────────────────────────┐
                    │     Nginx (:80)           │
                    │  /v1/* /user/* /admin/*   │
                    │       → Backend           │
                    │  /*  → Next.js            │
                    └──────────┬───────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼────────┐  ┌───▼──────────┐  ┌──▼────────┐
     │  Backend :8000  │  │ Next.js :3000│  │ External  │
     │  Python/FastAPI │  │ (internal)   │  │ Services  │
     └────────┬────────┘  └──────────────┘  └───────────┘
              │
    ┌─────────┼─────────┐
    │         │         │
┌───▼───┐ ┌──▼──┐ ┌────▼────┐
│ MySQL │ │Redis│ │ AI      │
│ (外部) │ │(外部)│ │ Backend │
└───────┘ └─────┘ └─────────┘
```

## 前置条件

- **Docker 20.10+** 和 **Docker Compose 2.0+**
- **MySQL 8.0**（已部署可访问）
- **Redis 7.0**（已部署可访问）
- 确保 MySQL/Redis 与部署服务器网络互通

## 1. 初始化 MySQL 数据库

在后端首次启动时会自动建表，但需要先创建数据库和用户：

```sql
CREATE DATABASE IF NOT EXISTS sesame CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'sesame'@'%' IDENTIFIED BY '你的密码';
GRANT ALL PRIVILEGES ON sesame.* TO 'sesame'@'%';
FLUSH PRIVILEGES;
```

## 2. 配置环境变量

编辑 `deploy/.env`，修改为你的实际地址和密码：

```env
# MySQL
MYSQL_HOST=10.0.0.1
MYSQL_PORT=3306
MYSQL_USER=sesame
MYSQL_PASSWORD=你的实际密码
MYSQL_DATABASE=sesame

# Redis（按需选择 single 或 cluster 模式）
REDIS_MODE=single
REDIS_HOST=10.0.0.2
REDIS_PORT=6379
REDIS_PASSWORD=你的Redis密码   # 没有密码则留空
REDIS_PREFIX=sesame:

# 加密密钥（务必生成你自己的）
# openssl rand -base64 32
ENCRYPTION_KEY=生成你自己的密钥

# 管理员初始账号
ADMIN_USER=admin
ADMIN_PASSWORD=设置一个强密码

# 要代理的 AI 后端地址
ENTERPRISE_AI_URL=https://your-ai-backend.com
```

> **Redis 集群模式**：如果使用 Redis Cluster，改为 `REDIS_MODE=cluster` 并设置 `REDIS_CLUSTER_NODES`。

## 3. 构建并启动

```bash
cd deploy
docker compose up -d --build
```

首次构建约 3-5 分钟（npm ci + next build），后续启动几秒内完成。

## 4. 验证服务

```bash
# 后端健康检查
curl http://localhost:8000/health

# 前端页面
curl -I http://localhost/
```

浏览器访问 `http://你的服务器IP` 进入管理界面。

## 5. 查看日志

```bash
# 全部服务
docker compose logs -f

# 只看后端
docker compose logs -f backend

# 只看前端
docker compose logs -f frontend
```

## 6. 常用运维命令

```bash
# 重新构建（代码有更新时）
docker compose up -d --build

# 仅重启后端
docker compose restart backend

# 停止
docker compose down

# 清理重建
docker compose down && docker compose up -d --build
```

## 7. 生产建议

- **HTTPS**：在 Nginx 前加一层反向代理（如 Caddy/Traefik/Nginx）处理 SSL 终止
- **MySQL**：启用 SSL 连接，配置 `MYSQL_HOST` 的 `ssl_ca` 参数
- **Redis**：生产环境务必设置密码
- **密钥管理**：`ENCRYPTION_KEY` 和 `ADMIN_PASSWORD` 不要硬编码，建议通过 secrets 管理
- **日志轮转**：配置 Docker 日志 driver 限制日志大小
- **资源限制**：在 docker-compose.yml 中为每个 service 添加 `deploy.resources`

## Docker Compose 配置说明

只包含 `backend` 和 `frontend` 两个自定义服务，MySQL 和 Redis 使用外部部署的服务，通过 `.env` 中的 `MYSQL_HOST` / `REDIS_HOST` 连接。
