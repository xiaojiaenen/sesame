"use client";

import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Key, Users, Network,
  Activity, LogOut, ChevronRight, FileText, BarChart3, Server
} from "lucide-react";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { motion } from "motion/react";

const NAV_ITEMS = [
  { name: "仪表盘", href: "/main/dashboard", icon: LayoutDashboard },
  { name: "渠道管理", href: "/main/channels", icon: Server },
  { name: "API Key 管理", href: "/main/api-keys", icon: Key },
  { name: "使用说明", href: "/main/guide", icon: Activity },
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

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const pathname = usePathname();

  if (isLoading) {
    return (
      <div className="min-h-screen flex bg-background">
        <aside className="w-64 bg-card border-r border-border flex flex-col shadow-sm">
          <div className="h-16 flex items-center gap-3 px-5 border-b border-border">
            <img src="/logo.svg" alt="Sesame" className="w-9 h-9" />
            <div>
              <div className="font-bold text-foreground text-sm">Sesame</div>
              <div className="text-[10px] text-muted-foreground -mt-0.5">Gateway Console</div>
            </div>
          </div>
          <div className="flex-1 p-3 space-y-2 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 rounded-xl" />
            ))}
          </div>
        </aside>
        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          <header className="h-16 bg-card/80 border-b border-border" />
          <div className="flex-1 p-8 animate-pulse space-y-6">
            <div className="h-7 w-40 bg-slate-200 rounded-lg" />
            <div className="h-4 w-64 bg-slate-100 rounded-lg" />
            <div className="h-64 bg-slate-100 rounded-xl" />
          </div>
        </main>
      </div>
    );
  }

  const pageTitle = PAGE_TITLES[pathname.split("/").pop() || ""] || "Sesame";

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col shadow-sm">
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-border">
          <img src="/logo.svg" alt="Sesame" className="w-9 h-9" />
          <div>
            <div className="font-bold text-foreground text-sm">Sesame</div>
            <div className="text-[10px] text-muted-foreground -mt-0.5">Gateway Console</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group relative",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                      active
                        ? "bg-white/20"
                        : "bg-slate-100 group-hover:bg-slate-200"
                    )}>
                      <item.icon className="w-4 h-4 transition-transform group-hover:scale-110" />
                    </div>
                    <span className={active ? "font-medium" : ""}>{item.name}</span>
                    {active && (
                      <motion.div
                        layoutId="nav-indicator"
                        className="absolute right-2"
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      >
                        <ChevronRight className="w-4 h-4 text-white/80" />
                      </motion.div>
                    )}
                  </Link>
                </li>
              );
            })}

            {user?.role === "admin" && (
              <>
                <Separator className="my-4" />
                <div className="mb-2 px-3">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">管理后台</span>
                </div>
                {ADMIN_ITEMS.map((item) => {
                  const active = pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                          active
                            ? "bg-white/20"
                            : "bg-slate-100 group-hover:bg-slate-200"
                        )}>
                          <item.icon className="w-4 h-4 transition-transform group-hover:scale-110" />
                        </div>
                        <span className={active ? "font-medium" : ""}>{item.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </>
            )}
          </ul>
        </nav>

        {/* User Info */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-3 px-1">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-semibold text-sm">
              {user?.user_id?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">{user?.user_id}</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                {user?.role === "admin" && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">ADMIN</span>
                )}
                {user?.role === "admin" ? "管理员" : "普通用户"}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full flex items-center gap-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors rounded-xl"
            onClick={logout}
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 bg-card/80 backdrop-blur-sm border-b border-border flex items-center px-8">
          <motion.h1
            key={pageTitle}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12 }}
            className="font-semibold text-foreground text-lg"
          >
            {pageTitle}
          </motion.h1>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="p-8" key={pathname}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
