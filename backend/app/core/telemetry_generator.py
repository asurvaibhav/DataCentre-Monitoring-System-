"""
Synthetic 12-month multi-tenant telemetry generator for AO-02.

Generates hourly time-series for Power, Thermal/Cooling, Storage, Network,
VM Compute, and Software Licenses across Racks R-01..R-12, CRAC units A/B,
and Tenants T1-T3. Includes trends, daily/weekly seasonality, regime changes,
and transient spikes so the forecasting engine can be validated against known
exhaustion events and false-alarm cases.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

import numpy as np

from app.core.ao02_state_and_graph import ResourceType


RACK_IDS = [f"R-{i:02d}" for i in range(1, 13)]
TENANT_IDS = ["T1", "T2", "T3"]
FACILITY_TENANT = "FACILITY"
CRAC_UNIT_IDS = ["CRAC-A-North", "CRAC-B-South"]

# (hard_limit, safety_margin_pct, unit)
RESOURCE_SPEC: Dict[ResourceType, Dict[str, object]] = {
    ResourceType.POWER: {"hard_limit": 80.0, "safety_margin_pct": 90.0, "unit": "kW"},
    ResourceType.STORAGE: {"hard_limit": 100.0, "safety_margin_pct": 85.0, "unit": "%"},
    ResourceType.NETWORK: {"hard_limit": 10.0, "safety_margin_pct": 80.0, "unit": "Gbps"},
    ResourceType.VM_COMPUTE: {"hard_limit": 500.0, "safety_margin_pct": 80.0, "unit": "VMs"},
    ResourceType.THERMAL_COOLING: {"hard_limit": 27.0, "safety_margin_pct": 88.0, "unit": "Celsius"},
    ResourceType.SOFTWARE_LICENSE: {"hard_limit": 1000.0, "safety_margin_pct": 85.0, "unit": "Seats"},
}

MONTHS = 12
DAYS_PER_MONTH = 30
HOURS_PER_DAY = 24
TOTAL_HOURS = MONTHS * DAYS_PER_MONTH * HOURS_PER_DAY


@dataclass
class TelemetryPoint:
    timestamp: datetime
    rack_id: str
    tenant_id: str
    resource_type: ResourceType
    value: float
    unit: str


class TelemetryGenerator:
    """Deterministic synthetic telemetry generator (seedable for reproducibility)."""

    def __init__(self, seed: int = 42, months: int = MONTHS) -> None:
        self.seed = seed
        self.months = months
        self.rng = np.random.default_rng(seed)
        self.start_date = datetime(2025, 1, 1, tzinfo=timezone.utc)
        self.end_date = self.start_date + timedelta(days=DAYS_PER_MONTH * months)
        self.points: List[TelemetryPoint] = []
        self._index: Optional[Dict[tuple, List[TelemetryPoint]]] = None

    def _hourly_index(self) -> List[datetime]:
        return [self.start_date + timedelta(hours=i) for i in range(TOTAL_HOURS)]

    @staticmethod
    def _daily_seasonality(hour: int) -> float:
        """Business-hours pattern: higher utilization 08:00-18:00, lower at night."""
        return 1.0 + 0.15 * np.sin(2 * np.pi * (hour - 8) / 24)

    @staticmethod
    def _weekly_seasonality(day_of_week: int) -> float:
        """Lower utilization on weekends (Sat=5, Sun=6)."""
        return 0.85 if day_of_week >= 5 else 1.0

    def _generate_base_trend(
        self,
        start_util: float,
        end_util: float,
        regime_change_hours: Optional[List[int]] = None,
        regime_magnitude: float = 0.0,
    ) -> np.ndarray:
        """Linear trend with optional step regime changes at given hour indices."""
        hours = np.arange(TOTAL_HOURS)
        trend = np.linspace(start_util, end_util, TOTAL_HOURS)
        if regime_change_hours:
            for rc_hour in regime_change_hours:
                trend[rc_hour:] += regime_magnitude
        return trend

    @staticmethod
    def _add_transient_spike(
        series: np.ndarray, spike_hour: int, duration_hours: int, magnitude: float
    ) -> np.ndarray:
        """Short-lived spike that returns to baseline (false-alarm candidate)."""
        end = min(spike_hour + duration_hours, TOTAL_HOURS)
        series[spike_hour:end] += magnitude
        return series

    def generate(self) -> List[TelemetryPoint]:
        timestamps = self._hourly_index()
        all_points: List[TelemetryPoint] = []

        # --- Per-rack resources: POWER, NETWORK (facility tenant) ---
        for rack in RACK_IDS:
            power_start = float(self.rng.uniform(30, 45))
            power_end = float(self.rng.uniform(55, 95))  # some racks near exhaustion
            power_trend = self._generate_base_trend(power_start, power_end)
            power_series = np.array(
                [
                    power_trend[i]
                    * self._daily_seasonality(timestamps[i].hour)
                    * self._weekly_seasonality(timestamps[i].weekday())
                    + float(self.rng.normal(0, 1.5))
                    for i in range(TOTAL_HOURS)
                ]
            )
            # Transient spike on R-07 power (self-resolving, false-alarm candidate)
            if rack == "R-07":
                power_series = self._add_transient_spike(power_series, 2000, 6, 15.0)
            all_points.extend(
                self._to_points(
                    timestamps, rack, FACILITY_TENANT, ResourceType.POWER, power_series
                )
            )

            net_start = float(self.rng.uniform(2, 4))
            net_end = float(self.rng.uniform(5, 9))
            net_trend = self._generate_base_trend(net_start, net_end)
            net_series = np.array(
                [
                    net_trend[i] * self._daily_seasonality(timestamps[i].hour)
                    + float(self.rng.normal(0, 0.3))
                    for i in range(TOTAL_HOURS)
                ]
            )
            all_points.extend(
                self._to_points(
                    timestamps, rack, FACILITY_TENANT, ResourceType.NETWORK, net_series
                )
            )

        # --- Per-rack per-tenant: STORAGE, VM_COMPUTE ---
        for rack in RACK_IDS:
            for tenant in TENANT_IDS:
                stor_start = float(self.rng.uniform(40, 60))
                stor_end = float(self.rng.uniform(70, 98))  # some near exhaustion
                stor_trend = self._generate_base_trend(stor_start, stor_end)
                stor_series = np.clip(
                    stor_trend + self.rng.normal(0, 2.0, TOTAL_HOURS), 0, 100
                )
                # Regime change: new tenant onboarding mid-year on R-04/T1 storage
                if rack == "R-04" and tenant == "T1":
                    stor_trend = self._generate_base_trend(
                        stor_start, stor_end,
                        regime_change_hours=[4000], regime_magnitude=15.0,
                    )
                    stor_series = np.clip(
                        stor_trend + self.rng.normal(0, 2.0, TOTAL_HOURS), 0, 100
                    )
                all_points.extend(
                    self._to_points(
                        timestamps, rack, tenant, ResourceType.STORAGE, stor_series
                    )
                )

                vm_start = float(self.rng.uniform(100, 200))
                vm_end = float(self.rng.uniform(300, 480))
                vm_trend = self._generate_base_trend(vm_start, vm_end)
                vm_series = np.clip(
                    vm_trend + self.rng.normal(0, 5, TOTAL_HOURS), 0, 500
                )
                all_points.extend(
                    self._to_points(
                        timestamps, rack, tenant, ResourceType.VM_COMPUTE, vm_series
                    )
                )

        # --- CRAC cooling units (facility tenant) ---
        for crac in CRAC_UNIT_IDS:
            temp_start = float(self.rng.uniform(12.5, 14.0))
            temp_end = float(self.rng.uniform(15.0, 20.0))  # cooling degradation
            temp_trend = self._generate_base_trend(temp_start, temp_end)
            temp_series = temp_trend + self.rng.normal(0, 0.5, TOTAL_HOURS)
            # Thermal runway spike on CRAC-B South
            if crac == "CRAC-B-South":
                temp_series = self._add_transient_spike(temp_series, 5000, 12, 4.0)
            all_points.extend(
                self._to_points(
                    timestamps,
                    crac,
                    FACILITY_TENANT,
                    ResourceType.THERMAL_COOLING,
                    temp_series,
                )
            )

        # --- Per-tenant software licenses (facility-wide per tenant) ---
        for tenant in TENANT_IDS:
            lic_start = float(self.rng.uniform(600, 750))
            lic_end = float(self.rng.uniform(850, 990))
            lic_trend = self._generate_base_trend(lic_start, lic_end)
            lic_series = np.clip(
                lic_trend + self.rng.normal(0, 8, TOTAL_HOURS), 0, 1000
            )
            all_points.extend(
                self._to_points(
                    timestamps,
                    "FACILITY",
                    tenant,
                    ResourceType.SOFTWARE_LICENSE,
                    lic_series,
                )
            )

        self.points = all_points
        self._index = None
        return all_points

    def _to_points(
        self,
        timestamps: List[datetime],
        rack_id: str,
        tenant_id: str,
        resource_type: ResourceType,
        series: np.ndarray,
    ) -> List[TelemetryPoint]:
        unit = str(RESOURCE_SPEC[resource_type]["unit"])
        return [
            TelemetryPoint(
                timestamp=ts,
                rack_id=rack_id,
                tenant_id=tenant_id,
                resource_type=resource_type,
                value=float(round(float(v), 3)),
                unit=unit,
            )
            for ts, v in zip(timestamps, series)
        ]

    def _ensure_generated(self) -> None:
        """Generate the dataset on first access so the API never depends on
        a previous /telemetry/generate call."""
        if not self.points:
            self.generate()

    def _build_index(self) -> None:
        index: Dict[tuple, List[TelemetryPoint]] = {}
        for point in self.points:
            key = (point.rack_id, point.tenant_id, point.resource_type)
            index.setdefault(key, []).append(point)
        for series in index.values():
            series.sort(key=lambda p: p.timestamp)
        self._index = index

    def get_series(
        self,
        rack_id: str,
        tenant_id: str,
        resource_type: ResourceType,
    ) -> List[TelemetryPoint]:
        """Return all points for a given rack/tenant/resource, sorted by time."""
        self._ensure_generated()
        if self._index is None:
            self._build_index()
        return self._index.get((rack_id, tenant_id, resource_type), [])

    def latest_point(
        self,
        rack_id: str,
        tenant_id: str,
        resource_type: ResourceType,
    ) -> Optional[TelemetryPoint]:
        """Return the most recent point of a series, or None when absent."""
        series = self.get_series(rack_id, tenant_id, resource_type)
        return series[-1] if series else None

    def get_latest_window(
        self,
        rack_id: str,
        tenant_id: str,
        resource_type: ResourceType,
        lookback_hours: int = 168,  # 7 days
    ) -> List[TelemetryPoint]:
        """Return the most recent `lookback_hours` points for a given series."""
        series = self.get_series(rack_id, tenant_id, resource_type)
        return series[-lookback_hours:]

    def get_all_points(self) -> List[TelemetryPoint]:
        return self.points


def to_dict(point: TelemetryPoint) -> dict:
    """Serialize a TelemetryPoint to a plain dict for JSON responses."""
    return {
        "timestamp": point.timestamp.isoformat(),
        "rack_id": point.rack_id,
        "tenant_id": point.tenant_id,
        "resource_type": point.resource_type.value,
        "value": point.value,
        "unit": point.unit,
    }

