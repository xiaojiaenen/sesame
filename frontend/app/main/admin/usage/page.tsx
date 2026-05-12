"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { PageHeader } from "@/components/page-header";
import { BarChart3, TrendingUp, Users, Cpu, Clock, Zap, Target, Gauge, ArrowUpRight, ArrowDownRight } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, RadialBarChart, RadialBar
} from "recharts";

interface HourlyStats {
  hour: string;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  requests: number;
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

interface ModelStats {
  model: string;
  total_requests: number;
  total_tokens: number;
  avg_latency_ms: number;
}

interface UserStats {
  user_id: string;
  total_requests: number;
  total_tokens: number;
  avg_latency_ms: number;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

const COLORS = [
  '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
];

export default function UsagePage() {
  const [hourlyStats, setHourlyStats] = useState<HourlyStats[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [modelStats, setModelStats] = useState<ModelStats[]>([]);
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const hourlyDays = days <= 1 ? 1 : days <= 7 ? days : 7;
      const [hourly, daily, model, user] = await Promise.all([
        apiFetch(`/admin/usage/hourly?days=${hourlyDays}`),
        apiFetch(`/admin/usage/daily?days=${days}`),
        apiFetch(`/admin/usage/by-model?days=${days}`),
        apiFetch(`/admin/usage/by-user?days=${days}`),
      ]);
      setHourlyStats(hourly);
      setDailyStats(daily);
      setModelStats(model);
      setUserStats(user);
    } catch (e: any) {
      toast.error(e.message || "加载统计失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, [days]);

  const totalRequests = dailyStats.reduce((sum, d) => sum + d.total_requests, 0);
  const totalTokens = dailyStats.reduce((sum, d) => sum + d.total_tokens, 0);
  const totalPrompt = dailyStats.reduce((sum, d) => sum + d.total_prompt_tokens, 0);
  const totalCompletion = dailyStats.reduce((sum, d) => sum + d.total_completion_tokens, 0);
  const totalErrors = dailyStats.reduce((sum, d) => sum + d.error_count, 0);
  const avgLatency = dailyStats.length > 0
    ? Math.round(dailyStats.reduce((sum, d) => sum + d.avg_latency_ms, 0) / dailyStats.length)
    : 0;
  const successRate = totalRequests > 0 ? ((totalRequests - totalErrors) / totalRequests * 100) : 100;
  const avgTokensPerReq = totalRequests > 0 ? Math.round(totalTokens / totalRequests) : 0;

  // 今日 vs 昨日
  const today = dailyStats[dailyStats.length - 1];
  const yesterday = dailyStats[dailyStats.length - 2];
  const todayRequests = today?.total_requests ?? 0;
  const yesterdayRequests = yesterday?.total_requests ?? 0;
  const requestTrend = yesterdayRequests > 0 ? ((todayRequests - yesterdayRequests) / yesterdayRequests * 100) : 0;

  const hourlyChartData = hourlyStats.map(h => ({
    hour: h.hour.slice(5),
    tokens: Math.round(h.total_tokens / 1000),
    prompt: Math.round(h.prompt_tokens / 1000),
    completion: Math.round(h.completion_tokens / 1000),
    requests: h.requests,
  }));

  const dailyChartData = dailyStats.map(d => ({
    date: d.date.slice(5),
    requests: d.total_requests,
    tokens: Math.round(d.total_tokens / 1000),
    prompt: Math.round(d.total_prompt_tokens / 1000),
    completion: Math.round(d.total_completion_tokens / 1000),
    latency: Math.round(d.avg_latency_ms),
    errors: d.error_count,
  })).reverse();

  const modelChartData = modelStats.slice(0, 8).map(m => ({
    name: m.model.length > 16 ? m.model.slice(0, 16) + '…' : m.model,
    fullName: m.model,
    tokens: m.total_tokens,
    requests: m.total_requests,
    avgLatency: Math.round(m.avg_latency_ms),
  }));

  const userChartData = userStats.slice(0, 8).map(u => ({
    name: u.user_id,
    tokens: u.total_tokens,
    requests: u.total_requests,
    avgLatency: Math.round(u.avg_latency_ms),
  }));

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover/95 backdrop-blur-sm border border-border/60 rounded-xl p-3 shadow-xl">
        <p className="text-xs font-semibold text-foreground mb-1.5">{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-medium text-foreground">{entry.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  };

  const SummaryCard = ({ icon: Icon, label, value, loading: l, color = "primary", sub }: {
    icon: React.ElementType; label: string; value: string; loading: boolean; color?: string; sub?: React.ReactNode;
  }) => {
    const colorMap: Record<string, { bg: string; text: string }> = {
      primary: { bg: "bg-primary/10", text: "text-primary" },
      success: { bg: "bg-success/10", text: "text-success" },
      destructive: { bg: "bg-destructive/10", text: "text-destructive" },
      warning: { bg: "bg-warning/10", text: "text-warning" },
    };
    const c = colorMap[color] || colorMap.primary;
    return (
      <Card className="border-border/50 hover:shadow-md hover:shadow-primary/5 transition-all duration-200">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center`}>
              <Icon className={`w-5 h-5 ${c.text}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
              {l ? <Skeleton className="h-7 w-16 mt-0.5" /> : (
                <div className="text-xl font-bold text-foreground mt-0.5">{value}</div>
              )}
              {sub && <div className="mt-1">{sub}</div>}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="用量统计"
        description="查看 API 使用情况和 Token 消耗"
        action={
          <div className="flex gap-1.5 p-1 bg-muted rounded-lg">
            {[7, 30, 90].map(d => (
              <Button
                key={d}
                variant={days === d ? "default" : "ghost"}
                size="sm"
                onClick={() => setDays(d)}
                className="h-7 px-3 text-xs"
              >
                {d} 天
              </Button>
            ))}
          </div>
        }
      />

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <motion.div {...fadeInUp}>
          <SummaryCard
            icon={TrendingUp}
            label="总请求数"
            value={totalRequests.toLocaleString()}
            loading={loading}
            sub={
              !loading && requestTrend !== 0 ? (
                <span className={`flex items-center gap-0.5 text-xs ${requestTrend > 0 ? 'text-success' : 'text-destructive'}`}>
                  {requestTrend > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(requestTrend).toFixed(0)}% 较昨日
                </span>
              ) : undefined
            }
          />
        </motion.div>
        <motion.div {...fadeInUp}>
          <SummaryCard icon={BarChart3} label="总 Token" value={formatTokens(totalTokens)} loading={loading} />
        </motion.div>
        <motion.div {...fadeInUp}>
          <SummaryCard icon={Target} label="成功率" value={`${successRate.toFixed(1)}%`} loading={loading} color={successRate >= 99 ? "success" : successRate >= 95 ? "warning" : "destructive"} />
        </motion.div>
        <motion.div {...fadeInUp}>
          <SummaryCard icon={Gauge} label="平均请求 Token" value={formatTokens(avgTokensPerReq)} loading={loading} color="warning" />
        </motion.div>
      </div>

      {/* Hourly Token Chart */}
      <motion.div {...fadeInUp}>
        <Card className="border-border/50 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              按小时统计 Token
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-72 w-full" /> : hourlyChartData.length === 0 ? (
              <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">暂无数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={288}>
                <BarChart data={hourlyChartData}>
                  <defs>
                    <linearGradient id="gradPrompt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.4} />
                    </linearGradient>
                    <linearGradient id="gradCompletion" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="prompt" name="Prompt (K)" fill="url(#gradPrompt)" stackId="tokens" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="completion" name="Completion (K)" fill="url(#gradCompletion)" stackId="tokens" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Requests Area Chart */}
        <motion.div {...fadeInUp}>
          <Card className="border-border/50 overflow-hidden h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">每日请求量</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-64 w-full" /> : dailyChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">暂无数据</div>
              ) : (
                <ResponsiveContainer width="100%" height={256}>
                  <AreaChart data={dailyChartData}>
                    <defs>
                      <linearGradient id="gradRequests" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="requests" name="请求数" stroke="#10b981" strokeWidth={2} fill="url(#gradRequests)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Token Line Chart */}
        <motion.div {...fadeInUp}>
          <Card className="border-border/50 overflow-hidden h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">每日 Token 消耗</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-64 w-full" /> : dailyChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">暂无数据</div>
              ) : (
                <ResponsiveContainer width="100%" height={256}>
                  <LineChart data={dailyChartData}>
                    <defs>
                      <linearGradient id="gradTokens" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line type="monotone" dataKey="tokens" name="Token (K)" stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Prompt vs Completion 比例 */}
        <motion.div {...fadeInUp}>
          <Card className="border-border/50 overflow-hidden h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Token 分布
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-48 w-full" /> : totalTokens === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">暂无数据</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-center">
                    <ResponsiveContainer width={160} height={160}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Prompt', value: totalPrompt },
                            { name: 'Completion', value: totalCompletion },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={70}
                          paddingAngle={4}
                          dataKey="value"
                          stroke="none"
                        >
                          <Cell fill="#3b82f6" />
                          <Cell fill="#10b981" />
                        </Pie>
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="bg-popover/95 backdrop-blur-sm border border-border/60 rounded-xl p-3 shadow-xl">
                              <p className="text-xs font-semibold">{payload[0].name}</p>
                              <p className="text-xs text-muted-foreground">{formatTokens(payload[0].value as number)}</p>
                            </div>
                          );
                        }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]" />Prompt</span>
                      <span className="font-medium">{formatTokens(totalPrompt)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#10b981]" />Completion</span>
                      <span className="font-medium">{formatTokens(totalCompletion)}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Model Pie */}
        <motion.div {...fadeInUp}>
          <Card className="border-border/50 overflow-hidden h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" />
                按模型统计
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-48 w-full" /> : modelChartData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">暂无数据</div>
              ) : (
                <div className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={modelChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="tokens"
                        nameKey="name"
                        stroke="none"
                      >
                        {modelChartData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-popover/95 backdrop-blur-sm border border-border/60 rounded-xl p-3 shadow-xl">
                            <p className="text-xs font-semibold mb-1">{d.fullName}</p>
                            <p className="text-xs text-muted-foreground">Token: {formatTokens(d.tokens)}</p>
                            <p className="text-xs text-muted-foreground">请求: {d.requests}</p>
                            <p className="text-xs text-muted-foreground">延迟: {d.avgLatency}ms</p>
                          </div>
                        );
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
                    {modelChartData.slice(0, 5).map((entry, i) => (
                      <div key={entry.name} className="flex items-center gap-1 text-[11px]">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-muted-foreground truncate max-w-[80px]">{entry.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* User Bar */}
        <motion.div {...fadeInUp}>
          <Card className="border-border/50 overflow-hidden h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                按用户统计
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-48 w-full" /> : userChartData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">暂无数据</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={userChartData.slice(0, 5)} layout="vertical" barSize={16}>
                    <defs>
                      <linearGradient id="gradUser" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#a78bfa" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="name" type="category" width={60} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover/95 backdrop-blur-sm border border-border/60 rounded-xl p-3 shadow-xl">
                          <p className="text-xs font-semibold mb-1">{d.name}</p>
                          <p className="text-xs text-muted-foreground">Token: {formatTokens(d.tokens)}</p>
                          <p className="text-xs text-muted-foreground">请求: {d.requests}</p>
                          <p className="text-xs text-muted-foreground">延迟: {d.avgLatency}ms</p>
                        </div>
                      );
                    }} />
                    <Bar dataKey="tokens" name="Token" fill="url(#gradUser)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Latency + Errors */}
      <motion.div {...fadeInUp}>
        <Card className="border-border/50 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">延迟 & 错误趋势</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-72 w-full" /> : dailyChartData.length === 0 ? (
              <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">暂无数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={288}>
                <LineChart data={dailyChartData}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="left" type="monotone" dataKey="latency" name="延迟 (ms)" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }} />
                  <Line yAxisId="right" type="monotone" dataKey="errors" name="错误数" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#ef4444', stroke: '#fff', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
