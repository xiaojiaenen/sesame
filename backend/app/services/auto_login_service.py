"""自动登录服务 - 基于 Playwright 浏览器自动化"""

import asyncio
from typing import Optional

from playwright.async_api import async_playwright


async def login_with_credentials(
    login_url: str,
    username: str,
    password: str,
) -> tuple[bool, str, Optional[str]]:
    """
    使用 Playwright 打开浏览器，自动填写账号密码登录，提取 Cookie。

    Returns:
        (success, message, cookie_string)
    """
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()

            await page.goto(login_url, wait_until="networkidle", timeout=30000)

            # 自动识别用户名输入框
            username_input = await _find_username_input(page)
            if not username_input:
                await browser.close()
                return False, "未找到用户名输入框", None

            # 自动识别密码输入框
            password_input = await page.query_selector('input[type="password"]')
            if not password_input:
                await browser.close()
                return False, "未找到密码输入框", None

            # 填写表单
            await username_input.fill(username)
            await password_input.fill(password)

            # 提交：优先找提交按钮，否则回车
            submit_btn = await _find_submit_button(page)
            if submit_btn:
                await submit_btn.click()
            else:
                await password_input.press("Enter")

            # 等待导航完成
            await page.wait_for_load_state("networkidle", timeout=15000)
            await asyncio.sleep(1)  # 等待 JS 设置 cookie

            # 提取所有 cookie
            cookies = await context.cookies()
            await browser.close()

            if not cookies:
                return False, "登录成功但未获取到 Cookie", None

            cookie_str = "; ".join(f"{c['name']}={c['value']}" for c in cookies)
            return True, "登录成功", cookie_str

    except Exception as e:
        return False, f"登录失败: {str(e)}", None


async def _find_username_input(page):
    """智能识别用户名输入框"""
    # 优先级从高到低
    selectors = [
        'input[name="username"]',
        'input[name="account"]',
        'input[name="user"]',
        'input[name="email"]',
        'input[name="loginId"]',
        'input[name="userId"]',
        'input[type="email"]',
        'input[type="text"][autocomplete="username"]',
        'input[type="tel"]',
    ]
    for sel in selectors:
        el = await page.query_selector(sel)
        if el and await el.is_visible():
            return el

    # 兜底：密码框前面的第一个可见 text/email/tel input
    password = await page.query_selector('input[type="password"]')
    if password:
        all_inputs = await page.query_selector_all(
            'input[type="text"], input[type="email"], input[type="tel"], input:not([type])'
        )
        for inp in all_inputs:
            if await inp.is_visible():
                bbox = await inp.bounding_box()
                pwd_box = await password.bounding_box()
                if bbox and pwd_box and bbox["y"] < pwd_box["y"]:
                    return inp

    return None


async def _find_submit_button(page):
    """智能识别登录按钮"""
    selectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("登录")',
        'button:has-text("Login")',
        'button:has-text("Sign in")',
        'button:has-text("提交")',
    ]
    for sel in selectors:
        el = await page.query_selector(sel)
        if el and await el.is_visible():
            return el
    return None
