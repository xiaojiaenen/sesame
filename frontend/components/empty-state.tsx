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
      className={cn("flex flex-col items-center justify-center py-16 px-6", className)}
    >
      <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center mb-4">
        {icon || <Inbox className="w-7 h-7 text-muted-foreground" />}
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground text-center max-w-md mb-4">{description}</p>
      )}
      {action}
    </motion.div>
  );
}
