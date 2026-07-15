/**
 * types.ts
 * ========
 * TypeScript types matching the backend's Pydantic models.
 * Kept in sync manually — if the backend schema changes, update these too.
 */

/** The traffic pattern the simulation should generate. */
export type TrafficPattern = "steady" | "spike" | "double_spike";

/** Request body for POST /simulate. */
export interface SimulationRequest {
  pattern: TrafficPattern;
  duration_seconds: number;
  base_rate_per_second: number;
  spike_multiplier: number;
  limit: number;
  window_size: number;
  bucket_capacity: number;
  bucket_refill_rate: number;
}

/** Per-algorithm summary (allowed vs. blocked counts). */
export interface AlgorithmSummary {
  allowed: number;
  blocked: number;
}

/** The algorithm names returned by the backend. */
export type AlgorithmName =
  | "token_bucket"
  | "sliding_window_counter"
  | "sliding_window_log";

/** Response body from POST /simulate. */
export interface SimulationResponse {
  timestamps: number[];
  results: Record<AlgorithmName, boolean[]>;
  summary: Record<AlgorithmName, AlgorithmSummary>;
}

/**
 * A single data point for the Recharts bar chart.
 * Each row represents a time bucket (~0.5s interval) and contains
 * allowed/blocked counts for each algorithm.
 */
export interface ChartDataPoint {
  bucket: string; // e.g. "0.0–0.5"
  tb_allowed: number;
  tb_blocked: number;
  swc_allowed: number;
  swc_blocked: number;
  swl_allowed: number;
  swl_blocked: number;
}
