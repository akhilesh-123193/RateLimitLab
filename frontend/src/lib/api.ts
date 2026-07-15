/**
 * api.ts
 * ======
 * API helper for communicating with the FastAPI backend.
 *
 * The backend URL is read from the NEXT_PUBLIC_API_URL environment variable
 * so we never hardcode localhost — this makes deployment straightforward.
 */

import { SimulationRequest, SimulationResponse } from "@/types";

/**
 * The base URL of the backend API.
 * Falls back to localhost:8000 for local dev if the env var is missing.
 */
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Call POST /simulate on the backend and return the parsed response.
 *
 * Throws an Error with a descriptive message if the request fails,
 * so the UI can catch it and show a user-friendly error state.
 */
export async function runSimulation(
  request: SimulationRequest
): Promise<SimulationResponse> {
  const response = await fetch(`${API_BASE_URL}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Simulation request failed (${response.status}): ${errorBody}`
    );
  }

  return response.json();
}
