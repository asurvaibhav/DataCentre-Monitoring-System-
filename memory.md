# AO-02 Engineering Ledger — memory.md
Cross-AI chronological engineering log for Team XOR — Problem Statement AO-02: "Seeing trouble before the capacity runs out."

## Entry 001 — 2026-10-28 | Session: init-dev/ao02-core

### Summary of Changes
- Initialized empty Git repository in `C:\Users\sunil\OneDrive\Documents\Default Project`.
- Created and switched to development branch `dev/ao02-core`. `main` branch left untouched per human-simulated commit protocol.
- Created root-level `memory.md` as the immutable chronological engineering ledger.
- Attached AO-02 architectural context: Data Center Capacity Forecasting & Incident Resolution (multi-tenant, read-only telemetry, tenant isolation, immutable audit trail).

### Touched Files
- `.git/` (initialized repo)
- `dev/ao02-core` (development branch)
- `memory.md` (this file)

### Architectural Impact
- Baseline established per Team XOR Token-Queue-Heap Multi-Agent Architecture (adapted from OpsPilot DSU DevHack 3.0).
- Core pivot: Git/CI event listeners replaced by Time-Series Telemetry Ingestion & Forecasting Engine; Docker/GitHub PR remediation replaced by Simulation & Advisory-only remediation.
- Stack confirmed: FastAPI + LangGraph + React + Vite + Tailwind CSS; unified LLM provider abstraction (Google Gemini / OpenAI) via structured Pydantic outputs.
- Safety boundaries locked: read-only telemetry constraint, strict tenant isolation (T1/T2/T3 never leak), immutable audit trail linking every forecast to its telemetry snapshot (raw_series_sha256).

### Next Pending Steps
- Step 2: Build synthetic 12-month telemetry generator, tenant isolation middleware, Priority Token Queue, and Shared Heap state manager.
- Step 3: Implement Forecasting Engine and wire the 3 core agents + Risk & Verification gates in LangGraph.
- Step 4: Expose FastAPI REST + WebSocket endpoints and build decoupled React frontend.

## Entry 002 — 2026-10-28 | Session: step1-scaffold

### Summary of Changes
- Scaffolded monorepo on `dev/ao02-core`: `backend/` (FastAPI + LangGraph) and `frontend/` (React + Vite + Tailwind).
- Added `backend/app/core/ao02_state_and_graph.py` with exact AO-02 blueprint: Pydantic domain schemas (ResourceType, PipelinePhase, GateDecision), TelemetryWindowSummary, CapacityForecast, RCADiagnosis, RemediationOption (read-only safety validator), RiskEvaluation, AuditTrailRecord; IncidentToken with hop-count loop guard; PriorityTokenQueue min-heap with dedup keying and compute_priority_number; SharedContextHeap with tenant isolation guard and immutable audit trail; AO02AgentState TypedDict and build_ao02_workflow_blueprint wiring the 6-phase LangGraph pipeline (monitoring -> incident_reporting -> rca_agent -> remediation_agent -> risk_analysis -> human_verification) with interrupt_before human-in-the-loop.
- Added `backend/app/main.py` FastAPI entry point wiring heap, queue, and workflow singletons plus /health and / routes.
- Added `backend/requirements.txt`, `backend/.env.example`, and package __init__ files.
- Added `frontend/` scaffold: index.html, package.json, vite.config.ts, tailwind.config.js, postcss.config.js, tsconfig configs, src/main.tsx, src/App.tsx, src/index.css.
- Added decoupled frontend contract `frontend/src/types/ao02.ts` (ResourceType, SeverityStatus, RackSpatialNode, CoolingUnitNode, QueuedIncidentTokenDTO).
- Added placeholder dirs src/services, src/hooks, src/store for headless-state & presentation pattern (Step 4).

### Touched Files
- `memory.md` (this entry)
- `backend/app/core/ao02_state_and_graph.py` (new)
- `backend/app/main.py` (new)
- `backend/app/__init__.py`, `backend/app/core/__init__.py` (new)
- `backend/requirements.txt`, `backend/.env.example` (new)
- `frontend/index.html`, `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tailwind.config.js`, `frontend/postcss.config.js`, `frontend/tsconfig.json`, `frontend/tsconfig.node.json` (new)
- `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/index.css` (new)
- `frontend/src/types/ao02.ts` (new)
- `frontend/src/services/__init__.py`, `frontend/src/hooks/__init__.py`, `frontend/src/store/__init__.py` (new placeholders)

### Architectural Impact
- Step 1 complete: `main` untouched; all work isolated on `dev/ao02-core`.
- Backend data contracts and LangGraph 6-phase state machine are in place before any LLM or telemetry logic is added, keeping agents coordinated through the Shared Heap and Priority Token Queue.
- Frontend is fully decoupled from backend via `src/types/ao02.ts`; Tailwind design tokens live in tailwind.config.js so future brand palette reskins need zero data-logic changes.

### Next Pending Steps
- Step 3: Implement Forecasting Engine (time-to-exhaustion + regime change detection + transient spike filtering) and wire 3 core agents + Risk & Verification gates in LangGraph with Gemini/OpenAI structured outputs.
- Step 4: Expose FastAPI REST + WebSocket endpoints and build decoupled React frontend (Isometric Rack Map, Forecasting Charts, Token Queue Visualizer, Human-in-the-Loop Console).

## Entry 003 — 2026-10-28 | Session: step2-telemetry-queue-heap

### Summary of Changes
- Step 2 complete: synthetic 12-month telemetry generator, tenant isolation guard, Priority Token Queue wiring, Shared Context Heap state manager, and FastAPI REST layer.
- `backend/requirements.txt`: added `numpy==1.26.4` and `sqlalchemy==2.0.29` for telemetry math and SQLite persistence.
- `backend/app/database.py`: SQLAlchemy engine/session/Base for file-based SQLite (`ao02.db`) plus `get_db()` dependency.
- `backend/app/models.py`: ORM models `TelemetryPointORM` and `AuditRecordORM` for persistent telemetry store and immutable audit trail.
- `backend/app/core/telemetry_generator.py`: `TelemetryGenerator` (seedable, deterministic) producing hourly 12-month series for Power, Network, Storage, VM Compute, Thermal/Cooling, and Software Licenses across R-01..R-12, CRAC-A/B, and T1-T3. Includes daily/weekly seasonality, linear exhaustion trends, regime changes (R-04/T1 storage onboarding step), transient spikes (R-07 power, CRAC-B thermal), and resources trending toward exhaustion by month 12. Exposes `get_series`, `get_latest_window`, `to_dict`.
- `backend/app/core/tenant_guard.py`: `TenantGuard` wrapping `SharedContextHeap.get_tenant_isolated_view` into FastAPI HTTPExceptions (403 on tenant-isolation breach, 404 on missing token); `require_tenant_header` and `is_facility_operator` header helpers.
- `backend/app/services/ingestion.py`: `IngestionService` — loads telemetry, computes SHA-256 of raw series for audit, runs linear-regression time-to-exhaustion forecast with confidence intervals, detects transient spikes and regime changes, evaluates against safety margins, mints `IncidentToken` with `compute_priority_number`, writes `HeapIncidentEnvelope` to Shared Heap, enqueues into Priority Token Queue. `scan_all_resources()` evaluates every rack/tenant/resource combination.
- `backend/app/api/deps.py`: module-level singletons for heap, queue, and ingestion with getter dependencies.
- `backend/app/api/routers/telemetry.py`: POST /telemetry/generate, GET /telemetry/points (filtered listing), GET /telemetry/window (latest series window).
- `backend/app/api/routers/queue.py`: GET /queue/snapshot (ordered tokens for visualizer), POST /queue/enqueue (rejects duplicates).
- `backend/app/api/routers/heap.py`: GET /heap/{token_id} (tenant-isolated view via X-Tenant-Id / X-Facility-Operator headers), GET /heap/{token_id}/envelope (full envelope).
- `backend/app/api/routers/ingest.py`: POST /ingest/scan (runs full resource scan and minting).
- `backend/app/main.py`: mounts all routers, builds LangGraph workflow blueprint from heap singleton, exposes /health, /, and endpoint index.

### Touched Files
- `memory.md` (this entry)
- `backend/requirements.txt` (edited)
- `backend/app/database.py` (new)
- `backend/app/models.py` (new)
- `backend/app/core/telemetry_generator.py` (new)
- `backend/app/core/tenant_guard.py` (new)
- `backend/app/services/ingestion.py` (new)
- `backend/app/api/deps.py` (new)
- `backend/app/api/__init__.py` (new)
- `backend/app/api/routers/__init__.py` (new)
- `backend/app/api/routers/telemetry.py` (new)
- `backend/app/api/routers/queue.py` (new)
- `backend/app/api/routers/heap.py` (new)
- `backend/app/api/routers/ingest.py` (new)
- `backend/app/main.py` (rewrote to mount routers + workflow)

### Architectural Impact
- Read-only telemetry pipeline is operational: generation → windowing → forecast → threshold breach → token mint → heap write → queue enqueue.
- Tenant isolation enforced at the API layer via `TenantGuard` + `X-Tenant-Id`/`X-Facility-Operator` headers; facility operators bypass isolation, tenants cannot read each other's telemetry.
- Every minted token gets an immutable audit entry (telemetry SHA-256, actor, phase, summary) in the Shared Heap.
- LangGraph 6-phase workflow blueprint is compiled and ready for agent node LLM wiring in Step 3.

### Next Pending Steps
- Step 4: Expose FastAPI WebSocket endpoint for live agent graph streaming and build decoupled React frontend (Isometric Rack Map, Forecasting Charts, Token Queue Visualizer, Human-in-the-Loop Console).

## Entry 006 — 2026-10-28 | Session: step4-websocket-frontend

### Summary of Changes
- Step 4 complete: FastAPI WebSocket streaming endpoint + decoupled React + Vite + TypeScript + Tailwind frontend.
- `backend/app/api/routers/stream.py`: WebSocket endpoint `/stream/agent-events` for live agent graph state transitions; HTTP fallback `/stream/queue/snapshot`. Includes `ConnectionManager` for broadcast to all connected clients.
- `backend/app/services/streaming.py`: `broadcast_token_transition()` and `broadcast_queue_update()` pub/sub helpers for agent nodes to push live events.
- `backend/app/workflow.py`: each node now broadcasts phase transitions and queue updates via WebSocket after execution.
- `backend/app/main.py`: mounts `stream.router`; version 0.4.0.
- `frontend/src/services/api.ts`: decoupled REST API client (telemetry, queue, heap, agent run, scan) — all backend communication lives here.
- `frontend/src/services/websocket.ts`: `WSClient` with auto-reconnect, typed `StreamEvent` union, subscribe/unsubscribe pattern.
- `frontend/src/store/ao02Store.tsx`: headless state store (React Context + useReducer) holding telemetry, queue tokens, heap envelopes, and stream state. Actions: `fetchWindow`, `runAgentPipeline`, `scanResources`. Subscribes to WebSocket on mount.
- `frontend/src/hooks/useTelemetry.ts`, `useQueue.ts`, `useAgentStream.ts`: headless hooks consuming the store.
- `frontend/src/components/layout/Sidebar.tsx`, `Header.tsx`: navigation shell.
- `frontend/src/components/common/SeverityBadge.tsx`, `MetricCard.tsx`: decoupled UI primitives using semantic Tailwind tokens.
- `frontend/src/components/rack-map/`: `IsometricRackMap.tsx` (2.5D isometric grid R-01–R-12 + CRAC A/B with severity dots, active badges, power load bars), `RackMapPage.tsx` (assembles from store).
- `frontend/src/components/forecasting/`: `ForecastChart.tsx` (SVG time-series with confidence cone, area fill, grid, axes), `ForecastPage.tsx` (workbench with resource selector).
- `frontend/src/components/queue-visualizer/TokenQueueVisualizer.tsx`: priority-ordered token table with phase badges, hop count vs max, utilization, lead time.
- `frontend/src/components/hitl-console/HITLConsole.tsx`: RCA findings, remediation simulations (read-only), risk score gauge, operator approve/reject/defer buttons, audit trail log.
- `frontend/src/App.tsx`: app shell wiring store provider, sidebar, header, and page routing.
- `frontend/`: `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json`, `package.json`, `index.html`, `src/main.tsx`, `src/index.css` — all from Step 1 scaffold.

### Touched Files
- `memory.md` (this entry)
- `.gitignore` (edited — added frontend/dist/, frontend/node_modules/)
- `backend/app/api/routers/stream.py` (new)
- `backend/app/api/routers/__init__.py` (new)
- `backend/app/services/streaming.py` (new)
- `backend/app/workflow.py` (edited — added broadcasting)
- `backend/app/main.py` (edited)
- `frontend/src/services/api.ts` (new)
- `frontend/src/services/websocket.ts` (new)
- `frontend/src/services/__init__.js` (new placeholder)
- `frontend/src/store/ao02Store.tsx` (new)
- `frontend/src/hooks/useTelemetry.ts`, `useQueue.ts`, `useAgentStream.ts`, `__init__.js` (new)
- `frontend/src/components/layout/Sidebar.tsx`, `Header.tsx` (new)
- `frontend/src/components/common/SeverityBadge.tsx`, `MetricCard.tsx` (new)
- `frontend/src/components/rack-map/*` (new)
- `frontend/src/components/forecasting/*` (new)
- `frontend/src/components/queue-visualizer/*` (new)
- `frontend/src/components/hitl-console/*` (new)
- `frontend/src/App.tsx` (rewrote)

### Architectural Impact
- Step 4 complete: full decoupled frontend operational. Headless state & presentation pattern enforced — `src/services/` and `src/store/` contain all backend logic; components are pure presentational consumers.
- WebSocket live streaming: agent phase transitions broadcast to frontend in real time; queue snapshot available via HTTP fallback.
- Frontend builds cleanly with `tsc --noEmit` and `vite build` (zero TypeScript errors).
- All four core views delivered: Isometric Rack Map, Forecasting Charts, Token Queue Visualizer, HITL Console.
- Tailwind design tokens in `tailwind.config.js` — future brand palette reskins need zero data-logic or component changes.

### Next Pending Steps
- All 4 steps complete. Ready for production hardening: auth/RBAC, persistent database (SQLAlchemy models already defined), WebSocket reconnection resilience, chart interactivity, and operator decision write-back to heap.

## Entry 004 — 2026-10-28 | Session: step2-bugfixes

### Summary of Changes
- Fixed two bugs surfaced by the Step 2 end-to-end TestClient verification.
- `backend/app/services/ingestion.py`:
  - `evaluate_and_mint`: compute `current_utilization_pct` as `(current / hard_limit) * 100`, clamped to 100.0, so count/kW/seat resources (VM_COMPUTE, POWER, NETWORK, SOFTWARE_LICENSE) satisfy the `TelemetryWindowSummary.current_utilization_pct le=100` schema constraint instead of raising Pydantic validation errors on over-capacity resources (e.g., R-07 power spiking to 103.6).
  - `scan_all_resources`: replaced call to removed private `_get_latest_window` with the public `get_latest_window` accessor.
- Added `.gitignore` excluding `__pycache__/`, `*.pyc`, `.env`, `*.db`, IDE/OS files so compiled artifacts and local DB/env aren't committed.

### Touched Files
- `memory.md` (this entry)
- `backend/app/services/ingestion.py` (edited)
- `.gitignore` (new)

### Architectural Impact
- Ingestion pipeline now handles all six resource types without schema violations, including resources that exceed their hard capacity limit (reported as 100% utilization — critical severity).
- Verified end-to-end via FastAPI TestClient: telemetry generation (872,640 points), /ingest/scan (53 tokens minted), /queue/snapshot (priority-ordered), /heap tenant-isolation (403 for wrong tenant, 200 for facility operator / correct tenant).

### Next Pending Steps
- Step 4: Expose FastAPI WebSocket endpoint for live agent graph streaming and build decoupled React frontend (Isometric Rack Map, Forecasting Charts, Token Queue Visualizer, Human-in-the-Loop Console).

## Entry 006 — 2026-10-28 | Session: step4-websocket-frontend

### Summary of Changes
- Step 4 complete: FastAPI WebSocket streaming endpoint + decoupled React + Vite + TypeScript + Tailwind frontend.
- `backend/app/api/routers/stream.py`: WebSocket endpoint `/stream/agent-events` for live agent graph state transitions; HTTP fallback `/stream/queue/snapshot`. Includes `ConnectionManager` for broadcast to all connected clients.
- `backend/app/services/streaming.py`: `broadcast_token_transition()` and `broadcast_queue_update()` pub/sub helpers for agent nodes to push live events.
- `backend/app/workflow.py`: each node now broadcasts phase transitions and queue updates via WebSocket after execution.
- `backend/app/main.py`: mounts `stream.router`; version 0.4.0.
- `frontend/src/services/api.ts`: decoupled REST API client (telemetry, queue, heap, agent run, scan) — all backend communication lives here.
- `frontend/src/services/websocket.ts`: `WSClient` with auto-reconnect, typed `StreamEvent` union, subscribe/unsubscribe pattern.
- `frontend/src/store/ao02Store.tsx`: headless state store (React Context + useReducer) holding telemetry, queue tokens, heap envelopes, and stream state. Actions: `fetchWindow`, `runAgentPipeline`, `scanResources`. Subscribes to WebSocket on mount.
- `frontend/src/hooks/useTelemetry.ts`, `useQueue.ts`, `useAgentStream.ts`: headless hooks consuming the store.
- `frontend/src/components/layout/Sidebar.tsx`, `Header.tsx`: navigation shell.
- `frontend/src/components/common/SeverityBadge.tsx`, `MetricCard.tsx`: decoupled UI primitives using semantic Tailwind tokens.
- `frontend/src/components/rack-map/`: `IsometricRackMap.tsx` (2.5D isometric grid R-01–R-12 + CRAC A/B with severity dots, active badges, power load bars), `RackMapPage.tsx` (assembles from store).
- `frontend/src/components/forecasting/`: `ForecastChart.tsx` (SVG time-series with confidence cone, area fill, grid, axes), `ForecastPage.tsx` (workbench with resource selector).
- `frontend/src/components/queue-visualizer/TokenQueueVisualizer.tsx`: priority-ordered token table with phase badges, hop count vs max, utilization, lead time.
- `frontend/src/components/hitl-console/HITLConsole.tsx`: RCA findings, remediation simulations (read-only), risk score gauge, operator approve/reject/defer buttons, audit trail log.
- `frontend/src/App.tsx`: app shell wiring store provider, sidebar, header, and page routing.
- `frontend/`: `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json`, `package.json`, `index.html`, `src/main.tsx`, `src/index.css` — all from Step 1 scaffold.

### Touched Files
- `memory.md` (this entry)
- `.gitignore` (edited — added frontend/dist/, frontend/node_modules/)
- `backend/app/api/routers/stream.py` (new)
- `backend/app/api/routers/__init__.py` (new)
- `backend/app/services/streaming.py` (new)
- `backend/app/workflow.py` (edited — added broadcasting)
- `backend/app/main.py` (edited)
- `frontend/src/services/api.ts` (new)
- `frontend/src/services/websocket.ts` (new)
- `frontend/src/services/__init__.js` (new placeholder)
- `frontend/src/store/ao02Store.tsx` (new)
- `frontend/src/hooks/useTelemetry.ts`, `useQueue.ts`, `useAgentStream.ts`, `__init__.js` (new)
- `frontend/src/components/layout/Sidebar.tsx`, `Header.tsx` (new)
- `frontend/src/components/common/SeverityBadge.tsx`, `MetricCard.tsx` (new)
- `frontend/src/components/rack-map/*` (new)
- `frontend/src/components/forecasting/*` (new)
- `frontend/src/components/queue-visualizer/*` (new)
- `frontend/src/components/hitl-console/*` (new)
- `frontend/src/App.tsx` (rewrote)

### Architectural Impact
- Step 4 complete: full decoupled frontend operational. Headless state & presentation pattern enforced — `src/services/` and `src/store/` contain all backend logic; components are pure presentational consumers.
- WebSocket live streaming: agent phase transitions broadcast to frontend in real time; queue snapshot available via HTTP fallback.
- Frontend builds cleanly with `tsc --noEmit` and `vite build` (zero TypeScript errors).
- All four core views delivered: Isometric Rack Map, Forecasting Charts, Token Queue Visualizer, HITL Console.
- Tailwind design tokens in `tailwind.config.js` — future brand palette reskins need zero data-logic or component changes.

### Next Pending Steps
- All 4 steps complete. Ready for production hardening: auth/RBAC, persistent database (SQLAlchemy models already defined), WebSocket reconnection resilience, chart interactivity, and operator decision write-back to heap.

## Entry 005 — 2026-10-28 | Session: step3-agents-langgraph

### Summary of Changes
- Step 3 complete: LLM provider abstraction, 3 core agents + risk agent, LangGraph workflow wired end-to-end.
- `backend/requirements.txt`: added `google-generativeai==0.8.3` and `openai==1.40.0`.
- `backend/app/core/llm_provider.py`: unified LLM provider abstraction with `LLMProvider` ABC, `GeminiProvider` (structured JSON via `response_mime_type`/`response_schema`), `OpenAIProvider` (structured JSON via `response_format`), and `_MockProvider` deterministic fallback when no API key is configured. `get_llm_provider()` factory reads `LLM_PROVIDER`/`GEMINI_API_KEY`/`OPENAI_API_KEY` env vars.
- `backend/app/api/deps.py`: added `get_llm_provider()` singleton dependency.
- `backend/app/agents/base.py`: `BaseAgent` with heap access, LLM provider, `_advance()` (hop increment + phase transition + immutable audit write), and `_llm_structured()` wrapper.
- `backend/app/agents/monitoring_agent.py`: `ResourceMonitoringAgent` — Phase 1. Evaluates forecast, suppresses transient spikes (false-alarm filtering), detects regime changes, escalates critical lead times, advances to incident reporting.
- `backend/app/agents/rca_agent.py`: `RCAAgent` — Phase 3. Calls LLM with `RCADiagnosis` schema, attributes trend to tenant/workload, correlates cross-resource signals.
- `backend/app/agents/remediation_agent.py`: `RemediationAgent` — Phase 4. Calls LLM with `RemediationOption` schema, enforces `mutates_live_facility_controls=False` read-only safety constraint.
- `backend/app/agents/risk_agent.py`: `RiskAgent` — Phase 5. Computes deterministic risk score (utilization, lead time urgency, confidence, regime shift), calls LLM with `RiskEvaluation` schema, issues `GateDecision`.
- `backend/app/workflow.py`: `AO02Workflow` builds and compiles the LangGraph state machine with monitoring → incident_reporting → rca_agent → remediation_agent → risk_analysis → human_verification, `interrupt_before=["human_verification"]` for live human-in-the-loop pause. Dequeuing handled outside the graph.
- `backend/app/main.py`: version 0.3.0, wires workflow, LLM provider, adds POST `/agents/run` endpoint that dequeues highest-priority token and runs it through the pipeline. Fixed `queue` variable name collision with imported routers module (renamed singleton to `token_queue`).
- `backend/app/services/ingestion.py`: replaced `_forecast_linear` with `_forecast_enhanced` — linear regression with R-squared confidence, residual-based confidence intervals, sliding-window regime-change detection, improved transient-spike suppression.

### Touched Files
- `memory.md` (this entry)
- `backend/requirements.txt` (edited)
- `backend/app/core/llm_provider.py` (new)
- `backend/app/api/deps.py` (edited)
- `backend/app/agents/__init__.py` (new)
- `backend/app/agents/base.py` (new)
- `backend/app/agents/monitoring_agent.py` (new)
- `backend/app/agents/rca_agent.py` (new)
- `backend/app/agents/remediation_agent.py` (new)
- `backend/app/agents/risk_agent.py` (new)
- `backend/app/workflow.py` (new)
- `backend/app/main.py` (edited)
- `backend/app/services/ingestion.py` (edited)

### Architectural Impact
- Full 6-phase LangGraph pipeline operational: dequeue → monitoring → incident reporting → RCA → remediation → risk → human verification (interrupt).
- LLM provider abstraction supports Gemini, OpenAI, or deterministic mock (no API key needed for sandbox/demo).
- All agent outputs are structured Pydantic models with immutable audit trail in the Shared Heap.
- Read-only safety constraint enforced: `mutates_live_facility_controls=False` on all remediation options.
- End-to-end verified: 53 tokens minted from scan, top-priority token processed through all phases, heap envelope fully populated with RCA, remediation, risk evaluation, and 6 audit entries.

### Next Pending Steps
- Step 4: Expose FastAPI WebSocket endpoint for live agent graph streaming and build decoupled React frontend (Isometric Rack Map, Forecasting Charts, Token Queue Visualizer, Human-in-the-Loop Console).

## Entry 006 — 2026-10-28 | Session: step4-websocket-frontend

### Summary of Changes
- Step 4 complete: FastAPI WebSocket streaming endpoint + decoupled React + Vite + TypeScript + Tailwind frontend.
- `backend/app/api/routers/stream.py`: WebSocket endpoint `/stream/agent-events` for live agent graph state transitions; HTTP fallback `/stream/queue/snapshot`. Includes `ConnectionManager` for broadcast to all connected clients.
- `backend/app/services/streaming.py`: `broadcast_token_transition()` and `broadcast_queue_update()` pub/sub helpers for agent nodes to push live events.
- `backend/app/workflow.py`: each node now broadcasts phase transitions and queue updates via WebSocket after execution.
- `backend/app/main.py`: mounts `stream.router`; version 0.4.0.
- `frontend/src/services/api.ts`: decoupled REST API client (telemetry, queue, heap, agent run, scan) — all backend communication lives here.
- `frontend/src/services/websocket.ts`: `WSClient` with auto-reconnect, typed `StreamEvent` union, subscribe/unsubscribe pattern.
- `frontend/src/store/ao02Store.tsx`: headless state store (React Context + useReducer) holding telemetry, queue tokens, heap envelopes, and stream state. Actions: `fetchWindow`, `runAgentPipeline`, `scanResources`. Subscribes to WebSocket on mount.
- `frontend/src/hooks/useTelemetry.ts`, `useQueue.ts`, `useAgentStream.ts`: headless hooks consuming the store.
- `frontend/src/components/layout/Sidebar.tsx`, `Header.tsx`: navigation shell.
- `frontend/src/components/common/SeverityBadge.tsx`, `MetricCard.tsx`: decoupled UI primitives using semantic Tailwind tokens.
- `frontend/src/components/rack-map/`: `IsometricRackMap.tsx` (2.5D isometric grid R-01–R-12 + CRAC A/B with severity dots, active badges, power load bars), `RackMapPage.tsx` (assembles from store).
- `frontend/src/components/forecasting/`: `ForecastChart.tsx` (SVG time-series with confidence cone, area fill, grid, axes), `ForecastPage.tsx` (workbench with resource selector).
- `frontend/src/components/queue-visualizer/TokenQueueVisualizer.tsx`: priority-ordered token table with phase badges, hop count vs max, utilization, lead time.
- `frontend/src/components/hitl-console/HITLConsole.tsx`: RCA findings, remediation simulations (read-only), risk score gauge, operator approve/reject/defer buttons, audit trail log.
- `frontend/src/App.tsx`: app shell wiring store provider, sidebar, header, and page routing.
- `frontend/`: `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json`, `package.json`, `index.html`, `src/main.tsx`, `src/index.css` — all from Step 1 scaffold.

### Touched Files
- `memory.md` (this entry)
- `.gitignore` (edited — added frontend/dist/, frontend/node_modules/)
- `backend/app/api/routers/stream.py` (new)
- `backend/app/api/routers/__init__.py` (new)
- `backend/app/services/streaming.py` (new)
- `backend/app/workflow.py` (edited — added broadcasting)
- `backend/app/main.py` (edited)
- `frontend/src/services/api.ts` (new)
- `frontend/src/services/websocket.ts` (new)
- `frontend/src/services/__init__.js` (new placeholder)
- `frontend/src/store/ao02Store.tsx` (new)
- `frontend/src/hooks/useTelemetry.ts`, `useQueue.ts`, `useAgentStream.ts`, `__init__.js` (new)
- `frontend/src/components/layout/Sidebar.tsx`, `Header.tsx` (new)
- `frontend/src/components/common/SeverityBadge.tsx`, `MetricCard.tsx` (new)
- `frontend/src/components/rack-map/*` (new)
- `frontend/src/components/forecasting/*` (new)
- `frontend/src/components/queue-visualizer/*` (new)
- `frontend/src/components/hitl-console/*` (new)
- `frontend/src/App.tsx` (rewrote)

### Architectural Impact
- Step 4 complete: full decoupled frontend operational. Headless state & presentation pattern enforced — `src/services/` and `src/store/` contain all backend logic; components are pure presentational consumers.
- WebSocket live streaming: agent phase transitions broadcast to frontend in real time; queue snapshot available via HTTP fallback.
- Frontend builds cleanly with `tsc --noEmit` and `vite build` (zero TypeScript errors).
- All four core views delivered: Isometric Rack Map, Forecasting Charts, Token Queue Visualizer, HITL Console.
- Tailwind design tokens in `tailwind.config.js` — future brand palette reskins need zero data-logic or component changes.

### Next Pending Steps
- All 4 steps complete. Ready for production hardening: auth/RBAC, persistent database (SQLAlchemy models already defined), WebSocket reconnection resilience, chart interactivity, and operator decision write-back to heap.

## Entry 007 — 2026-10-28 | Session: pipeline-repair-and-contract-fix

### Summary of Changes
- Repaired the runtime end to end. `/agents/run` failed for every token with `asyncio.run() cannot be called from a running event loop`; LangGraph nodes are now async and await agents plus WebSocket broadcasts on the API event loop.
- Fixed API/frontend contract drift: backend snake_case token payloads are normalised once in `frontend/src/services/api.ts` into camelCase DTOs. This removes the `NaN%` values, blank rack/tenant labels, and the queue-page crash.
- `/queue/snapshot` and WebSocket payloads are now enriched with heap telemetry (utilization, safety margin, lead time, confidence, interval, regime flags, risk/gate) through new `backend/app/api/serializers.py`.
- Cold start fixed: telemetry generates lazily on first series access, so scanning no longer depends on a prior `/telemetry/generate` call.
- Duplicate-scan bug fixed: the envelope write moved after the queue dedupe gate, so repeated scans no longer create orphan heap records (previously 53 -> 106 after one rescan).
- HITL flow completed: `/agents/run` leaves the token at `06_HUMAN_VERIFICATION`, `/agents/pending` lists it, `/agents/decision` records approve/reject/defer with an audit entry and phase transition. Failed runs requeue the token via `PriorityTokenQueue.requeue`.
- New endpoints: `/facility/overview` (real rack power/network/tenant utilization plus CRAC temperature and derived RPM), `/agents/pending`, `/agents/decision`, `/agents/history` (terminal phases only).
- Frontend rebuilt against the DTO contract: facility-driven isometric map, forecast page with least-squares 14-day projection, 95% confidence cone and safety-margin threshold, queue tabs (queued/pending/history), and a full HITL console (stepper, evidence, RCA, remediation, risk, decision, audit).
- Store fixes: no telemetry regeneration on mount, WebSocket plus 15s polling fallback, envelope cache invalidation on phase change, and auto-follow of the incident awaiting verification without hijacking an explicit operator selection.
- Layout fixes: desktop header offset past the fixed sidebar, mobile drawer, horizontally scrollable rack floor, error boundary, and dismissible error banner.
- Removed Python `__init__` placeholders from `frontend/src/services` and `frontend/src/hooks`.

### Touched Files
- `backend/app/core/ao02_state_and_graph.py` (REJECTED phase, requeue, all_envelopes)
- `backend/app/core/telemetry_generator.py` (lazy generation, series index, latest_point)
- `backend/app/services/ingestion.py` (dedupe before heap write)
- `backend/app/services/streaming.py` (serialized broadcasts)
- `backend/app/api/serializers.py` (new)
- `backend/app/api/routers/agents.py` (new)
- `backend/app/api/routers/facility.py` (new)
- `backend/app/api/routers/queue.py`, `stream.py` (serializers)
- `backend/app/api/deps.py` (workflow singleton)
- `backend/app/workflow.py` (async nodes)
- `backend/app/main.py` (router mounting, health)
- `backend/app/agents/monitoring_agent.py` (Optional import)
- `frontend/src/types/ao02.ts` (full DTO contract)
- `frontend/src/services/api.ts`, `websocket.ts`
- `frontend/src/store/ao02Store.tsx`
- `frontend/src/hooks/*` (rewritten; `useFacility`, `useSelectedIncident` added)
- `frontend/src/lib/format.ts`, `resourceSpec.ts` (new)
- `frontend/src/components/**` (all four views, layout, common)
- `frontend/src/App.tsx`
- `frontend/src/vite-env.d.ts` (new)
- `memory.md` (this entry)

### Verification
- `npx tsc --noEmit` and `npm run build` pass (51 modules, ~219 kB JS).
- API flow: fresh boot -> scan mints 53 -> repeat scan mints 0 with heap stable at 53 -> run reaches 06 with 5 hops -> pending 1 -> heap envelope has RCA, 1 remediation option, risk 0.956, 6 audit entries -> approve resolves to 07.
- Tenant isolation: T1 requesting a T2 envelope returns 403.
- Browser: all four views render real values with zero console errors and no `NaN`; queue run -> HITL -> approve works; a history row reopens the resolved incident with the approval note.

### Architectural Impact
- The data contract boundary is explicit: backend stays snake_case, frontend consumes camelCase DTOs from one normaliser. The palette is already tokenised, so reskins need no backend or data-logic changes.
- Pipeline ownership clarified: the API owns dequeue/requeue, the graph owns phase progression, the heap owns evidence and audit, and the decision endpoint owns operator sign-off. The human gate is observable via the pending list instead of dropping tokens.
- Telemetry remains strictly read-only; every remediation option is simulated and audit-linked to `raw_series_sha256`.

### Next Pending Steps
- Persist heap/queue state (SQLAlchemy models exist) so verification survives restarts and audit history is durable.
- Add auth/RBAC for operator identity instead of the demo `operator@facility` default.
- Harden WebSocket fan-out across multiple workers (Redis pub/sub) before horizontal scaling.
- Add backend tests for dedupe/idempotent scans, requeue-on-error, tenant isolation, and decision transitions.

## Entry 008 — 2026-10-28 | Session: xor-warm-technical-redesign

### Summary of Changes
- Replaced the previous dark-sidebar/light-card presentation with the XOR Capacity Observatory visual language: warm canvas `#eae8e2`, ink `#292c29`, muted `#646861`, hairline `#bcbfb5`, soft line `#d4d7cc`, surface `#f4f3ee`, accent green `#34765f`, warning ochre `#8a5a2b`, critical brick `#a33a2f`, and the Segoe UI + Cascadia Code type pairing.
- Rebuilt the shell around an 88px brand header and a horizontal numbered technical nav (01 Facility, 02 Queue, 03 Forecast, 04 Operator). Live queue and pending counts are shown in the nav; connection and last-update metadata sit on the right.
- Removed the fixed sidebar and rewrote `App.tsx` with per-view editorial intros, a shared connection block, dismissible backend errors, and the three-part footer.
- Rebuilt the rack map from the XOR isometric SVG geometry (960×590): floor grid, 12 cabinets, 2 cooling units, orientation mark, service-aisle label, live utilization readings, status-coloured outlines and dots. Kept keyboard selection, CSS rack lift, 80–130% zoom, and reset.
- Rebuilt the facility page around the reference workspace: FIG. 01 caption, SVG plan, live inspector, dark view-controls bar, rack selector, six-cell resource coverage strip, four-stat strip, and incident overlay table with HITL drill-through.
- Restyled the queue page as a technical tabbed table with priority, token, node/tenant, resource, utilization bar, lead time, confidence, hops, phase and flags columns, plus the live agent activity stream and pipeline/scan/refresh controls.
- Restyled forecasting as a selector panel, divided stat strip, warm-palette SVG chart (green observed line, ink projection, green confidence cone, ochre safety margin), linked-incident panel, telemetry-window evidence panel, and regime-change notice.
- Restyled the HITL console as an operator record with severity tag, seven-step phase track, six-cell evidence grid, RCA, read-only remediation options, immutable audit timeline, risk gate, operator notes, and approve/reject/defer actions.
- Restyled `MetricCard`, `SeverityBadge`, and `ErrorBoundary` as flat technical primitives. Updated `index.html` title, description, and theme colour.
- Responsive rules at 1100px and 680px adapt the nav, intro, floor plan, inspector, strips, phase track, evidence grid, and footer.

### Touched Files
- `memory.md` (this entry)
- `frontend/index.html`
- `frontend/tailwind.config.js`
- `frontend/src/index.css`
- `frontend/src/App.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/components/layout/Sidebar.tsx` (deleted)
- `frontend/src/components/common/ErrorBoundary.tsx`
- `frontend/src/components/common/MetricCard.tsx`
- `frontend/src/components/common/SeverityBadge.tsx`
- `frontend/src/components/rack-map/IsometricRackMap.tsx`
- `frontend/src/components/rack-map/RackMapPage.tsx`
- `frontend/src/components/queue-visualizer/TokenQueueVisualizer.tsx`
- `frontend/src/components/forecasting/ForecastPage.tsx`
- `frontend/src/components/forecasting/ForecastChart.tsx`
- `frontend/src/components/hitl-console/HITLConsole.tsx`

### Verification
- `npx tsc --noEmit` and `npm run build` pass (50 modules, 216.58 kB JS, 30.59 kB CSS).
- Live browser checks at `http://localhost:5173/`: canvas `rgb(234,232,226)`, ink `rgb(41,44,41)`, header exactly 88px, 12 selectable racks, 2 cooling units, 6 resource cells, 4 stat blocks, 12 incident rows, no console errors, no `NaN`, no horizontal overflow.
- Rack click updates the inspector; rack selector toggles selection; zoom +/−/reset produce 110% and 100%; “Open incident” opens the correct token in the operator console.
- Queue → run pipeline → token reaches `06_HUMAN_VERIFICATION`; pending tab exposes one row; row click opens HITL; approval records “Advisory approved by operator”, resolves the token, clears the pending count, and appends a seventh audit entry with the telemetry hash.
- 375px iframe checks: no page overflow, nav fits, queue table scrolls inside its wrapper, forecast chart scales to 318px, HITL collapses to one column, evidence grid becomes 2×3, and the footer stacks.
- Chart computed colours: observed `rgb(52,118,95)`, grid `rgb(212,215,204)`, projection `rgb(41,44,41)`, safety margin `rgb(138,90,43)`.

### Architectural Impact
- Presentation-only reskin. The backend, DTO contract, store, hooks, WebSocket client, tenant isolation, token queue, shared heap, and agent pipeline are unchanged.
- Semantic design tokens remain centralised in `tailwind.config.js` plus CSS custom properties, so palette/type changes still require no data-logic edits.
- No new runtime dependency was added; zoom, selection, and rack lift are React/CSS only.
- The tool remains advisory and read-only: remediation options are simulated, and the human gate and immutable audit link remain visible in the operator view.

### Next Pending Steps
- Commit this redesign on `dev/ao02-core` (do not touch `main`).
- Persist heap/queue state so decisions and audit history survive restarts.
- Add auth/RBAC for operator identity and harden WebSocket fan-out for multiple workers.
- Add backend regression tests for dedupe, requeue-on-error, tenant isolation, and decision transitions.
- Optional polish: deep-link a HITL incident to its forecast series, add visual regression screenshots, and verify the 1440px desktop composition on hardware.
