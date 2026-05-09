"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "motion/react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { List, ArrowRight, Box, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="border-0 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="font-semibold text-slate-700 h-12">
                    <div className="flex items-center gap-2">
                      <Box className="w-4 h-4 text-slate-400" />
                      对外暴露模型
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 h-12">
                    <div className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                      映射
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 h-12">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-slate-400" />
                      内部真实模型
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-8" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                    </TableRow>
                  ))
                ) : models.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <EmptyState
                        icon={<List className="w-8 h-8 text-slate-400" />}
                        title="暂无模型配置"
                        description="管理员尚未配置任何模型映射"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  models.map((m: any, i) => (
                    <motion.tr
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="border-b transition-colors hover:bg-slate-50"
                    >
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-sm">
                          {m.external_model}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                            <ArrowRight className="w-4 h-4 text-slate-400" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-sm">
                          {m.internal_model}
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

      {/* Legend */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-xs text-slate-500 bg-slate-50 rounded-xl p-4"
      >
        <p className="font-medium text-slate-600 mb-2">说明：</p>
        <ul className="space-y-1 list-disc list-inside">
          <li><span className="text-blue-600">对外暴露模型</span>：客户端请求时使用的模型名称</li>
          <li><span className="text-emerald-600">内部真实模型</span>：实际转发给后端的模型名称</li>
        </ul>
      </motion.div>
    </div>
  );
}
