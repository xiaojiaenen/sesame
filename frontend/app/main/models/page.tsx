"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ArrowRight, Box, Cpu, List } from "lucide-react";

export default function ModelsPage() {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const data = await apiFetch("/user/models");
        setModels(data);
      } catch (error) {
        toast.error("加载模型列表失败");
      } finally {
        setLoading(false);
      }
    };
    fetchModels();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="模型列表"
        description="查看可用的 AI 模型及其映射关系"
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="ring-1 ring-border/40 shadow-xs">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-6 w-48 rounded-md" />
                  <Skeleton className="h-6 w-6 rounded-full" />
                  <Skeleton className="h-6 w-48 rounded-md" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : models.length === 0 ? (
        <Card className="ring-1 ring-border/40 shadow-xs">
          <CardContent className="p-0">
            <EmptyState
              icon={<List className="w-8 h-8 text-muted-foreground" />}
              title="暂无模型配置"
              description="管理员尚未配置任何模型映射"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {models.map((m: any, i) => (
            <motion.div
              key={i}
              {...fadeInUp}
              transition={{ ...fadeInUp.transition, delay: i * 0.03 }}
            >
              <Card className="ring-1 ring-border/40 shadow-xs hover:shadow-md hover:shadow-primary/5 transition-all duration-200 group">
                <CardContent className="py-3.5 px-5">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
                        <Box className="w-3.5 h-3.5 text-sky-500" />
                      </div>
                      <code className="text-sm font-semibold font-mono text-sky-600 dark:text-sky-400 truncate">
                        {m.external_model}
                      </code>
                    </div>

                    <div className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                      <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                    </div>

                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                        <Cpu className="w-3.5 h-3.5 text-violet-500" />
                      </div>
                      <code className="text-sm font-semibold font-mono text-violet-600 dark:text-violet-400 truncate">
                        {m.internal_model}
                      </code>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Legend */}
      <motion.div
        {...fadeInUp}
        transition={{ ...fadeInUp.transition, delay: 0.3 }}
        className="text-xs text-muted-foreground bg-muted/50 rounded-xl p-4"
      >
        <p className="font-medium text-foreground mb-2">说明：</p>
        <ul className="space-y-1 list-disc list-inside">
          <li><span className="text-sky-500 font-medium">对外暴露模型</span>：客户端请求时使用的模型名称</li>
          <li><span className="text-violet-500 font-medium">内部真实模型</span>：实际转发给后端的模型名称</li>
        </ul>
      </motion.div>
    </div>
  );
}
