export default function MainLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-36 bg-muted rounded-md animate-pulse" />
        <div className="h-4 w-52 bg-muted rounded-md animate-pulse" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl ring-1 ring-border/40 shadow-xs p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                <div className="h-8 w-12 bg-muted rounded animate-pulse" />
              </div>
              <div className="w-10 h-10 bg-muted rounded-lg animate-pulse" />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl ring-1 ring-border/40 shadow-xs overflow-hidden">
        <div className="h-10 bg-muted/50 border-b border-border/50" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 border-b border-border/30 flex items-center px-4 gap-4">
            <div className="h-4 w-24 bg-muted rounded animate-pulse" />
            <div className="h-4 w-32 bg-muted rounded animate-pulse" />
            <div className="h-4 w-20 bg-muted rounded animate-pulse" />
            <div className="h-4 w-16 bg-muted rounded animate-pulse ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
