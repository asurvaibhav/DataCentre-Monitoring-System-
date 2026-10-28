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

    def _forecast_enhanced(
        self,
        points: List[TelemetryPoint],
        resource_type: ResourceType,
        hard_limit: float,
        safety_margin_pct: float,
    ) -> CapacityForecast:
        """Enhanced time-to-exhaustion forecast.

        Uses linear regression on the full window with R-squared confidence,
        transient-spike suppression (recent values resolving back below the
        safety margin), and regime-change detection via sliding-window mean
        shift. Confidence intervals are derived from residual standard error.
        """
        if len(points) < 10:
            return CapacityForecast(
                lead_time_weeks=999.0,
                confidence_interval_days=(999.0, 999.0),
                forecast_confidence_score=0.0,
            )

        values = np.array([p.value for p in points], dtype=float)
        hours = np.arange(len(values), dtype=float)
        current = float(values[-1])
        margin_limit = hard_limit * (safety_margin_pct / 100.0)

        # --- Linear regression ---
        slope, intercept = np.polyfit(hours, values, 1)
        fitted = slope * hours + intercept
        residuals = values - fitted
        resid_std = float(np.std(residuals)) if len(residuals) > 1 else 0.0

        # R-squared for forecast confidence.
        ss_res = float(np.sum(residuals ** 2))
        ss_tot = float(np.sum((values - np.mean(values)) ** 2))
        r_squared = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
        r_squared = float(np.clip(r_squared, 0.0, 1.0))

        # --- Time to exhaustion ---
        if slope > 1e-6:
            hours_to_limit = (margin_limit - current) / slope
        else:
            hours_to_limit = 9999.0

        lead_time_weeks = max(0.0, hours_to_limit / (24.0 * 7.0))
        predicted_exhaustion: Optional[datetime] = None
        if 0 < hours_to_limit < 9999.0:
            predicted_exhaustion = points[-1].timestamp + timedelta(hours=hours_to_limit)

        # --- Confidence interval (days) from residual standard error ---
        # Standard error of the forecast grows with horizon; use resid_std * sqrt(hours).
        forecast_horizon_hours = max(hours_to_limit, 24.0)
        ci_days = resid_std * np.sqrt(forecast_horizon_hours / 24.0)
        ci_lower = max(0.0, lead_time_weeks * 7 - ci_days)
        ci_upper = lead_time_weeks * 7 + ci_days

        # --- Transient spike detection ---
        # A spike is transient if recent values (last 12h) are declining back
        # toward baseline while the long-term slope is positive.
        recent = values[-12:]
        earlier = values[-36:-12] if len(values) >= 36 else values[:-12]
        is_transient = bool(
            slope > 0
            and len(earlier) > 0
            and float(np.mean(recent)) < float(np.mean(earlier)) * 0.85
            and current < margin_limit * 0.9
        )

        # --- Regime change detection via sliding-window mean shift ---
        # Compare the mean of the last quarter vs. the rest of the window.
        q = max(len(values) // 4, 24)
        recent_mean = float(np.mean(values[-q:]))
        prior_mean = float(np.mean(values[:-q])) if len(values) > q else recent_mean
        regime_shift_magnitude = abs(recent_mean - prior_mean)
        # Threshold: shift greater than 10% of the hard limit is significant.
        regime_change = bool(regime_shift_magnitude > hard_limit * 0.10)
        regime_description = None
        if regime_change:
            direction = "increase" if recent_mean > prior_mean else "decrease"
            regime_description = (
                f"Step-change in {resource_type.value.lower()} trend: "
                f"{direction} of {regime_shift_magnitude:.1f} detected in "
                f"recent {q}-hour window."
            )

        # --- Confidence score combines R-squared and residual noise ---
        confidence = float(np.clip(r_squared * (1.0 - min(resid_std / max(current, 1.0), 0.5)), 0.1, 1.0))

        return CapacityForecast(
            predicted_exhaustion_date=predicted_exhaustion,
            lead_time_weeks=round(lead_time_weeks, 2),
            confidence_interval_days=(round(ci_lower, 1), round(ci_upper, 1)),
            forecast_confidence_score=round(confidence, 3),
            is_transient_spike=is_transient,
            regime_change_detected=regime_change,
            regime_change_description=regime_description,
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

        forecast = self._forecast_enhanced(points, resource_type, hard_limit, safety_margin_pct)
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

        # Enqueue first: `enqueue` is also the duplicate gate. Writing the
        # envelope before this check would leave orphan incidents in the heap
        # every time the same resource is scanned again.
        enqueued = self.queue.enqueue(token)
        if not enqueued:
            return None  # Duplicate token for same rack/tenant/resource

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
