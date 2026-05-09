export default function MainLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-40 bg-slate-200 rounded-lg" />
        <div className="h-4 w-64 bg-slate-100 rounded-lg" />
      </div>
      <div className="flex gap-4">
        <div className="h-10 w-32 bg-slate-200 rounded-lg" />
        <div className="h-10 w-32 bg-slate-200 rounded-lg" />
        <div className="h-10 w-32 bg-slate-200 rounded-lg" />
      </div>
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="h-12 bg-slate-50 border-b border-border" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 border-b border-border flex items-center px-6 gap-4">
            <div className="h-4 w-24 bg-slate-200 rounded" />
            <div className="h-4 w-32 bg-slate-100 rounded" />
            <div className="h-4 w-20 bg-slate-200 rounded" />
            <div className="h-4 w-16 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
