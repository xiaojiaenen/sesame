import { cn } from "@/lib/utils";
import { fadeInUp } from "@/lib/animations";
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
  className?: string;
  delay?: number;
}

export function StatCard({ icon, label, value, description, className, delay = 0 }: StatCardProps) {
  return (
    <motion.div {...fadeInUp} transition={{ ...fadeInUp.transition, delay }}>
      <Card className={cn("ring-1 ring-border/40 shadow-xs hover-lift", className)}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
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
  const statusBg = {
    active: "bg-success/5",
    inactive: "bg-muted",
    warning: "bg-warning/5",
    error: "bg-destructive/5",
  };

  const statusBadgeVariant = {
    active: "default" as const,
    inactive: "secondary" as const,
    warning: "outline" as const,
    error: "destructive" as const,
  };

  const iconColors = {
    active: "bg-success/10 text-success",
    inactive: "bg-muted text-muted-foreground",
    warning: "bg-warning/10 text-warning",
    error: "bg-destructive/10 text-destructive",
  };

  return (
    <motion.div {...fadeInUp} transition={{ ...fadeInUp.transition, delay }}>
      <Card className={cn("ring-1 ring-border/40 shadow-xs hover-lift", statusBg[status], className)}>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              iconColors[status]
            )}>
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
    </motion.div>
  );
}
