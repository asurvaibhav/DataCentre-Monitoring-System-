"""Facility overview endpoint for the isometric rack map.

Reads the latest *read-only* telemetry point for each rack and CRAC unit and
overlays active incident tokens so the floor plan reflects real utilization
instead of placeholder numbers.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends

from app.api.deps import get_heap, get_ingestion, get_queue
from app.core.ao02_state_and_graph import PipelinePhase, ResourceType
from app.core.telemetry_generator import (
    CRAC_UNIT_IDS,
    FACILITY_TENANT,
    RACK_IDS,
    RESOURCE_SPEC,
    TENANT_IDS,
)

router = APIRouter(prefix="/facility", tags=["facility"])

CRAC_LABELS = {
    "CRAC-A-North": "CRAC Unit A (North)",
    "CRAC-B-South": "CRAC Unit B (South)",
}


def _status_for(utilization_pct: float) -> str:
    if utilization_pct >= 95.0:
        return "CRITICAL"
    if utilization_pct >= 85.0:
        return "WARNING"
    return "HEALTHY"


def _pct(value: float, resource_type: ResourceType) -> float:
    hard_limit = float(RESOURCE_SPEC[resource_type]["hard_limit"])
    return round(min(100.0, (value / hard_limit) * 100.0), 2)


@router.get("/overview")
def facility_overview(
    ingestion=Depends(get_ingestion),
    queue=Depends(get_queue),
    heap=Depends(get_heap),
) -> Dict[str, Any]:
    generator = ingestion.generator

    # Active incident tokens (queued or awaiting human verification).
    incident_tokens = list(queue.snapshot())
    incident_tokens += [
        env.token
        for env in heap.all_envelopes()
        if env.token.current_phase == PipelinePhase.HUMAN_VERIFICATION
    ]

    def incidents_for(node_id: str) -> List[Dict[str, Any]]:
        return [
            {
                "token_id": token.token_id,
                "resource_type": token.resource_type.value,
                "tenant_id": token.tenant_id,
                "phase": token.current_phase.value,
            }
            for token in incident_tokens
            if token.rack_id == node_id
        ]

    racks: List[Dict[str, Any]] = []
    for rack in RACK_IDS:
        power = generator.latest_point(rack, FACILITY_TENANT, ResourceType.POWER)
        network = generator.latest_point(rack, FACILITY_TENANT, ResourceType.NETWORK)

        power_pct = _pct(power.value, ResourceType.POWER) if power else 0.0
        network_pct = _pct(network.value, ResourceType.NETWORK) if network else 0.0

        tenant_pcts: List[float] = []
        for tenant in TENANT_IDS:
            for resource_type in (ResourceType.STORAGE, ResourceType.VM_COMPUTE):
                point = generator.latest_point(rack, tenant, resource_type)
                if point is not None:
                    tenant_pcts.append(_pct(point.value, resource_type))

        incident_list = incidents_for(rack)
        worst_pct = max([power_pct, network_pct, *tenant_pcts], default=0.0)
        if incident_list:
            # An open incident always flags the rack for operator attention.
            worst_pct = max(worst_pct, 85.0)

        racks.append(
            {
                "rack_id": rack,
                "status": _status_for(worst_pct),
                "power_load_kw": round(power.value, 2) if power else 0.0,
                "max_power_kw": float(RESOURCE_SPEC[ResourceType.POWER]["hard_limit"]),
                "power_pct": power_pct,
                "network_pct": network_pct,
                "worst_utilization_pct": round(worst_pct, 2),
                "incident_count": len(incident_list),
                "incidents": incident_list,
            }
        )

    cooling: List[Dict[str, Any]] = []
    for unit in CRAC_UNIT_IDS:
        point = generator.latest_point(unit, FACILITY_TENANT, ResourceType.THERMAL_COOLING)
        temp = round(point.value, 2) if point else 0.0
        util = _pct(temp, ResourceType.THERMAL_COOLING) if point else 0.0
        incident_list = incidents_for(unit)
        cooling.append(
            {
                "unit_id": unit,
                "label": CRAC_LABELS.get(unit, unit),
                "supply_temp_celsius": temp,
                "max_temp_celsius": float(
                    RESOURCE_SPEC[ResourceType.THERMAL_COOLING]["hard_limit"]
                ),
                "fan_speed_rpm": int(round(900 + util * 11)),
                "utilization_pct": util,
                "status": _status_for(max(util, 85.0 if incident_list else util)),
                "incident_count": len(incident_list),
                "incidents": incident_list,
            }
        )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "racks": racks,
        "cooling": cooling,
    }
