"use client";

import { useEffect, useState, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Box, List, Search, Server, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ModelInfo {
  external_model: string;
  internal_model?: string;
  channel_id?: number;
  channel_name?: string;
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [channels, setChannels] = useState<{ id: number; name: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchData = async () => {
    try {
      const [modelsRes, channelsRes] = await Promise.allSettled([
        apiFetch("/user/models"),
        apiFetch("/user/channels"),
      ]);
      if (modelsRes.status === "fulfilled") setModels(modelsRes.value);
      if (channelsRes.status === "fulfilled") {
        const chData = Array.isArray(channelsRes.value) ? channelsRes.value : (channelsRes.value.data ?? []);
        setChannels(chData.map((c: any) => ({ id: c.id, name: c.name, status: c.status })));
      }
    } catch {
      toast.error("加载模型列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return models;
    const q = search.toLowerCase();
    return models.filter(m =>
      m.external_model.toLowerCase().includes(q) ||
      (m.internal_model && m.internal_model.toLowerCase().includes(q)) ||
      (m.channel_name && m.channel_name.toLowerCase().includes(q))
    );
  }, [models, search]);

  // 按渠道分组
  const grouped = useMemo(() => {
    const map = new Map<string, ModelInfo[]>();
    for (const m of filtered) {
      const key = m.channel_name || "未分配渠道";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="模型列表"
        description={`共 ${models.length} 个可用模型`}
        action={
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchData(); }}>
            <RefreshCw className="w-4 h-4 mr-1.5" />
            刷新
          </Button>
        }
      />

      {/* 搜索栏 */}
      {!loading && models.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索模型名称..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="ring-1 ring-border/40 shadow-xs">
              <CardContent className="p-4">
                <Skeleton className="h-6 w-48 rounded-md" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : models.length === 0 ? (
        <Card className="ring-1 ring-border/40 shadow-xs">
          <CardContent className="p-0">
            <EmptyState
              icon={<List className="w-8 h-8 text-muted-foreground" />}
              title="暂无模型配置"
              description="暂无渠道配置可用模型"
            />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="ring-1 ring-border/40 shadow-xs">
          <CardContent className="p-0">
            <EmptyState
              icon={<Search className="w-8 h-8 text-muted-foreground" />}
              title="未找到匹配模型"
              description={`没有匹配「${search}」的模型`}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([channelName, channelModels]) => {
            const ch = channels.find(c => c.name === channelName);
            return (
              <div key={channelName} className="space-y-2">
                {/* 渠道分组标题 */}
                <div className="flex items-center gap-2 px-1">
                  <Server className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {channelName}
                  </span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {channelModels.length}
                  </Badge>
                  {ch && (
                    <Badge
                      variant={ch.status === "active" ? "default" : "destructive"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {ch.status === "active" ? "在线" : "离线"}
                    </Badge>
                  )}
                </div>
                {/* 模型列表 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {channelModels.map((m, i) => (
                    <motion.div
                      key={m.external_model}
                      {...fadeInUp}
                      transition={{ ...fadeInUp.transition, delay: i * 0.02 }}
                    >
                      <Card className="ring-1 ring-border/40 shadow-xs hover:shadow-md hover:shadow-primary/5 transition-all duration-200">
                        <CardContent className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
                              <Box className="w-3.5 h-3.5 text-sky-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <code className="text-sm font-semibold font-mono text-sky-600 dark:text-sky-400 truncate block">
                                {m.external_model}
                              </code>
                              {m.internal_model && m.internal_model !== m.external_model && (
                                <span className="text-[10px] text-muted-foreground truncate block">
                                  → {m.internal_model}
                                </span>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
