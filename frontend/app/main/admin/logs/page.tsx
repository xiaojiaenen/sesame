"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { FileText, Search, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";

interface RequestLog {
  id: number;
  user_id: string;
  key_id: number | null;
  channel_id: number | null;
  model: string | null;
  internal_model: string | null;
  tokens_prompt: number;
  tokens_completion: number;
  latency_ms: number | null;
  status_code: number | null;
  is_stream: boolean;
  api_format: string | null;
  error_message: string | null;
  created_at: string | null;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);

  const [userId, setUserId] = useState("");
  const [model, setModel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (userId) params.append("user_id", userId);
      if (model) params.append("model", model);
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      if (errorsOnly) params.append("errors_only", "true");

      const data = await apiFetch(`/admin/logs?${params}`);
      setLogs(data.logs);
      setTotal(data.total);
    } catch (e: any) {
      toast.error(e.message || "加载日志失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, errorsOnly]);

  const handleSearch = () => {
    setPage(0);
    fetchLogs();
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <PageHeader
        title="请求日志"
        description="查看 API 调用记录"
      />

      {/* Filters */}
      <motion.div
        {...fadeInUp}
        className="flex flex-wrap gap-4 items-end"
      >
        <div className="space-y-2">
          <Label>用户 ID</Label>
          <Input value={userId} onChange={e => setUserId(e.target.value)} placeholder="筛选用户" className="w-40" />
        </div>
        <div className="space-y-2">
          <Label>模型</Label>
          <Input value={model} onChange={e => setModel(e.target.value)} placeholder="筛选模型" className="w-40" />
        </div>
        <div className="space-y-2">
          <Label>开始日期</Label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-2">
          <Label>结束日期</Label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
        </div>
        <Button onClick={handleSearch}>
          <Search className="w-4 h-4 mr-2" />
          搜索
        </Button>
        <div className="flex items-center gap-2 pb-1">
          <Checkbox
            id="errorsOnly"
            checked={errorsOnly}
            onCheckedChange={(checked) => {
              setErrorsOnly(checked === true);
              setPage(0);
            }}
          />
          <Label htmlFor="errorsOnly" className="text-sm cursor-pointer flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 text-destructive" />
            仅错误
          </Label>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div
        {...fadeInUp}
        transition={{ ...fadeInUp.transition, delay: 0.1 }}
      >
        <Card className="ring-1 ring-border/40 shadow-xs">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="font-semibold text-foreground h-12">时间</TableHead>
                  <TableHead className="font-semibold text-foreground">用户</TableHead>
                  <TableHead className="font-semibold text-foreground">请求模型</TableHead>
                  <TableHead className="font-semibold text-foreground">实际模型</TableHead>
                  <TableHead className="font-semibold text-foreground">Token 消耗</TableHead>
                  <TableHead className="font-semibold text-foreground">延迟</TableHead>
                  <TableHead className="font-semibold text-foreground">格式</TableHead>
                  <TableHead className="font-semibold text-foreground">状态</TableHead>
                  <TableHead className="font-semibold text-foreground">错误信息</TableHead>
                  <TableHead className="font-semibold text-foreground">类型</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <EmptyState
                        icon={<FileText className="w-8 h-8 text-muted-foreground" />}
                        title="暂无请求日志"
                        description="API 调用记录将显示在这里"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log, i) => (
                    <motion.tr
                      key={log.id}
                      {...fadeInUp}
                      transition={{ ...fadeInUp.transition, delay: i * 0.02 }}
                      className="border-b transition-colors hover:bg-accent/50"
                    >
                      <TableCell className="text-sm text-muted-foreground">
                        {log.created_at ? new Date(log.created_at).toLocaleString() : "-"}
                      </TableCell>
                      <TableCell className="font-medium">{log.user_id}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs w-fit">
                          {log.model || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs w-fit">
                          {log.internal_model || log.model || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span className="text-foreground">{log.tokens_prompt + log.tokens_completion}</span>
                          <span className="text-muted-foreground text-xs ml-1">
                            ({log.tokens_prompt} + {log.tokens_completion})
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm ${log.latency_ms && log.latency_ms > 5000 ? 'text-destructive' : ''}`}>
                          {log.latency_ms ? `${log.latency_ms}ms` : "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">
                          {log.api_format === "anthropic" ? "Anthropic" : log.api_format === "openai" ? "OpenAI" : log.api_format === "responses" ? "Responses" : "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={log.status_code && log.status_code < 400 ? "default" : "destructive"}>
                          {log.status_code || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {log.error_message ? (
                          <span className="text-xs text-destructive max-w-[200px] truncate block" title={log.error_message}>
                            {log.error_message}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={log.is_stream ? "secondary" : "outline"} className="text-[11px]">
                          {log.is_stream ? "流式" : "非流式"}
                        </Badge>
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
