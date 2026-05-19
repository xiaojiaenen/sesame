"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { PageHeader } from "@/components/page-header";
import { Activity, Wifi, WifiOff, Trash2, Clock, Zap, AlertTriangle, Radio } from "lucide-react";

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

function PulseRing({ color = "primary", size = 48 }: { color?: string; size?: number }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`absolute rounded-full border bg-${color}/5 border-${color}/20`}
          style={{
            width: size * (1 + i * 0.6),
            height: size * (1 + i * 0.6),
            animation: `pulse-ring 3s ease-out ${i * 0.8}s infinite`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
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
    if (wsRef.current) {
      wsRef.current.close(1000, 'Reconnecting');
      wsRef.current = null;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    const wsUrl = apiUrl.replace(/^http/, 'ws') + '/admin/ws/monitor';

    try {
      const ws = new WebSocket(wsUrl);
      let pingInterval: NodeJS.Timeout | null = null;
      let reconnectTimeout: NodeJS.Timeout | null = null;

      ws.onopen = () => {
        setConnected(true);
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          if (event.data === 'pong') return;

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
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = (event) => {
        setConnected(false);
        if (pingInterval) clearInterval(pingInterval);
        if (event.code !== 1000) {
          reconnectTimeout = setTimeout(connectWebSocket, 5000);
        }
      };

      ws.onerror = () => {
        setConnected(false);
      };

      wsRef.current = ws;

      return () => {
        if (pingInterval) clearInterval(pingInterval);
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
      };
    } catch {
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
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const clearEvents = () => {
    setEvents([]);
    setStats({ totalRequests: 0, activeRequests: 0, errors: 0, avgLatency: 0 });
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'request_start': return 'border-l-primary bg-primary/5';
      case 'request_end': return 'border-l-emerald-500 bg-emerald-500/5';
      case 'request_error': return 'border-l-red-500 bg-red-500/5';
      default: return 'border-l-muted-foreground';
    }
  };

  const getEventDot = (type: string) => {
    switch (type) {
      case 'request_start': return 'bg-primary';
      case 'request_end': return 'bg-emerald-500';
      case 'request_error': return 'bg-red-500';
      default: return 'bg-muted-foreground';
    }
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'request_start': return <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs">请求开始</Badge>;
      case 'request_end': return <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs">请求完成</Badge>;
      case 'request_error': return <Badge variant="destructive" className="text-xs">请求错误</Badge>;
      default: return <Badge variant="outline" className="text-xs">{type}</Badge>;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const statItems = [
    { icon: Activity, label: "总请求数", value: stats.totalRequests, color: "primary", bg: "bg-primary/10", text: "text-primary" },
    { icon: Zap, label: "进行中", value: stats.activeRequests, color: "amber", bg: "bg-amber-500/10", text: "text-amber-500" },
    { icon: Clock, label: "平均延迟", value: `${stats.avgLatency}ms`, color: "violet", bg: "bg-violet-500/10", text: "text-violet-500" },
    { icon: AlertTriangle, label: "错误数", value: stats.errors, color: "red", bg: "bg-red-500/10", text: "text-red-500" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="实时监控"
        description="WebSocket 实时显示 API 请求状态"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={clearEvents}>
              <Trash2 className="w-4 h-4 mr-2" />
              清空
            </Button>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
              connected ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 text-destructive"
            }`}>
              {connected ? (
                <><Wifi className="w-4 h-4" /><span className="text-sm font-medium">已连接</span></>
              ) : (
                <><WifiOff className="w-4 h-4" /><span className="text-sm font-medium">断开</span></>
              )}
            </div>
          </div>
        }
      />

      {/* ═══ Stats Cards with pulse rings ═══ */}
      <div className="grid gap-4 md:grid-cols-4">
        {statItems.map((item, i) => (
          <motion.div key={i} {...fadeInUp} transition={{ delay: i * 0.05 }}>
            <Card className="ring-1 ring-border/40 shadow-xs hover:shadow-md transition-all duration-300 relative overflow-hidden group">
              <div className={`absolute top-0 right-0 w-24 h-24 ${item.bg} rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-y-1/2 translate-x-1/2`} />
              <CardContent className="p-5 relative">
                <div className="flex items-center gap-4">
                  <div className={`relative w-12 h-12 rounded-xl ${item.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                    <item.icon className={`w-5 h-5 ${item.text}`} />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{item.label}</div>
                    <motion.div
                      key={item.value}
                      initial={{ scale: 1.15, opacity: 0.5 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className="text-2xl font-bold text-foreground tabular-nums mt-0.5"
                    >
                      {item.value}
                    </motion.div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* ═══ Radar visualization ═══ */}
      <motion.div {...fadeInUp}>
        <Card className="ring-1 ring-border/40 shadow-xs overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Radio className="w-5 h-5 text-primary" />
              实时请求流
              <Badge variant="outline" className="ml-auto">{events.length} 条</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {/* Radar background */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg opacity-[0.03] dark:opacity-[0.06]">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/20"
                      style={{
                        width: 80 * (i + 1),
                        height: 80 * (i + 1),
                        animation: `radar-sweep 4s ease-out ${i * 1.3}s infinite`,
                        opacity: 0,
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="h-[480px] overflow-y-auto space-y-1.5 pr-2 relative">
                {events.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                      <Radio className="w-6 h-6" />
                    </div>
                    <span className="text-sm">{connected ? "等待请求..." : "WebSocket 未连接"}</span>
                  </div>
                ) : (
                  <AnimatePresence>
                    {events.map((event, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -16, height: 0 }}
                        animate={{ opacity: 1, x: 0, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`border-l-2 rounded-r-lg p-3 ${getEventColor(event.type)} transition-colors`}
                      >
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <span className={`w-2 h-2 rounded-full ${getEventDot(event.type)} flex-shrink-0`} />
                          {getEventBadge(event.type)}
                          <span className="text-[11px] text-muted-foreground tabular-nums ml-auto">
                            {formatTime(event.timestamp)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm ml-4.5">
                          <span>
                            <span className="text-muted-foreground text-xs">用户 </span>
                            <span className="font-medium text-xs">{event.data.user_id}</span>
                          </span>
                          <span>
                            <span className="text-muted-foreground text-xs">模型 </span>
                            <Badge variant="outline" className="font-mono text-[11px] px-1.5 py-0">
                              {event.data.model}
                            </Badge>
                          </span>
                          {event.data.tokens > 0 && (
                            <span>
                              <span className="text-muted-foreground text-xs">Token </span>
                              <span className="font-medium text-xs tabular-nums">{event.data.tokens}</span>
                            </span>
                          )}
                          {event.data.latency_ms > 0 && (
                            <span>
                              <span className="text-muted-foreground text-xs">延迟 </span>
                              <span className={`font-medium text-xs tabular-nums ${event.data.latency_ms > 5000 ? "text-destructive" : ""}`}>
                                {event.data.latency_ms}ms
                              </span>
                            </span>
                          )}
                          {event.data.is_stream && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0">流式</Badge>
                          )}
                          {event.data.error_message && (
                            <span className="text-destructive text-xs truncate max-w-[200px]">
                              {event.data.error_message}
                            </span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
                <div ref={eventsEndRef} />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
