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
import { BarChart3, TrendingUp, Users, Cpu, Clock } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from "recharts";

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

const COLORS = [
  'oklch(0.55 0.16 155)',   // chart-1 / primary
  'oklch(0.55 0.14 250)',   // chart-2 / blue
  'oklch(0.55 0.18 300)',   // chart-4 / violet
  'oklch(0.65 0.15 75)',    // chart-3 / warning
  'oklch(0.577 0.245 27)',  // destructive
  'oklch(0.60 0.20 340)',   // pink
  'oklch(0.60 0.12 200)',   // cyan
  'oklch(0.60 0.16 130)',   // lime
];

export default function UsagePage() {
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [modelStats, setModelStats] = useState<ModelStats[]>([]);
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [daily, model, user] = await Promise.all([
        apiFetch(`/admin/usage/daily?days=${days}`),
        apiFetch(`/admin/usage/by-model?days=${days}`),
        apiFetch(`/admin/usage/by-user?days=${days}`),
      ]);
      setDailyStats(daily);
      setModelStats(model);
      setUserStats(user);
    } catch (e: any) {
      toast.error(e.message || "加载统计失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [days]);

  // Calculate totals
  const totalRequests = dailyStats.reduce((sum, d) => sum + d.total_requests, 0);
  const totalTokens = dailyStats.reduce((sum, d) => sum + d.total_tokens, 0);
  const totalErrors = dailyStats.reduce((sum, d) => sum + d.error_count, 0);
  const avgLatency = dailyStats.length > 0
    ? Math.round(dailyStats.reduce((sum, d) => sum + d.avg_latency_ms, 0) / dailyStats.length)
    : 0;

  // Prepare chart data
  const dailyChartData = dailyStats.map(d => ({
    date: d.date.slice(5),
    requests: d.total_requests,
    tokens: Math.round(d.total_tokens / 1000),
    latency: Math.round(d.avg_latency_ms),
    errors: d.error_count,
  })).reverse();

  const modelChartData = modelStats.slice(0, 8).map(m => ({
    name: m.model.length > 20 ? m.model.slice(0, 20) + '...' : m.model,
    fullName: m.model,
    tokens: m.total_tokens,
    requests: m.total_requests,
  }));

  const userChartData = userStats.slice(0, 8).map(u => ({
    name: u.user_id,
    tokens: u.total_tokens,
    requests: u.total_requests,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm text-muted-foreground">
              {entry.name}: {entry.value.toLocaleString()}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="用量统计"
        description="查看 API 使用情况和 Token 消耗"
        action={
          <div className="flex gap-2">
            <Button variant={days === 7 ? "default" : "outline"} size="sm" onClick={() => setDays(7)}>7 天</Button>
            <Button variant={days === 30 ? "default" : "outline"} size="sm" onClick={() => setDays(30)}>30 天</Button>
            <Button variant={days === 90 ? "default" : "outline"} size="sm" onClick={() => setDays(90)}>90 天</Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <motion.div {...fadeInUp}>
          <Card className="ring-1 ring-border/40 shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">总请求数</div>
                  {loading ? <Skeleton className="h-8 w-16" /> : (
                    <div className="text-2xl font-bold text-foreground">{totalRequests.toLocaleString()}</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fadeInUp}>
          <Card className="ring-1 ring-border/40 shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">总 Token 消耗</div>
                  {loading ? <Skeleton className="h-8 w-16" /> : (
                    <div className="text-2xl font-bold text-foreground">{(totalTokens / 1000).toFixed(1)}K</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fadeInUp}>
          <Card className="ring-1 ring-border/40 shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">平均延迟</div>
                  {loading ? <Skeleton className="h-8 w-16" /> : (
                    <div className="text-2xl font-bold text-foreground">{avgLatency}ms</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fadeInUp}>
          <Card className="ring-1 ring-border/40 shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">错误数</div>
                  {loading ? <Skeleton className="h-8 w-16" /> : (
                    <div className="text-2xl font-bold text-foreground">{totalErrors}</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Daily Requests Chart */}
      <motion.div {...fadeInUp}>
        <Card className="ring-1 ring-border/40 shadow-xs">
          <CardHeader>
            <CardTitle className="text-lg">每日请求量</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : dailyChartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">暂无数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailyChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fill: 'var(--muted-foreground)' }} />
                  <YAxis className="text-xs" tick={{ fill: 'var(--muted-foreground)' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="requests" name="请求数" fill="oklch(0.62 0.17 155)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Token Consumption Chart */}
      <motion.div {...fadeInUp}>
        <Card className="ring-1 ring-border/40 shadow-xs">
          <CardHeader>
            <CardTitle className="text-lg">每日 Token 消耗 (K)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : dailyChartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">暂无数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fill: 'var(--muted-foreground)' }} />
                  <YAxis className="text-xs" tick={{ fill: 'var(--muted-foreground)' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey="tokens" name="Token 消耗 (K)" stroke="oklch(0.62 0.17 155)" strokeWidth={2} dot={{ fill: 'oklch(0.62 0.17 155)' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Model Stats Pie Chart */}
        <motion.div {...fadeInUp}>
          <Card className="ring-1 ring-border/40 shadow-xs">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Cpu className="w-5 h-5" />
                按模型统计
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : modelChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">暂无数据</div>
              ) : (
                <div className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={modelChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="tokens"
                        nameKey="name"
                      >
                        {modelChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                              <p className="text-sm font-medium">{data.fullName}</p>
                              <p className="text-sm text-muted-foreground">Token: {(data.tokens / 1000).toFixed(1)}K</p>
                              <p className="text-sm text-muted-foreground">请求: {data.requests}</p>
                            </div>
                          );
                        }
                        return null;
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-2 justify-center mt-4">
                    {modelChartData.map((entry, index) => (
                      <div key={entry.name} className="flex items-center gap-1 text-xs">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span className="text-muted-foreground">{entry.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* User Stats Bar Chart */}
        <motion.div {...fadeInUp}>
          <Card className="ring-1 ring-border/40 shadow-xs">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5" />
                按用户统计
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : userChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">暂无数据</div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={userChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" className="text-xs" tick={{ fill: 'var(--muted-foreground)' }} />
                    <YAxis dataKey="name" type="category" width={80} className="text-xs" tick={{ fill: 'var(--muted-foreground)' }} />
                    <Tooltip content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                            <p className="text-sm font-medium">{data.name}</p>
                            <p className="text-sm text-muted-foreground">Token: {(data.tokens / 1000).toFixed(1)}K</p>
                            <p className="text-sm text-muted-foreground">请求: {data.requests}</p>
                          </div>
                        );
                      }
                      return null;
                    }} />
                    <Bar dataKey="tokens" name="Token 消耗" fill="oklch(0.55 0.14 250)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Latency Chart */}
      <motion.div {...fadeInUp}>
        <Card className="ring-1 ring-border/40 shadow-xs">
          <CardHeader>
            <CardTitle className="text-lg">每日平均延迟 (ms)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : dailyChartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">暂无数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fill: 'var(--muted-foreground)' }} />
                  <YAxis className="text-xs" tick={{ fill: 'var(--muted-foreground)' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="latency" name="延迟 (ms)" stroke="oklch(0.65 0.15 75)" strokeWidth={2} dot={{ fill: 'oklch(0.65 0.15 75)' }} />
                  <Line type="monotone" dataKey="errors" name="错误数" stroke="oklch(0.577 0.245 27)" strokeWidth={2} dot={{ fill: 'oklch(0.577 0.245 27)' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
