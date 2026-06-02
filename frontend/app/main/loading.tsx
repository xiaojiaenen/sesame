export default function MainLoading() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.03] to-transparent p-6 -mx-1">
        <div className="space-y-2">
          <div className="h-7 w-48 skeleton-shimmer rounded-lg" />
          <div className="h-4 w-36 skeleton-shimmer rounded-md" />
        </div>
      </div>

      {/* Hero stats skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl ring-1 ring-border/40 shadow-xs p-6 space-y-3">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 skeleton-shimmer rounded-2xl" />
              <div className="space-y-2 flex-1">
                <div className="h-3 w-16 skeleton-shimmer rounded" />
                <div className="h-9 w-24 skeleton-shimmer rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Compact stats skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl ring-1 ring-border/40 shadow-xs p-4 space-y-2">
            <div className="h-3 w-16 skeleton-shimmer rounded" />
            <div className="h-7 w-20 skeleton-shimmer rounded-lg" />
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="rounded-xl ring-1 ring-border/40 shadow-xs p-6">
        <div className="h-[260px] skeleton-shimmer rounded-lg" />
      </div>
    </div>
  );
}
