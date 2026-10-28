"""
Telemetry ingestion pipeline for AO-02.

Evaluates 12-month telemetry windows against capacity limits and safety
margins, runs a lightweight time-to-exhaustion forecast, detects transient
spikes and regime changes, mints IncidentTokens on breach, enqueues them
into the Priority Token Queue, and writes initial context to the Shared
Context Heap with an immutable audit entry.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional

import numpy as np

from app.core.ao02_state_and_graph import (
    CapacityForecast,
    HeapIncidentEnvelope,
    IncidentToken,
    PriorityTokenQueue,
    ResourceType,
    SharedContextHeap,
    TelemetryWindowSummary,
)
from app.core.telemetry_generator import (
    FACILITY_TENANT,
    RESOURCE_SPEC,
    TelemetryGenerator,
    TelemetryPoint,
)


class IngestionService:
    def __init__(
        self,
        heap: SharedContextHeap,
        queue: PriorityTokenQueue,
        generator: Optional[TelemetryGenerator] = None,
    ) -> None:
        self.heap = heap
        self.queue = queue
        self.generator = generator or TelemetryGenerator()
        self._points: List[TelemetryPoint] = []

    def load_telemetry(self) -> List[TelemetryPoint]:
        if not self._points:
            self._points = self.generator.generate()
        return self._points

    def get_all_points(self) -> List[TelemetryPoint]:
        return self.load_telemetry()

    def _get_series(
        self, rack_id: str, tenant_id: str, resource_type: ResourceType
    ) -> List[TelemetryPoint]:
        return self.generator.get_series(rack_id, tenant_id, resource_type)

    @staticmethod
    def _series_sha256(points: List[TelemetryPoint]) -> str:
        import hashlib
        import json

        payload = json.dumps(
            [(p.timestamp.isoformat(), p.value) for p in points], sort_keys=True
        )
        return hashlib.sha256(payload.encode()).hexdigest()

    def _forecast_linear(
        self,
        points: List[TelemetryPoint],
        hard_limit: float,
        safety_margin_pct: float,
    ) -> CapacityForecast:
        """Simple linear-regression time-to-exhaustion forecast (Step 2 baseline)."""
        if len(points) < 2:
            return CapacityForecast(
                lead_time_weeks=999.0,
                confidence_interval_days=(999.0, 999.0),
                forecast_confidence_score=0.0,
            )

        values = np.array([p.value for p in points])
        hours = np.arange(len(points))

        slope, intercept = np.polyfit(hours, values, 1)
        current = float(values[-1])
        margin_limit = hard_limit * (safety_margin_pct / 100.0)

        if slope > 0:
            hours_to_limit = (margin_limit - current) / slope
        else:
            hours_to_limit = 9999.0

        lead_time_weeks = max(0.0, hours_to_limit / (24.0 * 7.0))
        predicted_exhaustion: Optional[datetime] = None
        if 0 < hours_to_limit < 9999.0:
            predicted_exhaustion = points[-1].timestamp + timedelta(hours=hours_to_limit)

        residuals = values - (slope * hours + intercept)
        resid_std = float(np.std(residuals)) if len(residuals) > 1 else 0.0
        ci_lower = max(0.0, lead_time_weeks * 7 - resid_std)
        ci_upper = lead_time_weeks * 7 + resid_std

        # Transient spike: recent values resolving back below margin
        recent = values[-24:]
        is_transient = bool(
            slope > 0
            and np.mean(recent[-6:]) < np.mean(recent[:6]) * 0.8
            and current < margin_limit * 0.9
        )

        # Regime change: step change in mean between first and second half
        mid = len(values) // 2
        regime_change = bool(
            abs(float(np.mean(values[mid:])) - float(np.mean(values[:mid]))) > 10.0
        )

        confidence = float(
            np.clip(1.0 - (resid_std / max(current, 1.0)), 0.1, 1.0)
        )

        return CapacityForecast(
            predicted_exhaustion_date=predicted_exhaustion,
            lead_time_weeks=round(lead_time_weeks, 2),
            confidence_interval_days=(round(ci_lower, 1), round(ci_upper, 1)),
            forecast_confidence_score=round(confidence, 3),
            is_transient_spike=is_transient,
            regime_change_detected=regime_change,
            regime_change_description=(
                "Step-change in utilization trend detected" if regime_change else None
            ),
        )

    def evaluate_and_mint(
        self,
        rack_id: str,
        tenant_id: str,
        resource_type: ResourceType,
        lookback_hours: int = 168,
    ) -> Optional[IncidentToken]:
        """Evaluate one resource window; mint + enqueue a token on breach."""
        spec = RESOURCE_SPEC[resource_type]
        hard_limit = float(spec["hard_limit"])
        safety_margin_pct = float(spec["safety_margin_pct"])
        unit = str(spec["unit"])

        points = self.get_latest_window(rack_id, tenant_id, resource_type, lookback_hours)
        if len(points) < 10:
            return None

        current = float(points[-1].value)
        margin_limit = hard_limit * (safety_margin_pct / 100.0)
        if current < margin_limit:
            return None  # Below safety margin — no incident

        forecast = self._forecast_linear(points, hard_limit, safety_margin_pct)
        series_hash = self._series_sha256(points)

        # Utilization expressed as % of hard capacity limit (0-100) so the
        # TelemetryWindowSummary constraint holds for count/kW/seat resources too.
        current_utilization_pct = min(100.0, round((current / hard_limit) * 100.0, 2))

        telemetry = TelemetryWindowSummary(
            window_start=points[0].timestamp,
            window_end=points[-1].timestamp,
            rack_id=rack_id,
            tenant_id=tenant_id,
            resource_type=resource_type,
            current_utilization_pct=current_utilization_pct,
            safety_margin_pct=safety_margin_pct,
            hard_capacity_limit=hard_limit,
            unit=unit,
            raw_series_sha256=series_hash,
        )

        priority_number = self.queue.compute_priority_number(
            resource_type, current, forecast.lead_time_weeks
        )

        token = IncidentToken(
            priority_number=priority_number,
            rack_id=rack_id,
            tenant_id=tenant_id,
            resource_type=resource_type,
        )

        envelope = HeapIncidentEnvelope(
            token=token,
            telemetry=telemetry,
            forecast=forecast,
        )
        self.heap.put_envelope(
            envelope,
            actor="ResourceMonitoringAgent",
            summary=(
                f"Flagged {resource_type.value} exhaustion in {rack_id}/{tenant_id}; "
                f"utilization {current:.1f}%, lead time {forecast.lead_time_weeks:.1f} weeks."
            ),
        )

        enqueued = self.queue.enqueue(token)
        if not enqueued:
            return None  # Duplicate token for same rack/tenant/resource

        return token

    def get_latest_window(
        self,
        rack_id: str,
        tenant_id: str,
        resource_type: ResourceType,
        lookback_hours: int = 168,
    ) -> List[TelemetryPoint]:
        """Public accessor for the latest telemetry window of a series."""
        return self.generator.get_latest_window(
            rack_id, tenant_id, resource_type, lookback_hours
        )

    def scan_all_resources(self) -> List[IncidentToken]:
        """Scan every rack/tenant/resource combination and mint tokens on breach."""
        tokens: List[IncidentToken] = []

        # Rack-level shared resources (facility tenant)
        from app.core.telemetry_generator import RACK_IDS, CRAC_UNIT_IDS

        for rack in RACK_IDS:
            for rt in (ResourceType.POWER, ResourceType.NETWORK):
                tok = self.evaluate_and_mint(rack, FACILITY_TENANT, rt)
                if tok:
                    tokens.append(tok)

        for crac in CRAC_UNIT_IDS:
            tok = self.evaluate_and_mint(crac, FACILITY_TENANT, ResourceType.THERMAL_COOLING)
            if tok:
                tokens.append(tok)

        # Per-tenant resources
        from app.core.telemetry_generator import TENANT_IDS

        for rack in RACK_IDS:
            for tenant in TENANT_IDS:
                for rt in (ResourceType.STORAGE, ResourceType.VM_COMPUTE):
                    tok = self.evaluate_and_mint(rack, tenant, rt)
                    if tok:
                        tokens.append(tok)

        for tenant in TENANT_IDS:
            tok = self.evaluate_and_mint("FACILITY", tenant, ResourceType.SOFTWARE_LICENSE)
            if tok:
                tokens.append(tok)

        return tokens
