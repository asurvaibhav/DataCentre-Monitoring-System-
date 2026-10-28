// frontend/src/hooks/useAgentStream.ts
// Headless hook for live agent graph WebSocket stream.

import { useAO02Store } from "@/store/ao02Store";

export function useAgentStream() {
  const { state, actions } = useAO02Store();
  return {
    connected: state.connected,
    recentEvents: state.recentEvents,
    runAgentPipeline: actions.runAgentPipeline,
  };
}
