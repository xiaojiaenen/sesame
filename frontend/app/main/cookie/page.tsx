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
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isActive
                  ? "bg-emerald-100 text-emerald-600"
                  : "bg-slate-100 text-slate-500"
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
                    <motion.div 
                      initial={{ scale: 0 }} 
                      animate={{ scale: 1 }}
                      className="flex items-center gap-2"
                    >
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      </div>
                      <Badge className="text-sm bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        正常运行
                      </Badge>
                    </motion.div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                        <XCircle className="w-5 h-5 text-slate-400" />
                      </div>
                      <Badge variant="secondary" className="text-sm">
                        {status.status === "expired" ? "已过期" : "未配置"}
                      </Badge>
                    </div>
                  )}
                </div>
                
                {status.expire_at && (
                  <div className="flex items-center gap-2 text-sm text-slate-600 bg-white/60 p-3 rounded-lg">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>过期时间：</span>
                    <span className="font-medium">{new Date(status.expire_at).toLocaleString()}</span>
                  </div>
                )}
                
                {status.cookie_preview && (
                  <div>
                    <div className="text-sm text-slate-500 mb-2 flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      Cookie 预览
                    </div>
                    <div
                      className="p-3 bg-white/60 rounded-xl border border-slate-200 font-mono text-xs break-all cursor-pointer hover:bg-white transition-colors flex items-center gap-2 group"
                      onClick={handleCopy}
                      title="点击复制"
                    >
                      <span className="flex-1 text-slate-600">{status.cookie_preview}</span>
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Copy className="w-4 h-4 text-slate-500" />
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchStatus}
                    className="text-slate-600"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    刷新状态
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    删除 Cookie
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span className="text-sm text-amber-700">尚未配置 Cookie，请在下方提交</span>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Submit Card */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.1 }}
      >
        <Card className="border-0 shadow-sm">
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
                <Label htmlFor="cookie" className="text-slate-600 flex items-center gap-2">
                  <Cookie className="w-4 h-4" />
                  Cookie 内容
                </Label>
                <Textarea
                  id="cookie"
                  placeholder="SESSION=xxx; cookie=xxx; ..."
                  rows={4}
                  value={cookieVal}
                  onChange={(e) => setCookieVal(e.target.value)}
                  className="bg-slate-50/50 border-slate-200 focus:bg-white font-mono text-sm resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expire" className="text-slate-600 flex items-center gap-2">
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
                  className="w-32 bg-slate-50/50 border-slate-200 focus:bg-white"
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
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                <Trash2 className="w-4 h-4 text-red-500" />
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
              className="bg-red-500 hover:bg-red-600"
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
