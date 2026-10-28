// AO-02 frontend shell. All backend access lives in src/services + src/store;
// these components are presentational consumers of the headless store.

import { useState } from "react";
import type { ComponentType } from "react";

import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { HITLConsole } from "@/components/hitl-console/HITLConsole";
import { ForecastPage } from "@/components/forecasting/ForecastPage";
import { TokenQueueVisualizer } from "@/components/queue-visualizer/TokenQueueVisualizer";
import { RackMapPage } from "@/components/rack-map/RackMapPage";
import { AO02StoreProvider, useAO02Store } from "@/store/ao02Store";

type Page = "rack-map" | "queue" | "forecast" | "hitl";

interface PageProps {
  onNavigate?: (page: Page) => void;
}

const PAGE_TITLES: Record<Page, { title: string; subtitle: string }> = {
  "rack-map": {
    title: "Facility Overview",
    subtitle: "Live rack and cooling telemetry with active incident overlay",
  },
  queue: {
    title: "Priority Queue",
    subtitle: "Min-heap ordered IncidentTokens with hop-count loop protection",
  },
  forecast: {
    title: "Forecasting & Attribution",
    subtitle: "Time-to-exhaustion projections with confidence bands and regime shifts",
  },
  hitl: {
    title: "Human-in-the-Loop Console",
    subtitle: "RCA evidence, read-only remediation simulation, and operator sign-off",
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
  const [navOpen, setNavOpen] = useState(false);
  const { state, actions } = useAO02Store();

  const PageComponent = PAGE_COMPONENTS[page];
  const meta = PAGE_TITLES[page];

  return (
    <div className="min-h-screen bg-brand-dark text-slate-100 antialiased">
      <Header
        connected={state.connected}
        queuedCount={state.tokens.length}
        pendingCount={state.pending.length}
        running={state.loading.pipeline}
        onMenuClick={() => setNavOpen(true)}
      />

      <Sidebar
        active={page}
        open={navOpen}
        queuedCount={state.tokens.length}
        pendingCount={state.pending.length}
        onSelect={(key) => setPage(key as Page)}
        onClose={() => setNavOpen(false)}
      />

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl space-y-5 p-4 lg:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-white">{meta.title}</h1>
              <p className="mt-0.5 text-xs text-slate-500">{meta.subtitle}</p>
            </div>
            <div className="text-[11px] text-slate-500">
              {state.lastUpdated
                ? `Updated ${new Date(state.lastUpdated).toLocaleTimeString()}`
                : "Loading…"}
            </div>
          </div>

          {state.error && (
            <div
              role="alert"
              className="flex items-start justify-between gap-4 rounded-xl border border-brand-critical/40 bg-brand-critical/10 px-4 py-3 text-sm text-brand-critical"
            >
              <span>{state.error}</span>
              <button
                type="button"
                onClick={actions.clearError}
                className="shrink-0 text-xs font-medium underline"
              >
                Dismiss
              </button>
            </div>
          )}

          <PageComponent onNavigate={setPage} />
        </div>
      </main>
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
