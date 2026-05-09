"""自动登录服务 - 支持多种登录方式"""

import json
import httpx
from typing import Optional

from app.config import settings


async def login_with_credentials(
    login_url: str,
    username: str,
    password: str,
    login_type: str = "form"
) -> tuple[bool, str, Optional[str]]:
    """
    使用账号密码自动登录获取 Cookie

    Args:
        login_url: 登录接口 URL
        username: 用户名
        password: 密码
        login_type: 登录类型 (form/api/oauth)

    Returns:
        (success, message, cookie)
    """
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            if login_type == "api":
                return await _login_api(client, login_url, username, password)
            elif login_type == "form":
                return await _login_form(client, login_url, username, password)
            else:
                return False, f"不支持的登录类型: {login_type}", None
    except Exception as e:
        return False, f"登录失败: {str(e)}", None


async def _login_api(
    client: httpx.AsyncClient,
    login_url: str,
    username: str,
    password: str
) -> tuple[bool, str, Optional[str]]:
    """API 方式登录"""
    resp = await client.post(
        login_url,
        json={"username": username, "password": password},
        headers={"Content-Type": "application/json"}
    )

    if resp.status_code == 200:
        # 从响应中提取 Cookie
        cookies = resp.cookies
        if cookies:
            cookie_str = "; ".join([f"{k}={v}" for k, v in cookies.items()])
            return True, "登录成功", cookie_str

        # 尝试从响应体中提取 token
        try:
            data = resp.json()
            token = data.get("token") or data.get("access_token")
            if token:
                return True, "登录成功", f"Bearer {token}"
        except Exception:
            pass

        return False, "登录成功但未获取到 Cookie", None
    else:
        return False, f"登录失败: HTTP {resp.status_code}", None


async def _login_form(
    client: httpx.AsyncClient,
    login_url: str,
    username: str,
    password: str
) -> tuple[bool, str, Optional[str]]:
    """表单方式登录"""
    # 先获取登录页面（可能需要 CSRF token）
    page_resp = await client.get(login_url)

    # 提取 CSRF token（如果有的话）
    csrf_token = None
    if "csrf" in page_resp.text.lower():
        import re
        match = re.search(r'name="csrf[_-]token"[^>]*value="([^"]*)"', page_resp.text)
        if match:
            csrf_token = match.group(1)

    # 构建表单数据
    form_data = {"username": username, "password": password}
    if csrf_token:
        form_data["csrf_token"] = csrf_token

    # 提交登录表单
    resp = await client.post(login_url, data=form_data)

    if resp.status_code in (200, 302):
        cookies = resp.cookies
        if cookies:
            cookie_str = "; ".join([f"{k}={v}" for k, v in cookies.items()])
            return True, "登录成功", cookie_str

    return False, f"登录失败: HTTP {resp.status_code}", None


async def refresh_cookie(
    refresh_url: str,
    current_cookie: str
) -> tuple[bool, str, Optional[str]]:
    """
    刷新 Cookie

    Args:
        refresh_url: 刷新接口 URL
        current_cookie: 当前 Cookie

    Returns:
        (success, message, new_cookie)
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                refresh_url,
                headers={"Cookie": current_cookie}
            )

            if resp.status_code == 200:
                cookies = resp.cookies
                if cookies:
                    cookie_str = "; ".join([f"{k}={v}" for k, v in cookies.items()])
                    return True, "刷新成功", cookie_str

            return False, f"刷新失败: HTTP {resp.status_code}", None
    except Exception as e:
        return False, f"刷新失败: {str(e)}", None
