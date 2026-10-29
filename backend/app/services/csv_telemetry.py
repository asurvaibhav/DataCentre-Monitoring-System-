"""Recognize telemetry CSV headings without depending on column order or spelling style."""
import csv
import io
import math
import re
from datetime import datetime, timezone

from app.core.ao02_state_and_graph import ResourceType
from app.core.telemetry_generator import TelemetryPoint, RACK_IDS, CRAC_UNIT_IDS, TENANT_IDS, RESOURCE_SPEC


def normalized(text):
    return re.sub(r"[^a-z0-9]", "", text.lower())


ALIASES = {
    "timestamp": ["timestamp", "time", "datetime", "date", "recorded at", "recorded time", "measurement time", "sample time", "event time", "date time utc"],
    "rack_id": ["rack id", "rack", "rack name", "server", "server id", "node", "node id", "host", "hostname", "device", "device id", "asset id"],
    "tenant_id": ["tenant id", "tenant", "tenant name", "customer", "customer id", "client", "client id", "organization", "organisation", "account id"],
    "resource_type": ["resource type", "resource", "metric", "metric name", "metric type", "measurement", "sensor type"],
    "value": ["value", "reading", "metric value", "measured value", "measurement value", "current value", "usage value", "usage", "utilization", "utilisation", "consumption"],
    "capacity": ["capacity", "total capacity", "storage capacity", "total storage", "hard capacity limit", "hard limit", "capacity tb", "storage capacity tb", "total storage tb", "total capacity tb", "total capacity gb", "capacity gb", "storage capacity gb"],
    "unit": ["unit", "units", "uom", "measurement unit", "value unit"],
}
RESOURCES = {
    ResourceType.POWER: ["power", "power consumption", "power draw", "electrical power", "power load"],
    ResourceType.STORAGE: ["storage", "storage usage", "storage utilization", "disk usage", "disk utilization", "disk space used", "storage used", "used storage"],
    ResourceType.NETWORK: ["network", "network bandwidth", "bandwidth", "network throughput", "network usage"],
    ResourceType.THERMAL_COOLING: ["thermal cooling", "thermal", "cooling", "temperature", "supply temperature", "supply temp", "inlet temperature"],
    ResourceType.VM_COMPUTE: ["vm compute", "vm count", "virtual machines", "virtual machine count", "active vms"],
    ResourceType.SOFTWARE_LICENSE: ["software license", "software licenses", "license usage", "license count", "licenses used", "licences used", "seats used"],
}
STORAGE_BYTES = {"B": 1, "KB": 1000, "MB": 1000**2, "GB": 1000**3, "TB": 1000**4, "PB": 1000**5, "KiB": 1024, "MiB": 1024**2, "GiB": 1024**3, "TiB": 1024**4}
UNITS = {**{k.lower(): k for k in STORAGE_BYTES}, "kw": "kW", "kilowatts": "kW", "w": "W", "watts": "W", "mw": "MW", "percent": "%", "percentage": "%", "pct": "%", "gbps": "Gbps", "mbps": "Mbps", "c": "Celsius", "celsius": "Celsius", "degc": "Celsius", "vms": "VMs", "seats": "Seats"}
# Unit spellings are normalized once for both column headings and row values.
for canonical, aliases in {
    "VMs": ["vm", "virtual machine", "virtual machines", "instance", "instances"],
    "Seats": ["seat", "license", "licenses", "licence", "licences"],
    "kW": ["kilowatt"], "W": ["watt"], "MW": ["megawatt", "megawatts"],
    "Celsius": ["degree C", "degrees C", "degree Celsius", "degrees Celsius", "centigrade"],
    "Fahrenheit": ["f", "fahrenheit", "deg f", "degrees Fahrenheit"],
    "Kelvin": ["k", "kelvin"],
    "Gbps": ["gbit/s", "gigabits per second"],
    "Mbps": ["mbit/s", "megabits per second"],
    "Kbps": ["kbps", "kbit/s"], "Tbps": ["tbps", "tbit/s"],
}.items():
    UNITS.update({normalized(alias): canonical for alias in aliases})




def resource_heading(heading):
    """Match explicit metric names, allowing a trailing unit or utilization suffix."""
    key = normalized(heading)
    for resource, aliases in RESOURCES.items():
        for alias in sorted([resource.value, *aliases], key=len, reverse=True):
            prefix = normalized(alias)
            if key == prefix:
                return resource, "%" if "%" in heading else None
            if key.startswith(prefix):
                suffix = key[len(prefix):]
                if suffix in UNITS:
                    return resource, UNITS[suffix]
                if suffix in {"usagepercent", "utilizationpercent", "utilisationpercent", "utilization", "utilisation", "pct"}:
                    return resource, "%"
    return None


def number_and_unit(raw, default_unit):
    match = re.fullmatch(r"\s*([+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*([^\d,]*)", str(raw))
    if not match:
        raise ValueError(f"Invalid numeric reading: {raw!r}.")
    value = float(match[1].replace(",", ""))
    if not math.isfinite(value) or value < 0:
        raise ValueError("Value must be a finite, non-negative number.")
    supplied = match[2].strip() or default_unit
    unit = "%" if supplied == "%" else UNITS.get(normalized(supplied), supplied)
    return value, unit


def canonical_id(raw, tenant=False):
    value = raw.strip().upper()
    match = re.fullmatch(r"(?:T|TENANT)[ _-]*0*(\d+)", value) if tenant else re.fullmatch(r"(?:R|RACK)[ _-]*0*(\d+)", value)
    if match:
        return f"T{int(match[1])}" if tenant else f"R-{int(match[1]):02d}"
    return {"CRAC-A-NORTH": "CRAC-A-North", "CRAC-B-SOUTH": "CRAC-B-South"}.get(value, value)


def parse_csv_telemetry(text, storage_capacity_tb=None):
    try:
        dialect = csv.Sniffer().sniff(text[:8192], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    headings = reader.fieldnames or []
    if len({normalized(h) for h in headings}) != len(headings):
        raise ValueError("Duplicate column headings. Give each column a unique name.")
    fields = {}
    metrics = []
    for heading in headings:
        key = normalized(heading)
        field = next((name for name, aliases in ALIASES.items() if key in {normalized(a) for a in aliases}), None)
        if field:
            if field in fields:
                raise ValueError(f"Ambiguous columns for {field}: {fields[field]} and {heading}. Keep one.")
            fields[field] = heading
        elif match := resource_heading(heading):
            metrics.append((heading, *match))
    missing = [f for f in ("timestamp", "rack_id", "tenant_id") if f not in fields]
    if missing:
        raise ValueError(f"Could not identify {', '.join(missing)}. Rename the corresponding headings (for example Time, Server ID, Customer ID).")
    long_format = "resource_type" in fields or "value" in fields
    if long_format and not {"resource_type", "value"}.issubset(fields):
        raise ValueError("A resource/metric column needs a corresponding value/reading column.")
    if long_format and metrics:
        raise ValueError("Ambiguous layout: use resource + value columns OR individual resource columns.")
    if not long_format and not metrics:
        raise ValueError("No resource readings recognized. Use Metric + Reading columns, or headings such as Power (kW), Temperature (C), Storage (%).")
    points, seen, errors = [], set(), []
    for line, row in enumerate(reader, 2):
        try:
            if None in row:
                raise ValueError("More values than column headings.")
            def cell(field):
                return (row.get(fields.get(field, "")) or "").strip()
            timestamp = datetime.fromisoformat(cell("timestamp").replace("Z", "+00:00"))
            timestamp = timestamp.replace(tzinfo=timezone.utc) if timestamp.tzinfo is None else timestamp.astimezone(timezone.utc)
            rack, tenant = canonical_id(cell("rack_id")), canonical_id(cell("tenant_id"), tenant=True)
            if rack not in [*RACK_IDS, *CRAC_UNIT_IDS, "FACILITY"] or tenant not in [*TENANT_IDS, "FACILITY"]:
                raise ValueError("Unknown rack or tenant ID.")
            if long_format:
                match = resource_heading(cell("resource_type"))
                if not match:
                    raise ValueError(f"Unknown resource: {cell('resource_type')}.")
                readings = [(cell("value"), *match)]
            else:
                readings = [(row.get(heading), resource, unit) for heading, resource, unit in metrics if (row.get(heading) or "").strip()]
            for raw, resource, header_unit in readings:
                native = str(RESOURCE_SPEC[resource]["unit"])
                supplied = cell("unit") or header_unit or native
                value, unit = number_and_unit(raw, supplied)
                if resource == ResourceType.STORAGE and unit in STORAGE_BYTES:
                    if cell("capacity"):
                        capacity_heading = fields["capacity"]
                        capacity_unit = next((u for u in STORAGE_BYTES if normalized(capacity_heading).endswith(normalized(u)) and len(u) > 1), unit)
                        capacity, capacity_unit = number_and_unit(cell("capacity"), capacity_unit)
                    elif storage_capacity_tb is not None:
                        capacity, capacity_unit = storage_capacity_tb, "TB"
                    else:
                        raise ValueError("Storage in TB/GB needs total capacity to calculate utilization. Add a Storage Capacity column (in the same unit), or enter Storage capacity (TB) beside Upload CSV.")
                    if capacity_unit not in STORAGE_BYTES or not math.isfinite(capacity) or capacity <= 0:
                        raise ValueError("Storage capacity must be positive and use a storage unit such as TB or GB.")
                    value = value * STORAGE_BYTES[unit] / (capacity * STORAGE_BYTES[capacity_unit]) * 100
                    unit = "%"
                if unit == "%" and native != "%":
                    if resource == ResourceType.THERMAL_COOLING:
                        raise ValueError("Temperature requires Celsius, not a percentage.")
                    value *= float(RESOURCE_SPEC[resource]["hard_limit"]) / 100
                elif resource == ResourceType.POWER and unit in {"W", "MW"}:
                    value *= 0.001 if unit == "W" else 1000
                elif resource == ResourceType.NETWORK and unit in {"Mbps", "Kbps", "Tbps"}:
                    value *= {"Mbps": .001, "Kbps": .000001, "Tbps": 1000}[unit]
                elif resource == ResourceType.THERMAL_COOLING and unit in {"Fahrenheit", "Kelvin"}:
                    value = (value - 32) * 5 / 9 if unit == "Fahrenheit" else value - 273.15
                elif resource in {ResourceType.VM_COMPUTE, ResourceType.SOFTWARE_LICENSE} and normalized(unit) in {"count", "counts", "unit", "units"}:
                    pass
                elif unit != native:
                    raise ValueError(f"Expected {native} for {resource.value}; received {supplied}.")
                key = (rack, tenant, resource, timestamp)
                if key in seen:
                    raise ValueError("Duplicate timestamp in the same series.")
                seen.add(key)
                if not math.isfinite(value):
                    raise ValueError("Converted value exceeds the supported numeric range.")
                points.append(TelemetryPoint(timestamp, rack, tenant, resource, value, native))
        except (ValueError, TypeError, AttributeError) as exc:
            errors.append(f"Row {line}: {exc}")
            if len(errors) >= 10:
                break
    if errors:
        raise ValueError("\n".join(errors) + "\nNo readings were imported. Correct these rows and retry.")
    if not points:
        raise ValueError("CSV contains no readings.")
    return points
