"use client";

import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { motion } from "motion/react";
import {
  Key, Cookie, Users, Route, Activity, ArrowRight,
  AlertTriangle, CheckCircle2, XCircle, Clock, Zap, TrendingUp,
  Server, Database
} from "lucide-react";

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
      {/* Welcome Section */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }} 
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            欢迎回来，<span className="text-primary">{user?.user_id}</span>
          </h2>
          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            {new Date().toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long'
            })}
          </p>
        </div>
        {user?.role === "admin" && (
          <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
            管理员
          </Badge>
        )}
      </motion.div>

      {/* Alert Banner */}
      {!loading && !cookieOk && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-amber-800">Cookie 未配置或已失效</div>
            <div className="text-sm text-amber-600 mt-0.5">请先提交企业 AI Cookie 才能使用代理服务</div>
          </div>
          <Link href="/main/cookie">
            <Button className="bg-amber-500 hover:bg-amber-600">
              去配置 <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </motion.div>
      )}

      {/* Quick Stats */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {/* User Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-0 shadow-sm hover-lift">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <img src="/logo.svg" alt="Sesame" className="w-14 h-14" />
                <div>
                  <div className="text-sm text-muted-foreground">当前用户</div>
                  <div className="text-xl font-bold text-foreground mt-0.5">{user?.user_id}</div>
                  <Badge variant="secondary" className="mt-2 text-[10px]">
                    {user?.role === "admin" ? "管理员" : "普通用户"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Cookie Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-0 shadow-sm hover-lift">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                  cookieOk
                    ? "bg-emerald-100 text-emerald-600"
                    : "bg-slate-100 text-slate-500"
                }`}>
                  <Cookie className="w-7 h-7" />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-muted-foreground">Cookie 状态</div>
                  <div className="flex items-center gap-2 mt-1">
                    {loading ? (
                      <div className="h-7 w-24 skeleton-shimmer rounded-lg" />
                    ) : cookieOk ? (
                      <motion.div
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        className="flex items-center gap-2"
                      >
                        <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        </div>
                        <span className="font-semibold text-emerald-700">正常运行</span>
                      </motion.div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
                          <XCircle className="w-4 h-4 text-slate-400" />
                        </div>
                        <span className="font-semibold text-slate-500">未配置</span>
                      </div>
                    )}
                  </div>
                  {cookieStatus?.expire_at && (
                    <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      过期: {new Date(cookieStatus.expire_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <Link href="/main/cookie">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* API Key Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-0 shadow-sm hover-lift">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Key className="w-7 h-7 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-muted-foreground">API Key</div>
                  {loading ? (
                    <div className="h-7 w-20 skeleton-shimmer rounded-lg mt-1" />
                  ) : (
                    <div className="text-xl font-bold text-foreground mt-0.5">
                      {apiKeyCount ?? 0} <span className="text-sm font-normal text-muted-foreground">个</span>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    管理您的 API 密钥
                  </div>
                </div>
                <Link href="/main/api-keys">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Admin Stats */}
      {user?.role === "admin" && adminStats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground">系统概览</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-0 shadow-sm hover-lift">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">用户数</div>
                    <div className="text-2xl font-bold text-foreground">{adminStats.userCount ?? 0}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm hover-lift">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Route className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">代理路由</div>
                    <div className="text-2xl font-bold text-foreground">{adminStats.routeCount ?? 0}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm hover-lift">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Database className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">数据库</div>
                    <Badge
                      variant={adminStats.health?.database === "ok" ? "default" : "destructive"}
                      className="mt-1"
                    >
                      {adminStats.health?.database === "ok" ? "正常" : "异常"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm hover-lift">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    adminStats.health?.status === "healthy"
                      ? "bg-emerald-100"
                      : "bg-red-100"
                  }`}>
                    <Server className={`w-5 h-5 ${
                      adminStats.health?.status === "healthy"
                        ? "text-emerald-600"
                        : "text-red-600"
                    }`} />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">服务状态</div>
                    <div className="flex items-center gap-2 mt-1">
                      {loading ? (
                        <div className="h-6 w-16 skeleton-shimmer rounded" />
                      ) : (
                        <>
                          <div className={`w-2 h-2 rounded-full ${
                            adminStats.health?.status === "healthy"
                              ? "bg-emerald-500 animate-pulse"
                              : "bg-red-500"
                          }`} />
                          <span className="text-sm font-medium">
                            {adminStats.health?.status === "healthy" ? "健康" : "异常"}
                          </span>
                          <span className="text-xs text-muted-foreground">v{adminStats.health?.version || "?"}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      )}

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">快速操作</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/main/cookie">
            <Card className="border-0 shadow-sm hover-lift cursor-pointer group">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Cookie className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="font-medium text-foreground">管理 Cookie</div>
                  <div className="text-xs text-muted-foreground mt-0.5">提交或更新认证凭证</div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/main/api-keys">
            <Card className="border-0 shadow-sm hover-lift cursor-pointer group">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Key className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="font-medium text-foreground">API Key</div>
                  <div className="text-xs text-muted-foreground mt-0.5">创建和管理密钥</div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/main/guide">
            <Card className="border-0 shadow-sm hover-lift cursor-pointer group">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Activity className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="font-medium text-foreground">使用说明</div>
                  <div className="text-xs text-muted-foreground mt-0.5">查看配置指南</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
