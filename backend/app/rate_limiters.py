"""
rate_limiters.py
================
Three classic rate-limiting algorithms, all sharing the same interface:

    limiter.allow_request(timestamp: float) -> bool

Timestamps are floats in seconds. They can be simulated time (not
wall-clock), which lets us run reproducible comparisons.
"""

import math
from collections import deque


# ---------------------------------------------------------------------------
# Token Bucket
# ---------------------------------------------------------------------------
class TokenBucket:
    """
    Token Bucket rate limiter.

    How it works
    ------------
    Imagine a bucket that can hold up to `capacity` tokens. Tokens are
    added at a constant `refill_rate` (tokens per second), but the bucket
    never overflows past `capacity`. Every incoming request costs one
    token. If a token is available, the request is allowed and one token
    is removed. If the bucket is empty, the request is blocked.

    Why it's useful
    ---------------
    The token bucket naturally allows short *bursts* of traffic (up to
    `capacity` requests at once) while still enforcing a steady average
    rate over time (`refill_rate` requests/sec). This makes it a good
    fit for APIs where occasional spikes are acceptable.

    Complexity
    ----------
    - Time per request:  O(1) — just arithmetic, no data structures to scan.
    - Memory:            O(1) — only stores two floats (`current_tokens`
                         and `last_update_time`).
    """

    def __init__(self, capacity: int, refill_rate: float) -> None:
        """
        Parameters
        ----------
        capacity : int
            Maximum number of tokens the bucket can hold.
        refill_rate : float
            How many tokens are added per second.
        """
        self.capacity = capacity
        self.refill_rate = refill_rate

        # The bucket starts full, so the very first burst of requests
        # (up to `capacity`) will be allowed immediately.
        self.current_tokens: float = float(capacity)
        self.last_update_time: float = 0.0

    def allow_request(self, timestamp: float) -> bool:
        """
        Decide whether a request arriving at `timestamp` should be
        allowed or blocked.

        Steps:
        1. Calculate how much time has elapsed since the last request.
        2. Add tokens proportional to the elapsed time (but cap at capacity).
        3. If at least one token is available, consume it and allow.
           Otherwise, block.
        """
        # Step 1 + 2: Refill tokens based on elapsed time
        elapsed = timestamp - self.last_update_time
        self.current_tokens = min(
            self.capacity,
            self.current_tokens + elapsed * self.refill_rate,
        )
        self.last_update_time = timestamp

        # Step 3: Try to consume a token
        if self.current_tokens >= 1.0:
            self.current_tokens -= 1.0
            return True

        return False


# ---------------------------------------------------------------------------
# Sliding Window Counter
# ---------------------------------------------------------------------------
class SlidingWindowCounter:
    """
    Sliding Window Counter rate limiter.

    How it works
    ------------
    Time is divided into fixed-size windows (e.g. 1-second intervals).
    We track the request count for the current window and the immediately
    previous window. To decide on a new request, we compute a *weighted*
    count that blends the previous window's count (proportional to how
    much of it still "overlaps" with the current sliding window) with
    the current window's count.

    This is an *approximation* — it assumes requests in the previous
    window were evenly distributed, which smooths out the "boundary bug"
    that plagues naive fixed-window counters (where a client could send
    2x the limit right at the boundary between two windows).

    Memory optimization
    -------------------
    Only the current and previous window counts are ever read, so we
    store exactly three scalars instead of a dict of window indices.
    When the window advances by one, we shift (previous = current,
    current = 0). When it advances by more than one (a gap in traffic),
    both counts reset to 0 since the old windows are no longer relevant.

    Complexity
    ----------
    - Time per request:  O(1) — arithmetic only.
    - Memory:            O(1) — exactly three scalars (window index +
                         two counters), no unbounded growth.
    """

    def __init__(self, window_size: float, limit: int) -> None:
        """
        Parameters
        ----------
        window_size : float
            Length of each fixed window in seconds.
        limit : int
            Maximum allowed requests per window.
        """
        self.window_size = window_size
        self.limit = limit

        # Three scalars replace the old defaultdict(int).
        # This ensures memory is strictly O(1) — no dict that grows
        # by one key per window for the lifetime of the process.
        self.current_window_index: int = 0
        self.current_count: int = 0
        self.previous_count: int = 0

    def _advance_window(self, request_window: int) -> None:
        """
        Advance internal state so that `current_window_index` matches
        `request_window`.

        Three cases:
        - Same window:          do nothing.
        - Exactly one ahead:    shift current → previous, reset current.
        - More than one ahead:  both counts are stale, reset everything.
        """
        if request_window == self.current_window_index:
            # Still in the same window — nothing to do.
            return

        if request_window == self.current_window_index + 1:
            # Moved exactly one window forward. The old "current" becomes
            # the new "previous", and "current" starts fresh.
            self.previous_count = self.current_count
            self.current_count = 0
            self.current_window_index = request_window
        else:
            # Jumped more than one window (gap in traffic). Both the old
            # current and previous windows are outside the sliding view,
            # so neither contributes anything.
            self.previous_count = 0
            self.current_count = 0
            self.current_window_index = request_window

    def allow_request(self, timestamp: float) -> bool:
        """
        Decide whether a request arriving at `timestamp` should be
        allowed or blocked.

        Steps:
        1. Figure out which fixed window we're in and advance state
           if the window has changed since the last request.
        2. Compute a weighted count: full weight for the current window,
           partial weight (based on overlap) for the previous window.
        3. If the weighted count is under the limit, allow and increment
           the current window's counter. Otherwise, block.
        """
        # Step 1: Determine current window index and advance if needed
        request_window = math.floor(timestamp / self.window_size)
        self._advance_window(request_window)

        # How far through the current window are we? (0.0 = start, 1.0 = end)
        elapsed_fraction = (timestamp % self.window_size) / self.window_size

        # Step 2: Blend previous window's count with current window's count
        previous_window_weight = 1.0 - elapsed_fraction
        weighted_count = (
            self.current_count
            + self.previous_count * previous_window_weight
        )

        # Step 3: Allow or block
        if weighted_count < self.limit:
            self.current_count += 1
            return True

        return False


# ---------------------------------------------------------------------------
# Sliding Window Log
# ---------------------------------------------------------------------------
class SlidingWindowLog:
    """
    Sliding Window Log rate limiter.

    How it works
    ------------
    We keep an exact log (a sorted list) of the timestamp of every
    allowed request. When a new request arrives, we throw away any
    entries older than `window_size` seconds ago, then count what's left.
    If the count is under the limit, the request is allowed and its
    timestamp is appended to the log.

    This is the most *accurate* of the three algorithms — there's no
    approximation and no boundary artifacts. The tradeoff is memory:
    the log can grow up to `limit` entries per window.

    Complexity
    ----------
    - Time per request:  O(k) where k is the number of expired entries
                         removed (amortized O(1) per entry since each
                         entry is added once and removed once).
    - Memory:            O(limit) — at most `limit` timestamps stored
                         at any time, but this can be significant at
                         high throughput.
    """

    def __init__(self, window_size: float, limit: int) -> None:
        """
        Parameters
        ----------
        window_size : float
            Length of the sliding window in seconds.
        limit : int
            Maximum allowed requests within the window.
        """
        self.window_size = window_size
        self.limit = limit

        # A deque of timestamps of allowed requests, in chronological order.
        # Using a deque makes popping from the left O(1).
        self.log: deque[float] = deque()

    def allow_request(self, timestamp: float) -> bool:
        """
        Decide whether a request arriving at `timestamp` should be
        allowed or blocked.

        Steps:
        1. Remove all entries older than (timestamp - window_size).
        2. If the remaining count is under the limit, allow and record.
           Otherwise, block.
        """
        # Step 1: Evict expired timestamps from the front of the deque
        cutoff = timestamp - self.window_size
        while self.log and self.log[0] <= cutoff:
            self.log.popleft()

        # Step 2: Check remaining count against the limit
        if len(self.log) < self.limit:
            self.log.append(timestamp)
            return True

        return False
