import { cn } from "@/lib/utils";
import { fadeInUp } from "@/lib/animations";
import { motion } from "motion/react";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <motion.div
      {...fadeInUp}
      className={cn("flex items-center justify-between", className)}
    >
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {action}
    </motion.div>
  );
}
