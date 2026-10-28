"""SQLAlchemy ORM models for AO-02 telemetry store and immutable audit trail."""

import uuid
from sqlalchemy import Column, Integer, String, DateTime, Float, Text, func
from sqlalchemy.orm import relationship

from app.database import Base


class TelemetryPointORM(Base):
    __tablename__ = "telemetry_points"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), index=True)
    rack_id = Column(String, index=True)
    tenant_id = Column(String, index=True)
    resource_type = Column(String, index=True)
    value = Column(Float)
    unit = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AuditRecordORM(Base):
    __tablename__ = "audit_records"

    id = Column(Integer, primary_key=True, index=True)
    audit_id = Column(
        String, default=lambda: f"audit-{uuid.uuid4().hex[:10]}", index=True
    )
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    token_id = Column(String, index=True)
    phase = Column(String)
    actor = Column(String)
    telemetry_hash = Column(String)
    decision_summary = Column(Text)
