"""FastAPI dependency providers for AO-02 backend singletons."""

from __future__ import annotations

from app.core.ao02_state_and_graph import PriorityTokenQueue, SharedContextHeap
from app.services.ingestion import IngestionService

_heap = SharedContextHeap()
_queue = PriorityTokenQueue()
_ingestion = IngestionService(_heap, _queue)


def get_heap() -> SharedContextHeap:
    return _heap


def get_queue() -> PriorityTokenQueue:
    return _queue


def get_ingestion() -> IngestionService:
    return _ingestion
