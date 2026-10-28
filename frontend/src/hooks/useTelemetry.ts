// frontend/src/hooks/useTelemetry.ts
// Headless hook for telemetry data. No UI logic here.

import { useAO02Store } from "@/store/ao02Store";

export function useTelemetry() {
  const { state, actions } = useAO02Store();
  return {
    points: state.points,
    window: state.window,
    loading: state.loading,
    error: state.error,
    fetchWindow: actions.fetchWindow,
  };
}
