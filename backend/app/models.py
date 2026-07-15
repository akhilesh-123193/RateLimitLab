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
        le=60.0,
        description="Total duration of the simulation in seconds. Max 60.",
    )
    base_rate_per_second: float = Field(
        default=3.0,
        gt=0,
        le=50.0,
        description="Number of requests per second during steady periods. Max 50.",
    )
    spike_multiplier: float = Field(
        default=5.0,
        gt=1,
        le=20.0,
        description=(
            "How many times the base rate to use during spike bursts. "
            "Only relevant for 'spike' and 'double_spike' patterns. Max 20."
        ),
    )

    # Rate limiter configuration (shared by sliding-window algorithms)
    limit: int = Field(
        default=5,
        gt=0,
        le=1000,
        description="Max allowed requests per window (sliding window algorithms). Max 1000.",
    )
    window_size: float = Field(
        default=1.0,
        gt=0,
        le=60.0,
        description="Window size in seconds (sliding window algorithms). Max 60.",
    )

    # Token bucket-specific configuration
    bucket_capacity: int = Field(
        default=5,
        gt=0,
        le=1000,
        description="Maximum tokens the bucket can hold. Max 1000.",
    )
    bucket_refill_rate: float = Field(
        default=5.0,
        gt=0,
        le=1000.0,
        description="Tokens added to the bucket per second. Max 1000.",
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
