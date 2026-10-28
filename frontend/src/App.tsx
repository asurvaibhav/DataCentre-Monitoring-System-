// AO-02 frontend shell. All backend access lives in src/services + src/store;
// these components are presentational consumers of the headless store.

import { useState } from "react";
import type { ComponentType } from "react";

import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Header } from "@/components/layout/Header";
import type { ViewKey } from "@/components/layout/Header";
import { HITLConsole } from "@/components/hitl-console/HITLConsole";
import { ForecastPage } from "@/components/forecasting/ForecastPage";
import { TokenQueueVisualizer } from "@/components/queue-visualizer/TokenQueueVisualizer";
import { RackMapPage } from "@/components/rack-map/RackMapPage";
import { AO02StoreProvider, useAO02Store } from "@/store/ao02Store";

type Page = ViewKey;

interface PageProps {
  onNavigate?: (page: Page) => void;
}

const PAGE_META: Record<
  Page,
  { eyebrow: string; title: string; muted: string; copy: string; status: string }
> = {
  "rack-map": {
    eyebrow: "01 / FACILITY EXPLORER",
    title: "Understand the space.",
    muted: "See what comes next.",
    copy: "A technical view of your data center. Live rack telemetry, cooling headroom, and the active incident overlay on one floor plan.",
    status: "LIVE FACILITY · READ-ONLY",
  },
  queue: {
    eyebrow: "02 / PRIORITY QUEUE",
    title: "Ordered by risk.",
    muted: "Not by noise.",
    copy: "IncidentTokens ordered in a min-heap with hop-count loop protection. Every row opens the operator record.",
    status: "MIN-HEAP · 8-HOP GUARD",
  },
  forecast: {
    eyebrow: "03 / FORECASTING",
    title: "Read the trend.",
    muted: "Act before the limit.",
    copy: "Time-to-exhaustion projections against the resource safety margin, with confidence bands and regime-shift detection.",
    status: "WINDOW · 336 HOURS",
  },
  hitl: {
    eyebrow: "04 / OPERATOR GATE",
    title: "Machines advise.",
    muted: "Humans decide.",
    copy: "Evidence, root cause, remediation simulation, and operator sign-off in one immutable record tied to the raw telemetry hash.",
    status: "GATE · HUMAN VERIFICATION",
  },
};

const PAGE_COMPONENTS: Record<Page, ComponentType<PageProps>> = {
  "rack-map": RackMapPage,
  queue: TokenQueueVisualizer,
  forecast: ForecastPage,
  hitl: HITLConsole,
};

function Shell() {
  const [page, setPage] = useState<Page>("rack-map");
  const { state, actions } = useAO02Store();

  const PageComponent = PAGE_COMPONENTS[page];
  const meta = PAGE_META[page];

  return (
    <div className="app-shell min-h-screen">
      <Header
        active={page}
        connected={state.connected}
        queuedCount={state.tokens.length}
        pendingCount={state.pending.length}
        running={state.loading.pipeline}
        lastUpdated={state.lastUpdated}
        onNavigate={setPage}
      />

      <main id="main">
        <section className="intro">
          <div>
            <p className="eyebrow">{meta.eyebrow}</p>
            <h1>
              {meta.title}
              <br />
              <span>{meta.muted}</span>
            </h1>
            <p className="intro-copy">{meta.copy}</p>
          </div>

          <div className="connection" role="status">
            <span className={`connection-dot ${state.connected ? "connected" : ""}`} />
            {state.connected ? "API connected" : "Connecting to API"}
            <small>
              {meta.status} · {state.tokens.length} queued · {state.pending.length} awaiting
            </small>
          </div>
        </section>

        {state.error && (
          <div role="alert" className="notice mt-6 flex items-start justify-between gap-4">
            <span>{state.error}</span>
            <button type="button" onClick={actions.clearError} className="link shrink-0 uppercase">
              Dismiss
            </button>
          </div>
        )}

        <PageComponent onNavigate={setPage} />
      </main>

      <footer className="site-footer mt-12">
        <span>TEAM AO-02 / CAPACITY OBSERVATORY</span>
        <p>Advisory by design. Infrastructure controls remain outside this application.</p>
        <span>READ-ONLY · TENANT ISOLATED</span>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AO02StoreProvider>
        <Shell />
      </AO02StoreProvider>
    </ErrorBoundary>
  );
}
