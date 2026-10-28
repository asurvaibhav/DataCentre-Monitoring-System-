// Headless hook for the facility floor plan (rack + cooling telemetry).

import { useAO02Store } from "@/store/ao02Store";

export function useFacility() {
  const { state } = useAO02Store();
  return {
    facility: state.facility,
    loading: state.loading.queue && state.facility === null,
  };
}
