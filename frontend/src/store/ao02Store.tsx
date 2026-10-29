/**
 * Headless state store for AO-02.
 *
 * Owns all server communication state: queue tokens, pending human-verification
 * tokens, facility overview, selected incident envelope, and telemetry windows.
 * Components consume via hooks only — no fetch calls in the UI layer.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import type { ReactNode } from "react";

import {
  api,
  ApiError,
  normalizers,
} from "@/services/api";
import { wsClient, type StreamEvent } from "@/services/websocket";
import type {
  IncidentEnvelopeDTO,
  IncidentTokenDTO,
  FacilityOverview,
  TelemetryWindow,
} from "@/types/ao02";

export type LoadKey =
  | "queue"
  | "facility"
  | "pipeline"
  | "decision"
  | "telemetry"
  | "scan";

export interface ActivityEntry {
  id: string;
  at: string;
  message: string;
  kind: "info" | "agent" | "human" | "error";
}

interface AppState {
  tokens: IncidentTokenDTO[];
  pending: IncidentTokenDTO[];
  history: IncidentTokenDTO[];
  facility: FacilityOverview | null;
  selectedTokenId: string | null;
  selectionAuto: boolean;
  envelopes: Record<string, IncidentEnvelopeDTO>;
  telemetryWindow: TelemetryWindow | null;
  telemetryKey: string | null;
  loading: Record<LoadKey, boolean>;
  connected: boolean;
  error: string | null;
  activity: ActivityEntry[];
  lastUpdated: string | null;
  scanStartedAt: number | null;
  pipelineStartedAt: number | null;
  lastScanDurationSec: number | null;
}

type Action =
  | { type: "SET_TOKENS"; payload: IncidentTokenDTO[] }
  | { type: "SET_PENDING"; payload: IncidentTokenDTO[] }
  | { type: "SET_HISTORY"; payload: IncidentTokenDTO[] }
  | { type: "SET_FACILITY"; payload: FacilityOverview }
  | { type: "PATCH_TOKEN"; payload: { tokenId: string; phase: string; hopCount: number } }
  | { type: "SELECT_TOKEN"; payload: string | null }
  | { type: "AUTO_SELECT"; payload: string | null }
  | { type: "SET_ENVELOPE"; payload: IncidentEnvelopeDTO }
  | { type: "SET_WINDOW"; payload: { key: string; window: TelemetryWindow } }
  | { type: "PRUNE_ENVELOPES"; payload: Record<string, string> }
  | { type: "SET_LOADING"; payload: { key: LoadKey; value: boolean } }
  | { type: "SET_CONNECTED"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "PUSH_ACTIVITY"; payload: ActivityEntry }
  | { type: "SET_SCAN_STARTED"; payload: number | null }
  | { type: "SET_LAST_SCAN_DURATION"; payload: number | null };

const emptyLoading: Record<LoadKey, boolean> = {
  queue: false,
  facility: false,
  pipeline: false,
  decision: false,
  telemetry: false,
  scan: false,
};

const initialState: AppState = {
  tokens: [],
  pending: [],
  history: [],
  facility: null,
  selectedTokenId: null,
  selectionAuto: false,
  envelopes: {},
  telemetryWindow: null,
  telemetryKey: null,
  loading: emptyLoading,
  connected: false,
  error: null,
  activity: [],
  lastUpdated: null,
  scanStartedAt: null,
  pipelineStartedAt: null,
  lastScanDurationSec: null,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_TOKENS":
      return { ...state, tokens: action.payload, lastUpdated: new Date().toISOString() };
    case "SET_PENDING":
      return { ...state, pending: action.payload, lastUpdated: new Date().toISOString() };
    case "SET_HISTORY":
      return { ...state, history: action.payload };
    case "SET_FACILITY":
      return { ...state, facility: action.payload };
    case "PATCH_TOKEN": {
      const patch = (list: IncidentTokenDTO[]) =>
        list.map((token) =>
          token.tokenId === action.payload.tokenId
            ? {
                ...token,
                currentPhase: action.payload.phase,
                hopCount: action.payload.hopCount,
              }
            : token,
        );
      const nextEnvelopes = { ...state.envelopes };
      delete nextEnvelopes[action.payload.tokenId];
      return {
        ...state,
        tokens: patch(state.tokens),
        pending: patch(state.pending),
        history: patch(state.history),
        envelopes: nextEnvelopes,
      };
    }
    case "SELECT_TOKEN":
      return { ...state, selectedTokenId: action.payload, selectionAuto: false };
    case "AUTO_SELECT":
      return { ...state, selectedTokenId: action.payload, selectionAuto: true };
    case "SET_ENVELOPE":
      return {
        ...state,
        envelopes: { ...state.envelopes, [action.payload.token.tokenId]: action.payload },
      };
    case "SET_WINDOW":
      return {
        ...state,
        telemetryWindow: action.payload.window,
        telemetryKey: action.payload.key,
      };
    case "PRUNE_ENVELOPES": {
      // Drop cached envelopes whose phase no longer matches the live token
      // lists so the HITL console never renders stale pre-pipeline evidence.
      const phases = action.payload;
      const nextEnvelopes: Record<string, IncidentEnvelopeDTO> = {};
      for (const [tokenId, envelope] of Object.entries(state.envelopes)) {
        const livePhase = phases[tokenId];
        if (!livePhase || livePhase === envelope.token.currentPhase) {
          nextEnvelopes[tokenId] = envelope;
        }
      }
      return { ...state, envelopes: nextEnvelopes };
    }
    case "SET_SCAN_STARTED":
      return { ...state, scanStartedAt: action.payload };
    case "SET_LAST_SCAN_DURATION":
      return { ...state, lastScanDurationSec: action.payload };
    case "SET_LOADING":
      return {
        ...state,
        loading: { ...state.loading, [action.payload.key]: action.payload.value },
        pipelineStartedAt: action.payload.key === "pipeline"
          ? (action.payload.value ? state.pipelineStartedAt ?? Date.now() : null)
          : state.pipelineStartedAt,
      };
    case "SET_CONNECTED":
      return { ...state, connected: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "PUSH_ACTIVITY":
      return { ...state, activity: [action.payload, ...state.activity].slice(0, 40) };
    default:
      return state;
  }
}

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.detail;
  if (error instanceof Error) return error.message;
  return fallback;
}

interface StoreValue {
  state: AppState;
  actions: {
    refreshAll: (quiet?: boolean) => Promise<void>;
    runPipeline: (tokenId?: string) => Promise<void>;
    stopPipeline: () => void;
    scanResources: () => Promise<void>;
    selectToken: (tokenId: string) => void;
    decide: (
      decision: "approve" | "reject" | "defer" | "resolve",
      notes?: string,
      targetTokenId?: string,
    ) => Promise<void>;
    loadTelemetry: (params: {
      rackId: string;
      tenantId: string;
      resourceType: IncidentTokenDTO["resourceType"];
      lookbackHours?: number;
    }) => Promise<void>;
    clearError: () => void;
  };
}

const StoreContext = createContext<StoreValue | null>(null);

// StrictMode mounts effects twice in development; guard the one-time bootstrap.
let bootstrapped = false;

export function AO02StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const refreshTimer = useRef<number | null>(null);
  const scanAbortRef = useRef<AbortController | null>(null);
  const pipelineAbortRef = useRef<AbortController | null>(null);

  const setLoading = useCallback((key: LoadKey, value: boolean) => {
    dispatch({ type: "SET_LOADING", payload: { key, value } });
  }, []);

  const log = useCallback((message: string, kind: ActivityEntry["kind"] = "info") => {
    dispatch({
      type: "PUSH_ACTIVITY",
      payload: {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        at: new Date().toISOString(),
        message,
        kind,
      },
    });
  }, []);

  const stopPipeline = useCallback(() => {
    pipelineAbortRef.current?.abort();
    pipelineAbortRef.current = null;
    setLoading("pipeline", false);
  }, [setLoading]);

  const stopScan = useCallback(() => {
    scanAbortRef.current?.abort();
    scanAbortRef.current = null;
    dispatch({ type: "SET_LOADING", payload: { key: "scan", value: false } });
    dispatch({ type: "SET_SCAN_STARTED", payload: null });
  }, []);

  const refreshAll = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading("queue", true);
      try {
        const [tokens, pending, history, facility] = await Promise.all([
          api.queueSnapshot(),
          api.pendingTokens(),
          api.history(20),
          api.facilityOverview(),
        ]);
        dispatch({ type: "SET_TOKENS", payload: tokens });
        dispatch({ type: "SET_PENDING", payload: pending });
        dispatch({ type: "SET_HISTORY", payload: history });
        dispatch({ type: "SET_FACILITY", payload: facility });
        dispatch({
          type: "PRUNE_ENVELOPES",
          payload: Object.fromEntries(
            [...tokens, ...pending, ...history].map((token) => [
              token.tokenId,
              token.currentPhase,
            ]),
          ),
        });
      } catch (error) {
        dispatch({ type: "SET_ERROR", payload: messageOf(error, "Failed to refresh data") });
      } finally {
        if (!quiet) setLoading("queue", false);
      }
    },
    [setLoading],
  );

  const scanResources = useCallback(async () => {
    if (state.loading.scan) {
      stopScan();
      return;
    }

    const startTime = Date.now();
    const controller = new AbortController();
    scanAbortRef.current = controller;
    dispatch({ type: "SET_SCAN_STARTED", payload: startTime });
    setLoading("scan", true);
    try {
      const result = await api.scanResources(controller.signal);
      const durationSec = (Date.now() - startTime) / 1000;
      dispatch({ type: "SET_LAST_SCAN_DURATION", payload: durationSec });
      log(
        `Resource scan complete in ${durationSec.toFixed(2)}s — ${result.tokens_minted} new incident token(s).`,
        "agent",
      );
      await refreshAll(true);
    } catch (error) {
      if (controller.signal.aborted) {
        log("Resource scan stopped by operator.", "info");
      } else {
        dispatch({ type: "SET_ERROR", payload: messageOf(error, "Resource scan failed") });
        log("Resource scan failed.", "error");
      }
    } finally {
      if (scanAbortRef.current === controller) {
        scanAbortRef.current = null;
      }
      setLoading("scan", false);
      dispatch({ type: "SET_SCAN_STARTED", payload: null });
    }
  }, [log, refreshAll, setLoading, state.loading.scan, stopScan]);

  const runPipeline = useCallback(
    async (tokenId?: string) => {
      if (pipelineAbortRef.current) return;
      const controller = new AbortController();
      pipelineAbortRef.current = controller;
      setLoading("pipeline", true);
      try {
        const result = await api.runPipeline(tokenId, controller.signal);
        if (result.status === "idle") {
          log("Pipeline idle — priority queue is empty.", "info");
        } else if (result.status === "error") {
          dispatch({
            type: "SET_ERROR",
            payload: result.error ?? "Agent pipeline failed",
          });
          log("Agent pipeline failed; token returned to the queue.", "error");
        } else if (result.token_id) {
          log(
            `Pipeline completed for ${result.token_id} — ${result.final_phase ?? "done"}.`,
            "agent",
          );
          dispatch({ type: "SELECT_TOKEN", payload: result.token_id });
        }
        await refreshAll(true);
      } catch (error) {
        if (controller.signal.aborted) {
          log("Incident scan stopped by operator.", "info");
        } else {
          dispatch({ type: "SET_ERROR", payload: messageOf(error, "Agent pipeline failed") });
        }
      } finally {
        if (pipelineAbortRef.current === controller) {
          pipelineAbortRef.current = null;
          setLoading("pipeline", false);
        }
      }
    },
    [log, refreshAll, setLoading],
  );

  const selectToken = useCallback((tokenId: string) => {
    dispatch({ type: "SELECT_TOKEN", payload: tokenId });
  }, []);

  const decide = useCallback(
    async (
      decision: "approve" | "reject" | "defer" | "resolve",
      notes: string = "",
      targetTokenId?: string,
    ) => {
      const tokenId = targetTokenId || state.selectedTokenId;
      if (!tokenId) return;
      setLoading("decision", true);
      try {
        const response = await api.decide({ tokenId, decision, notes });
        dispatch({
          type: "SET_ENVELOPE",
          payload: normalizers.normalizeEnvelope(response.envelope),
        });
        dispatch({ type: "SELECT_TOKEN", payload: tokenId });
        log(
          `Operator ${decision === "resolve" ? "resolved" : decision + "d"} incident ${tokenId}.`,
          "human",
        );
        await refreshAll(true);
      } catch (error) {
        dispatch({ type: "SET_ERROR", payload: messageOf(error, "Decision failed") });
      } finally {
        setLoading("decision", false);
      }
    },
    [log, refreshAll, setLoading, state.selectedTokenId],
  );

  const loadTelemetry = useCallback(
    async (params: {
      rackId: string;
      tenantId: string;
      resourceType: IncidentTokenDTO["resourceType"];
      lookbackHours?: number;
    }) => {
      const key = `${params.rackId}:${params.tenantId}:${params.resourceType}`;
      setLoading("telemetry", true);
      try {
        const window = await api.getWindow(params);
        dispatch({ type: "SET_WINDOW", payload: { key, window } });
      } catch (error) {
        dispatch({
          type: "SET_ERROR",
          payload: messageOf(error, "Failed to load telemetry window"),
        });
      } finally {
        setLoading("telemetry", false);
      }
    },
    [setLoading],
  );

  const clearError = useCallback(() => dispatch({ type: "SET_ERROR", payload: null }), []);

  // Fetch envelope whenever the selected token changes.
  useEffect(() => {
    const tokenId = state.selectedTokenId;
    if (!tokenId || state.envelopes[tokenId]) return;
    let cancelled = false;

    api
      .getEnvelope(tokenId)
      .then((envelope) => {
        if (!cancelled) dispatch({ type: "SET_ENVELOPE", payload: envelope });
      })
      .catch((error) => {
        if (!cancelled) {
          dispatch({ type: "SET_ERROR", payload: messageOf(error, "Failed to load incident") });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [state.selectedTokenId, state.envelopes]);

  // Pick a default selection once data arrives; auto-follow the incident that
  // just reached the human verification gate unless the operator picked a row.
  useEffect(() => {
    const candidate = state.pending[0] ?? state.tokens[0];
    if (!candidate) return;

    if (!state.selectedTokenId) {
      dispatch({ type: "AUTO_SELECT", payload: candidate.tokenId });
      return;
    }

    if (state.selectionAuto) {
      const stillExists =
        state.tokens.some((token) => token.tokenId === state.selectedTokenId) ||
        state.pending.some((token) => token.tokenId === state.selectedTokenId) ||
        state.history.some((token) => token.tokenId === state.selectedTokenId);

      if (
        !stillExists ||
        (state.pending.length > 0 && state.selectedTokenId !== state.pending[0].tokenId)
      ) {
        dispatch({ type: "AUTO_SELECT", payload: candidate.tokenId });
      }
    }
  }, [
    state.pending,
    state.tokens,
    state.history,
    state.selectedTokenId,
    state.selectionAuto,
  ]);

  // Bootstrap: load everything.
  useEffect(() => {
    if (bootstrapped) return;
    bootstrapped = true;

    const bootstrap = async () => {
      await refreshAll();
    };

    void bootstrap();
  }, [refreshAll]);

  // Live stream subscription.
  useEffect(() => {
    const unsubscribe = wsClient.subscribe((event: StreamEvent) => {
      switch (event.type) {
        case "connected":
          dispatch({ type: "SET_CONNECTED", payload: true });
          log("Live agent stream connected.", "info");
          void refreshAll(true);
          break;
        case "disconnected":
          dispatch({ type: "SET_CONNECTED", payload: false });
          break;
        case "ping":
          dispatch({ type: "SET_CONNECTED", payload: true });
          break;
        case "queue_snapshot":
        case "queue_update":
          dispatch({ type: "SET_TOKENS", payload: event.tokens });
          break;
        case "token_transition":
          dispatch({
            type: "PATCH_TOKEN",
            payload: {
              tokenId: event.tokenId,
              phase: event.phase,
              hopCount: event.hopCount,
            },
          });
          log(event.summary || `${event.tokenId} → ${event.phase}`, "agent");
          if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
          refreshTimer.current = window.setTimeout(() => {
            refreshTimer.current = null;
            void refreshAll(true);
          }, 400);
          break;
      }
    });

    wsClient.connect();

    return () => {
      unsubscribe();
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    };
  }, [log, refreshAll]);

  // Slow polling fallback if the socket is unavailable.
  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshAll(true);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refreshAll]);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      actions: {
        refreshAll,
        runPipeline,
        stopPipeline,
        scanResources,
        selectToken,
        decide,
        loadTelemetry,
        clearError,
      },
    }),
    [state, refreshAll, runPipeline, stopPipeline, scanResources, selectToken, decide, loadTelemetry, clearError],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAO02Store(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useAO02Store must be used inside AO02StoreProvider");
  return ctx;
}
