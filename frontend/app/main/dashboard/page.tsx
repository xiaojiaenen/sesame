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
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
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
  const colorMap: Record<string, { bg: string; text: string }> = {
    primary: { bg: "bg-primary/10", text: "text-primary" },
    success: { bg: "bg-success/10", text: "text-success" },
    destructive: { bg: "bg-destructive/10", text: "text-destructive" },
    warning: { bg: "bg-warning/10", text: "text-warning" },
    "muted-foreground": { bg: "bg-muted", text: "text-muted-foreground" },
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
            {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
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
      {!loading && (channelCount === 0) && (
        <div className="bg-warning/5 border border-warning/20 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-warning-foreground">暂无可用渠道</div>
            <div className="text-xs text-muted-foreground mt-0.5">请先在管理后台创建 API 渠道才能使用代理服务</div>
          </div>
          <Link href="/main/channels">
            <Button size="sm" className="bg-warning hover:bg-warning/80 shrink-0">
              去配置 <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      )}

      {/* User Usage Summary Cards */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          我的用量
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Activity}
            label="今日请求"
            value={summary?.today.requests ?? 0}
            loading={loading}
            color="primary"
            sub={summary?.today.errors ? <span className="text-destructive">{summary.today.errors} 错误</span> : undefined}
          />
          <StatCard
            icon={Zap}
            label="今日 Token"
            value={formatTokens(summary?.today.tokens ?? 0)}
            loading={loading}
            color="success"
            sub={summary?.today.tokens ? <span>{formatTokens(summary.today.prompt)} 输入 / {formatTokens(summary.today.completion)} 输出</span> : undefined}
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
            <BarChart3 className="w-4 h-4 text-primary" />
            近期用量趋势
          </h3>
          <Card className="border-border/50">
            <CardContent className="p-5">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatTokens(v)}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: any, name: any) => [
                      name === 'tokens' ? formatTokens(Number(value)) : value,
                      name === 'tokens' ? 'Token 消耗' : '请求数'
                    ]}
                    labelFormatter={(label) => `日期: ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="tokens"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#colorTokens)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Account + Infrastructure Row */}
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
            <Activity className="w-4 h-4 text-primary" />
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
