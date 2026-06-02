"use client";

import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { formatTokens } from "@/lib/utils";
import { TokenDisplay } from "@/components/token-display";
import Link from "next/link";
import {
  Key, Users, ArrowRight,
  AlertTriangle, Zap, Activity, Target,
  Server, Database, BookOpen, BarChart3, FileText, TrendingUp,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

function DashboardChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover/95 backdrop-blur-md border border-border/60 rounded-xl p-3 shadow-2xl">
      <p className="text-xs font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold text-foreground tabular-nums"><TokenDisplay n={entry.value} /></span>
        </div>
      ))}
    </div>
  );
}

function HeroStat({ icon: Icon, label, value, loading, color = "primary", sub }: {
  icon: React.ElementType; label: string; value: React.ReactNode; loading?: boolean;
  color?: string; sub?: React.ReactNode;
}) {
  const colorMap: Record<string, { bg: string; text: string; glow: string }> = {
    primary: { bg: "bg-primary/10", text: "text-primary", glow: "bg-primary/5" },
    success: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", glow: "bg-emerald-500/5" },
    destructive: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", glow: "bg-red-500/5" },
    warning: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", glow: "bg-amber-500/5" },
  };
  const c = colorMap[color] || colorMap.primary;

  return (
    <Card className="group relative overflow-hidden border-border/40 hover:shadow-lg transition-all duration-300">
      <div className={`absolute inset-0 ${c.glow} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      <CardContent className="p-6 relative">
        <div className="flex items-start gap-4 mb-3">
          <div className={`w-12 h-12 rounded-2xl ${c.bg} flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
            <Icon className={`w-6 h-6 ${c.text}`} />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
            {loading ? (
              <div className="h-10 w-24 skeleton-shimmer rounded-lg mt-1" />
            ) : (
              <p className="text-[32px] font-bold text-foreground tracking-tight leading-none mt-1">{value}</p>
            )}
            {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
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
  const [adminStats, setAdminStats] = useState<{ userCount: number; channelCount: number; health: { database: string; status: string } | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [modelStats, setModelStats] = useState<{ model: string; total_tokens: number; total_requests: number }[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [channelsRes, apiKeysRes, summaryRes, dailyRes, modelRes] = await Promise.allSettled([
          apiFetch("/user/channels"),
          apiFetch("/user/api-keys"),
          apiFetch("/user/usage/summary"),
          apiFetch("/user/usage/daily?days=14"),
          apiFetch("/user/usage/by-model?days=30"),
        ]);
        if (channelsRes.status === "fulfilled") setChannelCount(channelsRes.value.total ?? 0);
        if (apiKeysRes.status === "fulfilled") setApiKeyCount(Array.isArray(apiKeysRes.value) ? apiKeysRes.value.length : (apiKeysRes.value.total ?? 0));
        if (summaryRes.status === "fulfilled") setSummary(summaryRes.value);
        if (dailyRes.status === "fulfilled") setDailyStats(dailyRes.value);
        if (modelRes.status === "fulfilled") setModelStats(modelRes.value);

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
      } catch {
        // Expected on initial load
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

      {/* ═══ 今日用量 - Hero Stats ═══ */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-primary" />
          </div>
          今日用量
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <HeroStat
            icon={Activity}
            label="请求数"
            value={summary?.today.requests ?? 0}
            loading={loading}
            color="primary"
            sub={summary?.today.errors ? <span className="text-red-500">{summary.today.errors} 错误</span> : undefined}
          />
          <HeroStat
            icon={Zap}
            label="Token 消耗"
            value={<TokenDisplay n={summary?.today.tokens ?? 0} />}
            loading={loading}
            color="success"
            sub={summary?.today.tokens ? <span><TokenDisplay n={summary.today.prompt} /> 入 · <TokenDisplay n={summary.today.completion} /> 出</span> : undefined}
          />
          <HeroStat
            icon={Target}
            label="成功率"
            value={todaySuccessRate !== null ? `${todaySuccessRate.toFixed(1)}%` : "-"}
            loading={loading}
            color={todaySuccessRate !== null && todaySuccessRate >= 99 ? "success" : todaySuccessRate !== null && todaySuccessRate >= 95 ? "warning" : "destructive"}
            sub={summary?.today.requests ? `${summary.today.requests} 次请求` : undefined}
          />
        </div>
      </div>

      {/* ═══ 7 日汇总 - Compact Stats ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Activity}
          label="7 日请求"
          value={summary?.last_7_days.requests ?? 0}
          loading={loading}
        />
        <StatCard
          icon={TrendingUp}
          label="7 日 Token"
          value={<TokenDisplay n={summary?.last_7_days.tokens ?? 0} />}
          loading={loading}
          color="success"
        />
        <StatCard
          icon={TrendingUp}
          label="30 日 Token"
          value={<TokenDisplay n={summary?.last_30_days.tokens ?? 0} />}
          loading={loading}
          color="warning"
        />
        <StatCard
          icon={Server}
          label="渠道数"
          value={(user?.role === "admin" ? (adminStats?.channelCount ?? channelCount) : channelCount) ?? 0}
          loading={loading || (user?.role === "admin" && !adminStats)}
          href="/main/channels"
        />
      </div>

      {/* ═══ Token Usage Chart ═══ */}
      {chartData.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="w-3.5 h-3.5 text-primary" />
            </div>
            近期用量趋势
          </h3>
          <Card className="border-border/40 overflow-hidden">
            <CardContent className="p-6">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTokens2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} opacity={0.5} />
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
                  <Tooltip content={<DashboardChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="tokens"
                    name="Token"
                    stroke="var(--primary)"
                    strokeWidth={2.5}
                    fill="url(#colorTokens2)"
                    activeDot={{ r: 5, fill: 'var(--primary)', stroke: 'var(--background)', strokeWidth: 3 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ Model Usage Distribution ═══ */}
      {modelStats.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="w-3.5 h-3.5 text-primary" />
            </div>
            模型用量分布（近 30 天）
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/40">
              <CardContent className="p-6">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={modelStats.slice(0, 8)}
                      dataKey="total_tokens"
                      nameKey="model"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {modelStats.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={`oklch(${0.55 + i * 0.04} ${0.15 - i * 0.01} ${155 + i * 30})`} />
                      ))}
                    </Pie>
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover/95 backdrop-blur-md border border-border/60 rounded-xl p-3 shadow-2xl">
                          <p className="text-xs font-semibold text-foreground mb-1">{d.model}</p>
                          <p className="text-xs text-muted-foreground"><TokenDisplay n={d.total_tokens} /> tokens</p>
                          <p className="text-xs text-muted-foreground">{d.total_requests} 次请求</p>
                        </div>
                      );
                    }} />
                    <Legend
                      formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>}
                      iconSize={8}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="border-border/40">
              <CardContent className="p-6">
                <div className="space-y-3">
                  {modelStats.slice(0, 6).map((m, i) => {
                    const totalAll = modelStats.reduce((s, x) => s + x.total_tokens, 0);
                    const pct = totalAll > 0 ? (m.total_tokens / totalAll * 100) : 0;
                    return (
                      <div key={m.model} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-foreground truncate max-w-[180px]">{m.model}</span>
                          <span className="text-muted-foreground tabular-nums">{pct.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: `oklch(${0.55 + i * 0.04} ${0.15 - i * 0.01} ${155 + i * 30})`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ═══ Account + Quick Access ═══ */}
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
          icon={Key}
          label="API Keys"
          value={apiKeyCount ?? 0}
          loading={loading}
          href="/main/api-keys"
        />

        {/* Quick Actions */}
        <Card className="border-border/40">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">快速操作</p>
            <div className="space-y-1.5">
              <Link href="/main/guide" className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <span className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  使用说明
                </span>
                <ArrowRight className="w-3.5 h-3.5 opacity-40" />
              </Link>
              <Link href="/main/api-keys" className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <span className="flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  创建 Key
                </span>
                <ArrowRight className="w-3.5 h-3.5 opacity-40" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══ Admin Stats ═══ */}
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

          {/* Admin Quick Links */}
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
