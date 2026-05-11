"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fadeInUp } from "@/lib/animations";
import { motion } from "motion/react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Server, Key, Cookie, CheckCircle2, XCircle, Clock,
  Trash2, Send, RefreshCw, Info, AlertTriangle
} from "lucide-react";

interface ChannelItem {
  id: number;
  name: string;
  base_url: string;
  auth_type: "api_key" | "cookie";
  models: string | null;
  status: string;
  user_cookie_status?: "active" | "expired" | "none";
  cookie_expire_at?: string | null;
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 用户偏好
  const [preferredChannelId, setPreferredChannelId] = useState<number | null>(null);
  const [loadBalanceEnabled, setLoadBalanceEnabled] = useState(true);

  // Cookie dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogChannel, setDialogChannel] = useState<ChannelItem | null>(null);
  const [cookieVal, setCookieVal] = useState("");
  const expireDays = 7;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cookieDetail, setCookieDetail] = useState<any>(null);
  const [loginMode, setLoginMode] = useState<"manual" | "auto">("manual");
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const [data, prefs] = await Promise.all([
        apiFetch("/user/channels"),
        apiFetch("/user/preferences"),
      ]);
      setChannels(data.channels || data);
      setPreferredChannelId(prefs.preferred_channel_id);
      setLoadBalanceEnabled(prefs.load_balance_enabled);
    } catch (e: any) {
      toast.error(e.message || "加载渠道失败");
    } finally {
      setLoading(false);
    }
  };

  const updatePreference = async (updates: { preferred_channel_id?: number | null; load_balance_enabled?: boolean }) => {
    try {
      const params = new URLSearchParams();
      if (updates.preferred_channel_id !== undefined) {
        params.append("preferred_channel_id", String(updates.preferred_channel_id ?? ""));
      }
      if (updates.load_balance_enabled !== undefined) {
        params.append("load_balance_enabled", String(updates.load_balance_enabled));
      }
      await apiFetch(`/user/preferences?${params}`, { method: "PUT" });
      toast.success("偏好已更新");
    } catch (e: any) {
      toast.error(e.message || "更新失败");
    }
  };

  const handleSelectChannel = (channelId: number) => {
    setPreferredChannelId(channelId);
    updatePreference({ preferred_channel_id: channelId });
  };

  const handleToggleLoadBalance = (enabled: boolean) => {
    setLoadBalanceEnabled(enabled);
    updatePreference({ load_balance_enabled: enabled });
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const parseModels = (models: string | null): string[] => {
    if (!models) return [];
    try {
      const parsed = JSON.parse(models);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === "object" && parsed !== null) return Object.keys(parsed);
      return [];
    } catch {
      return [];
    }
  };

  const openCookieDialog = async (ch: ChannelItem) => {
    setDialogChannel(ch);
    setCookieVal("");
    setCookieDetail(null);
    setDialogOpen(true);
    // Fetch existing cookie detail
    try {
      const detail = await apiFetch(`/user/channels/${ch.id}/cookie`);
      setCookieDetail(detail);
    } catch {
      setCookieDetail(null);
    }
  };

  const handleSubmitCookie = async () => {
    if (!dialogChannel) return;
    if (!cookieVal.trim()) {
      toast.error("请输入 Cookie");
      return;
    }
    setIsSubmitting(true);
    try {
      await apiFetch(`/user/channels/${dialogChannel.id}/cookie`, {
        method: "POST",
        body: JSON.stringify({
          cookie: cookieVal,
        }),
      });
      toast.success("Cookie 提交成功");
      setCookieVal("");
      setDialogOpen(false);
      fetchChannels();
    } catch (e: any) {
      toast.error(e.message || "提交失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAutoLogin = async () => {
    if (!dialogChannel) return;
    if (!loginUser.trim() || !loginPass.trim()) {
      toast.error("请填写用户名和密码");
      return;
    }
    setIsSubmitting(true);
    try {
      await apiFetch(`/user/channels/${dialogChannel.id}/cookie/auto-login`, {
        method: "POST",
        body: JSON.stringify({
          username: loginUser,
          password: loginPass,
          auto_refresh: autoRefresh,
        }),
      });
      toast.success("自动登录成功，Cookie 已更新");
      setDialogOpen(false);
      fetchChannels();
    } catch (e: any) {
      toast.error(e.message || "自动登录失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCookie = async () => {
    if (!dialogChannel) return;
    try {
      await apiFetch(`/user/channels/${dialogChannel.id}/cookie`, { method: "DELETE" });
      toast.success("Cookie 已删除");
      setDeleteDialogOpen(false);
      setDialogOpen(false);
      fetchChannels();
    } catch (e: any) {
      toast.error(e.message || "删除失败");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-success/10 text-success hover:bg-success/10">正常</Badge>;
      case "error":
        return <Badge variant="destructive">异常</Badge>;
      default:
        return <Badge variant="secondary">禁用</Badge>;
    }
  };

  const getCookieStatusBadge = (status?: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-success/10 text-success hover:bg-success/10">已配置</Badge>;
      case "expired":
        return <Badge variant="destructive">已过期</Badge>;
      default:
        return <Badge variant="secondary">未配置</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="渠道管理"
        description="查看可用的后端渠道，配置 Cookie 类型渠道"
        action={
          <Button variant="outline" size="sm" onClick={fetchChannels}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
        }
      />

      {/* 负载均衡和渠道选择 */}
      <motion.div {...fadeInUp}>
        <Card className="ring-1 ring-border/40 shadow-xs">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Switch
                checked={loadBalanceEnabled}
                onCheckedChange={handleToggleLoadBalance}
              />
              <Label className="text-sm">负载均衡</Label>
              <span className="text-xs text-muted-foreground">
                {loadBalanceEnabled ? "按权重自动分配请求" : "指定单一渠道"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              开启后系统会根据各渠道权重自动分配请求，实现流量负载均衡和故障转移。关闭后所有请求将发送到您指定的渠道。
            </p>
            {!loadBalanceEnabled && (
              <div className="pt-1">
                <p className="text-xs font-medium text-foreground mb-2">选择渠道：</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {channels.filter(c => c.status === "active").map(c => {
                    const isSelected = preferredChannelId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectChannel(c.id)}
                        className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all duration-150 ${
                          isSelected
                            ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                            : "border-border/60 hover:border-border hover:bg-accent/50"
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                        }`}>
                          {c.auth_type === "cookie" ? (
                            <Cookie className="w-4 h-4" />
                          ) : (
                            <Key className="w-4 h-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium truncate ${isSelected ? "text-primary" : "text-foreground"}`}>
                            {c.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {c.base_url}
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="ring-1 ring-border/40 shadow-xs">
              <CardContent className="p-6 space-y-3">
                <div className="h-6 w-32 skeleton-shimmer rounded-lg" />
                <div className="h-4 w-48 skeleton-shimmer rounded-lg" />
                <div className="h-4 w-24 skeleton-shimmer rounded-lg" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : channels.length === 0 ? (
        <Card className="ring-1 ring-border/40 shadow-xs">
          <CardContent className="p-0">
            <EmptyState
              icon={<Server className="w-8 h-8 text-muted-foreground" />}
              title="暂无可用渠道"
              description="管理员尚未配置渠道"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((ch, i) => {
            const models = parseModels(ch.models);
            return (
              <motion.div
                key={ch.id}
                {...fadeInUp}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="ring-1 ring-border/40 shadow-xs hover:shadow-md transition-shadow h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        ch.auth_type === "cookie"
                          ? "bg-warning/10 text-warning"
                          : "bg-primary/10 text-primary"
                      }`}>
                        {ch.auth_type === "cookie" ? (
                          <Cookie className="w-5 h-5" />
                        ) : (
                          <Key className="w-5 h-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{ch.name}</CardTitle>
                        <CardDescription className="text-xs">
                          {ch.auth_type === "cookie" ? "Cookie 认证" : "API Key 认证"}
                        </CardDescription>
                      </div>
                      {getStatusBadge(ch.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-xs text-muted-foreground font-mono truncate" title={ch.base_url}>
                      {ch.base_url}
                    </div>

                    {models.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {models.slice(0, 3).map(m => (
                          <Badge key={m} variant="secondary" className="text-[11px]">{m}</Badge>
                        ))}
                        {models.length > 3 && (
                          <Badge variant="secondary" className="text-[11px]">+{models.length - 3}</Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">所有模型</span>
                    )}

                    {ch.auth_type === "cookie" && (
                      <div className="pt-2 border-t border-border space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Cookie 状态</span>
                          {getCookieStatusBadge(ch.user_cookie_status)}
                        </div>
                        {ch.cookie_expire_at && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            <span>过期：{new Date(ch.cookie_expire_at).toLocaleString()}</span>
                          </div>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => openCookieDialog(ch)}
                        >
                          {ch.user_cookie_status === "active" ? "更新 Cookie" : "配置 Cookie"}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Cookie 配置对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                <Cookie className="w-4 h-4 text-warning" />
              </div>
              配置 Cookie - {dialogChannel?.name}
            </DialogTitle>
            <DialogDescription>
              为此渠道提交您的浏览器 Cookie
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 当前状态 */}
            {cookieDetail && cookieDetail.status !== "none" && (
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  {cookieDetail.status === "active" ? (
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  ) : (
                    <XCircle className="w-4 h-4 text-destructive" />
                  )}
                  <span className="text-sm font-medium">
                    {cookieDetail.status === "active" ? "当前 Cookie 有效" : "当前 Cookie 已过期"}
                  </span>
                </div>
                {cookieDetail.expire_at && (
                  <div className="text-xs text-muted-foreground">
                    过期时间：{new Date(cookieDetail.expire_at).toLocaleString()}
                  </div>
                )}
                {cookieDetail.cookie_preview && (
                  <div className="font-mono text-xs text-muted-foreground">
                    {cookieDetail.cookie_preview}
                  </div>
                )}
              </div>
            )}

            {/* 模式切换 */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <button
                type="button"
                onClick={() => setLoginMode("manual")}
                className={`flex-1 text-sm py-2 rounded-md transition-colors ${
                  loginMode === "manual"
                    ? "bg-background text-foreground shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                手动输入
              </button>
              <button
                type="button"
                onClick={() => setLoginMode("auto")}
                className={`flex-1 text-sm py-2 rounded-md transition-colors ${
                  loginMode === "auto"
                    ? "bg-background text-foreground shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                自动登录
              </button>
            </div>

            {loginMode === "manual" ? (
              <>
                <div className="space-y-2">
                  <Label>Cookie 内容</Label>
                  <Textarea
                    placeholder="SESSION=xxx; cookie=xxx; ..."
                    rows={4}
                    value={cookieVal}
                    onChange={(e) => setCookieVal(e.target.value)}
                    className="font-mono text-sm resize-none"
                  />
                </div>
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <p className="font-medium">如何获取 Cookie：</p>
                      <ol className="list-decimal list-inside space-y-0.5 text-sm">
                        <li>在浏览器中登录对应的网页服务</li>
                        <li>按 F12 打开开发者工具</li>
                        <li>切换到 Network 标签，刷新页面</li>
                        <li>点击任意请求，复制 Headers 中的 Cookie</li>
                      </ol>
                    </div>
                  </AlertDescription>
                </Alert>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>用户名</Label>
                    <Input
                      placeholder="username"
                      value={loginUser}
                      onChange={(e) => setLoginUser(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>密码</Label>
                    <Input
                      type="password"
                      placeholder="password"
                      value={loginPass}
                      onChange={(e) => setLoginPass(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={autoRefresh}
                    onCheckedChange={setAutoRefresh}
                  />
                  <Label className="text-sm">自动续期</Label>
                  <span className="text-xs text-muted-foreground">过期前自动重新登录</span>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            {cookieDetail && cookieDetail.status !== "none" && (
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(true)}
                className="text-destructive hover:text-destructive/80 hover:bg-destructive/10 border-destructive/30 mr-auto"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                删除
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button
              onClick={loginMode === "manual" ? handleSubmitCookie : handleAutoLogin}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {loginMode === "manual" ? "提交中..." : "登录中..."}
                </div>
              ) : loginMode === "manual" ? (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  提交 Cookie
                </>
              ) : (
                <>
                  <Key className="w-4 h-4 mr-2" />
                  自动登录
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除 Cookie？</DialogTitle>
            <DialogDescription>
              删除后该渠道的代理服务将无法正常工作，直到您重新提交新的 Cookie。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleDeleteCookie}>
              <Trash2 className="w-4 h-4 mr-2" />
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
