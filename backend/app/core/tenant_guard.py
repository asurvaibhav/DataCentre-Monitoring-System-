"""
Tenant isolation guard for AO-02.

Enforces that tenant-level data (T1/T2/T3) never leaks across tenants,
while facility operators see attributed views with strict access boundaries.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request, status

from app.core.ao02_state_and_graph import SharedContextHeap


class TenantGuard:
    """Middleware-style guard for tenant-scoped data access."""

    def __init__(self, heap: SharedContextHeap) -> None:
        self.heap = heap

    def check_access(
        self,
        token_id: str,
        requesting_tenant_id: str,
        is_facility_operator: bool = False,
    ) -> dict[str, Any]:
        """Return a tenant-isolated heap view or raise HTTP 403 on breach."""
        try:
            return self.heap.get_tenant_isolated_view(
                token_id, requesting_tenant_id, is_facility_operator
            )
        except PermissionError as exc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=str(exc),
            )
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(exc),
            )


def require_tenant_header(request: Request) -> str:
    """Extract X-Tenant-Id header; required on every tenant-scoped request."""
    tenant_id = request.headers.get("X-Tenant-Id")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing X-Tenant-Id header",
        )
    return tenant_id


def is_facility_operator(request: Request) -> bool:
    """True when the caller is a facility operator (bypasses tenant isolation)."""
    return request.headers.get("X-Facility-Operator", "false").lower() == "true"
