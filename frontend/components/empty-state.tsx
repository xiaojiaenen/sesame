"use client";

import { cn } from "@/lib/utils";
import { fadeInUp } from "@/lib/animations";
import { motion } from "motion/react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <motion.div
      {...fadeInUp}
      className={cn("flex flex-col items-center justify-center py-20 px-6", className)}
    >
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-primary/5 rounded-full blur-2xl scale-150" />
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-muted to-muted/30 ring-1 ring-border/60 flex items-center justify-center relative">
          <div className="text-muted-foreground/70">
            {icon || <Inbox className="w-8 h-8" />}
          </div>
        </div>
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1.5">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground text-center max-w-md mb-5">{description}</p>
      )}
      {action}
    </motion.div>
  );
}
