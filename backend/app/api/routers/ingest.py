"""Telemetry ingestion trigger endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_ingestion

router = APIRouter(prefix="/ingest", tags=["ingestion"])


@router.post("/scan")
def scan_all_resources(ingestion=Depends(get_ingestion)) -> dict:
    """Run the monitoring scan: evaluate all resources, mint tokens, enqueue, heap."""
    tokens = ingestion.scan_all_resources()
    return {
        "status": "scanned",
        "tokens_minted": len(tokens),
        "tokens": [
            {
                "token_id": t.token_id,
                "priority_number": t.priority_number,
                "rack_id": t.rack_id,
                "tenant_id": t.tenant_id,
                "resource_type": t.resource_type.value,
                "current_phase": t.current_phase.value,
            }
            for t in tokens
        ],
    }
