import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  description?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  className?: string;
  delay?: number;
}

export function StatCard({ icon, label, value, description, className, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
    >
      <Card className={cn("border-0 shadow-sm hover-lift", className)}>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-muted-foreground truncate">{label}</div>
              <div className="text-2xl font-bold text-foreground mt-0.5">{value}</div>
              {description && (
                <div className="text-xs text-muted-foreground mt-1">{description}</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface StatusCardProps {
  icon: React.ReactNode;
  title: string;
  status: "active" | "inactive" | "warning" | "error";
  statusText: string;
  details?: { label: string; value: string }[];
  href?: string;
  className?: string;
  delay?: number;
}

export function StatusCard({ icon, title, status, statusText, details, href, className, delay = 0 }: StatusCardProps) {
  const statusColors = {
    active: "bg-emerald-50",
    inactive: "bg-slate-50",
    warning: "bg-amber-50",
    error: "bg-red-50",
  };

  const statusBadgeVariant = {
    active: "default" as const,
    inactive: "secondary" as const,
    warning: "outline" as const,
    error: "destructive" as const,
  };

  const iconColors = {
    active: "bg-emerald-100 text-emerald-600",
    inactive: "bg-slate-100 text-slate-500",
    warning: "bg-amber-100 text-amber-600",
    error: "bg-red-100 text-red-600",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
    >
      <Card className={cn("border-0 shadow-sm hover-lift", statusColors[status], className)}>
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center",
              iconColors[status]
            )}>
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-muted-foreground">{title}</div>
              <div className="mt-1">
                <Badge variant={statusBadgeVariant[status]} className="text-sm">
                  {statusText}
                </Badge>
              </div>
              {details && details.length > 0 && (
                <div className="mt-3 space-y-1">
                  {details.map((detail, i) => (
                    <div key={i} className="text-xs text-muted-foreground">
                      <span className="text-muted-foreground">{detail.label}:</span>{" "}
                      <span className="font-medium">{detail.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {href && (
              <Link href={href}>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
