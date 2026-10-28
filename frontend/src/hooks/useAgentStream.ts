// Headless hook for the live agent graph stream.

import { useAO02Store } from "@/store/ao02Store";

export function useAgentStream() {
  const { state, actions } = useAO02Store();
  return {
    connected: state.connected,
    activity: state.activity,
    lastUpdated: state.lastUpdated,
    running: state.loading.pipeline,
    runPipeline: actions.runPipeline,
  };
}
