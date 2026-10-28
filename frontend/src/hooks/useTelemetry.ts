// Headless hook for telemetry windows. No UI logic here.

import { useAO02Store } from "@/store/ao02Store";

export function useTelemetry() {
  const { state, actions } = useAO02Store();
  return {
    window: state.telemetryWindow,
    windowKey: state.telemetryKey,
    loading: state.loading.telemetry,
    error: state.error,
    loadTelemetry: actions.loadTelemetry,
  };
}
