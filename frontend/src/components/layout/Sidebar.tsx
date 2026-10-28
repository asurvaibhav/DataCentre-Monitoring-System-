// Left navigation. Fixed on desktop, slide-over drawer on mobile.

interface SidebarProps {
  active: string;
  open: boolean;
  queuedCount: number;
  pendingCount: number;
  onSelect: (key: string) => void;
  onClose: () => void;
}

const NAV_ITEMS = [
  {
    key: "rack-map",
    label: "Rack Map",
    path: "M3 10.5 12 4l9 6.5M5 9.5V20h14V9.5",
  },
  {
    key: "queue",
    label: "Priority Queue",
    path: "M4 6h16M4 12h16M4 18h10",
  },
  {
    key: "forecast",
    label: "Forecasting",
    path: "M4 19V5m0 14h16M7 15l4-5 3 3 4-6",
  },
  {
    key: "hitl",
    label: "HITL Console",
    path: "M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
] as const;

export function Sidebar({
  active,
  open,
  queuedCount,
  pendingCount,
  onSelect,
  onClose,
}: SidebarProps) {
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-brand-surface bg-brand-dark transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-brand-surface px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-accent/15 text-sm font-bold text-brand-accent">
            AO
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-white">AO-02</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              Capacity Observatory
            </p>
          </div>
        </div>

        <nav className="mt-4 flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => {
            const isActive = active === item.key;
            const badge =
              item.key === "queue"
                ? queuedCount
                : item.key === "hitl"
                  ? pendingCount
                  : null;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  onSelect(item.key);
                  onClose();
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-accent/10 text-brand-accent"
                    : "text-slate-400 hover:bg-brand-surface/40 hover:text-white"
                }`}
              >
                <svg
                  className="h-5 w-5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.path} />
                </svg>
                <span className="flex-1 text-left">{item.label}</span>
                {badge !== null && badge > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                      item.key === "hitl"
                        ? "bg-brand-warn/20 text-brand-warn"
                        : "bg-brand-surface text-slate-300"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-brand-surface p-4 text-[11px] leading-relaxed text-slate-500">
          <p className="font-medium text-slate-400">dev/ao02-core</p>
          <p>Read-only telemetry · tenant isolated</p>
        </div>
      </aside>
    </>
  );
}
