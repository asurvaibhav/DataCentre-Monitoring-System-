"""Shared Context Heap REST endpoints with tenant isolation."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException

from app.api.deps import get_heap
from app.core.tenant_guard import TenantGuard, is_facility_operator

router = APIRouter(prefix="/heap", tags=["heap"])


@router.get("/{token_id}")
def heap_view(
    token_id: str,
    x_tenant_id: str = Header(..., alias="X-Tenant-Id"),
    x_facility_operator: str = Header("false", alias="X-Facility-Operator"),
    heap=Depends(get_heap),
) -> dict[str, Any]:
    """Return a tenant-isolated view of a heap envelope (403 on isolation breach)."""
    guard = TenantGuard(heap)
    return guard.check_access(
        token_id,
        x_tenant_id,
        is_facility_operator=x_facility_operator.lower() == "true",
    )


@router.get("/{token_id}/envelope")
def heap_envelope(token_id: str, heap=Depends(get_heap)) -> dict[str, Any]:
    """Return the full heap envelope (facility-operator / internal use)."""
    try:
        envelope = heap.get_envelope_for_agent(token_id)
        return envelope.model_dump()
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
