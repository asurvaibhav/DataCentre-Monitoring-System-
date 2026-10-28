// frontend/src/App.tsx
// AO-02 frontend shell using the decoupled headless-state & presentation pattern.
// All backend communication lives in src/services/; state lives in src/store/;
// UI components are pure presentational consumers.

import { useState } from "react";
import { AO02StoreProvider } from "@/store/ao02Store";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { RackMapPage } from "@/components/rack-map/RackMapPage";
import { ForecastPage } from "@/components/forecasting/ForecastPage";
import { TokenQueueVisualizer } from "@/components/queue-visualizer/TokenQueueVisualizer";
import { HITLConsole } from "@/components/hitl-console/HITLConsole";

type Page = "rack-map" | "queue" | "forecast" | "hitl";

const PAGE_LABELS: Record<Page, string> = {
  "rack-map": "Rack Map",
  queue: "Priority Queue",
  forecast: "Forecasting",
  hitl: "HITL Console",
};

export default function App() {
  const [activePage, setActivePage] = useState<Page>("rack-map");

  const pageComponents: Record<Page, React.ComponentType> = {
    "rack-map": RackMapPage,
    queue: TokenQueueVisualizer,
    forecast: ForecastPage,
    hitl: HITLConsole,
  };

  const PageComponent = pageComponents[activePage];

  return (
    <AO02StoreProvider>
      <div className="min-h-screen bg-brand-dark text-white font-sans antialiased">
        <Header onMenuClick={() => {}} />
        <div className="flex">
          <Sidebar active={activePage} onSelect={(key) => setActivePage(key as Page)} />
          <main className="flex-1 p-6 lg:pl-64">
            <div className="max-w-7xl mx-auto space-y-6">
              <header className="flex items-center justify-between">
                <h1 className="text-xl font-semibold">{PAGE_LABELS[activePage]}</h1>
                <div className="hidden sm:flex items-center gap-4 text-xs text-gray-500">
                  <span>dev/ao02-core</span>
                  <span>•</span>
                  <span>Step 4 — Frontend</span>
                </div>
              </header>
              <PageComponent />
            </div>
          </main>
        </div>
      </div>
    </AO02StoreProvider>
  );
}
