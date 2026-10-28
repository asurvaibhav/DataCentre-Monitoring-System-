"""AO-02 FastAPI application entry point.

Read-only telemetry ingestion, forecasting, and multi-agent incident pipeline
for proactive data center capacity exhaustion forecasting.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import heap, ingest, queue, telemetry
from app.api.deps import get_heap, get_queue
from app.core.ao02_state_and_graph import (
    SharedContextHeap,
    PriorityTokenQueue,
    build_ao02_workflow_blueprint,
)

# Shared infra singletons wired across the 6-phase LangGraph pipeline.
heap_singleton: SharedContextHeap = get_heap()
queue_singleton: PriorityTokenQueue = get_queue()
workflow = build_ao02_workflow_blueprint(heap_singleton)

app = FastAPI(
    title="AO-02 Data Center Capacity Forecasting",
    description=(
        "Proactive multi-tenant data center capacity exhaustion forecasting "
        "& incident resolution (read-only telemetry, tenant-isolated, "
        "immutable audit trail)."
    ),
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routers
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
    }


@app.get("/")
async def root() -> dict:
    return {
        "service": "AO-02 Data Center Capacity Forecasting",
        "branch": "dev/ao02-core",
        "phase": "Step 2 — telemetry + queue + heap wiring",
        "endpoints": {
            "telemetry": "/telemetry",
            "queue": "/queue",
            "heap": "/heap",
            "ingest": "/ingest",
        },
    }
