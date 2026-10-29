"""
Tenant isolation guard for AO-02.

Enforces that tenant-level data (T1/T2/T3) never leaks across tenants,
while facility operators see attributed views with strict access boundaries.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status

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
