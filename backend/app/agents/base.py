"""
Base class for AO-02 multi-agent pipeline agents.

Each agent reads an incident envelope from the Shared Context Heap, performs
its domain work (optionally calling the LLM provider for structured output),
updates the envelope, advances the token phase, and writes back to the heap
with an immutable audit entry.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional, Type

from app.core.ao02_state_and_graph import (
    HeapIncidentEnvelope,
    PipelinePhase,
    SharedContextHeap,
)
from app.core.llm_provider import LLMProvider, get_llm_provider_for_agent


class BaseAgent(ABC):
    def __init__(
        self,
        heap: SharedContextHeap,
        llm: Optional[LLMProvider] = None,
        name: Optional[str] = None,
    ) -> None:
        self.heap = heap
        self.name = name or self.__class__.__name__

        if llm is not None:
            self.llm = llm
        else:
            self.llm = get_llm_provider_for_agent(self.__class__.__name__)

    @abstractmethod
    async def run(self, token_id: str) -> dict[str, Any]:
        """Execute the agent's phase for the given token."""
        ...

    def _advance(
        self,
        envelope: HeapIncidentEnvelope,
        next_phase: PipelinePhase,
        summary: str,
    ) -> HeapIncidentEnvelope:
        """Increment hop, advance phase, persist to heap with audit entry."""
        envelope.token.increment_hop(next_phase)
        self.heap.put_envelope(
            envelope,
            actor=self.name,
            summary=summary,
        )
        return envelope

    async def _llm_structured(
        self,
        prompt: str,
        schema: Type,
        system_prompt: Optional[str] = None,
    ) -> Any:
        """Wrapper around the LLM provider for structured generation."""
        return await self.llm.generate_structured(
            prompt=prompt,
            schema=schema,
            system_prompt=system_prompt,
        )
