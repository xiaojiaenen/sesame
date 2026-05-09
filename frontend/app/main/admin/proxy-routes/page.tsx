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
import { Switch } from "@/components/ui/switch";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Route } from "lucide-react";

export default function ProxyRoutesPage() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isOpen, setIsOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);

  const [path, setPath] = useState("");
  const [backendPath, setBackendPath] = useState("");
  const [method, setMethod] = useState("POST");
  const [isStreamable, setIsStreamable] = useState(true);
  const [isEnabled, setIsEnabled] = useState(true);
  const [description, setDescription] = useState("");

  const fetchRoutes = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/admin/proxy-routes");
      setRoutes(data);
    } catch (e: any) {
      toast.error(e.message || "加载路由失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  const handleSave = async () => {
    try {
      const payload = {
        path,
        backend_path: backendPath,
        method,
        is_streamable: isStreamable,
        is_enabled: isEnabled,
        description,
      };

      if (isEdit && currentId) {
        await apiFetch(`/admin/proxy-routes/${currentId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("更新成功");
      } else {
        await apiFetch("/admin/proxy-routes", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("创建成功");
      }
      setIsOpen(false);
      fetchRoutes();
    } catch (e: any) {
      toast.error(e.message || "保存失败");
    }
  };

  const handleEdit = (r: any) => {
    setIsEdit(true);
    setCurrentId(r.id);
    setPath(r.path);
    setBackendPath(r.backend_path);
    setMethod(r.method);
    setIsStreamable(r.is_streamable);
    setIsEnabled(r.is_enabled !== false);
    setDescription(r.description || "");
    setIsOpen(true);
  };

  const openCreate = () => {
    setIsEdit(false);
    setCurrentId(null);
    setPath("");
    setBackendPath("");
    setMethod("POST");
    setIsStreamable(true);
    setIsEnabled(true);
    setDescription("");
    setIsOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除吗？")) return;
    try {
      await apiFetch(`/admin/proxy-routes/${id}`, { method: "DELETE" });
      toast.success("已删除");
      fetchRoutes();
    } catch (e: any) {
      toast.error(e.message || "删除失败");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="代理路由"
        description="配置 API 请求的代理转发规则"
        action={
          <Button onClick={openCreate}>
            添加路由
          </Button>
        }
      />

      <motion.div
        {...fadeInUp}
        transition={{ ...fadeInUp.transition, delay: 0.1 }}
      >
        <Card className="ring-1 ring-border/40 shadow-xs">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="font-semibold text-foreground h-12">触发路径</TableHead>
                  <TableHead className="font-semibold text-foreground">目标路径</TableHead>
                  <TableHead className="font-semibold text-foreground">方法</TableHead>
                  <TableHead className="font-semibold text-foreground">流式</TableHead>
                  <TableHead className="font-semibold text-foreground">状态</TableHead>
                  <TableHead className="font-semibold text-foreground">描述</TableHead>
                  <TableHead className="font-semibold text-foreground text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : routes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <EmptyState
                        icon={<Route className="w-8 h-8 text-muted-foreground" />}
                        title="暂无代理路由"
                        description="添加路由来配置 API 请求转发规则"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  routes.map((r, i) => (
                    <motion.tr
                      key={r.id}
                      {...fadeInUp}
                      transition={{ ...fadeInUp.transition, delay: i * 0.05 }}
                      className="border-b transition-colors hover:bg-accent/50"
                    >
                      <TableCell className="font-medium font-mono text-sm">{r.path}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{r.backend_path}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.method}</Badge>
                      </TableCell>
                      <TableCell>
                        {r.is_streamable ? <Badge>支持</Badge> : <Badge variant="secondary">否</Badge>}
                      </TableCell>
                      <TableCell>
                        {r.is_enabled !== false ? <Badge variant="default">启用</Badge> : <Badge variant="outline">禁用</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">{r.description || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEdit(r)}>编辑</Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(r.id)}>删除</Button>
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

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEdit ? "编辑路由" : "新增路由"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>匹配路径 (如 /v1/chat/completions)</Label>
              <Input value={path} onChange={e => setPath(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>目标后端路径 (如 /api/v1/chat)</Label>
              <Input value={backendPath} onChange={e => setBackendPath(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>HTTP 方法</Label>
              <Input value={method} onChange={e => setMethod(e.target.value)} placeholder="GET, POST..." />
            </div>
            <div className="flex items-center space-x-2">
              <Switch checked={isStreamable} onCheckedChange={setIsStreamable} id="stream" />
              <Label htmlFor="stream">支持流式传输</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} id="enabled" />
              <Label htmlFor="enabled">启用路由</Label>
            </div>
            <div className="space-y-2">
              <Label>描述 (可选)</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} />
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
