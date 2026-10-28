"""
AO-02 FastAPI application entry point.

Read-only telemetry ingestion, forecasting, and multi-agent incident pipeline
for proactive data center capacity exhaustion forecasting.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.deps import get_heap, get_queue, get_workflow, get_llm_provider

app = FastAPI(
    title="AO-02 Data Center Capacity Forecasting",
    description=(
        "Proactive multi-tenant data center capacity exhaustion forecasting "
        "& incident resolution (read-only telemetry, tenant-isolated, "
        "immutable audit trail)."
    ),
    version="0.5.0",
)

# Vite dev server origins (and preview). Credentials are not used, so a
# wildcard is safe here and keeps local ports flexible.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routers
from app.api.routers import (  # noqa: E402
    agents,
    facility,
    heap,
    ingest,
    queue,
    stream,
    telemetry,
)

app.include_router(telemetry.router)
app.include_router(facility.router)
app.include_router(queue.router)
app.include_router(heap.router)
app.include_router(agents.router)
app.include_router(stream.router)
app.include_router(ingest.router)


@app.get("/health")
async def health() -> dict:
    heap = get_heap()
    token_queue = get_queue()
    return {
        "status": "ok",
        "service": "ao02-capacity-forecasting",
        "branch": "dev/ao02-core",
        "llm_provider": type(get_llm_provider()).__name__,
        "queued_tokens": len(token_queue.snapshot()),
        "heap_envelopes": len(heap.all_envelopes()),
    }


@app.get("/")
async def root() -> dict:
    return {
        "service": "AO-02 Data Center Capacity Forecasting",
        "branch": "dev/ao02-core",
        "phase": "Step 5 — pipeline, contracts and dashboard fixes",
        "endpoints": {
            "telemetry": "/telemetry",
            "facility": "/facility/overview",
            "queue": "/queue",
            "heap": "/heap",
            "agents": "/agents",
            "ingest": "/ingest",
            "stream": "/stream/agent-events",
        },
    }
