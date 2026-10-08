// Shown instantly while a page's data loads (via each section's loading.tsx),
// so a click gives immediate feedback instead of the app seeming frozen.
export function PageSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading…</span>
      <div className="glass animate-pulse rounded-3xl p-5 sm:p-6">
        <div className="h-4 w-40 rounded-full bg-glass-hover" />
        <div className="mt-3 h-3 w-64 max-w-full rounded-full bg-glass-soft" />
        <div className="mt-5 h-11 w-full rounded-xl bg-glass-soft" />
        <div className="mt-3 h-11 w-full rounded-xl bg-glass-soft" />
      </div>
      <div className="glass animate-pulse rounded-3xl p-5 sm:p-6">
        <div className="h-3 w-full rounded-full bg-glass-soft" />
        <div className="mt-3 h-3 w-5/6 rounded-full bg-glass-soft" />
        <div className="mt-3 h-3 w-2/3 rounded-full bg-glass-soft" />
      </div>
    </div>
  );
}
