"use client";

import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Key, Users, Route, ArrowRight,
  AlertTriangle, CheckCircle2, XCircle,
  Server, Database, BookOpen, BarChart3, FileText, Activity
} from "lucide-react";

function StatCard({ icon: Icon, label, value, loading, color = "primary", href }: {
  icon: React.ElementType; label: string; value: React.ReactNode; loading?: boolean;
  color?: string; href?: string;
}) {
  const colorMap: Record<string, { bg: string; text: string; glow: string }> = {
    primary: { bg: "bg-primary/10", text: "text-primary", glow: "shadow-primary/10" },
    success: { bg: "bg-success/10", text: "text-success", glow: "shadow-success/10" },
    destructive: { bg: "bg-destructive/10", text: "text-destructive", glow: "shadow-destructive/10" },
    warning: { bg: "bg-warning/10", text: "text-warning", glow: "shadow-warning/10" },
    "muted-foreground": { bg: "bg-muted", text: "text-muted-foreground", glow: "" },
  };
  const c = colorMap[color] || colorMap.primary;

  const content = (
    <Card className="hover:shadow-md hover:shadow-primary/5 transition-all duration-200 h-full group cursor-pointer border-border/50">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            {loading ? (
              <div className="h-8 w-16 skeleton-shimmer rounded-md" />
            ) : (
              <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
            )}
          </div>
          <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
            <Icon className={`w-5 h-5 ${c.text}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) return <Link href={href} className="block">{content}</Link>;
  return content;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [cookieStatus, setCookieStatus] = useState<any>(null);
  const [apiKeyCount, setApiKeyCount] = useState<number | null>(null);
  const [adminStats, setAdminStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [cookieRes, apiKeysRes] = await Promise.allSettled([
          apiFetch("/user/cookie"),
          apiFetch("/user/api-keys")
        ]);
        if (cookieRes.status === "fulfilled") setCookieStatus(cookieRes.value);
        if (apiKeysRes.status === "fulfilled") setApiKeyCount(apiKeysRes.value.length);

        if (user?.role === "admin") {
          const [usersRes, routesRes, healthRes] = await Promise.allSettled([
            apiFetch("/admin/users"),
            apiFetch("/admin/proxy-routes"),
            apiFetch("/health")
          ]);
          setAdminStats({
            userCount: usersRes.status === "fulfilled" ? usersRes.value.length : 0,
            routeCount: routesRes.status === "fulfilled" ? routesRes.value.length : 0,
            health: healthRes.status === "fulfilled" ? healthRes.value : null
          });
        }
      } catch (error) {
        // Ignoring expected errors
      } finally {
        setLoading(false);
      }
    };
    if (user) fetchDashboardData();
  }, [user]);

  const cookieOk = cookieStatus?.status === "active";

  return (
    <div className="space-y-8">
      {/* Header with gradient accent */}
      <div className="relative">
        <div className="absolute -top-4 -left-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl" />
        <div className="relative">
          <h2 className="text-2xl font-bold text-foreground tracking-tight">
            欢迎回来，{user?.user_id}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date().toLocaleDateString('zh-CN', {
              year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
            })}
          </p>
        </div>
      </div>

      {/* Alert Banner */}
      {!loading && !cookieOk && (
        <div className="bg-warning/5 border border-warning/20 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-warning-foreground">Cookie 未配置或已失效</div>
            <div className="text-xs text-muted-foreground mt-0.5">请先提交企业 AI Cookie 才能使用代理服务</div>
          </div>
          <Link href="/main/channels">
            <Button size="sm" className="bg-warning hover:bg-warning/80 shrink-0">
              去配置 <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      )}

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* User Card — spans 2 cols */}
        <Card className="md:col-span-2 border-border/50 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <CardContent className="p-5 flex items-center gap-4 relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0 shadow-lg shadow-primary/10">
              <span className="text-xl font-bold text-primary">
                {user?.user_id?.[0]?.toUpperCase() || "U"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">当前用户</div>
              <div className="text-lg font-semibold text-foreground truncate mt-0.5">{user?.user_id}</div>
            </div>
            <Badge variant={user?.role === "admin" ? "default" : "secondary"} className="shrink-0">
              {user?.role === "admin" ? "管理员" : "普通用户"}
            </Badge>
          </CardContent>
        </Card>

        <StatCard
          icon={cookieOk ? CheckCircle2 : XCircle}
          label="Cookie 状态"
          value={loading ? "..." : cookieOk ? "正常" : "未配置"}
          loading={loading}
          color={cookieOk ? "success" : "muted-foreground"}
          href="/main/channels"
        />

        <StatCard
          icon={Key}
          label="API Keys"
          value={apiKeyCount ?? 0}
          loading={loading}
          href="/main/api-keys"
        />
      </div>

      {/* Admin Stats */}
      {user?.role === "admin" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            系统概览
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Users} label="用户数" value={adminStats?.userCount ?? 0} loading={!adminStats} />
            <StatCard icon={Route} label="代理路由" value={adminStats?.routeCount ?? 0} loading={!adminStats} />
            <StatCard icon={Database} label="数据库" value={adminStats?.health?.database === "ok" ? "正常" : "异常"} loading={!adminStats} color={adminStats?.health?.database === "ok" ? "success" : "destructive"} />
            <StatCard icon={Server} label="服务状态" value={adminStats?.health?.status === "healthy" ? "健康" : "异常"} loading={!adminStats} color={adminStats?.health?.status === "healthy" ? "success" : "destructive"} />
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">快速操作</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: Server, label: "渠道管理", desc: "查看和配置后端渠道", href: "/main/channels" },
            { icon: Key, label: "API Key", desc: "创建和管理访问密钥", href: "/main/api-keys" },
            { icon: BookOpen, label: "使用说明", desc: "查看配置指南", href: "/main/guide" },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className="hover:shadow-md hover:shadow-primary/5 transition-all duration-200 cursor-pointer group h-full border-border/50">
                <CardContent className="p-4 flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                    <item.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{item.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground/60 transition-colors" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Admin Quick Links */}
      {user?.role === "admin" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">管理后台</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Users, label: "用户管理", href: "/main/admin/users" },
              { icon: BarChart3, label: "用量统计", href: "/main/admin/usage" },
              { icon: Activity, label: "实时监控", href: "/main/admin/monitor" },
              { icon: FileText, label: "请求日志", href: "/main/admin/logs" },
            ].map((item) => (
              <Link key={item.href} href={item.href}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer border-border/50">
                  <CardContent className="p-3.5 flex items-center gap-2.5">
                    <item.icon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">{item.label}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
