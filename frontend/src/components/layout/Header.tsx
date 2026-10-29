// Global shell header: brand, console mode and the four technical views.

export type ViewKey = "rack-map" | "queue" | "forecast" | "hitl";

interface HeaderProps {
  active: ViewKey;
  connected: boolean;
  queuedCount: number;
  pendingCount: number;
  running: boolean;
  lastUpdated: string | null;
  onNavigate: (page: ViewKey) => void;
}

const NAV_ITEMS: Array<{ key: ViewKey; number: string; label: string }> = [
  { key: "rack-map", number: "01", label: "Facility" },
  { key: "queue", number: "02", label: "Queue" },
  { key: "forecast", number: "03", label: "Forecast" },
  { key: "hitl", number: "04", label: "Operator" },
];

export function Header({
  active,
  connected,
  queuedCount,
  pendingCount,
  running,
  lastUpdated,
  onNavigate,
}: HeaderProps) {
  const updatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <>
      <header className="site-header">
        <a href="#main" className="brand" aria-label="AO-02 Capacity Observatory">
          <span className="brand-mark">A</span>
          AO-02
          <span className="brand-caption">CAPACITY OBSERVATORY</span>
        </a>
        <span className="mode-label">
          AO–02 <span aria-hidden="true">/</span> OPERATIONS CONSOLE
        </span>
      </header>

      <nav className="top-nav" aria-label="Views">
        <div className="nav-items">
          {NAV_ITEMS.map((item) => {
            const count =
              item.key === "queue"
                ? queuedCount
                : item.key === "hitl"
                  ? pendingCount
                  : null;

            return (
              <button
                key={item.key}
                type="button"
                className="nav-item"
                data-active={active === item.key}
                aria-current={active === item.key ? "page" : undefined}
                onClick={() => onNavigate(item.key)}
              >
                <strong>{item.number}</strong>
                {item.label}
                {count !== null && (
                  <span className="nav-count" aria-label={`${count} items`}>
                    {String(count).padStart(2, "0")}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="nav-status" role="status">
          {running && <span className="tag tag-ok">agents running</span>}
          <span className={`connection-dot ${connected ? "connected" : ""}`} />
          <span className="sep" aria-hidden="true">
            /
          </span>
          <span className="nav-time">updated {updatedLabel}</span>
        </div>
      </nav>
    </>
  );
}
