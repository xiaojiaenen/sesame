"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Users, ChevronLeft, ChevronRight, Shield, User, UserMinus, Plus } from "lucide-react";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);

  // create user state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      const data = await apiFetch(`/admin/users?${params}`);
      setUsers(data.users);
      setTotal(data.total);
    } catch (e: any) {
      toast.error(e.message || "加载用户失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page]);

  const handleCreate = async () => {
    try {
      await apiFetch("/admin/users", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, password, role }),
      });
      toast.success("用户创建成功");
      setIsCreateOpen(false);
      setUserId("");
      setPassword("");
      setRole("user");
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message || "创建失败");
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  const handleDisable = async (id: string) => {
    if (!confirm(`确定要禁用用户 ${id} 吗？`)) return;
    try {
      await apiFetch(`/admin/users/${id}`, { method: "DELETE" });
      toast.success("用户已禁用");
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message || "操作失败");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="用户管理"
        description="管理系统用户账户"
        action={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            创建用户
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
                  <TableHead className="font-semibold text-foreground h-11 text-xs uppercase tracking-wider">用户名</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">角色</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">状态</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">创建时间</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <EmptyState
                        icon={<Users className="w-8 h-8 text-muted-foreground" />}
                        title="暂无用户数据"
                        description="创建第一个用户来开始使用系统"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u, i) => (
                    <motion.tr
                      key={u.user_id}
                      {...fadeInUp}
                      transition={{ ...fadeInUp.transition, delay: i * 0.02 }}
                      className={`border-b transition-colors hover:bg-accent/40 ${!u.is_active ? 'opacity-60' : ''}`}
                    >
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            u.role === "admin"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : "bg-primary/8 text-primary"
                          }`}>
                            {u.role === "admin" ? (
                              <Shield className="w-4 h-4" />
                            ) : (
                              <User className="w-4 h-4" />
                            )}
                          </div>
                          <span className="font-medium text-foreground">{u.user_id}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          u.role === "admin"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {u.role === "admin" ? (
                            <><Shield className="w-3 h-3" /> 管理员</>
                          ) : (
                            <><User className="w-3 h-3" /> 普通用户</>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          u.is_active
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-red-500/10 text-red-600 dark:text-red-400"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? "bg-emerald-500" : "bg-red-500"}`} />
                          {u.is_active ? "正常" : "禁用"}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {u.created_at ? new Date(u.created_at).toLocaleString("zh-CN") : "-"}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDisable(u.user_id)}
                          disabled={!u.is_active || u.role === "admin"}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-30"
                        >
                          <UserMinus className="w-4 h-4 mr-1" />
                          禁用
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

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Plus className="w-4 h-4 text-primary" />
              </div>
              创建用户
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>用户名</Label>
              <Input value={userId} onChange={e => setUserId(e.target.value)} placeholder="输入用户名" />
            </div>
            <div className="space-y-2">
              <Label>密码</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="输入密码" />
            </div>
            <div className="space-y-2">
              <Label>角色</Label>
              <Select value={role} onValueChange={(v) => setRole(v || "user")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">普通用户</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreate}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
