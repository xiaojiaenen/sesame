"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { Eye, EyeOff, Lock, User, ArrowRight, Sparkles } from "lucide-react";

function GridPattern() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06]"
        style={{
          backgroundImage: `
            linear-gradient(var(--border) 1px, transparent 1px),
            linear-gradient(90deg, var(--border) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black 40%, transparent 70%)",
        }}
      />
    </div>
  );
}

export default function LoginPage() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/user/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, password }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("登录成功");
        login(data.access_token);
      } else {
        toast.error(data.detail || "登录失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      {/* Background atmosphere */}
      <GridPattern />
      <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] bg-primary/3 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[5%] w-[500px] h-[500px] bg-violet-500/3 rounded-full blur-[120px]" />
      <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] bg-amber-500/2 rounded-full blur-[100px]" />

      <div className="w-full max-w-md mx-4 relative z-10">
        {/* Branding */}
        <motion.div
          {...fadeInUp}
          className="text-center mb-8"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center gap-3 mb-5"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl" />
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 flex items-center justify-center relative shadow-lg shadow-primary/10">
                <img src="/logo.svg" alt="Sesame" className="w-9 h-9" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Sesame</h1>
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="text-muted-foreground text-sm"
          >
            AI 网关 · 统一接入 · 智能路由
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.4 }}
            className="text-muted-foreground/50 text-xs mt-1.5"
          >
            芝麻智门 — 连接每一份智能
          </motion.p>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="bg-card/70 backdrop-blur-2xl rounded-2xl shadow-2xl ring-1 ring-border/40 overflow-hidden"
        >
          <div className="p-8">
            <div className="mb-7">
              <h2 className="text-lg font-semibold text-foreground">欢迎回来</h2>
              <p className="text-sm text-muted-foreground mt-1">登录您的账户以继续</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25, duration: 0.35 }}
                className="space-y-2"
              >
                <Label htmlFor="userId" className="text-sm font-medium">
                  用户名
                </Label>
                <div className="relative">
                  <div className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors duration-200 ${
                    focusedField === "userId" ? "text-primary" : "text-muted-foreground/60"
                  }`}>
                    <User className="w-4 h-4" />
                  </div>
                  <Input
                    id="userId"
                    placeholder="输入用户名"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    onFocus={() => setFocusedField("userId")}
                    onBlur={() => setFocusedField(null)}
                    required
                    className={`h-11 pl-10 rounded-xl transition-all duration-200 ${
                      focusedField === "userId" ? "border-primary ring-2 ring-primary/10" : "border-border/60"
                    }`}
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.33, duration: 0.35 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium">
                    密码
                  </Label>
                </div>
                <div className="relative">
                  <div className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors duration-200 ${
                    focusedField === "password" ? "text-primary" : "text-muted-foreground/60"
                  }`}>
                    <Lock className="w-4 h-4" />
                  </div>
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="输入密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    required
                    className={`h-11 pl-10 pr-10 rounded-xl transition-all duration-200 ${
                      focusedField === "password" ? "border-primary ring-2 ring-primary/10" : "border-border/60"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.42, duration: 0.35 }}
              >
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 font-medium rounded-xl bg-gradient-to-r from-primary to-emerald-500 hover:from-primary/95 hover:to-emerald-500/90 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25 transition-all duration-300 mt-2"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      登录中...
                    </div>
                  ) : (
                    <span className="flex items-center gap-2">
                      登录 <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  )}
                </Button>
              </motion.div>
            </form>
          </div>

          {/* Footer */}
          <div className="px-8 py-4 bg-muted/30 border-t border-border/40">
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground/60">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                Sesame v1.1.0
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
