"use client";

import { useState, useEffect, useRef } from "react";
import { apiFetch, getBaseUrl } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { PageHeader } from "@/components/page-header";
import { CodeBlock } from "@/components/code-block";
import { Send, Square, Copy, RotateCcw, Zap } from "lucide-react";

export default function PlaygroundPage() {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful assistant.");
  const [userMessage, setUserMessage] = useState("");
  const [temperature, setTemperature] = useState("0.7");
  const [maxTokens, setMaxTokens] = useState("1024");
  const [stream, setStream] = useState(true);
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const responseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const data = await apiFetch("/user/models");
        const modelNames = Array.isArray(data)
          ? data.map((m: any) => typeof m === "string" ? m : m.external_model || m.model || "")
          : [];
        const unique = [...new Set(modelNames.filter(Boolean))].sort();
        setModels(unique);
        if (unique.length > 0) setSelectedModel(unique[0]);
      } catch {
        toast.error("加载模型列表失败");
      }
    };
    fetchModels();
  }, []);

  const handleSend = async () => {
    if (!userMessage.trim()) {
      toast.error("请输入消息");
      return;
    }
    if (!selectedModel) {
      toast.error("请选择模型");
      return;
    }

    setIsLoading(true);
    setResponse("");
    setResponseTime(null);
    const startTime = Date.now();

    const messages = [];
    if (systemPrompt.trim()) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: userMessage });

    const body: any = {
      model: selectedModel,
      messages,
      temperature: parseFloat(temperature) || 0.7,
      max_tokens: parseInt(maxTokens) || 1024,
      stream,
    };

    if (stream) {
      // 流式请求
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const token = localStorage.getItem("sesame_token");
        const resp = await fetch(`${getBaseUrl()}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.detail || err.message || `HTTP ${resp.status}`);
        }

        const reader = resp.body?.getReader();
        if (!reader) throw new Error("无法读取响应流");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const chunk = JSON.parse(data);
              const content = chunk.choices?.[0]?.delta?.content;
              if (content) {
                setResponse(prev => prev + content);
              }
            } catch {}
          }
        }

        setResponseTime(Date.now() - startTime);
      } catch (e: any) {
        if (e.name !== "AbortError") {
          toast.error(e.message || "请求失败");
          setResponse(`Error: ${e.message}`);
        }
      }
    } else {
      // 非流式请求
      try {
        const data = await apiFetch("/v1/chat/completions", {
          method: "POST",
          body: JSON.stringify(body),
        });
        const content = data.choices?.[0]?.message?.content || "";
        setResponse(content);
        setResponseTime(Date.now() - startTime);
      } catch (e: any) {
        toast.error(e.message || "请求失败");
        setResponse(`Error: ${e.message}`);
      }
    }

    setIsLoading(false);
    abortRef.current = null;
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsLoading(false);
  };

  const handleCopyCurl = () => {
    const messages = [];
    if (systemPrompt.trim()) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: userMessage });

    const body = {
      model: selectedModel,
      messages,
      temperature: parseFloat(temperature) || 0.7,
      max_tokens: parseInt(maxTokens) || 1024,
      stream,
    };

    const token = localStorage.getItem("sesame_token") || "YOUR_API_KEY";
    const curl = `curl ${getBaseUrl()}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${token}" \\
  -d '${JSON.stringify(body, null, 2)}'`;

    navigator.clipboard.writeText(curl);
    toast.success("已复制 curl 命令");
  };

  const handleClear = () => {
    setResponse("");
    setResponseTime(null);
    setUserMessage("");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Playground"
        description="在线测试 API 调用，实时查看响应结果"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：请求配置 */}
        <motion.div {...fadeInUp} className="space-y-4">
          <Card className="border-border/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                请求配置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 模型选择 */}
              <div className="space-y-2">
                <Label>模型</Label>
                <Select value={selectedModel} onValueChange={(v) => { if (v) setSelectedModel(v); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map(m => (
                      <SelectItem key={m} value={m}>
                        <code className="text-xs font-mono">{m}</code>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* System Prompt */}
              <div className="space-y-2">
                <Label>System Prompt</Label>
                <Textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  placeholder="系统提示词（可选）"
                  rows={3}
                  className="font-mono text-sm"
                />
              </div>

              {/* User Message */}
              <div className="space-y-2">
                <Label>用户消息</Label>
                <Textarea
                  value={userMessage}
                  onChange={e => setUserMessage(e.target.value)}
                  placeholder="输入你的消息..."
                  rows={5}
                  className="font-mono text-sm"
                  onKeyDown={e => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      if (!isLoading) handleSend();
                    }
                  }}
                />
                <p className="text-[10px] text-muted-foreground">Ctrl/Cmd + Enter 发送</p>
              </div>

              {/* 参数 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Temperature</Label>
                  <Input
                    type="number"
                    value={temperature}
                    onChange={e => setTemperature(e.target.value)}
                    min="0"
                    max="2"
                    step="0.1"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Tokens</Label>
                  <Input
                    type="number"
                    value={maxTokens}
                    onChange={e => setMaxTokens(e.target.value)}
                    min="1"
                    max="128000"
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              {/* 流式开关 */}
              <div className="flex items-center gap-2">
                <Switch checked={stream} onCheckedChange={setStream} />
                <Label className="text-sm">流式响应</Label>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2 pt-2">
                {isLoading ? (
                  <Button onClick={handleStop} variant="destructive" className="flex-1">
                    <Square className="w-4 h-4 mr-2" />
                    停止
                  </Button>
                ) : (
                  <Button onClick={handleSend} className="flex-1">
                    <Send className="w-4 h-4 mr-2" />
                    发送
                  </Button>
                )}
                <Button variant="outline" onClick={handleCopyCurl}>
                  <Copy className="w-4 h-4 mr-1.5" />
                  cURL
                </Button>
                <Button variant="outline" onClick={handleClear}>
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* 右侧：响应结果 */}
        <motion.div {...fadeInUp} transition={{ ...fadeInUp.transition, delay: 0.1 }}>
          <Card className="border-border/40 h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">响应结果</CardTitle>
                <div className="flex items-center gap-3">
                  {responseTime !== null && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {responseTime}ms
                    </span>
                  )}
                  {response && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(response);
                        toast.success("已复制响应");
                      }}
                      className="h-7 px-2"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {response ? (
                <div ref={responseRef} className="max-h-[600px] overflow-y-auto">
                  <CodeBlock code={response} language="bash" />
                </div>
              ) : (
                <div className="min-h-[300px] flex items-center justify-center text-muted-foreground text-sm">
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      等待响应...
                    </div>
                  ) : (
                    "发送请求后，响应将显示在这里"
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
