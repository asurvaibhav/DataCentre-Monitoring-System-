// Headless hook for priority queue, pending verification, and history.

import { useAO02Store } from "@/store/ao02Store";

export function useQueue() {
  const { state, actions } = useAO02Store();
  return {
    tokens: state.tokens,
    pending: state.pending,
    history: state.history,
    loading: state.loading.queue,
    scanning: state.loading.scan,
    selectedTokenId: state.selectedTokenId,
    scanResources: actions.scanResources,
    selectToken: actions.selectToken,
  };
}
