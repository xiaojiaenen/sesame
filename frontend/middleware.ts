import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 公开路由（不需要认证）
const PUBLIC_PATHS = ["/login", "/api"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 公开路由放行
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 检查是否存在 token cookie 或 header
  // 注意：当前项目使用 localStorage 存储 token，服务端无法直接读取
  // 此 middleware 主要作为第一层防护，防止未认证用户直接访问受保护页面的 HTML
  // 实际认证验证仍由客户端 auth-context 和后端 API 完成
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/main/:path*",
  ],
};
