"""
simulate.py
============
Traffic pattern generation and simulation runner.

This module does two things:
1. Generate a list of simulated request timestamps for a given traffic
   pattern (steady, spike, double_spike).
2. Run that *identical* list through all three rate limiters so their
   behavior can be compared side by side.
"""

from app.models import AlgorithmSummary, SimulationRequest, SimulationResponse
from app.rate_limiters import SlidingWindowCounter, SlidingWindowLog, TokenBucket


# ---------------------------------------------------------------------------
# Traffic pattern generators
# ---------------------------------------------------------------------------

def generate_timestamps(
    pattern: str,
    duration_seconds: float,
    base_rate_per_second: float,
    spike_multiplier: float,
) -> list[float]:
    """
    Create a sorted list of simulated request timestamps.

    Parameters
    ----------
    pattern : str
        One of "steady", "spike", or "double_spike".
    duration_seconds : float
        How long the simulation runs (in seconds).
    base_rate_per_second : float
        Steady-state request rate.
    spike_multiplier : float
        How much to multiply the base rate during burst periods.

    Returns
    -------
    list[float]
        Sorted timestamps in seconds.
    """
    timestamps: list[float] = []

    # --- Steady baseline ---
    # Evenly spaced requests across the full duration.
    total_steady_requests = int(duration_seconds * base_rate_per_second)
    if total_steady_requests > 0:
        interval = duration_seconds / total_steady_requests
        for i in range(total_steady_requests):
            timestamps.append(round(i * interval, 4))

    # --- Add spike(s) if requested ---
    if pattern == "spike":
        spike_timestamps = _generate_spike(
            center=duration_seconds * 0.4,
            rate=base_rate_per_second * spike_multiplier,
            spike_duration=1.0,
        )
        timestamps.extend(spike_timestamps)

    elif pattern == "double_spike":
        # First spike at ~30% of the duration
        spike_1 = _generate_spike(
            center=duration_seconds * 0.3,
            rate=base_rate_per_second * spike_multiplier,
            spike_duration=1.0,
        )
        # Second spike at ~70% of the duration
        spike_2 = _generate_spike(
            center=duration_seconds * 0.7,
            rate=base_rate_per_second * spike_multiplier,
            spike_duration=1.0,
        )
        timestamps.extend(spike_1)
        timestamps.extend(spike_2)

    # Sort so all algorithms see requests in chronological order
    timestamps.sort()
    return timestamps


def _generate_spike(
    center: float,
    rate: float,
    spike_duration: float,
) -> list[float]:
    """
    Generate a burst of evenly-spaced request timestamps centered
    around `center`, lasting `spike_duration` seconds at the given `rate`.

    For example, center=4.0, rate=15, spike_duration=1.0 produces ~15
    requests evenly spaced between 3.5 and 4.5.
    """
    spike_start = center - spike_duration / 2
    num_spike_requests = int(rate * spike_duration)
    spike_timestamps: list[float] = []

    if num_spike_requests > 0:
        spike_interval = spike_duration / num_spike_requests
        for i in range(num_spike_requests):
            t = spike_start + i * spike_interval
            spike_timestamps.append(round(t, 4))

    return spike_timestamps


# ---------------------------------------------------------------------------
# Simulation runner
# ---------------------------------------------------------------------------

def run_simulation(request: SimulationRequest) -> SimulationResponse:
    """
    Run the full simulation:
    1. Generate timestamps for the requested traffic pattern.
    2. Create a fresh instance of each rate limiter.
    3. Feed the *same* timestamps to each limiter independently.
    4. Collect and return the results.
    """

    # Step 1: Generate the traffic
    timestamps = generate_timestamps(
        pattern=request.pattern,
        duration_seconds=request.duration_seconds,
        base_rate_per_second=request.base_rate_per_second,
        spike_multiplier=request.spike_multiplier,
    )

    # Step 2: Create fresh limiter instances (each starts with clean state)
    limiters = {
        "token_bucket": TokenBucket(
            capacity=request.bucket_capacity,
            refill_rate=request.bucket_refill_rate,
        ),
        "sliding_window_counter": SlidingWindowCounter(
            window_size=request.window_size,
            limit=request.limit,
        ),
        "sliding_window_log": SlidingWindowLog(
            window_size=request.window_size,
            limit=request.limit,
        ),
    }

    # Step 3: Run each limiter against the same timestamps
    results: dict[str, list[bool]] = {}
    for name, limiter in limiters.items():
        outcomes = []
        for t in timestamps:
            outcomes.append(limiter.allow_request(t))
        results[name] = outcomes

    # Step 4: Compute summaries
    summary: dict[str, AlgorithmSummary] = {}
    for name, outcomes in results.items():
        allowed = sum(1 for ok in outcomes if ok)
        blocked = len(outcomes) - allowed
        summary[name] = AlgorithmSummary(allowed=allowed, blocked=blocked)

    return SimulationResponse(
        timestamps=timestamps,
        results=results,
        summary=summary,
    )
