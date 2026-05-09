"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "motion/react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import {
  Key, Plus, Copy, Check, Trash2,
  Power, PowerOff, AlertTriangle
} from "lucide-react";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Create state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newModels, setNewModels] = useState<string[]>([]);
  const [newQpm, setNewQpm] = useState("60");
  const [newExpire, setNewExpire] = useState("");
  const [createdKey, setCreatedKey] = useState("");
  const [copiedKey, setCopiedKey] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [keysData, modelsData] = await Promise.all([
        apiFetch("/user/api-keys"),
        apiFetch("/user/models"),
      ]);
      setKeys(keysData);
      setModels(modelsData);
    } catch (error) {
      toast.error("加载数据失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async () => {
    try {
      const res = await apiFetch("/user/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: newName || undefined,
          allowed_models: newModels,
          max_qpm: parseInt(newQpm, 10) || 60,
          expire_days: newExpire ? parseInt(newExpire, 10) : undefined,
        }),
      });
      setCreatedKey(res.api_key);
      toast.success("创建成功");
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const closeCreate = () => {
    setIsCreateOpen(false);
    setCreatedKey("");
    setCopiedKey(false);
    setNewName("");
    setNewModels([]);
    setNewQpm("60");
    setNewExpire("");
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    toast.success("已复制到剪贴板");
  };

  const [copyingKeyId, setCopyingKeyId] = useState<number | null>(null);

  const handleCopyKey = async (keyId: number) => {
    setCopyingKeyId(keyId);
    try {
      const res = await apiFetch(`/user/api-keys/${keyId}/reveal`);
      await navigator.clipboard.writeText(res.api_key);
      toast.success("API Key 已复制到剪贴板");
    } catch (e: any) {
      toast.error(e.message || "获取 Key 失败");
    } finally {
      setCopyingKeyId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除此 Key 吗？")) return;
    try {
      await apiFetch(`/user/api-keys/${id}`, { method: "DELETE" });
      toast.success("删除成功");
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const toggleActive = async (id: number, currentActive: boolean) => {
    try {
      await apiFetch(`/user/api-keys/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !currentActive }),
      });
      toast.success(currentActive ? "已禁用" : "已启用");
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="API Key 管理" 
        description="创建和管理您的 API 访问密钥"
        action={
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="bg-primary hover:bg-primary/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            创建 Key
          </Button>
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="border-0 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="font-semibold text-slate-700 h-12">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-slate-400" />
                      名称
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700">前缀</TableHead>
                  <TableHead className="font-semibold text-slate-700">可用模型</TableHead>
                  <TableHead className="font-semibold text-slate-700">QPM</TableHead>
                  <TableHead className="font-semibold text-slate-700">状态</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-36" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    </TableRow>
                  ))
                ) : keys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <EmptyState
                        icon={<Key className="w-8 h-8 text-slate-400" />}
                        title="还没有创建任何 Key"
                        description="创建一个 API Key 来开始使用 Sesame Gateway"
                        action={
                          <Button 
                            onClick={() => setIsCreateOpen(true)}
                            variant="outline"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            创建第一个 Key
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  keys.map((k: any, i) => (
                    <motion.tr
                      key={k.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="border-b transition-colors hover:bg-slate-50/50"
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                            <Key className="w-4 h-4 text-slate-500" />
                          </div>
                          <span className="font-medium text-foreground">{k.name || "未命名"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="px-2 py-1 bg-slate-100 rounded text-xs font-mono text-slate-600">
                          {k.key_prefix}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {(!k.allowed_models || k.allowed_models.length === 0) ? (
                            <Badge variant="secondary" className="text-xs bg-emerald-50 text-emerald-700">
                              所有权限
                            </Badge>
                          ) : (
                            k.allowed_models.slice(0, 2).map((m: string) => (
                              <Badge key={m} variant="secondary" className="text-[10px]">
                                {m}
                              </Badge>
                            ))
                          )}
                          {k.allowed_models?.length > 2 && (
                            <Badge variant="secondary" className="text-[10px]">
                              +{k.allowed_models.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-sm">{k.max_qpm}</span>
                          <span className="text-xs text-slate-400">/分</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={k.is_active ? "default" : "secondary"}
                          className={k.is_active ? "bg-emerald-100 text-emerald-700" : ""}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${k.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                          {k.is_active ? "启用" : "禁用"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyKey(k.id)}
                            disabled={copyingKeyId === k.id}
                            className="text-slate-500 hover:text-foreground hover:bg-slate-100"
                          >
                            {copyingKeyId === k.id ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleActive(k.id, k.is_active)}
                            className={k.is_active ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50" : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"}
                          >
                            {k.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(k.id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
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

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => !open && closeCreate()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Key className="w-4 h-4 text-primary" />
              </div>
              创建 API Key
            </DialogTitle>
            <DialogDescription>
              创建一个新的 API Key 用于访问 Sesame Gateway
            </DialogDescription>
          </DialogHeader>
          
          {createdKey ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4"
            >
              <div className="p-6 bg-emerald-50 rounded-xl text-center border border-emerald-200">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <Check className="w-5 h-5 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-700">创建成功！</span>
                </div>
                <div className="p-3 bg-white rounded-lg border border-emerald-200">
                  <code className="text-sm font-mono break-all text-foreground">{createdKey}</code>
                </div>
                <Button
                  onClick={() => handleCopy(createdKey)}
                  className="mt-4 bg-primary hover:bg-primary/90"
                  disabled={copiedKey}
                >
                  {copiedKey ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      复制 API Key
                    </>
                  )}
                </Button>
              </div>
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-700">
                  请妥善保存此 Key，关闭弹窗后将无法再次查看！
                </p>
              </div>
              <DialogFooter>
                <Button onClick={closeCreate} className="w-full">完成</Button>
              </DialogFooter>
            </motion.div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-600">名称 (可选)</Label>
                <Input 
                  value={newName} 
                  onChange={e => setNewName(e.target.value)} 
                  placeholder="我的测试 Key"
                  className="bg-slate-50/50"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-600">每分钟请求限制 (QPM)</Label>
                <Input 
                  type="number" 
                  value={newQpm} 
                  onChange={e => setNewQpm(e.target.value)}
                  className="bg-slate-50/50"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-600">有效天数 (可选，留空为永久)</Label>
                <Input 
                  type="number" 
                  value={newExpire} 
                  onChange={e => setNewExpire(e.target.value)}
                  placeholder="30"
                  className="bg-slate-50/50"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-600">允许的模型 (不选则拥有所有权限)</Label>
                <div className="max-h-48 overflow-y-auto space-y-2 border border-slate-200 p-3 rounded-xl bg-slate-50/50">
                  {models.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">暂无可用模型</p>
                  ) : (
                    models.map((m: any) => (
                      <div key={m.external_model} className="flex items-center space-x-2 p-2 hover:bg-white rounded-lg transition-colors">
                        <Checkbox 
                          id={`model-${m.external_model}`}
                          checked={newModels.includes(m.external_model)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setNewModels([...newModels, m.external_model]);
                            } else {
                              setNewModels(newModels.filter(x => x !== m.external_model));
                            }
                          }}
                        />
                        <label htmlFor={`model-${m.external_model}`} className="text-sm font-medium leading-none cursor-pointer flex-1">
                          {m.external_model}
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={closeCreate}>取消</Button>
                <Button
                  onClick={handleCreate}
                  className="bg-primary hover:bg-primary/90"
                >
                  创建
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
