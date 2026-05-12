"use client";

import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Key, Users, ArrowRight, ArrowUpRight, ArrowDownRight,
  AlertTriangle, Zap, Activity, Target,
  Server, Database, BookOpen, BarChart3, FileText, TrendingUp, Clock
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function StatCard({ icon: Icon, label, value, loading, color = "primary", href, sub }: {
  icon: React.ElementType; label: string; value: React.ReactNode; loading?: boolean;
  color?: string; href?: string; sub?: React.ReactNode;
}) {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    primary: { bg: "bg-primary/10", text: "text-primary", border: "border-primary/20" },
    success: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/20" },
    destructive: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-500/20" },
    warning: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/20" },
    "muted-foreground": { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" },
  };
  const c = colorMap[color] || colorMap.primary;

  const content = (
    <Card className={`hover:shadow-lg transition-all duration-300 h-full group cursor-pointer border-border/40 hover:${c.border} relative overflow-hidden`}>
      <div className={`absolute top-0 right-0 w-24 h-24 ${c.bg} rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-y-1/2 translate-x-1/2`} />
      <CardContent className="p-5 relative">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>
            {loading ? (
              <div className="h-9 w-20 skeleton-shimmer rounded-lg" />
            ) : (
              <p className="text-[28px] font-bold text-foreground tracking-tight leading-none">{value}</p>
            )}
            {sub && <div className="text-xs text-muted-foreground pt-0.5">{sub}</div>}
          </div>
          <div className={`w-11 h-11 rounded-2xl ${c.bg} flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
            <Icon className={`w-5 h-5 ${c.text}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) return <Link href={href} className="block">{content}</Link>;
  return content;
}

interface SummaryData {
  today: { requests: number; tokens: number; prompt: number; completion: number; errors: number };
  last_7_days: { requests: number; tokens: number; prompt: number; completion: number; errors: number };
  last_30_days: { requests: number; tokens: number; prompt: number; completion: number; errors: number };
}

interface DailyStats {
  date: string;
  total_requests: number;
  total_tokens: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  avg_latency_ms: number;
  error_count: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [channelCount, setChannelCount] = useState<number | null>(null);
  const [apiKeyCount, setApiKeyCount] = useState<number | null>(null);
  const [adminStats, setAdminStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [channelsRes, apiKeysRes, summaryRes, dailyRes] = await Promise.allSettled([
          apiFetch("/user/channels"),
          apiFetch("/user/api-keys"),
          apiFetch("/user/usage/summary"),
          apiFetch("/user/usage/daily?days=14"),
        ]);
        if (channelsRes.status === "fulfilled") setChannelCount(channelsRes.value.total ?? 0);
        if (apiKeysRes.status === "fulfilled") setApiKeyCount(Array.isArray(apiKeysRes.value) ? apiKeysRes.value.length : (apiKeysRes.value.total ?? 0));
        if (summaryRes.status === "fulfilled") setSummary(summaryRes.value);
        if (dailyRes.status === "fulfilled") setDailyStats(dailyRes.value);

        if (user?.role === "admin") {
          const [usersRes, channelsRes, healthRes] = await Promise.allSettled([
            apiFetch("/admin/users"),
            apiFetch("/admin/channels"),
            apiFetch("/health")
          ]);
          setAdminStats({
            userCount: usersRes.status === "fulfilled" ? usersRes.value.total ?? 0 : 0,
            channelCount: channelsRes.status === "fulfilled" ? channelsRes.value.total ?? 0 : 0,
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

  const todaySuccessRate = summary?.today
    ? summary.today.requests > 0
      ? ((summary.today.requests - summary.today.errors) / summary.today.requests * 100)
      : 100
    : null;

  const chartData = dailyStats.map(d => ({
    date: d.date.slice(5),
    tokens: d.total_tokens,
    requests: d.total_requests,
  }));

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover/95 backdrop-blur-md border border-border/60 rounded-xl p-3 shadow-2xl">
        <p className="text-xs font-semibold text-foreground mb-1.5">{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-semibold text-foreground tabular-nums">{formatTokens(entry.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-transparent to-violet-500/5 p-6 -mx-1">
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-violet-500/5 rounded-full blur-3xl" />
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
      {!loading && (channelCount === 0) && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-amber-700 dark:text-amber-400">暂无可用渠道</div>
            <div className="text-xs text-muted-foreground mt-0.5">请先在管理后台创建 API 渠道才能使用代理服务</div>
          </div>
          <Link href="/main/channels">
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 shrink-0">
              去配置 <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      )}

      {/* User Usage Summary Cards */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-primary" />
          </div>
          我的用量
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Activity}
            label="今日请求"
            value={summary?.today.requests ?? 0}
            loading={loading}
            color="primary"
            sub={summary?.today.errors ? <span className="text-red-500">{summary.today.errors} 错误</span> : undefined}
          />
          <StatCard
            icon={Zap}
            label="今日 Token"
            value={formatTokens(summary?.today.tokens ?? 0)}
            loading={loading}
            color="success"
            sub={summary?.today.tokens ? <span>{formatTokens(summary.today.prompt)} 入 / {formatTokens(summary.today.completion)} 出</span> : undefined}
          />
          <StatCard
            icon={TrendingUp}
            label="7 日 Token"
            value={formatTokens(summary?.last_7_days.tokens ?? 0)}
            loading={loading}
            color="warning"
            sub={summary?.last_7_days.requests ? <span>{summary.last_7_days.requests} 次请求</span> : undefined}
          />
          <StatCard
            icon={Target}
            label="今日成功率"
            value={todaySuccessRate !== null ? `${todaySuccessRate.toFixed(1)}%` : "-"}
            loading={loading}
            color={todaySuccessRate !== null && todaySuccessRate >= 99 ? "success" : todaySuccessRate !== null && todaySuccessRate >= 95 ? "warning" : "destructive"}
          />
        </div>
      </div>

      {/* Token Usage Chart */}
      {chartData.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="w-3.5 h-3.5 text-primary" />
            </div>
            近期用量趋势
          </h3>
          <Card className="border-border/40 overflow-hidden">
            <CardContent className="p-5 pt-4">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatTokens(v)}
                    width={50}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="tokens"
                    name="Token"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    fill="url(#colorTokens)"
                    activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Account + Infrastructure Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* User Card */}
        <Card className="md:col-span-2 border-border/40 overflow-hidden relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardContent className="p-5 flex items-center gap-4 relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-violet-500/10 flex items-center justify-center shrink-0 shadow-lg shadow-primary/10">
              <span className="text-xl font-bold text-primary">
                {user?.user_id?.[0]?.toUpperCase() || "U"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">当前用户</div>
              <div className="text-lg font-bold text-foreground truncate mt-0.5">{user?.user_id}</div>
            </div>
            <Badge variant={user?.role === "admin" ? "default" : "secondary"} className="shrink-0 px-3 py-1">
              {user?.role === "admin" ? "管理员" : "普通用户"}
            </Badge>
          </CardContent>
        </Card>

        <StatCard
          icon={Server}
          label="渠道数"
          value={(user?.role === "admin" ? (adminStats?.channelCount ?? channelCount) : channelCount) ?? 0}
          loading={loading || (user?.role === "admin" && !adminStats)}
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
            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
              <Activity className="w-3.5 h-3.5 text-primary" />
            </div>
            系统概览
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Users} label="用户数" value={adminStats?.userCount ?? 0} loading={!adminStats} />
            <StatCard icon={Server} label="渠道数" value={adminStats?.channelCount ?? 0} loading={!adminStats} />
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
              <Card className="hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 cursor-pointer group h-full border-border/40 hover:border-primary/20">
                <CardContent className="p-4 flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 group-hover:scale-105 transition-all duration-300">
                    <item.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">{item.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
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
                <Card className="hover:bg-accent/50 hover:shadow-md transition-all duration-200 cursor-pointer border-border/40 group">
                  <CardContent className="p-3.5 flex items-center gap-2.5">
                    <item.icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-sm text-foreground font-medium">{item.label}</span>
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
