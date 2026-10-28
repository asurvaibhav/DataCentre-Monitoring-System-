// frontend/src/services/websocket.ts
// Decoupled WebSocket client for live agent graph streaming.
// Reconnects automatically and emits typed events to subscribers.

import type { QueuedIncidentTokenDTO } from "@/types/ao02";

const WS_BASE =
  (import.meta as any).env.VITE_WS_BASE || "ws://localhost:8000";

export type StreamEvent =
  | { type: "queue_snapshot"; tokens: QueuedIncidentTokenDTO[] }
  | { type: "queue_update"; tokens: QueuedIncidentTokenDTO[] }
  | {
      type: "token_transition";
      token_id: string;
      phase: string;
      hop_count: number;
      summary: string;
      awaiting_human_verification: boolean;
      should_halt: boolean;
      halt_reason: string | null;
    }
  | { type: "connected" };

type Listener = (event: StreamEvent) => void;

class WSClient {
  private ws: WebSocket | null = null;
  private listeners: Set<Listener> = new Set();
  private reconnectTimer: number | null = null;
  private url: string;
  private connecting = false;

  constructor(url: string = `${WS_BASE}/stream/agent-events`) {
    this.url = url;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.connecting) return;
    this.connecting = true;
    try {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        this.connecting = false;
        this.emit({ type: "connected" });
      };
      this.ws.onmessage = (event) => {
        try {
          const parsed: StreamEvent = JSON.parse(event.data);
          this.emit(parsed);
        } catch {
          // ignore malformed messages
        }
      };
      this.ws.onclose = () => {
        this.connecting = false;
        this.ws = null;
        this.scheduleReconnect();
      };
      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.connecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: StreamEvent) {
    this.listeners.forEach((fn) => fn(event));
  }

  disconnect() {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.listeners.clear();
  }
}

export const wsClient = new WSClient();
