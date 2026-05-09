"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { PageHeader } from "@/components/page-header";
import {
  Globe, Key, Copy, Check,
  Monitor, Code, Settings, Zap, Shield, Terminal, Boxes
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

function CopyableCode({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("已复制到剪贴板");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 group">
      <code className="flex-1 px-3 py-2 bg-slate-100 rounded-lg text-sm font-mono text-slate-700 break-all">
        {text}
      </code>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  );
}

function StepItem({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: number * 0.1 }}
      className="flex gap-4"
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
        {number}
      </div>
      <div className="flex-1">
        <h4 className="font-medium text-foreground mb-2">{title}</h4>
        <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
      </div>
    </motion.div>
  );
}

export default function GuidePage() {
  const [baseUrl, setBaseUrl] = useState<string>("");

  useEffect(() => {
    setBaseUrl(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="使用说明" 
        description="在各大 AI 客户端中配置 Sesame Gateway"
      />

      {/* Quick Start */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="border-0 shadow-sm border-l-4 border-l-primary">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">快速开始</CardTitle>
                <CardDescription>所有客户端通用配置信息</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" />
                  API Base URL
                </div>
                <CopyableCode text={`${baseUrl}/v1`} />
                <p className="text-xs text-muted-foreground mt-1">
                  部分客户端要求以 /v1 结尾，部分则不需要
                </p>
              </div>
              <div>
                <div className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" />
                  API Key
                </div>
                <p className="text-sm text-muted-foreground">
                  请在 <Badge variant="outline" className="mx-1">API Key 管理</Badge> 页面创建并复制
                </p>
              </div>
              <div>
                <div className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-primary" />
                  代理模型
                </div>
                <p className="text-sm text-muted-foreground">
                  请在 <Badge variant="outline" className="mx-1">模型列表</Badge> 页面查看支持的模型名称
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* API Formats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Boxes className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">支持的 API 格式</CardTitle>
                <CardDescription>Sesame Gateway 同时兼容 OpenAI 和 Anthropic 两种 API 格式</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* OpenAI Format */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="default">OpenAI 兼容</Badge>
                <span className="text-sm text-muted-foreground">适用于大多数客户端</span>
              </div>
              <div className="text-sm font-medium text-foreground">端点</div>
              <CopyableCode text={`${baseUrl}/v1/chat/completions`} />
              <div className="text-sm font-medium text-foreground mt-3">请求示例</div>
              <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg text-sm overflow-x-auto">
{`curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "stream": false
  }'`}
              </pre>
            </div>

            <div className="border-t border-border" />

            {/* Anthropic Format */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Anthropic 兼容</Badge>
                <span className="text-sm text-muted-foreground">适用于 Claude 客户端</span>
              </div>
              <div className="text-sm font-medium text-foreground">端点</div>
              <CopyableCode text={`${baseUrl}/v1/messages`} />
              <div className="text-sm font-medium text-foreground mt-3">请求示例</div>
              <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg text-sm overflow-x-auto">
{`curl ${baseUrl}/v1/messages \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "system": "You are a helpful assistant.",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "stream": false
  }'`}
              </pre>
              <div className="text-sm text-muted-foreground mt-2">
                <strong>注意：</strong>Anthropic 格式使用 <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">x-api-header</code> 或 <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">Authorization: Bearer</code> 传递 API Key。
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Cherry Studio */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Monitor className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Cherry Studio 配置</CardTitle>
                <CardDescription>桌面端 AI 客户端</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-6">
              <StepItem number={1} title="打开设置面板">
                打开 Cherry Studio 设置面板，进入 <Badge variant="secondary">提供商</Badge>（Providers）选项。
              </StepItem>
              <StepItem number={2} title="选择 API 格式">
                选择 <Badge variant="secondary">OpenAI</Badge> 兼容格式，或者添加自定义提供商。
              </StepItem>
              <StepItem number={3} title="填写 API Base URL">
                在 API Base URL 中填入：
                <div className="mt-2">
                  <CopyableCode text={`${baseUrl}/v1`} />
                </div>
              </StepItem>
              <StepItem number={4} title="填写 API Key">
                在 API Key 中填入您创建的 Sesame Key。
              </StepItem>
              <StepItem number={5} title="配置模型">
                在模型列表中手动添加（或点击刷新拉取）支持的 <code className="px-1.5 py-0.5 bg-slate-100 rounded text-sm">external_model</code> 名称。
              </StepItem>
              <StepItem number={6} title="完成配置">
                保存配置即可开始对话。
              </StepItem>
            </div>
            
            <div className="mt-6 p-12 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
              <Monitor className="w-12 h-12 mb-3 text-slate-300" />
              <span className="text-sm">截图占位: Cherry Studio 设置界面</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Cline */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Code className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Cline (VS Code 扩展) 配置</CardTitle>
                <CardDescription>VS Code 中的 AI 编程助手</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-6">
              <StepItem number={1} title="打开 Cline 设置">
                在 VS Code 中打开 Cline 扩展设置。
              </StepItem>
              <StepItem number={2} title="选择 API Provider">
                API Provider 选择 <Badge variant="secondary">OpenAI Compatible</Badge>。
              </StepItem>
              <StepItem number={3} title="填写 Base URL">
                Base URL 填入：
                <div className="mt-2">
                  <CopyableCode text={`${baseUrl}/v1`} />
                </div>
              </StepItem>
              <StepItem number={4} title="填写 API Key">
                API Key 填入您的 Sesame Key。
              </StepItem>
              <StepItem number={5} title="选择模型">
                Model ID 填入支持的模型名称（例如 <code className="px-1.5 py-0.5 bg-slate-100 rounded text-sm">claude-3-5-sonnet-20241022</code>，需由管理员在模型映射中配置）。
              </StepItem>
            </div>
            
            <div className="mt-6 p-12 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
              <Code className="w-12 h-12 mb-3 text-slate-300" />
              <span className="text-sm">截图占位: Cline 设置界面</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tips */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            <div className="font-medium mb-2">安全提示</div>
            <ul className="space-y-1 text-sm">
              <li>API Key 是您的访问凭证，请妥善保管，不要泄露给他人</li>
              <li>建议为不同的应用创建不同的 API Key，便于管理和追踪</li>
              <li>如果发现 Key 被泄露，请立即在管理页面禁用或删除</li>
            </ul>
          </AlertDescription>
        </Alert>
      </motion.div>
    </div>
  );
}
