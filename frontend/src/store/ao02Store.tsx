// frontend/src/store/ao02Store.ts
// Headless state store for AO-02. Holds telemetry, priority queue,
// heap envelopes, and WebSocket stream state. Presentation components
// consume via hooks; no backend logic leaks into components.

import type { QueuedIncidentTokenDTO, SeverityStatus } from "@/types/ao02";
import { api } from "@/services/api";
import { wsClient, type StreamEvent } from "@/services/websocket";
import { createContext, useContext, useEffect, useReducer, useRef } from "react";

export type RackStatus = {
  rackId: string;
  status: SeverityStatus;
  activeBadge?: string;
  powerLoadKw: number;
  maxPowerKw: number;
  activeTokenIds: string[];
};

export type CoolingStatus = {
  unitId: string;
  supplyTempCelsius: number;
  fanSpeedRpm: number;
  status: SeverityStatus;
};

export type TokenDTO = QueuedIncidentTokenDTO;

type AppState = {
  // Telemetry
  points: any[];
  window: any | null;
  loading: boolean;
  error: string | null;
  // Queue
  tokens: TokenDTO[];
  // Heap
  envelopes: Record<string, any>;
  // Stream
  connected: boolean;
  recentEvents: StreamEvent[];
};

type AppAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_POINTS"; payload: any[] }
  | { type: "SET_WINDOW"; payload: any }
  | { type: "SET_TOKENS"; payload: TokenDTO[] }
  | { type: "ADD_TOKEN"; payload: TokenDTO }
  | { type: "SET_ENVELOPE"; payload: { tokenId: string; envelope: any } }
  | { type: "STREAM_EVENT"; payload: StreamEvent }
  | { type: "SET_CONNECTED"; payload: boolean };

const initialState: AppState = {
  points: [],
  window: null,
  loading: false,
  error: null,
  tokens: [],
  envelopes: {},
  connected: false,
  recentEvents: [],
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_POINTS":
      return { ...state, points: action.payload };
    case "SET_WINDOW":
      return { ...state, window: action.payload };
    case "SET_TOKENS":
      return { ...state, tokens: action.payload };
    case "ADD_TOKEN":
      return { ...state, tokens: [...state.tokens, action.payload] };
    case "SET_ENVELOPE":
      return {
        ...state,
        envelopes: { ...state.envelopes, [action.payload.tokenId]: action.payload.envelope },
      };
    case "STREAM_EVENT":
      return {
        ...state,
        recentEvents: [action.payload, ...state.recentEvents].slice(0, 50),
      };
    case "SET_CONNECTED":
      return { ...state, connected: action.payload };
    default:
      return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  actions: {
    fetchWindow: (params: { rack_id: string; tenant_id: string; resource_type: string }) => Promise<void>;
    runAgentPipeline: () => Promise<any | null>;
    scanResources: () => Promise<any | null>;
  };
} | null>(null);

export function AO02StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const wsRef = useRef<ReturnType<typeof wsClient.subscribe> | null>(null);

  useEffect(() => {
    // Subscribe to WebSocket stream events
    wsRef.current = wsClient.subscribe((event) => {
      dispatch({ type: "STREAM_EVENT", payload: event });
      if (event.type === "connected") {
        dispatch({ type: "SET_CONNECTED", payload: true });
        // Refresh queue snapshot on connect
        fetchQueueSnapshot();
      }
      if (event.type === "queue_update" || event.type === "queue_snapshot") {
        dispatch({ type: "SET_TOKENS", payload: event.tokens });
      }
      if (event.type === "token_transition") {
        dispatch({ type: "SET_CONNECTED", payload: true });
        // Optionally upsert token into local list
        dispatch({ type: "ADD_TOKEN", payload: event as unknown as TokenDTO });
      }
    });

    wsClient.connect();

    // Initial data load
    loadInitialData();

    return () => {
      if (wsRef.current) wsRef.current();
      // Keep connection open; do not disconnect on unmount so stream persists
    };
  }, []);

  async function loadInitialData() {
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      await api.generateTelemetry();
      await fetchQueueSnapshot();
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        payload: err instanceof Error ? err.message : "Failed to load initial data",
      });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }

  async function fetchQueueSnapshot() {
    try {
      const data = await api.queueSnapshot();
      dispatch({ type: "SET_TOKENS", payload: data.tokens });
    } catch {
      // queue may be empty on first load
    }
  }

  async function fetchWindow(params: {
    rack_id: string;
    tenant_id: string;
    resource_type: string;
  }) {
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const window = await api.getWindow({
        rack_id: params.rack_id,
        tenant_id: params.tenant_id,
        resource_type: params.resource_type as any,
      });
      dispatch({ type: "SET_WINDOW", payload: window });
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        payload: err instanceof Error ? err.message : "Failed to fetch window",
      });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }

  async function runAgentPipeline() {
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const result = await api.runAgentPipeline();
      await fetchQueueSnapshot();
      return result;
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        payload: err instanceof Error ? err.message : "Agent pipeline failed",
      });
      return null;
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }

  async function scanResources() {
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const result = await api.scanResources();
      await fetchQueueSnapshot();
      return result;
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        payload: err instanceof Error ? err.message : "Scan failed",
      });
      return null;
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }

  const value = {
    state,
    dispatch,
    actions: { fetchWindow, runAgentPipeline, scanResources },
  };

  return (
    <AppContext.Provider value={value}>{children}</AppContext.Provider>
  );
}

export function useAO02Store() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAO02Store must be used within AO02StoreProvider");
  }
  return ctx;
}
