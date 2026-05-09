"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Eye, EyeOff, Lock, User } from "lucide-react";

export default function LoginPage() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/user/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, password }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success("登录成功");
        login(data.access_token);
      } else {
        toast.error(data.detail || "登录失败，请检查用户名和密码");
      }
    } catch (error) {
      toast.error("网络错误，请稍后再试");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md mx-4"
      >
        <div className="bg-card rounded-xl shadow-lg border border-border p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <img src="/logo.svg" alt="Sesame" className="w-20 h-20 mb-5" />
            <h1 className="text-3xl font-bold text-foreground">
              Sesame Gateway
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              企业 AI 网关管理平台
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label
                htmlFor="userId"
                className={`text-sm font-medium transition-colors ${
                  focusedField === "userId" ? "text-primary" : "text-foreground"
                }`}
              >
                用户名
              </Label>
              <div className="relative group">
                <div className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${
                  focusedField === "userId" ? "text-primary" : "text-muted-foreground"
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
                  className={`h-12 pl-10 bg-background border-border transition-all duration-200 ${
                    focusedField === "userId"
                      ? "border-primary ring-2 ring-primary/20"
                      : "hover:border-slate-300"
                  }`}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="password"
                className={`text-sm font-medium transition-colors ${
                  focusedField === "password" ? "text-primary" : "text-foreground"
                }`}
              >
                密码
              </Label>
              <div className="relative group">
                <div className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${
                  focusedField === "password" ? "text-primary" : "text-muted-foreground"
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
                  className={`h-12 pl-10 pr-10 bg-background border-border transition-all duration-200 ${
                    focusedField === "password"
                      ? "border-primary ring-2 ring-primary/20"
                      : "hover:border-slate-300"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-all duration-200 disabled:opacity-70"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  登录中...
                </div>
              ) : (
                <span className="flex items-center gap-2">
                  登录
                </span>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Sesame Gateway v1.1.0
        </p>
      </motion.div>
    </div>
  );
}
