import { useState } from "react";

export default function App() {
  const [stage, setStage] = useState("scaffold");

  return (
    <div className="min-h-screen bg-brand-dark text-white font-sans">
      <header className="border-b border-brand-surface p-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold">AO-02 — Data Center Capacity Forecasting</h1>
        <div className="text-xs text-brand-accent">dev/ao02-core • Step 1 scaffold</div>
      </header>
      <main className="p-6 space-y-6">
        <section className="p-4 border border-brand-surface rounded bg-brand-surface">
          <h2 className="text-lg font-medium mb-2">Scaffold complete</h2>
          <p className="text-sm text-gray-400">
            Backend ({stage}) and frontend monorepo initialized on `dev/ao02-core`.
            Ready for Step 2: synthetic telemetry generator, tenant isolation,
            Priority Token Queue, and Shared Context Heap.
          </p>
        </section>
      </main>
    </div>
  );
}
