"""
models.py
=========
Pydantic models for the /simulate endpoint's request and response bodies.

Using Pydantic here gives us:
  - Automatic request validation (FastAPI returns a 422 with details if
    the client sends invalid data)
  - Auto-generated OpenAPI docs at /docs (FastAPI reads the model schemas)
  - Clear, self-documenting type definitions that double as documentation
"""

from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------
class SimulationRequest(BaseModel):
    """
    Parameters the client sends to configure and run a simulation.
    """

    # Which traffic pattern to generate
    pattern: Literal["steady", "spike", "double_spike"] = Field(
        default="steady",
        description=(
            "Traffic pattern to simulate. "
            "'steady' = constant rate, "
            "'spike' = steady + one burst, "
            "'double_spike' = steady + two bursts."
        ),
    )

    # Traffic shape parameters
    duration_seconds: float = Field(
        default=10.0,
        gt=0,
        description="Total duration of the simulation in seconds.",
    )
    base_rate_per_second: float = Field(
        default=3.0,
        gt=0,
        description="Number of requests per second during steady periods.",
    )
    spike_multiplier: float = Field(
        default=5.0,
        gt=1,
        description=(
            "How many times the base rate to use during spike bursts. "
            "Only relevant for 'spike' and 'double_spike' patterns."
        ),
    )

    # Rate limiter configuration (shared by sliding-window algorithms)
    limit: int = Field(
        default=5,
        gt=0,
        description="Max allowed requests per window (sliding window algorithms).",
    )
    window_size: float = Field(
        default=1.0,
        gt=0,
        description="Window size in seconds (sliding window algorithms).",
    )

    # Token bucket-specific configuration
    bucket_capacity: int = Field(
        default=5,
        gt=0,
        description="Max tokens the token bucket can hold.",
    )
    bucket_refill_rate: float = Field(
        default=5.0,
        gt=0,
        description="Tokens added per second to the token bucket.",
    )


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------
class AlgorithmSummary(BaseModel):
    """
    High-level outcome for one algorithm: how many requests were
    allowed vs. blocked.
    """

    allowed: int
    blocked: int


class SimulationResponse(BaseModel):
    """
    The full result of running a simulation. Contains the raw per-request
    results (so the frontend can chart them) and a summary per algorithm
    (for the at-a-glance cards).
    """

    # The exact timestamps of every simulated request
    timestamps: list[float]

    # Per-algorithm, per-request outcome: results["token_bucket"][i]
    # corresponds to timestamps[i]
    results: dict[str, list[bool]]

    # Per-algorithm totals
    summary: dict[str, AlgorithmSummary]
