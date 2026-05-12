"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Server, Plus, Trash2, Edit, RefreshCw, X, Key, Cookie, ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Channel {
  id: number;
  name: string;
  base_url: string;
  auth_type: "api_key" | "cookie";
  models: string | null;
  weight: number;
  is_enabled: boolean;
  status: string;
  priority: number;
  max_qps: number;
  last_check: string | null;
  error_message: string | null;
  created_at: string | null;
}

interface ModelMapping {
  accept: string;  // 接受的模型名（客户端发的）
  backend: string; // 后端实际模型名
}

function parseModelsDict(raw: string | null): ModelMapping[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // 兼容旧格式
      return parsed.map((m: string) => ({ accept: m, backend: m }));
    }
    if (typeof parsed === "object" && parsed !== null) {
      return Object.entries(parsed).map(([accept, backend]) => ({
        accept,
        backend: backend as string,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [isOpen, setIsOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [authType, setAuthType] = useState<"api_key" | "cookie">("api_key");
  const [modelMappings, setModelMappings] = useState<ModelMapping[]>([]);
  const [newAccept, setNewAccept] = useState("");
  const [newBackend, setNewBackend] = useState("");
  const [weight, setWeight] = useState("1");
  const [priority, setPriority] = useState("0");
  const [maxQps, setMaxQps] = useState("10");

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      const data = await apiFetch(`/admin/channels?${params}`);
      setChannels(data.channels);
      setTotal(data.total);
    } catch (e: any) {
      toast.error(e.message || "加载渠道失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, [page]);

  const addModelMapping = () => {
    const accept = newAccept.trim();
    const backend = newBackend.trim();
    if (!accept || !backend) return;
    if (modelMappings.some(m => m.accept === accept)) {
      toast.error("该模型名已存在");
      return;
    }
    setModelMappings([...modelMappings, { accept, backend }]);
    setNewAccept("");
    setNewBackend("");
  };

  const removeModelMapping = (accept: string) => {
    setModelMappings(modelMappings.filter(m => m.accept !== accept));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addModelMapping();
    }
  };

  const handleSave = async () => {
    try {
      const params = new URLSearchParams({
        name,
        base_url: baseUrl,
        api_key: apiKey,
        auth_type: authType,
        weight,
        priority,
        max_qps: maxQps,
      });
      if (modelMappings.length > 0) {
        const modelsDict: Record<string, string> = {};
        modelMappings.forEach(m => { modelsDict[m.accept] = m.backend; });
        params.append("models", JSON.stringify(modelsDict));
      }

      if (isEdit && currentId) {
        await apiFetch(`/admin/channels/${currentId}?${params}`, { method: "PUT" });
        toast.success("更新成功");
      } else {
        await apiFetch(`/admin/channels?${params}`, { method: "POST" });
        toast.success("创建成功");
      }
      setIsOpen(false);
      fetchChannels();
    } catch (e: any) {
      toast.error(e.message || "保存失败");
    }
  };

  const handleEdit = (ch: Channel) => {
    setIsEdit(true);
    setCurrentId(ch.id);
    setName(ch.name);
    setBaseUrl(ch.base_url);
    setApiKey("");
    setAuthType(ch.auth_type || "api_key");
    setModelMappings(parseModelsDict(ch.models));
    setWeight(String(ch.weight));
    setPriority(String(ch.priority));
    setMaxQps(String(ch.max_qps));
    setIsOpen(true);
  };

  const openCreate = () => {
    setIsEdit(false);
    setCurrentId(null);
    setName("");
    setBaseUrl("");
    setApiKey("");
    setAuthType("api_key");
    setModelMappings([]);
    setNewAccept("");
    setNewBackend("");
    setWeight("1");
    setPriority("0");
    setMaxQps("10");
    setIsOpen(true);
  };

  const totalPages = Math.ceil(total / pageSize);

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除此渠道吗？")) return;
    try {
      await apiFetch(`/admin/channels/${id}`, { method: "DELETE" });
      toast.success("已删除");
      fetchChannels();
    } catch (e: any) {
      toast.error(e.message || "删除失败");
    }
  };

  const handleTest = async (id: number) => {
    try {
      const result = await apiFetch(`/admin/channels/${id}/test`, { method: "POST" });
      if (result.status === "ok") {
        toast.success("连接测试成功");
      } else {
        toast.error(`连接测试失败: ${result.message}`);
      }
      fetchChannels();
    } catch (e: any) {
      toast.error(e.message || "测试失败");
    }
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    try {
      await apiFetch(`/admin/channels/${id}?is_enabled=${enabled}`, { method: "PUT" });
      toast.success(enabled ? "已启用" : "已禁用");
      fetchChannels();
    } catch (e: any) {
      toast.error(e.message || "操作失败");
    }
  };

  const renderModelsCell = (models: string | null) => {
    const mappings = parseModelsDict(models);
    if (mappings.length === 0) {
      return <span className="text-xs text-muted-foreground">所有模型</span>;
    }
    const hasMapping = mappings.some(m => m.accept !== m.backend);
    return (
      <div className="flex flex-wrap gap-1 max-w-[240px]">
        {mappings.slice(0, 2).map((m) => (
          <Badge key={m.accept} variant="secondary" className="text-[11px]">
            {hasMapping && m.accept !== m.backend ? `${m.accept}→${m.backend}` : m.accept}
          </Badge>
        ))}
        {mappings.length > 2 && (
          <Badge variant="secondary" className="text-[11px]">+{mappings.length - 2}</Badge>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="渠道管理"
        description="管理后端 API 渠道，支持模型映射和负载均衡"
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            添加渠道
          </Button>
        }
      />

      <motion.div
        {...fadeInUp}
        transition={{ ...fadeInUp.transition, delay: 0.1 }}
      >
        <Card className="ring-1 ring-border/40 shadow-xs overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="font-semibold text-foreground h-11 text-xs uppercase tracking-wider">名称</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">认证类型</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">Base URL</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">模型映射</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">权重/优先级</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">状态</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">启用</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40 rounded-md" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-10 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24 rounded-full ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : channels.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <EmptyState
                        icon={<Server className="w-8 h-8 text-muted-foreground" />}
                        title="暂无渠道配置"
                        description="添加渠道来支持后端 API"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  channels.map((ch, i) => (
                    <motion.tr
                      key={ch.id}
                      {...fadeInUp}
                      transition={{ ...fadeInUp.transition, delay: i * 0.02 }}
                      className={`border-b transition-colors hover:bg-accent/40 ${!ch.is_enabled ? 'opacity-60' : ''}`}
                    >
                      <TableCell className="py-2.5 font-medium">{ch.name}</TableCell>
                      <TableCell className="py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          ch.auth_type === "cookie"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                        }`}>
                          {ch.auth_type === "cookie" ? (
                            <><Cookie className="w-3 h-3" /> Cookie</>
                          ) : (
                            <><Key className="w-3 h-3" /> API Key</>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <code className="text-xs font-mono text-muted-foreground truncate max-w-[200px] block" title={ch.base_url}>
                          {ch.base_url}
                        </code>
                      </TableCell>
                      <TableCell className="py-2.5">{renderModelsCell(ch.models)}</TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium tabular-nums bg-sky-500/10 text-sky-600 dark:text-sky-400">
                            W:{ch.weight}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium tabular-nums bg-violet-500/10 text-violet-600 dark:text-violet-400">
                            P:{ch.priority}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          ch.status === "active"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : ch.status === "error"
                            ? "bg-red-500/10 text-red-600 dark:text-red-400"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            ch.status === "active" ? "bg-emerald-500" : ch.status === "error" ? "bg-red-500" : "bg-muted-foreground"
                          } ${ch.status === "error" ? "animate-pulse" : ""}`} />
                          {ch.status === "active" ? "正常" : ch.status === "error" ? "异常" : "禁用"}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Switch
                          checked={ch.is_enabled}
                          onCheckedChange={(checked) => handleToggle(ch.id, checked)}
                        />
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleTest(ch.id)} title="测试连接">
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(ch)} title="编辑">
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(ch.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10" title="删除">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </motion.div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            共 {total} 条记录，第 {page + 1} / {totalPages} 页
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEdit ? "编辑渠道" : "添加渠道"}</DialogTitle>
            <DialogDescription>
              配置渠道信息和模型映射。模型映射：左边填客户端发的模型名，右边填后端实际模型名。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>渠道名称</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="例如: DeepSeek" />
            </div>
            <div className="space-y-2">
              <Label>认证类型</Label>
              <Select value={authType} onValueChange={(v) => { if (v) setAuthType(v as "api_key" | "cookie"); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="api_key">API Key</SelectItem>
                  <SelectItem value="cookie">Cookie（用户各自配置）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com" />
            </div>
            {authType === "api_key" && (
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." />
              </div>
            )}

            {/* 模型映射 */}
            <div className="space-y-2">
              <Label>模型映射（留空表示接受所有模型）</Label>
              <div className="flex gap-2">
                <Input
                  value={newAccept}
                  onChange={e => setNewAccept(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="客户端模型名（如 claude-sonnet-4-xxx）"
                  className="flex-1"
                />
                <span className="flex items-center text-muted-foreground">→</span>
                <Input
                  value={newBackend}
                  onChange={e => setNewBackend(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="后端模型名（如 deepseek-chat）"
                  className="flex-1"
                />
                <Button variant="outline" size="icon" onClick={addModelMapping} disabled={!newAccept.trim() || !newBackend.trim()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {modelMappings.length > 0 && (
                <div className="space-y-1 mt-2 p-3 bg-muted rounded-lg">
                  {modelMappings.map(m => (
                    <div key={m.accept} className="flex items-center justify-between text-sm group">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-mono text-xs">{m.accept}</Badge>
                        <span className="text-muted-foreground">→</span>
                        <Badge variant="outline" className="font-mono text-xs">{m.backend}</Badge>
                      </div>
                      <button
                        onClick={() => removeModelMapping(m.accept)}
                        className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive transition-opacity"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>权重</Label>
                <Input type="number" value={weight} onChange={e => setWeight(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>优先级</Label>
                <Input type="number" value={priority} onChange={e => setPriority(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>最大 QPS</Label>
                <Input type="number" value={maxQps} onChange={e => setMaxQps(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>取消</Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
