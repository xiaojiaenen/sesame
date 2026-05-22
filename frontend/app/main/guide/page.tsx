"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { getBaseUrl } from "@/lib/api";
import { motion } from "motion/react";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Globe, Key, Copy, Check,
  Monitor, Zap, Shield, Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/code-block";

function CopyableCode({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyToClipboard(text);
    setCopied(true);
    toast.success("已复制到剪贴板");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 group">
      <code className="flex-1 px-3 py-2 bg-muted rounded-lg text-sm font-mono text-foreground break-all">
        {text}
      </code>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
      >
        {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  );
}

function StepItem({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
        {number}
      </div>
      <div className="flex-1 pt-1">
        <h4 className="font-medium text-foreground mb-1.5">{title}</h4>
        <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export default function GuidePage() {
  const baseUrl = getBaseUrl();

  return (
    <div className="space-y-6">
      <PageHeader
        title="使用说明"
        description="在 Cherry Studio 中配置 Sesame Gateway"
      />

      {/* 快速开始 */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">快速开始</CardTitle>
                <CardDescription>只需两步即可开始使用</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" />
                  API Base URL
                </div>
                <CopyableCode text={`${baseUrl}/v1`} />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" />
                  API Key
                </div>
                <p className="text-sm text-muted-foreground pt-2">
                  在 <Badge variant="outline">API Key 管理</Badge> 页面创建
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              如果在 <Badge variant="secondary">渠道管理</Badge> 中设置了默认模型，就无需在客户端配置模型，只需 Base URL + API Key 即可。
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* 消息格式 */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Settings className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">消息格式</CardTitle>
                <CardDescription>支持 OpenAI 和 Anthropic 两种 API 格式</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="openai" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="openai">OpenAI 兼容</TabsTrigger>
                <TabsTrigger value="anthropic">Anthropic 兼容</TabsTrigger>
              </TabsList>
              <TabsContent value="openai" className="space-y-3 mt-0">
                <div className="text-sm font-medium text-foreground">端点</div>
                <CopyableCode text={`${baseUrl}/v1/chat/completions`} />
                <div className="text-sm font-medium text-foreground mt-3">请求示例</div>
                <CodeBlock language="bash" code={`curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "stream": false
  }'`} />
              </TabsContent>
              <TabsContent value="anthropic" className="space-y-3 mt-0">
                <div className="text-sm font-medium text-foreground">端点</div>
                <CopyableCode text={`${baseUrl}/v1/messages`} />
                <div className="text-sm font-medium text-foreground mt-3">请求示例</div>
                <CodeBlock language="bash" code={`curl ${baseUrl}/v1/messages \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "stream": false
  }'`} />
                <p className="text-xs text-muted-foreground">
                  Anthropic 格式使用 <code className="px-1 py-0.5 bg-muted rounded text-xs">x-api-key</code> 或 <code className="px-1 py-0.5 bg-muted rounded text-xs">Authorization: Bearer</code> 传递 Key。设置默认模型后，请求中的 <code className="px-1 py-0.5 bg-muted rounded text-xs">model</code> 字段可省略。
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>

      {/* 模型保留关键字 */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">模型字段说明</CardTitle>
                <CardDescription>支持保留关键字，简化配置</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="p-3 rounded-lg border border-border/60 bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">default</Badge>
                    <span className="text-sm font-medium text-foreground">使用默认模型</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    请求中的 <code className="px-1 py-0.5 bg-muted rounded text-xs">model</code> 设为 <code className="px-1 py-0.5 bg-muted rounded text-xs">default</code>，网关自动替换为你在渠道管理页设置的默认模型。
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-border/60 bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">auto</Badge>
                    <span className="text-sm font-medium text-foreground">自动选择</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    设为 <code className="px-1 py-0.5 bg-muted rounded text-xs">auto</code>，网关从所有活跃渠道中随机选一个可用模型。适合不关心具体模型的场景。
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                如果指定了默认模型，<code className="px-1 py-0.5 bg-muted rounded text-xs">default</code> 和 <code className="px-1 py-0.5 bg-muted rounded text-xs">auto</code> 效果相同——都使用默认模型。不填 <code className="px-1 py-0.5 bg-muted rounded text-xs">model</code> 字段等同于 <code className="px-1 py-0.5 bg-muted rounded text-xs">default</code>。
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Cherry Studio */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
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
          <CardContent>
            <div className="space-y-6">
              <StepItem number={1} title="打开设置面板">
                打开 Cherry Studio 设置面板，进入 <Badge variant="secondary">提供商</Badge>（Providers）选项。
              </StepItem>
              <StepItem number={2} title="添加提供商">
                选择 <Badge variant="secondary">OpenAI</Badge> 兼容格式，或者添加自定义提供商。
              </StepItem>
              <StepItem number={3} title="填写 API Base URL">
                <div className="mt-1">
                  <CopyableCode text={`${baseUrl}/v1`} />
                </div>
              </StepItem>
              <StepItem number={4} title="填写 API Key">
                填入您在 Sesame Gateway 创建的 API Key。
              </StepItem>
              <StepItem number={5} title="配置模型（可选）">
                在模型列表中添加支持的模型名称，或点击刷新拉取。如果已在 Sesame Gateway 的 <Badge variant="secondary">渠道管理</Badge> 中设置了默认模型，可跳过此步骤。
              </StepItem>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 安全提示 */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
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
