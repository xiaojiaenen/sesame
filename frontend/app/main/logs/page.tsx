"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { TokenDisplay } from "@/components/token-display";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { FileText, Search, AlertCircle, ArrowDown, ArrowUp, Wifi, WifiOff } from "lucide-react";
import { Pagination } from "@/components/pagination";

interface RequestLog {
  id: number;
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
  request_body: string | null;
  response_body: string | null;
  created_at: string | null;
}

function formatTime(dateStr: string): { time: string; date: string } {
  const d = new Date(dateStr);
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  return { time, date };
}

function StatusBadge({ code }: { code: number | null }) {
  if (!code) return <span className="text-muted-foreground text-xs">-</span>;
  const is2xx = code >= 200 && code < 300;
  const is4xx = code >= 400 && code < 500;
  const is5xx = code >= 500;

  return (
    <span className={`
      inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums
      ${is2xx ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : ''}
      ${is4xx ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : ''}
      ${is5xx ? 'bg-red-500/10 text-red-600 dark:text-red-400' : ''}
      ${!is2xx && !is4xx && !is5xx ? 'bg-muted text-muted-foreground' : ''}
    `}>
      {is5xx && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
      {code}
    </span>
  );
}

function LatencyCell({ ms }: { ms: number | null }) {
  if (!ms) return <span className="text-muted-foreground text-xs">-</span>;
  const color = ms < 1000 ? 'text-emerald-600 dark:text-emerald-400'
    : ms < 3000 ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400';
  const bg = ms < 1000 ? 'bg-emerald-500/10'
    : ms < 3000 ? 'bg-amber-500/10'
    : 'bg-red-500/10';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium tabular-nums ${color} ${bg}`}>
      {ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`}
    </span>
  );
}

function FormatBadge({ format }: { format: string | null }) {
  if (!format) return <span className="text-muted-foreground text-xs">-</span>;
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    openai: { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', label: 'OpenAI' },
    anthropic: { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', label: 'Anthropic' },
    responses: { bg: 'bg-sky-500/10', text: 'text-sky-600 dark:text-sky-400', label: 'Responses' },
  };
  const s = styles[format] || { bg: 'bg-muted', text: 'text-muted-foreground', label: format };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function TokenCell({ prompt, completion }: { prompt: number; completion: number }) {
  const total = prompt + completion;
  if (total === 0) return <span className="text-muted-foreground text-xs">0</span>;
  const promptPct = total > 0 ? (prompt / total) * 100 : 50;

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 space-y-1">
        <div className="text-xs font-semibold tabular-nums text-foreground"><TokenDisplay n={total} /></div>
        <div className="flex h-1.5 rounded-full overflow-hidden bg-muted/60">
          <div className="bg-sky-400 dark:bg-sky-500 rounded-l-full" style={{ width: `${promptPct}%` }} />
          <div className="bg-violet-400 dark:bg-violet-500 rounded-r-full" style={{ width: `${100 - promptPct}%` }} />
        </div>
      </div>
      <div className="flex flex-col text-[10px] text-muted-foreground leading-tight tabular-nums shrink-0">
        <span className="flex items-center gap-0.5"><ArrowDown className="w-2.5 h-2.5 text-sky-400" /><TokenDisplay n={prompt} /></span>
        <span className="flex items-center gap-0.5"><ArrowUp className="w-2.5 h-2.5 text-violet-400" /><TokenDisplay n={completion} /></span>
      </div>
    </div>
  );
}

function StreamBadge({ isStream }: { isStream: boolean }) {
  return isStream ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
      <Wifi className="w-3 h-3" />
      流式
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
      <WifiOff className="w-3 h-3" />
      非流式
    </span>
  );
}

export default function UserLogsPage() {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);

  const [model, setModel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (model) params.append("model", model);
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      if (errorsOnly) params.append("errors_only", "true");

      const data = await apiFetch(`/user/logs?${params}`);
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
        description="查看我的 API 调用记录"
      />

      {/* Filters */}
      <motion.div {...fadeInUp}>
        <Card className="ring-1 ring-border/40 shadow-xs">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-end">
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
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Table */}
      <motion.div
        {...fadeInUp}
        transition={{ ...fadeInUp.transition, delay: 0.1 }}
      >
        <Card className="ring-1 ring-border/40 shadow-xs overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="font-semibold text-foreground h-11 text-xs uppercase tracking-wider">时间</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">请求模型</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">实际模型</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">Token 消耗</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">延迟</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">格式</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">状态</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">错误信息</TableHead>
                  <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">类型</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-12 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                    </TableRow>
                  ))
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <EmptyState
                        icon={<FileText className="w-8 h-8 text-muted-foreground" />}
                        title="暂无请求日志"
                        description="API 调用记录将显示在这里"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log, i) => {
                    const t = log.created_at ? formatTime(log.created_at) : null;
                    const hasError = log.status_code && log.status_code >= 400;
                    const hasDetail = hasError && (log.request_body || log.response_body);
                    return (
                      <motion.tr
                        key={log.id}
                        {...fadeInUp}
                        transition={{ ...fadeInUp.transition, delay: i * 0.015 }}
                        className={`border-b transition-colors hover:bg-accent/40 ${hasError ? 'bg-destructive/[0.02]' : ''}`}
                      >
                        <TableCell className="py-2.5">
                          {t ? (
                            <div className="flex flex-col leading-tight">
                              <span className="text-sm tabular-nums text-foreground">{t.time}</span>
                              <span className="text-[11px] tabular-nums text-muted-foreground">{t.date}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono bg-muted/60 text-foreground/80 max-w-[160px] truncate" title={log.model || ''}>
                            {log.model || "-"}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono bg-secondary/60 text-secondary-foreground max-w-[160px] truncate" title={log.internal_model || log.model || ''}>
                            {log.internal_model || log.model || "-"}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <TokenCell prompt={log.tokens_prompt} completion={log.tokens_completion} />
                        </TableCell>
                        <TableCell className="py-2.5">
                          <LatencyCell ms={log.latency_ms} />
                        </TableCell>
                        <TableCell className="py-2.5">
                          <FormatBadge format={log.api_format} />
                        </TableCell>
                        <TableCell className="py-2.5">
                          <StatusBadge code={log.status_code} />
                        </TableCell>
                        <TableCell className="py-2.5 max-w-[200px]">
                          {log.error_message ? (
                            <span
                              className={`text-xs text-destructive truncate block max-w-[200px] leading-relaxed ${hasDetail ? 'cursor-pointer hover:underline' : ''}`}
                              title={hasDetail ? '点击查看详情' : log.error_message}
                              onClick={() => hasDetail && setSelectedLog(log)}
                            >
                              {log.error_message}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <StreamBadge isStream={log.is_stream} />
                        </TableCell>
                      </motion.tr>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </motion.div>

      <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>请求错误详情</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">日志 ID：</span>{selectedLog.id}</div>
                <div><span className="text-muted-foreground">模型：</span>{selectedLog.model}</div>
                <div><span className="text-muted-foreground">状态码：</span><StatusBadge code={selectedLog.status_code} /></div>
                <div><span className="text-muted-foreground">格式：</span><FormatBadge format={selectedLog.api_format} /></div>
              </div>
              {selectedLog.error_message && (
                <div>
                  <div className="text-xs font-semibold text-foreground mb-1.5">错误信息</div>
                  <pre className="text-xs bg-destructive/5 rounded-md p-3 border border-destructive/20 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                    {selectedLog.error_message}
                  </pre>
                </div>
              )}
              {selectedLog.request_body && (
                <div>
                  <div className="text-xs font-semibold text-foreground mb-1.5">请求体</div>
                  <pre className="text-xs bg-background rounded-md p-3 border border-border/50 whitespace-pre-wrap break-all max-h-80 overflow-y-auto">
                    {selectedLog.request_body}
                  </pre>
                </div>
              )}
              {selectedLog.response_body && (
                <div>
                  <div className="text-xs font-semibold text-foreground mb-1.5">响应体</div>
                  <pre className="text-xs bg-background rounded-md p-3 border border-border/50 whitespace-pre-wrap break-all max-h-80 overflow-y-auto">
                    {selectedLog.response_body}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
