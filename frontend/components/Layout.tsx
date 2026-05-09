"use client";

import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Key, Users, Network,
  Activity, LogOut, FileText, BarChart3, Server, BookOpen
} from "lucide-react";
import { Button } from "./ui/button";

const NAV_ITEMS = [
  { name: "仪表盘", href: "/main/dashboard", icon: LayoutDashboard },
  { name: "渠道管理", href: "/main/channels", icon: Server },
  { name: "API Key 管理", href: "/main/api-keys", icon: Key },
  { name: "使用说明", href: "/main/guide", icon: BookOpen },
];

const ADMIN_ITEMS = [
  { name: "用户管理", href: "/main/admin/users", icon: Users },
  { name: "Session", href: "/main/admin/sessions", icon: Network },
  { name: "全局 API Keys", href: "/main/admin/api-keys", icon: Key },
  { name: "渠道管理", href: "/main/admin/channels", icon: Server },
  { name: "请求日志", href: "/main/admin/logs", icon: FileText },
  { name: "用量统计", href: "/main/admin/usage", icon: BarChart3 },
  { name: "实时监控", href: "/main/admin/monitor", icon: Activity },
];

const PAGE_TITLES: Record<string, string> = {
  dashboard: "仪表盘",
  channels: "渠道管理",
  "api-keys": "API Key 管理",
  guide: "使用说明",
  users: "用户管理",
  sessions: "Session 管理",
  logs: "请求日志",
  usage: "用量统计",
  monitor: "实时监控",
};

function NavItem({ item, active }: { item: typeof NAV_ITEMS[0]; active: boolean }) {
  return (
    <li>
      <Link
        href={item.href}
        className={cn(
          "group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150 relative",
          active
            ? "text-primary font-medium bg-primary/5"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        {active && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
        )}
        <item.icon className={cn(
          "w-4 h-4 shrink-0 transition-colors",
          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
        )} />
        <span>{item.name}</span>
      </Link>
    </li>
  );
}

function SidebarSkeleton() {
  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 bg-card border-r border-border flex flex-col">
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-border">
          <div className="w-7 h-7 rounded-lg bg-muted animate-pulse" />
          <div className="space-y-1">
            <div className="h-3.5 w-16 bg-muted rounded animate-pulse" />
            <div className="h-2.5 w-24 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="flex-1 p-3 space-y-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </aside>
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-14 bg-card border-b border-border" />
        <div className="flex-1 p-8 space-y-4">
          <div className="h-6 w-32 bg-muted rounded animate-pulse" />
          <div className="h-4 w-48 bg-muted rounded animate-pulse" />
          <div className="h-48 bg-muted rounded-xl animate-pulse" />
        </div>
      </main>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const pathname = usePathname();

  if (isLoading) {
    return <SidebarSkeleton />;
  }

  const pageTitle = PAGE_TITLES[pathname.split("/").pop() || ""] || "Sesame";

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar — 256px */}
      <aside className="w-64 bg-card border-r border-border flex flex-col shrink-0">
        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-border">
          <img src="/logo.svg" alt="Sesame" className="w-7 h-7" />
          <div className="leading-none">
            <div className="font-bold text-sm text-foreground tracking-tight">Sesame</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Gateway</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5 scrollbar-gutter-stable">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <NavItem key={item.href} item={item} active={pathname.startsWith(item.href)} />
            ))}

            {user?.role === "admin" && (
              <>
                <li className="my-3 mx-1">
                  <div className="h-px bg-border" />
                </li>
                <li className="mb-1.5 px-3">
                  <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                    管理后台
                  </span>
                </li>
                {ADMIN_ITEMS.map((item) => (
                  <NavItem key={item.href} item={item} active={pathname.startsWith(item.href)} />
                ))}
              </>
            )}
          </ul>
        </nav>

        {/* User */}
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
              {user?.user_id?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate leading-tight">
                {user?.user_id}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {user?.role === "admin" ? "管理员" : "用户"}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
              onClick={logout}
              title="退出登录"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <header className="h-14 bg-card/80 backdrop-blur-sm border-b border-border flex items-center px-8 shrink-0">
          <h1 className="font-semibold text-foreground text-base tracking-tight">
            {pageTitle}
          </h1>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="p-8 max-w-[1440px]" key={pathname}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
