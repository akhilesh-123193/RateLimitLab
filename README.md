# Rate Limiter Comparison Tool

A full-stack demo that compares three classic rate-limiting algorithms — **Token Bucket**, **Sliding Window Counter**, and **Sliding Window Log** — by running identical simulated traffic through each and visualizing the results side by side.

Built as a portfolio project for technical interviews. The code prioritizes clarity and readability over cleverness.

## The Three Algorithms

### Token Bucket 🪣

Imagine a bucket that can hold a fixed number of tokens (say 5). Tokens are added to the bucket at a steady rate (say 5 per second), but the bucket never fills past its capacity. Every incoming request costs one token — if one is available, the request goes through; otherwise, it's blocked.

**Key characteristic:** Naturally allows **bursts**. If the bucket is full and 5 requests arrive at once, they all go through. But after that, requests are throttled to the refill rate until the bucket refills.

- ✅ **Memory:** O(1) — just two numbers (current tokens and last update time)
- ✅ **Speed:** O(1) per request — simple arithmetic
- ⚠️ **Accuracy:** Allows temporary bursts above the average rate, which may or may not be desirable

### Sliding Window Counter 📊

Time is divided into fixed windows (e.g. 1-second intervals). Each window has a counter tracking how many requests were allowed. When a new request arrives, we compute a **weighted blend** of the current window's count and the previous window's count (weighted by how much of the previous window still "overlaps" with the current moment).

This approximation smooths out the **boundary bug** that plagues naive fixed-window counters — where a client could send a full window's worth of requests at the very *end* of one window and another full batch at the *start* of the next, effectively doubling the rate.

- ✅ **Memory:** O(1) active — only the current and previous window counts matter
- ✅ **Speed:** O(1) per request — dictionary lookup + arithmetic
- ⚠️ **Accuracy:** Approximate — assumes requests in the previous window were evenly distributed, which is usually close enough

### Sliding Window Log 📜

The most precise of the three. Keeps an **exact timestamp** of every allowed request in a log. When a new request arrives, discard all entries older than the window size, then count what's left. If under the limit, allow.

- ⚠️ **Memory:** O(n) where n = limit — stores one timestamp per allowed request in the window
- ✅ **Speed:** Amortized O(1) per request (each entry is added once and removed once)
- ✅ **Accuracy:** Exact — no approximation, no boundary artifacts

### Tradeoff Summary

| Algorithm | Memory | Burst Tolerance | Accuracy |
|---|---|---|---|
| Token Bucket | O(1) | High (allows bursts up to capacity) | Approximate (allows bursts) |
| Sliding Window Counter | O(1) | Low (smoothed) | Approximate (weighted blend) |
| Sliding Window Log | O(limit) | None (strict) | Exact |

---

## Local Setup

### Prerequisites

- Python 3.10+ with pip
- Node.js 18+ with npm

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
cp .env.local.example .env.local   # already points to localhost:8000
npm install
npm run dev
```

The app will be available at `http://localhost:3000`.

---

## API Documentation

### `POST /simulate`

Run a rate-limiter simulation with the specified traffic pattern and parameters.

#### Request Body

```json
{
  "pattern": "spike",
  "duration_seconds": 10,
  "base_rate_per_second": 3,
  "spike_multiplier": 5,
  "limit": 5,
  "window_size": 1.0,
  "bucket_capacity": 5,
  "bucket_refill_rate": 5
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `pattern` | `"steady" \| "spike" \| "double_spike"` | `"steady"` | Traffic pattern to simulate |
| `duration_seconds` | `float` | `10.0` | Total simulation duration in seconds |
| `base_rate_per_second` | `float` | `3.0` | Steady-state request rate |
| `spike_multiplier` | `float` | `5.0` | Burst rate = base_rate × this multiplier |
| `limit` | `int` | `5` | Max requests per window (sliding window algorithms) |
| `window_size` | `float` | `1.0` | Window size in seconds (sliding window algorithms) |
| `bucket_capacity` | `int` | `5` | Max tokens the token bucket can hold |
| `bucket_refill_rate` | `float` | `5.0` | Tokens added per second to the bucket |

#### Response Body

```json
{
  "timestamps": [0.0, 0.333, 0.667, ...],
  "results": {
    "token_bucket": [true, true, false, ...],
    "sliding_window_counter": [true, true, true, ...],
    "sliding_window_log": [true, false, true, ...]
  },
  "summary": {
    "token_bucket": { "allowed": 23, "blocked": 7 },
    "sliding_window_counter": { "allowed": 25, "blocked": 5 },
    "sliding_window_log": { "allowed": 22, "blocked": 8 }
  }
}
```

- `timestamps[i]` is the simulated time of the i-th request
- `results.<algorithm>[i]` is `true` if that algorithm allowed the i-th request, `false` if blocked
- `summary.<algorithm>` gives the total allowed/blocked counts

### `GET /`

Health check. Returns `{"status": "ok", "message": "Rate Limiter Comparison API is running."}`.

---

## Tech Stack

- **Backend:** Python, FastAPI, Pydantic, uvicorn
- **Frontend:** Next.js 14+ (App Router), React, TypeScript, Tailwind CSS, Recharts
- **No database** — everything is stateless and computed per-request

## Deployment

- **Backend:** Ready for Railway/Render (see `Procfile`)
- **Frontend:** Ready for Netlify/Vercel (standard Next.js app, client-rendered)
