"""Telemetry REST endpoints: generation, listing, and per-series windows."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_ingestion
from app.core.ao02_state_and_graph import ResourceType
from app.core.telemetry_generator import to_dict

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


@router.post("/generate")
def generate_telemetry(ingestion=Depends(get_ingestion)) -> dict:
    """Generate (or reload) the 12-month synthetic telemetry dataset."""
    points = ingestion.load_telemetry()
    return {"status": "generated", "points": len(points)}


@router.get("/points")
def list_points(
    rack_id: Optional[str] = Query(None),
    tenant_id: Optional[str] = Query(None),
    resource_type: Optional[ResourceType] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    ingestion=Depends(get_ingestion),
) -> dict:
    """List telemetry points with optional filtering."""
    points = ingestion.get_all_points()
    filtered = [
        p
        for p in points
        if (rack_id is None or p.rack_id == rack_id)
        and (tenant_id is None or p.tenant_id == tenant_id)
        and (resource_type is None or p.resource_type == resource_type)
    ]
    return {
        "count": len(filtered),
        "returned": min(limit, len(filtered)),
        "points": [to_dict(p) for p in filtered[:limit]],
    }


@router.get("/window")
def latest_window(
    rack_id: str = Query(...),
    tenant_id: str = Query(...),
    resource_type: ResourceType = Query(...),
    lookback_hours: int = Query(168, ge=1, le=2160),
    ingestion=Depends(get_ingestion),
) -> dict:
    """Return the latest telemetry window for a rack/tenant/resource series."""
    points = ingestion.get_latest_window(rack_id, tenant_id, resource_type, lookback_hours)
    if not points:
        return {"count": 0, "points": []}
    return {
        "count": len(points),
        "rack_id": rack_id,
        "tenant_id": tenant_id,
        "resource_type": resource_type.value,
        "window_start": points[0].timestamp.isoformat(),
        "window_end": points[-1].timestamp.isoformat(),
        "points": [to_dict(p) for p in points],
    }
