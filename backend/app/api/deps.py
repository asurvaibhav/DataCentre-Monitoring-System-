"""FastAPI dependency providers for AO-02 backend singletons."""

from __future__ import annotations

from typing import Optional

from app.core.ao02_state_and_graph import PriorityTokenQueue, SharedContextHeap
from app.core.llm_provider import LLMProvider, get_llm_provider as _build_provider
from app.services.ingestion import IngestionService

_heap: Optional[SharedContextHeap] = None
_queue: Optional[PriorityTokenQueue] = None
_ingestion: Optional[IngestionService] = None
_llm: Optional[LLMProvider] = None


def get_heap() -> SharedContextHeap:
    global _heap
    if _heap is None:
        _heap = SharedContextHeap()
    return _heap


def get_queue() -> PriorityTokenQueue:
    global _queue
    if _queue is None:
        _queue = PriorityTokenQueue()
    return _queue


def get_ingestion() -> IngestionService:
    global _ingestion
    if _ingestion is None:
        _ingestion = IngestionService(get_heap(), get_queue())
    return _ingestion


def get_llm_provider() -> LLMProvider:
    global _llm
    if _llm is None:
        _llm = _build_provider()
    return _llm
