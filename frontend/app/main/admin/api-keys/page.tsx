"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { motion } from "motion/react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Key, ChevronLeft, ChevronRight } from "lucide-react";

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

  const totalPages = Math.ceil(total / pageSize);

  const handleDelete = async (id: number) => {
    if (!confirm("确定要强制删除该 API Key 吗？")) return;
    try {
      await apiFetch(`/admin/api-keys/${id}`, { method: "DELETE" });
      toast.success("已强制删除");
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
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="font-semibold text-foreground h-12">所属用户</TableHead>
                  <TableHead className="font-semibold text-foreground">名称</TableHead>
                  <TableHead className="font-semibold text-foreground">前缀</TableHead>
                  <TableHead className="font-semibold text-foreground">可用模型</TableHead>
                  <TableHead className="font-semibold text-foreground">QPM / 状态</TableHead>
                  <TableHead className="font-semibold text-foreground text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
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
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="border-b transition-colors hover:bg-slate-50"
                    >
                      <TableCell className="font-medium">{k.user_id}</TableCell>
                      <TableCell>{k.name || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{k.key_prefix}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(!k.allowed_models || k.allowed_models.length === 0) && <span className="text-xs text-muted-foreground">所有模型</span>}
                          {k.allowed_models?.map((m: string) => (
                            <Badge key={m} variant="secondary" className="text-[10px]">
                              {m}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {k.max_qpm} <Badge variant={k.is_active ? "default" : "secondary"}>{k.is_active ? "启用" : "禁用"}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(k.id)}>删除</Button>
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
    </div>
  );
}
