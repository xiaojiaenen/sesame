import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skeleton-shimmer rounded-md bg-muted/80", className)}
      {...props}
    />
  )
}

function SkeletonCircle({ size = 10, className, ...props }: { size?: number } & React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton-circle"
      className={cn("skeleton-shimmer rounded-full bg-muted/80 shrink-0", className)}
      style={{ width: size * 4, height: size * 4 }}
      {...props}
    />
  )
}

function SkeletonText({ lines = 3, className, ...props }: { lines?: number } & React.ComponentProps<"div">) {
  return (
    <div data-slot="skeleton-text" className={cn("space-y-2", className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton-shimmer rounded-md bg-muted/80"
          style={{
            height: 12,
            width: i === lines - 1 ? "60%" : "100%",
          }}
        />
      ))}
    </div>
  )
}

export { Skeleton, SkeletonCircle, SkeletonText }
