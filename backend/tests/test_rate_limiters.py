"""
test_rate_limiters.py
=====================
Unit tests locking down boundary behavior for each rate-limiting algorithm.

Run with:
    python -m pytest backend/tests/test_rate_limiters.py -v
"""

import pytest

from app.rate_limiters import SlidingWindowCounter, SlidingWindowLog, TokenBucket


# ---------------------------------------------------------------------------
# Token Bucket
# ---------------------------------------------------------------------------

class TestTokenBucket:
    """Tests for the TokenBucket rate limiter."""

    def test_allows_exactly_capacity_instant_requests(self):
        """
        A full bucket with capacity=5 should allow exactly 5 back-to-back
        requests at the same timestamp, then block the 6th.
        """
        bucket = TokenBucket(capacity=5, refill_rate=1.0)

        # All 5 should be allowed (bucket starts full)
        for i in range(5):
            assert bucket.allow_request(0.0) is True, (
                f"Request {i+1} should be allowed (bucket had tokens)"
            )

        # The 6th at the same instant should be blocked (bucket is empty,
        # and no time has passed for refilling)
        assert bucket.allow_request(0.0) is False, (
            "Request 6 should be blocked (bucket empty, no time to refill)"
        )

    def test_refills_over_time(self):
        """
        After draining the bucket, waiting long enough for one token to
        refill should allow exactly one more request.
        """
        bucket = TokenBucket(capacity=5, refill_rate=1.0)

        # Drain all 5 tokens at t=0
        for _ in range(5):
            bucket.allow_request(0.0)

        # At t=0, bucket is empty — should block
        assert bucket.allow_request(0.0) is False

        # At t=1.0, one token should have refilled (rate=1.0 tok/s)
        assert bucket.allow_request(1.0) is True
        # But only one — the next should block again
        assert bucket.allow_request(1.0) is False

    def test_refill_caps_at_capacity(self):
        """
        Even after a long wait, the bucket should never exceed capacity.
        So after waiting 100 seconds with capacity=3, only 3 requests
        should be allowed at once.
        """
        bucket = TokenBucket(capacity=3, refill_rate=10.0)

        # Drain at t=0
        for _ in range(3):
            bucket.allow_request(0.0)

        # Wait a long time — tokens should cap at capacity=3, not 1000
        for i in range(3):
            assert bucket.allow_request(100.0) is True, (
                f"Request {i+1} at t=100 should be allowed"
            )
        assert bucket.allow_request(100.0) is False, (
            "Request 4 at t=100 should be blocked (capacity is only 3)"
        )


# ---------------------------------------------------------------------------
# Sliding Window Log
# ---------------------------------------------------------------------------

class TestSlidingWindowLog:
    """Tests for the SlidingWindowLog rate limiter."""

    def test_blocks_limit_plus_one_within_window(self):
        """
        With limit=3 and window_size=1.0, the 4th request within the
        same 1-second window should be blocked.
        """
        log = SlidingWindowLog(window_size=1.0, limit=3)

        # 3 requests within the window — all allowed
        assert log.allow_request(0.0) is True
        assert log.allow_request(0.3) is True
        assert log.allow_request(0.6) is True

        # 4th within the same window — blocked
        assert log.allow_request(0.9) is False

    def test_allows_after_window_expires(self):
        """
        After the window expires, old entries are evicted and new
        requests should be allowed again.
        """
        log = SlidingWindowLog(window_size=1.0, limit=3)

        # Fill the window at t=0.0, 0.3, 0.6
        log.allow_request(0.0)
        log.allow_request(0.3)
        log.allow_request(0.6)

        # At t=0.9, blocked (3 entries in the last 1.0s)
        assert log.allow_request(0.9) is False

        # At t=1.01, the entry at t=0.0 has expired (1.01 - 1.0 = 0.01,
        # and we evict entries <= cutoff where cutoff = 1.01 - 1.0 = 0.01,
        # but 0.0 <= 0.01 so it's evicted). Now only 2 entries remain
        # (0.3 and 0.6), so this should be allowed.
        assert log.allow_request(1.01) is True

    def test_exact_boundary_eviction(self):
        """
        An entry at timestamp T should be evicted when the current
        timestamp is exactly T + window_size (cutoff = T, and we evict
        entries <= cutoff).
        """
        log = SlidingWindowLog(window_size=1.0, limit=1)

        # One request at t=0.0 — allowed
        assert log.allow_request(0.0) is True
        # Still in window — blocked
        assert log.allow_request(0.5) is False

        # At t=1.0 exactly: cutoff = 1.0 - 1.0 = 0.0.
        # Entry at 0.0 <= 0.0, so it's evicted. Window is now empty.
        assert log.allow_request(1.0) is True


# ---------------------------------------------------------------------------
# Sliding Window Counter
# ---------------------------------------------------------------------------

class TestSlidingWindowCounter:
    """Tests for the SlidingWindowCounter rate limiter."""

    def test_basic_rate_limiting(self):
        """
        With limit=3 and window_size=1.0, requests within a single
        window should be capped at the limit.
        """
        counter = SlidingWindowCounter(window_size=1.0, limit=3)

        # First 3 in window 0 — all allowed
        assert counter.allow_request(0.1) is True
        assert counter.allow_request(0.2) is True
        assert counter.allow_request(0.3) is True

        # 4th in window 0 — blocked (weighted count = 3 current + 0 previous = 3, not < 3)
        assert counter.allow_request(0.4) is False

    def test_window_advancement_shifts_counts(self):
        """
        When we move to the next window, the old current count becomes
        the previous count and the current count resets to 0.
        """
        counter = SlidingWindowCounter(window_size=1.0, limit=3)

        # Fill window 0 with 3 requests
        counter.allow_request(0.1)
        counter.allow_request(0.2)
        counter.allow_request(0.3)

        # Move to window 1. At t=1.5, we're 50% through window 1.
        # weighted_count = current_count(0) + previous_count(3) * 0.5 = 1.5
        # 1.5 < 3, so allowed.
        assert counter.allow_request(1.5) is True

    def test_gap_in_traffic_resets_both_counts(self):
        """
        If we skip more than one window (a gap in traffic), both the
        current and previous counts should reset to 0 because neither
        window overlaps with the new sliding view.
        """
        counter = SlidingWindowCounter(window_size=1.0, limit=3)

        # Fill window 0
        counter.allow_request(0.1)
        counter.allow_request(0.2)
        counter.allow_request(0.3)

        # Jump to window 5 (skipping windows 1-4). Both counts should
        # be 0, so the first request in window 5 should definitely be allowed.
        assert counter.allow_request(5.0) is True

        # And we should be able to allow 2 more (total 3 = limit)
        assert counter.allow_request(5.1) is True
        assert counter.allow_request(5.2) is True
        assert counter.allow_request(5.3) is False  # blocked at limit

    def test_memory_is_constant(self):
        """
        Verify the counter only stores three scalars, not a growing dict.
        After processing requests across many windows, only the three
        scalar attributes should exist (no 'counts' dict).
        """
        counter = SlidingWindowCounter(window_size=1.0, limit=5)

        # Send requests across 100 different windows
        for window_idx in range(100):
            counter.allow_request(float(window_idx) + 0.5)

        # Verify the implementation uses scalars, not a dict
        assert hasattr(counter, "current_window_index")
        assert hasattr(counter, "current_count")
        assert hasattr(counter, "previous_count")
        assert not hasattr(counter, "counts"), (
            "SlidingWindowCounter should NOT have a 'counts' dict — "
            "it should use three scalars to avoid unbounded memory growth"
        )
