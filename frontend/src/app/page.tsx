"use client";

/**
 * page.tsx
 * ========
 * Main (and only) page for the Rate Limiter Comparison tool.
 *
 * Layout:
 *   1. Header with title
 *   2. Controls panel — pattern dropdown, parameter inputs, "Run" button
 *   3. Three summary cards (one per algorithm)
 *   4. Bar chart comparing allowed/blocked per time bucket
 */

import { useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { runSimulation } from "@/lib/api";
import type {
  TrafficPattern,
  SimulationRequest,
  SimulationResponse,
  AlgorithmName,
  ChartDataPoint,
} from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Display names and colors for each algorithm. */
const ALGORITHM_META: Record<
  AlgorithmName,
  { label: string; color: string; blockedColor: string; icon: string }
> = {
  token_bucket: {
    label: "Token Bucket",
    color: "#22d3ee", // cyan
    blockedColor: "#0e7490",
    icon: "🪣",
  },
  sliding_window_counter: {
    label: "Sliding Window Counter",
    color: "#8b5cf6", // violet
    blockedColor: "#5b21b6",
    icon: "📊",
  },
  sliding_window_log: {
    label: "Sliding Window Log",
    color: "#34d399", // emerald
    blockedColor: "#065f46",
    icon: "📜",
  },
};

const ALGORITHM_NAMES: AlgorithmName[] = [
  "token_bucket",
  "sliding_window_counter",
  "sliding_window_log",
];

const PATTERN_OPTIONS: { value: TrafficPattern; label: string; description: string }[] = [
  {
    value: "steady",
    label: "Steady",
    description: "Constant rate of requests",
  },
  {
    value: "spike",
    label: "Single Spike",
    description: "Steady baseline + one burst at 40%",
  },
  {
    value: "double_spike",
    label: "Double Spike",
    description: "Steady baseline + bursts at 30% and 70%",
  },
];

/** Default request params. */
const DEFAULT_REQUEST: SimulationRequest = {
  pattern: "spike",
  duration_seconds: 10,
  base_rate_per_second: 3,
  spike_multiplier: 5,
  limit: 5,
  window_size: 1.0,
  bucket_capacity: 5,
  bucket_refill_rate: 5,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Bucket the raw simulation results into ~0.5s intervals and count
 * allowed/blocked per algorithm per bucket. This gives us the data
 * shape Recharts expects.
 */
function buildChartData(response: SimulationResponse): ChartDataPoint[] {
  const bucketSize = 0.5; // seconds
  const maxTime = Math.max(...response.timestamps, 0);
  const bucketCount = Math.ceil(maxTime / bucketSize) + 1;

  // Initialize empty buckets
  const buckets: ChartDataPoint[] = Array.from({ length: bucketCount }, (_, i) => ({
    bucket: `${(i * bucketSize).toFixed(1)}s`,
    tb_allowed: 0,
    tb_blocked: 0,
    swc_allowed: 0,
    swc_blocked: 0,
    swl_allowed: 0,
    swl_blocked: 0,
  }));

  // Map from algorithm name to the chart data keys
  const keyMap: Record<AlgorithmName, { allowed: keyof ChartDataPoint; blocked: keyof ChartDataPoint }> = {
    token_bucket: { allowed: "tb_allowed", blocked: "tb_blocked" },
    sliding_window_counter: { allowed: "swc_allowed", blocked: "swc_blocked" },
    sliding_window_log: { allowed: "swl_allowed", blocked: "swl_blocked" },
  };

  // Fill buckets
  for (let i = 0; i < response.timestamps.length; i++) {
    const bucketIndex = Math.min(
      Math.floor(response.timestamps[i] / bucketSize),
      bucketCount - 1
    );

    for (const algo of ALGORITHM_NAMES) {
      const keys = keyMap[algo];
      const wasAllowed = response.results[algo][i];
      if (wasAllowed) {
        (buckets[bucketIndex][keys.allowed] as number) += 1;
      } else {
        (buckets[bucketIndex][keys.blocked] as number) += 1;
      }
    }
  }

  return buckets;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** A single summary card for one algorithm. */
function SummaryCard({
  name,
  allowed,
  blocked,
}: {
  name: AlgorithmName;
  allowed: number;
  blocked: number;
}) {
  const meta = ALGORITHM_META[name];
  const total = allowed + blocked;
  const blockRate = total > 0 ? ((blocked / total) * 100).toFixed(1) : "0.0";
  const allowRate = total > 0 ? ((allowed / total) * 100).toFixed(1) : "0.0";

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-6 transition-all duration-300 hover:border-opacity-60 hover:shadow-lg hover:shadow-black/20"
      style={{ borderColor: `${meta.color}30` }}
    >
      {/* Subtle gradient accent at top */}
      <div
        className="absolute inset-x-0 top-0 h-1 rounded-t-2xl"
        style={{
          background: `linear-gradient(90deg, ${meta.color}, ${meta.color}60)`,
        }}
      />

      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">{meta.icon}</span>
        <h3 className="text-lg font-semibold" style={{ color: meta.color }}>
          {meta.label}
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted mb-1">
            Allowed
          </p>
          <p className="text-2xl font-bold text-emerald-400">{allowed}</p>
          <p className="text-xs text-muted">{allowRate}%</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted mb-1">
            Blocked
          </p>
          <p className="text-2xl font-bold text-rose-400">{blocked}</p>
          <p className="text-xs text-muted">{blockRate}%</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted mb-1">
            Total
          </p>
          <p className="text-2xl font-bold text-foreground">{total}</p>
          <p className="text-xs text-muted">requests</p>
        </div>
      </div>

      {/* Visual block rate bar */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-muted mb-1">
          <span>Allow rate</span>
          <span>{allowRate}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-black/30 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${allowRate}%`,
              background: `linear-gradient(90deg, ${meta.color}, ${meta.color}aa)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** Custom tooltip for the Recharts bar chart. */
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-xl border border-card-border bg-card-bg/95 backdrop-blur-sm p-3 shadow-xl text-sm">
      <p className="font-semibold text-foreground mb-2">Time: {label}</p>
      {payload.map((entry) => (
        <div
          key={entry.name}
          className="flex items-center gap-2 py-0.5"
        >
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted">{entry.name}:</span>
          <span className="font-medium text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function Home() {
  // Form state
  const [request, setRequest] = useState<SimulationRequest>(DEFAULT_REQUEST);

  // API state
  const [response, setResponse] = useState<SimulationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Run the simulation against the backend. */
  const handleRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await runSimulation(request);
      setResponse(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }, [request]);

  /** Helper to update a single field in the request. */
  const updateField = <K extends keyof SimulationRequest>(
    key: K,
    value: SimulationRequest[K]
  ) => {
    setRequest((prev) => ({ ...prev, [key]: value }));
  };

  // Build chart data if we have a response
  const chartData = response ? buildChartData(response) : null;

  return (
    <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-card-border bg-card-bg/50 text-xs text-muted mb-4">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Interactive Demo
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent">
          Rate Limiter Comparison
        </h1>
        <p className="mt-3 text-lg text-muted max-w-2xl mx-auto">
          Compare <strong className="text-foreground">Token Bucket</strong>,{" "}
          <strong className="text-foreground">Sliding Window Counter</strong>,
          and{" "}
          <strong className="text-foreground">Sliding Window Log</strong>{" "}
          algorithms side by side with simulated traffic.
        </p>
      </header>

      {/* ── Controls Panel ─────────────────────────────────────────── */}
      <section
        id="controls-panel"
        className="rounded-2xl border border-card-border bg-card-bg p-6 mb-8"
      >
        <h2 className="text-lg font-semibold text-foreground mb-5 flex items-center gap-2">
          <span className="text-xl">⚙️</span> Simulation Parameters
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Pattern selector */}
          <div>
            <label
              htmlFor="pattern-select"
              className="block text-xs uppercase tracking-wider text-muted mb-1.5"
            >
              Traffic Pattern
            </label>
            <select
              id="pattern-select"
              value={request.pattern}
              onChange={(e) =>
                updateField("pattern", e.target.value as TrafficPattern)
              }
              className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-cyan/50"
            >
              {PATTERN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.description}
                </option>
              ))}
            </select>
          </div>

          {/* Duration */}
          <div>
            <label
              htmlFor="duration-input"
              className="block text-xs uppercase tracking-wider text-muted mb-1.5"
            >
              Duration (seconds)
            </label>
            <input
              id="duration-input"
              type="number"
              min={1}
              max={60}
              step={1}
              value={request.duration_seconds}
              onChange={(e) =>
                updateField("duration_seconds", Number(e.target.value))
              }
              className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-cyan/50"
            />
          </div>

          {/* Base rate */}
          <div>
            <label
              htmlFor="base-rate-input"
              className="block text-xs uppercase tracking-wider text-muted mb-1.5"
            >
              Base Rate (req/s)
            </label>
            <input
              id="base-rate-input"
              type="number"
              min={1}
              max={50}
              step={1}
              value={request.base_rate_per_second}
              onChange={(e) =>
                updateField("base_rate_per_second", Number(e.target.value))
              }
              className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-cyan/50"
            />
          </div>

          {/* Spike multiplier */}
          <div>
            <label
              htmlFor="spike-mult-input"
              className="block text-xs uppercase tracking-wider text-muted mb-1.5"
            >
              Spike Multiplier
            </label>
            <input
              id="spike-mult-input"
              type="number"
              min={2}
              max={20}
              step={1}
              value={request.spike_multiplier}
              onChange={(e) =>
                updateField("spike_multiplier", Number(e.target.value))
              }
              className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-cyan/50"
            />
          </div>
        </div>

        {/* Rate limiter params */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <label
              htmlFor="limit-input"
              className="block text-xs uppercase tracking-wider text-muted mb-1.5"
            >
              Window Limit (req/window)
            </label>
            <input
              id="limit-input"
              type="number"
              min={1}
              max={100}
              step={1}
              value={request.limit}
              onChange={(e) => updateField("limit", Number(e.target.value))}
              className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-cyan/50"
            />
          </div>
          <div>
            <label
              htmlFor="window-size-input"
              className="block text-xs uppercase tracking-wider text-muted mb-1.5"
            >
              Window Size (seconds)
            </label>
            <input
              id="window-size-input"
              type="number"
              min={0.1}
              max={10}
              step={0.1}
              value={request.window_size}
              onChange={(e) =>
                updateField("window_size", Number(e.target.value))
              }
              className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-cyan/50"
            />
          </div>
          <div>
            <label
              htmlFor="bucket-cap-input"
              className="block text-xs uppercase tracking-wider text-muted mb-1.5"
            >
              Bucket Capacity
            </label>
            <input
              id="bucket-cap-input"
              type="number"
              min={1}
              max={100}
              step={1}
              value={request.bucket_capacity}
              onChange={(e) =>
                updateField("bucket_capacity", Number(e.target.value))
              }
              className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-cyan/50"
            />
          </div>
          <div>
            <label
              htmlFor="bucket-refill-input"
              className="block text-xs uppercase tracking-wider text-muted mb-1.5"
            >
              Bucket Refill Rate (tok/s)
            </label>
            <input
              id="bucket-refill-input"
              type="number"
              min={1}
              max={100}
              step={1}
              value={request.bucket_refill_rate}
              onChange={(e) =>
                updateField("bucket_refill_rate", Number(e.target.value))
              }
              className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-cyan/50"
            />
          </div>
        </div>

        {/* Run button */}
        <button
          id="run-simulation-button"
          onClick={handleRun}
          disabled={loading}
          className="w-full sm:w-auto px-8 py-3 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer
            bg-gradient-to-r from-cyan-500 to-violet-500 text-white
            hover:from-cyan-400 hover:to-violet-400 hover:shadow-lg hover:shadow-cyan-500/25
            disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Running…
            </span>
          ) : (
            "▶ Run Simulation"
          )}
        </button>
      </section>

      {/* ── Error message ──────────────────────────────────────────── */}
      {error && (
        <div
          id="error-banner"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 mb-8 text-sm text-rose-300"
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────── */}
      {response && (
        <>
          {/* Summary Cards */}
          <section id="summary-cards" className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <span className="text-xl">📈</span> Results Summary
              <span className="text-xs font-normal text-muted ml-2">
                ({response.timestamps.length} total requests simulated)
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {ALGORITHM_NAMES.map((name) => (
                <SummaryCard
                  key={name}
                  name={name}
                  allowed={response.summary[name].allowed}
                  blocked={response.summary[name].blocked}
                />
              ))}
            </div>
          </section>

          {/* Bar Charts — one per algorithm for clarity */}
          <section id="charts-section">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <span className="text-xl">📊</span> Allowed vs Blocked Over Time
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {ALGORITHM_NAMES.map((algo) => {
                const meta = ALGORITHM_META[algo];
                // Build per-algorithm chart data
                const algoChartData = chartData!.map((point) => {
                  const keyPrefix =
                    algo === "token_bucket"
                      ? "tb"
                      : algo === "sliding_window_counter"
                        ? "swc"
                        : "swl";
                  return {
                    bucket: point.bucket,
                    Allowed:
                      point[
                        `${keyPrefix}_allowed` as keyof ChartDataPoint
                      ] as number,
                    Blocked:
                      point[
                        `${keyPrefix}_blocked` as keyof ChartDataPoint
                      ] as number,
                  };
                });

                return (
                  <div
                    key={algo}
                    className="rounded-2xl border border-card-border bg-card-bg p-5"
                    style={{ borderColor: `${meta.color}20` }}
                  >
                    <h3
                      className="text-sm font-semibold mb-3 flex items-center gap-2"
                      style={{ color: meta.color }}
                    >
                      <span>{meta.icon}</span>
                      {meta.label}
                    </h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={algoChartData}
                        margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#1e2d4a"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="bucket"
                          tick={{ fill: "#64748b", fontSize: 10 }}
                          axisLine={{ stroke: "#1e2d4a" }}
                          tickLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fill: "#64748b", fontSize: 10 }}
                          axisLine={{ stroke: "#1e2d4a" }}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip
                          content={<CustomTooltip />}
                          cursor={{ fill: "rgba(255,255,255,0.03)" }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: "11px", color: "#64748b" }}
                        />
                        <Bar
                          dataKey="Allowed"
                          fill={meta.color}
                          radius={[3, 3, 0, 0]}
                          maxBarSize={20}
                        />
                        <Bar
                          dataKey="Blocked"
                          fill={meta.blockedColor}
                          radius={[3, 3, 0, 0]}
                          maxBarSize={20}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* ── Empty state ────────────────────────────────────────────── */}
      {!response && !loading && !error && (
        <div className="text-center py-20 text-muted">
          <div className="text-5xl mb-4">🚦</div>
          <p className="text-lg">
            Configure your parameters above and click{" "}
            <strong className="text-foreground">Run Simulation</strong> to
            compare algorithms.
          </p>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="mt-16 pt-8 border-t border-card-border text-center text-xs text-muted pb-8">
        Rate Limiter Comparison Tool — Built with FastAPI + Next.js
      </footer>
    </main>
  );
}
