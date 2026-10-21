"""Seconds spent per stage of a rollout, summed until the trainer reads them.

A collection phase is the bridge workers' engines, the pipes between them and
this process, and the GPU's scoring, interleaved; `compact_ppo` logs this
split as `collect_breakdown` so a slow iteration says which of them it waited
on. Each stage is timed once per request or per scored batch, never per
decision, so the timers cost nothing measurable. Single-threaded use only.
"""

from __future__ import annotations

import time
from collections import defaultdict
from contextlib import contextmanager

# This process's stages, and the workers' own (`server.ts` `SYS1_PROFILE`),
# which come back on each reply and are summed over the workers.
TIMES: dict[str, float] = defaultdict(float)
WORKER_TIMES: dict[str, float] = defaultdict(float)


@contextmanager
def timed(stage: str):
    start = time.perf_counter()
    try:
        yield
    finally:
        TIMES[stage] += time.perf_counter() - start


def take() -> tuple[dict[str, float], dict[str, float]]:
    """Both tables since the last call, cleared."""
    mine, workers = dict(TIMES), dict(WORKER_TIMES)
    TIMES.clear()
    WORKER_TIMES.clear()
    return mine, workers
