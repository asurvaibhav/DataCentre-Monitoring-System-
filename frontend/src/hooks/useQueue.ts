// frontend/src/hooks/useQueue.ts
// Headless hook for priority queue state.

import { useAO02Store } from "@/store/ao02Store";

export function useQueue() {
  const { state, actions } = useAO02Store();
  return {
    tokens: state.tokens,
    scanResources: actions.scanResources,
  };
}
