from __future__ import annotations

import asyncio
from dataclasses import dataclass

import httpx

from .providers import ProviderError, router


@dataclass(frozen=True)
class Agent:
    name: str
    instruction: str
    preferred: str = "auto"


AGENTS = {
    "researcher": Agent("Researcher", "Investigate facts, assumptions, evidence, sources and unknowns."),
    "planner": Agent("Planner", "Create a practical ordered plan, dependencies, risks and acceptance criteria.", "sol"),
    "coder": Agent("Coder", "Think like a senior software engineer. Produce implementable technical decisions.", "claude"),
    "designer": Agent("Designer", "Design a clear user experience, interaction model and visual hierarchy.", "gemini"),
    "reviewer": Agent("Reviewer", "Critique the proposal. Find failures, missing cases, security and quality risks.", "sol"),
}


async def run_agent(agent: Agent, task: str, mode: str) -> dict:
    prompt = f"Role: {agent.name}\nInstruction: {agent.instruction}\n\nTask:\n{task}"
    try:
        result = await router.complete(prompt, mode=mode, preferred=agent.preferred)
    except (ProviderError, httpx.HTTPError):
        result = await router.complete(prompt, mode=mode, preferred="auto")
    return {"agent": agent.name, **result}


async def orchestrate(task: str, mode: str = "balanced", names: list[str] | None = None) -> dict:
    selected = [AGENTS[n] for n in (names or list(AGENTS)) if n in AGENTS]
    outputs = await asyncio.gather(*(run_agent(agent, task, mode) for agent in selected))
    joined = "\n\n".join(f"### {item['agent']}\n{item['text']}" for item in outputs)
    synthesis_prompt = (
        "You are the lead orchestrator. Synthesize the specialist outputs into one coherent answer. "
        "Resolve conflicts, retain useful details, explicitly call out uncertainties, and finish with concrete next steps.\n\n"
        f"Original task:\n{task}\n\nSpecialist outputs:\n{joined}"
    )
    synthesis = await router.complete(synthesis_prompt, mode="maximum" if mode == "maximum" else "balanced")
    return {"task": task, "agents": outputs, "synthesis": synthesis}
