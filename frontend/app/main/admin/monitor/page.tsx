"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { PageHeader } from "@/components/page-header";
import { Activity, Wifi, WifiOff, Trash2, Clock, Zap, AlertTriangle } from "lucide-react";

interface RequestEvent {
  type: string;
  timestamp: string;
  data: {
    user_id: string;
    model: string;
    tokens: number;
    latency_ms: number;
    status_code: number;
    is_stream: boolean;
    error_message?: string;
  };
}

export default function MonitorPage() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<RequestEvent[]>([]);
  const [stats, setStats] = useState({
    totalRequests: 0,
    activeRequests: 0,
    errors: 0,
    avgLatency: 0,
  });
  const wsRef = useRef<WebSocket | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const connectWebSocket = useCallback(() => {
    // 关闭现有连接
    if (wsRef.current) {
      wsRef.current.close(1000, 'Reconnecting');
      wsRef.current = null;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const wsUrl = apiUrl.replace(/^http/, 'ws') + '/admin/ws/monitor';

    try {
      const ws = new WebSocket(wsUrl);
      let pingInterval: NodeJS.Timeout | null = null;
      let reconnectTimeout: NodeJS.Timeout | null = null;

      ws.onopen = () => {
        setConnected(true);
        console.log('WebSocket connected');

        // 发送心跳保持连接
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          if (event.data === 'pong') return; // 忽略心跳响应

          const data: RequestEvent = JSON.parse(event.data);
          setEvents(prev => [...prev.slice(-100), data]);

          setStats(prev => {
            const newStats = { ...prev };
            newStats.totalRequests++;

            if (data.type === 'request_start') {
              newStats.activeRequests++;
            } else if (data.type === 'request_end') {
              newStats.activeRequests = Math.max(0, newStats.activeRequests - 1);
              if (data.data.latency_ms) {
                newStats.avgLatency = Math.round(
                  (prev.avgLatency * (prev.totalRequests - 1) + data.data.latency_ms) / prev.totalRequests
                );
              }
            } else if (data.type === 'request_error') {
              newStats.activeRequests = Math.max(0, newStats.activeRequests - 1);
              newStats.errors++;
            }

            return newStats;
          });
        } catch (e) {
          // 忽略解析错误
        }
      };

      ws.onclose = (event) => {
        setConnected(false);
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
        // 5 秒后重连
        if (event.code !== 1000) {
          reconnectTimeout = setTimeout(connectWebSocket, 5000);
        }
      };

      ws.onerror = () => {
        setConnected(false);
      };

      wsRef.current = ws;

      // 清理函数
      return () => {
        if (pingInterval) clearInterval(pingInterval);
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
      };
    } catch (e) {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, [connectWebSocket]);

  useEffect(() => {
    // Auto scroll to bottom
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const clearEvents = () => {
    setEvents([]);
    setStats({
      totalRequests: 0,
      activeRequests: 0,
      errors: 0,
      avgLatency: 0,
    });
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'request_start': return 'bg-primary';
      case 'request_end': return 'bg-success';
      case 'request_error': return 'bg-destructive';
      default: return 'bg-muted-foreground';
    }
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'request_start': return <Badge variant="secondary" className="bg-primary/10 text-primary">开始</Badge>;
      case 'request_end': return <Badge variant="default">完成</Badge>;
      case 'request_error': return <Badge variant="destructive">错误</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="实时监控"
        description="WebSocket 实时显示 API 请求状态"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={clearEvents}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              清空
            </Button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
              {connected ? (
                <>
                  <Wifi className="w-4 h-4 text-success" />
                  <span className="text-sm text-success">已连接</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-destructive" />
                  <span className="text-sm text-destructive">未连接</span>
                </>
              )}
            </div>
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <motion.div {...fadeInUp}>
          <Card className="ring-1 ring-border/40 shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">总请求数</div>
                  <div className="text-2xl font-bold text-foreground">{stats.totalRequests}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fadeInUp}>
          <Card className="ring-1 ring-border/40 shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">进行中</div>
                  <div className="text-2xl font-bold text-foreground">{stats.activeRequests}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fadeInUp}>
          <Card className="ring-1 ring-border/40 shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">平均延迟</div>
                  <div className="text-2xl font-bold text-foreground">{stats.avgLatency}ms</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fadeInUp}>
          <Card className="ring-1 ring-border/40 shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">错误数</div>
                  <div className="text-2xl font-bold text-foreground">{stats.errors}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Events Stream */}
      <motion.div {...fadeInUp}>
        <Card className="ring-1 ring-border/40 shadow-xs">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5" />
              请求流
              <Badge variant="outline" className="ml-auto">{events.length} 条记录</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[500px] overflow-y-auto space-y-2 pr-4">
              {events.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  {connected ? '等待请求...' : 'WebSocket 未连接'}
                </div>
              ) : (
                <AnimatePresence>
                  {events.map((event, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-start gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors"
                    >
                      <div className={`w-2 h-2 rounded-full mt-2 ${getEventColor(event.type)}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getEventBadge(event.type)}
                          <span className="text-xs text-muted-foreground">
                            {formatTime(event.timestamp)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          <span>
                            <span className="text-muted-foreground">用户: </span>
                            <span className="font-medium">{event.data.user_id}</span>
                          </span>
                          <span>
                            <span className="text-muted-foreground">模型: </span>
                            <Badge variant="outline" className="font-mono text-xs">
                              {event.data.model}
                            </Badge>
                          </span>
                          {event.data.tokens > 0 && (
                            <span>
                              <span className="text-muted-foreground">Token: </span>
                              <span className="font-medium">{event.data.tokens}</span>
                            </span>
                          )}
                          {event.data.latency_ms > 0 && (
                            <span>
                              <span className="text-muted-foreground">延迟: </span>
                              <span className={`font-medium ${event.data.latency_ms > 5000 ? 'text-destructive' : ''}`}>
                                {event.data.latency_ms}ms
                              </span>
                            </span>
                          )}
                          {event.data.is_stream && (
                            <Badge variant="secondary" className="text-xs">流式</Badge>
                          )}
                          {event.data.error_message && (
                            <span className="text-destructive text-xs">
                              {event.data.error_message}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
              <div ref={eventsEndRef} />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
