"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Network } from "lucide-react";

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail view state
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/admin/sessions");
      setSessions(data);
    } catch (e: any) {
      toast.error(e.message || "加载 Session 失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRevoke = async (userId: string) => {
    if (!confirm(`确定要废弃受影响的 Session 吗？`)) return;
    try {
      await apiFetch(`/admin/sessions/${encodeURIComponent(userId)}`, { method: "DELETE" });
      toast.success("已废弃");
      fetchSessions();
    } catch (e: any) {
      toast.error(e.message || "操作失败");
    }
  };

  const openDetail = async (userId: string) => {
    setIsDetailOpen(true);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const data = await apiFetch(`/admin/sessions/${encodeURIComponent(userId)}`);
      setDetailData(data);
    } catch (e: any) {
      toast.error(e.message || "获取详情失败");
      setIsDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Session 管理"
        description="查看和管理用户会话状态"
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
                  <TableHead className="font-semibold text-foreground h-12">用户 ID</TableHead>
                  <TableHead className="font-semibold text-foreground">状态</TableHead>
                  <TableHead className="font-semibold text-foreground">最后一次使用时间</TableHead>
                  <TableHead className="font-semibold text-foreground">过期时间</TableHead>
                  <TableHead className="font-semibold text-foreground text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    </TableRow>
                  ))
                ) : sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <EmptyState
                        icon={<Network className="w-8 h-8 text-muted-foreground" />}
                        title="暂无活动 Session"
                        description="用户登录后会话将显示在这里"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((s, i) => (
                    <motion.tr
                      key={i}
                      {...fadeInUp}
                      transition={{ ...fadeInUp.transition, delay: i * 0.05 }}
                      className="border-b transition-colors hover:bg-accent/50"
                    >
                      <TableCell className="font-medium">{s.user_id}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "active" ? "default" : "secondary"}>
                          {s.status === "active" ? "活跃" : s.status === "expired" ? "已过期" : s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.last_used_at ? new Date(s.last_used_at).toLocaleString() : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.expire_at ? new Date(s.expire_at).toLocaleString() : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openDetail(s.user_id)}>详情</Button>
                          <Button variant="destructive" size="sm" onClick={() => handleRevoke(s.user_id)}>废弃</Button>
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

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Session 详情</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {detailLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : detailData ? (
              <pre className="p-4 bg-muted text-xs overflow-auto rounded-md">
                {JSON.stringify(detailData, null, 2)}
              </pre>
            ) : (
              <div className="text-sm text-muted-foreground">暂无数据</div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsDetailOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
