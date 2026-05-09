"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fadeInUp } from "@/lib/animations";
import { motion } from "motion/react";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Cookie, CheckCircle2, XCircle, Clock, Trash2, Send,
  Copy, AlertTriangle, RefreshCw, Info, Lock
} from "lucide-react";

export default function CookiePage() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [cookieVal, setCookieVal] = useState("");
  const [expireDays, setExpireDays] = useState("7");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/user/cookie");
      setStatus(data);
    } catch (error) {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cookieVal.trim()) {
      toast.error("请输入 Cookie");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiFetch("/user/cookie", {
        method: "POST",
        body: JSON.stringify({
          cookie: cookieVal,
          expire_days: parseInt(expireDays, 10) || 7,
        }),
      });
      toast.success("Cookie 提交成功");
      setCookieVal("");
      fetchStatus();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await apiFetch("/user/cookie", { method: "DELETE" });
      toast.success("Cookie 已删除");
      setIsDeleteDialogOpen(false);
      fetchStatus();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleCopy = () => {
    if (status?.cookie_preview) {
      navigator.clipboard.writeText(status.cookie_preview);
      toast.success("已复制到剪贴板");
    }
  };

  const isActive = status?.status === "active";

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Cookie 管理" 
        description="管理企业 AI 服务的认证凭证"
      />

      {/* Status Card */}
      <motion.div {...fadeInUp}>
        <Card className="ring-1 ring-border/40 shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isActive
                  ? "bg-success/10 text-success"
                  : "bg-muted text-muted-foreground"
              }`}>
                <Cookie className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-lg">Cookie 状态</CardTitle>
                <CardDescription>企业 AI 服务的认证凭证</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="relative">
            {loading ? (
              <div className="space-y-3">
                <div className="h-7 w-32 skeleton-shimmer rounded-lg" />
                <div className="h-5 w-48 skeleton-shimmer rounded-lg" />
              </div>
            ) : status ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {isActive ? (
                    <motion.div {...fadeInUp} className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-success" />
                      </div>
                      <Badge className="text-sm bg-success/10 text-success hover:bg-success/10">
                        正常运行
                      </Badge>
                    </motion.div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <XCircle className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <Badge variant="secondary" className="text-sm">
                        {status.status === "expired" ? "已过期" : "未配置"}
                      </Badge>
                    </div>
                  )}
                </div>
                
                {status.expire_at && (
                  <div className="flex items-center gap-2 text-sm text-foreground bg-background/60 p-3 rounded-lg">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>过期时间：</span>
                    <span className="font-medium">{new Date(status.expire_at).toLocaleString()}</span>
                  </div>
                )}
                
                {status.cookie_preview && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      Cookie 预览
                    </div>
                    <div
                      className="p-3 bg-background/60 rounded-xl border border-border font-mono text-xs break-all cursor-pointer hover:bg-background transition-colors flex items-center gap-2 group"
                      onClick={handleCopy}
                      title="点击复制"
                    >
                      <span className="flex-1 text-foreground">{status.cookie_preview}</span>
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchStatus}
                    className="text-muted-foreground"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    刷新状态
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className="text-destructive hover:text-destructive/80 hover:bg-destructive/10 border-destructive/30"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    删除 Cookie
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 bg-warning/5 rounded-xl border border-warning/20">
                <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
                <span className="text-sm text-warning">尚未配置 Cookie，请在下方提交</span>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Submit Card */}
      <motion.div {...fadeInUp} transition={{ delay: 0.1 }}>
        <Card className="ring-1 ring-border/40 shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Send className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">提交或更新 Cookie</CardTitle>
                <CardDescription>从浏览器开发者工具中复制 Cookie 粘贴到下方</CardDescription>
              </div>
            </div>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cookie" className="text-foreground flex items-center gap-2">
                  <Cookie className="w-4 h-4" />
                  Cookie 内容
                </Label>
                <Textarea
                  id="cookie"
                  placeholder="SESSION=xxx; cookie=xxx; ..."
                  rows={4}
                  value={cookieVal}
                  onChange={(e) => setCookieVal(e.target.value)}
                  className="bg-muted/50 border-border focus:bg-background font-mono text-sm resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expire" className="text-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  有效天数
                </Label>
                <Input
                  id="expire"
                  type="number"
                  min="1"
                  max="365"
                  value={expireDays}
                  onChange={(e) => setExpireDays(e.target.value)}
                  className="w-32 bg-muted/50 border-border focus:bg-background"
                />
              </div>
              
              {/* Help text */}
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-medium">如何获取 Cookie：</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-sm">
                      <li>在浏览器中登录企业 AI 网页</li>
                      <li>按 F12 打开开发者工具</li>
                      <li>切换到 Network（网络）标签</li>
                      <li>刷新页面，点击任意请求</li>
                      <li>在 Headers 中找到 Cookie 字段并复制</li>
                    </ol>
                  </div>
                </AlertDescription>
              </Alert>
            </CardContent>
            <div className="px-6 pb-6">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-primary hover:bg-primary/90 h-11 px-6"
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    提交中...
                  </div>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    提交 Cookie
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
      </motion.div>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                <Trash2 className="w-4 h-4 text-destructive" />
              </div>
              确认删除 Cookie？
            </DialogTitle>
            <DialogDescription>
              删除后代理服务将无法正常工作，直到您重新提交新的 Cookie。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>取消</Button>
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
