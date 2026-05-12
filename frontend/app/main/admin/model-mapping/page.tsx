"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ArrowLeftRight, Plus, X, ArrowRight, Shuffle } from "lucide-react";

export default function ModelMappingPage() {
  const [mappings, setMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isOpen, setIsOpen] = useState(false);
  const [externalModel, setExternalModel] = useState("");
  const [internalModel, setInternalModel] = useState("");
  const [fallbackModels, setFallbackModels] = useState<string[]>([]);
  const [newFallback, setNewFallback] = useState("");

  const fetchMappings = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/admin/model-mapping");
      setMappings(data);
    } catch (e: any) {
      toast.error(e.message || "加载模型映射失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMappings();
  }, []);

  const addFallback = () => {
    if (newFallback && !fallbackModels.includes(newFallback)) {
      setFallbackModels([...fallbackModels, newFallback]);
      setNewFallback("");
    }
  };

  const removeFallback = (model: string) => {
    setFallbackModels(fallbackModels.filter(m => m !== model));
  };

  const handleCreate = async () => {
    if (!externalModel || !internalModel) {
      toast.error("请填写完整信息");
      return;
    }
    try {
      await apiFetch("/admin/model-mapping", {
        method: "POST",
        body: JSON.stringify({
          external_model: externalModel,
          internal_model: internalModel,
          fallback_models: fallbackModels.length > 0 ? fallbackModels : null,
        }),
      });
      toast.success("创建成功");
      setIsOpen(false);
      setExternalModel("");
      setInternalModel("");
      setFallbackModels([]);
      fetchMappings();
    } catch (e: any) {
      toast.error(e.message || "创建失败");
    }
  };

  const handleDelete = async (ext: string) => {
    if (!confirm(`确定删除 ${ext} 的映射吗？`)) return;
    try {
      await apiFetch(`/admin/model-mapping/${encodeURIComponent(ext)}`, { method: "DELETE" });
      toast.success("已删除");
      fetchMappings();
    } catch (e: any) {
      toast.error(e.message || "删除失败");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="模型映射"
        description="配置对外暴露模型与内部真实模型的映射关系，支持设置 fallback 模型"
        action={
          <Button onClick={() => setIsOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            添加映射
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
                  <TableHead className="font-semibold text-foreground h-11 text-xs uppercase tracking-wider">对外暴露模型</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider w-12"></TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">内部模型</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">Fallback 模型</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-40 rounded-md" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-8 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-40 rounded-md" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : mappings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <EmptyState
                        icon={<ArrowLeftRight className="w-8 h-8 text-muted-foreground" />}
                        title="暂无模型映射"
                        description="添加映射来配置模型名称转换规则"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  mappings.map((m, i) => (
                    <motion.tr
                      key={m.external_model}
                      {...fadeInUp}
                      transition={{ ...fadeInUp.transition, delay: i * 0.02 }}
                      className="border-b transition-colors hover:bg-accent/40"
                    >
                      <TableCell className="py-2.5">
                        <code className="px-2.5 py-1 rounded-md text-xs font-semibold font-mono bg-sky-500/10 text-sky-600 dark:text-sky-400">
                          {m.external_model}
                        </code>
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        <ArrowRight className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                      </TableCell>
                      <TableCell className="py-2.5">
                        <code className="px-2.5 py-1 rounded-md text-xs font-semibold font-mono bg-violet-500/10 text-violet-600 dark:text-violet-400">
                          {m.internal_model}
                        </code>
                      </TableCell>
                      <TableCell className="py-2.5">
                        {m.fallback_models && m.fallback_models.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1">
                            <Shuffle className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                            {m.fallback_models.map((model: string) => (
                              <span key={model} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                {model}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">-</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(m.external_model)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </motion.tr>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <ArrowLeftRight className="w-4 h-4 text-primary" />
              </div>
              添加模型映射
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>对外暴露模型名称</Label>
              <Input placeholder="例如: gpt-4o" value={externalModel} onChange={e => setExternalModel(e.target.value)} />
            </div>
            <div className="flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <ArrowRight className="w-5 h-5 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>内部真实模型名称</Label>
              <Input placeholder="例如: deepseek-chat" value={internalModel} onChange={e => setInternalModel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fallback 模型（可选，主模型失败时自动切换）</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="输入 fallback 模型名称"
                  value={newFallback}
                  onChange={e => setNewFallback(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addFallback()}
                />
                <Button variant="outline" onClick={addFallback} disabled={!newFallback}>
                  添加
                </Button>
              </div>
              {fallbackModels.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2 p-3 bg-muted rounded-lg">
                  {fallbackModels.map(model => (
                    <span key={model} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      {model}
                      <button onClick={() => removeFallback(model)} className="ml-0.5 hover:text-destructive transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsOpen(false);
              setFallbackModels([]);
            }}>取消</Button>
            <Button onClick={handleCreate}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
