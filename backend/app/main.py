"""
main.py
=======
FastAPI application with a single endpoint for running rate-limiter
simulations. Start with:

    uvicorn app.main:app --reload

Then visit http://localhost:8000/docs for the interactive API docs.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models import SimulationRequest, SimulationResponse
from app.simulate import run_simulation

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Rate Limiter Comparison API",
    description=(
        "Run simulated traffic through three rate-limiting algorithms "
        "(token bucket, sliding window counter, sliding window log) "
        "and compare their behavior side by side."
    ),
    version="1.0.0",
)

# CORS — allow all origins for local dev and demo purposes.
# In production, you'd restrict this to your frontend's domain, e.g.:
#   allow_origins=["https://your-frontend.netlify.app"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def health_check():
    """Simple health check — useful for deployment platforms that ping
    the root URL to verify the service is running."""
    return {"status": "ok", "message": "Rate Limiter Comparison API is running."}


@app.post("/simulate", response_model=SimulationResponse)
def simulate(request: SimulationRequest):
    """
    Run a rate-limiter simulation.

    Generates a list of request timestamps based on the specified traffic
    pattern, then runs them through all three rate-limiting algorithms
    (token bucket, sliding window counter, sliding window log) and
    returns the per-request results and summary statistics.
    """
    return run_simulation(request)
