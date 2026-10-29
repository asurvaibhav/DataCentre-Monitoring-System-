"""Telemetry ingestion trigger endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Query
import csv
from app.services.csv_telemetry import parse_csv_telemetry

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


@router.post("/upload")
async def upload_telemetry(request: Request, storage_capacity_tb: float | None = Query(None, gt=0, allow_inf_nan=False), ingestion=Depends(get_ingestion)) -> dict:
    """Import CSV readings, replacing only the supplied telemetry series."""
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 10 * 1024 * 1024:
            raise HTTPException(413, "CSV must be smaller than 10 MB.")
    try:
        points = parse_csv_telemetry(body.decode("utf-8-sig"), storage_capacity_tb)
    except (UnicodeError, ValueError, csv.Error) as exc:
        raise HTTPException(400, str(exc)) from exc
    keys = {(p.rack_id, p.tenant_id, p.resource_type) for p in points}
    existing = ingestion.load_telemetry()
    merged = [p for p in existing if (p.rack_id, p.tenant_id, p.resource_type) not in keys] + points
    ingestion._points = merged
    ingestion.generator.points = merged
    ingestion.generator._index = None
    ingestion.uploaded_series.update(keys)
    # Scan exactly this upload, using the same token + heap path as manual scans.
    tokens = []
    for rack, tenant, resource in sorted(keys):
        token = ingestion.evaluate_and_mint(rack, tenant, resource)
        if token:
            tokens.append(token)
    from app.api.routers.stream import manager
    from app.api.serializers import serialize_token
    await manager.broadcast({"type": "queue_update", "tokens": [
        serialize_token(token, ingestion.heap) for token in ingestion.queue.snapshot()
    ]})
    from collections import Counter
    counts = Counter((p.rack_id, p.tenant_id, p.resource_type) for p in points)
    short_series = sum(count < 10 for count in counts.values())
    return {"status": "imported", "points": len(points), "series": len(keys), "tokens_minted": len(tokens),
            "tokens": [serialize_token(token, ingestion.heap) for token in tokens],
            "warnings": [f"{short_series} series have fewer than 10 readings: current breaches were checked; trend forecasts need more readings."] if short_series else []}
