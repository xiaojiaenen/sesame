"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { Eye, EyeOff, Lock, User, ArrowRight } from "lucide-react";

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
        toast.error(data.detail || "登录失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/10" />
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />

      <motion.div {...fadeInUp} className="w-full max-w-md mx-4 relative z-10">
        {/* Card */}
        <div className="bg-card/80 backdrop-blur-xl rounded-2xl shadow-2xl ring-1 ring-border/50 p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 shadow-lg shadow-primary/10">
              <img src="/logo.svg" alt="Sesame" className="w-12 h-12" />
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Sesame
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              芝麻智门 · AI 网关
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="userId" className="text-sm font-medium">
                用户名
              </Label>
              <div className="relative">
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
                  className={`h-11 pl-10 transition-all duration-200 ${
                    focusedField === "userId" ? "border-primary ring-2 ring-primary/15" : ""
                  }`}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                密码
              </Label>
              <div className="relative">
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
                  className={`h-11 pl-10 pr-10 transition-all duration-200 ${
                    focusedField === "password" ? "border-primary ring-2 ring-primary/15" : ""
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
              className="w-full h-11 font-medium rounded-lg shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all duration-200"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  登录中...
                </div>
              ) : (
                <span className="flex items-center gap-2">
                  登录 <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground/60 mt-6">
          Sesame v1.1.0
        </p>
      </motion.div>
    </div>
  );
}
