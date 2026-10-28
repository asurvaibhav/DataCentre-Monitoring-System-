"""AO-02 FastAPI application entry point.

Read-only telemetry ingestion, forecasting, and multi-agent incident pipeline
for proactive data center capacity exhaustion forecasting.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.ao02_state_and_graph import (
    SharedContextHeap,
    PriorityTokenQueue,
    build_ao02_workflow_blueprint,
)

# Shared infra singletons wired across the 6-phase LangGraph pipeline.
heap = SharedContextHeap()
queue = PriorityTokenQueue()
workflow = build_ao02_workflow_blueprint(heap)

app = FastAPI(
    title="AO-02 Data Center Capacity Forecasting",
    description="Proactive multi-tenant data center capacity exhaustion forecasting & incident resolution.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "ao02-capacity-forecasting"}


@app.get("/")
async def root() -> dict:
    return {
        "service": "AO-02 Data Center Capacity Forecasting",
        "branch": "dev/ao02-core",
        "phase": "Step 1 scaffold",
    }


# TODO(Step 2): mount REST routers for telemetry ingestion, token queue,
# shared heap inspection, and agent graph streaming.
# TODO(Step 4): mount WebSocket endpoint for live agent graph streaming to frontend.
