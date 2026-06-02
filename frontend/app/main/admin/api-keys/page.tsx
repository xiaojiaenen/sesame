"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Key, Trash2, User, Zap } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { ConfirmDialog } from "@/components/confirm-dialog";

export default function AdminApiKeysPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      const data = await apiFetch(`/admin/api-keys?${params}`);
      setKeys(data.keys);
      setTotal(data.total);
    } catch (e: any) {
      toast.error(e.message || "加载 API Keys 失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, [page]);

  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const handleDelete = async () => {
    if (deleteTarget === null) return;
    try {
      await apiFetch(`/admin/api-keys/${deleteTarget}`, { method: "DELETE" });
      toast.success("已强制删除");
      setDeleteTarget(null);
      fetchKeys();
    } catch (e: any) {
      toast.error(e.message || "删除失败");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="全局 API Keys"
        description="查看和管理所有用户的 API Key"
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
                  <TableHead className="font-semibold text-foreground h-11 text-xs uppercase tracking-wider">所属用户</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">名称</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">前缀</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">可用模型</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">QPM / 状态</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20 rounded-md" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : keys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <EmptyState
                        icon={<Key className="w-8 h-8 text-muted-foreground" />}
                        title="暂无 API Key 数据"
                        description="用户创建的 API Key 将显示在这里"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  keys.map((k, i) => (
                    <motion.tr
                      key={k.id}
                      {...fadeInUp}
                      transition={{ ...fadeInUp.transition, delay: i * 0.02 }}
                      className="border-b transition-colors hover:bg-accent/40"
                    >
                      <TableCell className="py-2.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/8 text-primary">
                          <User className="w-3 h-3" />
                          {k.user_id}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className="text-sm text-foreground">{k.name || <span className="text-muted-foreground">-</span>}</span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <code className="px-2 py-0.5 rounded-md text-xs font-mono bg-muted/60 text-foreground/80">
                          {k.key_prefix}
                        </code>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {(!k.allowed_models || k.allowed_models.length === 0) ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              所有模型
                            </span>
                          ) : (
                            k.allowed_models.map((m: string) => (
                              <span key={m} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono bg-violet-500/10 text-violet-600 dark:text-violet-400">
                                {m}
                              </span>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium tabular-nums bg-sky-500/10 text-sky-600 dark:text-sky-400">
                            <Zap className="w-3 h-3" />
                            {k.max_qpm}/分
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            k.is_active
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-red-500/10 text-red-600 dark:text-red-400"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${k.is_active ? "bg-emerald-500" : "bg-red-500"}`} />
                            {k.is_active ? "启用" : "禁用"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(k.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          强制删除
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

      <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="强制删除 API Key"
        description="确定要强制删除该 API Key 吗？删除后立即失效，使用该 Key 的所有客户端将无法访问。"
        confirmText="强制删除"
        onConfirm={handleDelete}
      />
    </div>
  );
}
