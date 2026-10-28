"""AO-02 FastAPI application entry point.

Read-only telemetry ingestion, forecasting, and multi-agent incident pipeline
for proactive data center capacity exhaustion forecasting.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.deps import get_heap, get_queue, get_ingestion, get_llm_provider
from app.core.ao02_state_and_graph import (
    SharedContextHeap,
    PriorityTokenQueue,
)
from app.workflow import build_ao02_workflow

# Shared infra singletons wired across the 6-phase LangGraph pipeline.
heap: SharedContextHeap = get_heap()
token_queue: PriorityTokenQueue = get_queue()
llm = get_llm_provider()
workflow = build_ao02_workflow(heap, llm)

app = FastAPI(
    title="AO-02 Data Center Capacity Forecasting",
    description=(
        "Proactive multi-tenant data center capacity exhaustion forecasting "
        "& incident resolution (read-only telemetry, tenant-isolated, "
        "immutable audit trail)."
    ),
    version="0.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routers
from app.api.routers import heap, ingest, queue, telemetry  # noqa: E402

app.include_router(telemetry.router)
app.include_router(queue.router)
app.include_router(heap.router)
app.include_router(ingest.router)


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "service": "ao02-capacity-forecasting",
        "branch": "dev/ao02-core",
        "llm_provider": type(llm).__name__,
    }


@app.get("/")
async def root() -> dict:
    return {
        "service": "AO-02 Data Center Capacity Forecasting",
        "branch": "dev/ao02-core",
        "phase": "Step 3 — agents + LangGraph workflow wired",
        "endpoints": {
            "telemetry": "/telemetry",
            "queue": "/queue",
            "heap": "/heap",
            "ingest": "/ingest",
        },
    }


@app.post("/agents/run")
async def run_agent_pipeline() -> dict:
    """Dequeue the highest-priority token and run it through the 6-phase
    LangGraph agent pipeline (up to the human-verification interrupt)."""
    token = token_queue.dequeue()
    if token is None:
        return {"status": "idle", "message": "No tokens in queue"}

    initial_state = {
        "active_token_id": token.token_id,
        "current_phase": token.current_phase.value,
        "hop_count": token.hop_count,
        "should_halt": False,
        "halt_reason": None,
        "awaiting_human_verification": False,
    }

    try:
        result = workflow.invoke(initial_state)
        return {
            "status": "completed",
            "token_id": token.token_id,
            "final_phase": result.get("current_phase"),
            "hop_count": result.get("hop_count"),
            "should_halt": result.get("should_halt"),
            "halt_reason": result.get("halt_reason"),
            "awaiting_human_verification": result.get(
                "awaiting_human_verification", False
            ),
        }
    except Exception as exc:  # noqa: BLE001 - surface graph errors to caller
        return {
            "status": "error",
            "token_id": token.token_id,
            "error": str(exc),
        }
