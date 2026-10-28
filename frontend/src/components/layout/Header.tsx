// Top bar: mobile menu, live stream status, queue counts.

interface HeaderProps {
  connected: boolean;
  queuedCount: number;
  pendingCount: number;
  running: boolean;
  onMenuClick: () => void;
}

export function Header({
  connected,
  queuedCount,
  pendingCount,
  running,
  onMenuClick,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-brand-surface bg-brand-dark/95 px-4 backdrop-blur lg:ml-64 lg:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-lg p-2 text-slate-400 hover:bg-brand-surface/50 hover:text-white lg:hidden"
        aria-label="Open navigation"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="hidden text-xs text-slate-500 sm:block">
        Proactive capacity exhaustion forecasting · multi-tenant
      </div>

      <div className="ml-auto flex items-center gap-2">
        {running && (
          <span className="flex items-center gap-1.5 rounded-full border border-brand-accent/30 bg-brand-accent/10 px-3 py-1 text-[11px] font-medium text-brand-accent">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-accent" />
            Agents running
          </span>
        )}

        <span className="flex items-center gap-1.5 rounded-full border border-brand-surface bg-brand-surface/40 px-3 py-1 text-[11px] font-medium text-slate-300">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connected ? "bg-brand-ok" : "bg-brand-warn"
            }`}
          />
          {connected ? "Live" : "Polling"}
        </span>

        <span className="hidden items-center gap-1.5 rounded-full border border-brand-surface bg-brand-surface/40 px-3 py-1 text-[11px] font-medium text-slate-300 sm:flex">
          Queue <span className="font-semibold tabular-nums text-white">{queuedCount}</span>
        </span>

        <span className="flex items-center gap-1.5 rounded-full border border-brand-warn/30 bg-brand-warn/10 px-3 py-1 text-[11px] font-medium text-brand-warn">
          HITL <span className="font-semibold tabular-nums">{pendingCount}</span>
        </span>
      </div>
    </header>
  );
}
