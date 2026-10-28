/**
 * Decoupled WebSocket client for live agent-graph streaming.
 *
 * Reconnects with exponential backoff, ignores malformed frames, and
 * normalises token payloads through the same mapping used by the REST client.
 */

import type { IncidentTokenDTO } from "@/types/ao02";
import { API_BASE, normalizers } from "./api";

const WS_BASE = (
  import.meta.env.VITE_WS_BASE ?? API_BASE.replace(/^http/, "ws")
).replace(/\/$/, "");

export type StreamEvent =
  | { type: "connected" }
  | { type: "disconnected" }
  | { type: "ping" }
  | { type: "queue_snapshot"; tokens: IncidentTokenDTO[] }
  | { type: "queue_update"; tokens: IncidentTokenDTO[] }
  | {
      type: "token_transition";
      tokenId: string;
      phase: string;
      hopCount: number;
      summary: string;
      awaitingHumanVerification: boolean;
      shouldHalt: boolean;
      haltReason: string | null;
    };

type Listener = (event: StreamEvent) => void;

class WSClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private reconnectTimer: number | null = null;
  private attempts = 0;
  private manualClose = false;
  private readonly url: string;

  constructor(url: string = `${WS_BASE}/stream/agent-events`) {
    this.url = url;
  }

  connect(): void {
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }
    this.manualClose = false;

    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.attempts = 0;
      this.emit({ type: "connected" });
    };

    this.ws.onmessage = (message) => {
      try {
        const parsed = JSON.parse(message.data as string) as Record<string, unknown>;
        const type = parsed.type;

        if (type === "queue_snapshot" || type === "queue_update") {
          const tokens = Array.isArray(parsed.tokens)
            ? parsed.tokens.map(normalizers.normalizeToken)
            : [];
          this.emit({ type, tokens });
          return;
        }

        if (type === "token_transition") {
          this.emit({
            type: "token_transition",
            tokenId: String(parsed.token_id ?? ""),
            phase: String(parsed.phase ?? ""),
            hopCount: Number(parsed.hop_count ?? 0),
            summary: String(parsed.summary ?? ""),
            awaitingHumanVerification: Boolean(parsed.awaiting_human_verification),
            shouldHalt: Boolean(parsed.should_halt),
            haltReason:
              typeof parsed.halt_reason === "string" ? parsed.halt_reason : null,
          });
          return;
        }

        if (type === "ping") {
          this.emit({ type: "ping" });
        }
      } catch {
        // Ignore malformed frames.
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.emit({ type: "disconnected" });
      if (!this.manualClose) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.manualClose) return;
    const delay = Math.min(1000 * 2 ** this.attempts, 10_000);
    this.attempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: StreamEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }

  disconnect(): void {
    this.manualClose = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}

export const wsClient = new WSClient();
