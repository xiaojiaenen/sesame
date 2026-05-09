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
import { Badge } from "@/components/ui/badge";
import { motion } from "motion/react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ArrowLeftRight, Plus, X } from "lucide-react";

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
          <Button onClick={() => setIsOpen(true)} className="bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" />
            添加映射
          </Button>
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="font-semibold text-foreground h-12">对外暴露模型</TableHead>
                  <TableHead className="font-semibold text-foreground">内部模型</TableHead>
                  <TableHead className="font-semibold text-foreground">Fallback 模型</TableHead>
                  <TableHead className="font-semibold text-foreground text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    </TableRow>
                  ))
                ) : mappings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4}>
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
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="border-b transition-colors hover:bg-slate-50"
                    >
                      <TableCell className="font-medium font-mono text-sm">{m.external_model}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-sm">{m.internal_model}</TableCell>
                      <TableCell>
                        {m.fallback_models && m.fallback_models.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {m.fallback_models.map((model: string) => (
                              <Badge key={model} variant="outline" className="text-xs">
                                {model}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">无</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(m.external_model)}>删除</Button>
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
            <DialogTitle>添加模型映射</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>对外暴露模型名称</Label>
              <Input placeholder="例如: gpt-4o" value={externalModel} onChange={e => setExternalModel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>内部真实模型名称</Label>
              <Input placeholder="内部真实模型名称" value={internalModel} onChange={e => setInternalModel(e.target.value)} />
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
                <div className="flex flex-wrap gap-2 mt-2">
                  {fallbackModels.map(model => (
                    <Badge key={model} variant="secondary" className="gap-1">
                      {model}
                      <button
                        onClick={() => removeFallback(model)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
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
