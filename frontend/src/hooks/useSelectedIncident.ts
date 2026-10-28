// Headless hook for the selected incident, its heap envelope, and HITL actions.

import { useAO02Store } from "@/store/ao02Store";

export function useSelectedIncident() {
  const { state, actions } = useAO02Store();
  const tokenId = state.selectedTokenId;
  const envelope = tokenId ? state.envelopes[tokenId] ?? null : null;
  const token =
    (tokenId &&
      (state.pending.find((item) => item.tokenId === tokenId) ??
        state.tokens.find((item) => item.tokenId === tokenId) ??
        state.history.find((item) => item.tokenId === tokenId))) ||
    null;

  return {
    tokenId,
    token,
    envelope,
    deciding: state.loading.decision,
    selectToken: actions.selectToken,
    decide: actions.decide,
  };
}
