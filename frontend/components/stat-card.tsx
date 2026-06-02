"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const colorMap: Record<string, { bg: string; text: string; border: string }> = {
  primary: { bg: "bg-primary/10", text: "text-primary", border: "border-primary/20" },
  success: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/20" },
  destructive: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-500/20" },
  warning: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/20" },
};

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  loading?: boolean;
  color?: string;
  href?: string;
  sub?: React.ReactNode;
  className?: string;
}

export function StatCard({ icon: Icon, label, value, loading, color = "primary", href, sub, className }: StatCardProps) {
  const c = colorMap[color] || colorMap.primary;

  const content = (
    <Card className={cn(
      "hover:shadow-md transition-all duration-200 h-full group cursor-pointer border-border/40 relative overflow-hidden",
      className,
    )}>
      <div className={`absolute top-0 right-0 w-20 h-20 ${c.bg} rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-y-1/2 translate-x-1/2`} />
      <CardContent className="p-4 relative">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>
            {loading ? (
              <div className="h-8 w-16 skeleton-shimmer rounded-lg" />
            ) : (
              <p className="text-2xl font-bold text-foreground tracking-tight leading-none">{value}</p>
            )}
            {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
          </div>
          <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
            <Icon className={`w-[18px] h-[18px] ${c.text}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) return <Link href={href} className="block">{content}</Link>;
  return content;
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

export function StatusCard({ icon, title, status, statusText, details, href, className }: StatusCardProps) {
  const statusBg: Record<string, string> = {
    active: "bg-success/5",
    inactive: "bg-muted",
    warning: "bg-warning/5",
    error: "bg-destructive/5",
  };

  const statusBadgeVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    active: "default",
    inactive: "secondary",
    warning: "outline",
    error: "destructive",
  };

  const iconColors: Record<string, string> = {
    active: "bg-success/10 text-success",
    inactive: "bg-muted text-muted-foreground",
    warning: "bg-warning/10 text-warning",
    error: "bg-destructive/10 text-destructive",
  };

  return (
    <Card className={cn("ring-1 ring-border/40 shadow-xs hover-lift", statusBg[status], className)}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", iconColors[status])}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{title}</div>
            <div className="mt-1">
              <Badge variant={statusBadgeVariant[status]} className="text-xs">
                {statusText}
              </Badge>
            </div>
            {details && details.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {details.map((detail, i) => (
                  <div key={i} className="text-xs text-muted-foreground">
                    {detail.label}: <span className="font-medium text-foreground">{detail.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {href && (
            <Link href={href}>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
