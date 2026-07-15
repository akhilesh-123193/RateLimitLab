"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import {
  Container,
  BarChart2,
  ScrollText,
  Settings,
  Play,
  Activity,
  Server,
  BookOpen,
  Info,
  Clock,
  Zap,
  ShieldAlert,
  Loader2,
} from "lucide-react";
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

const ALGORITHM_META: Record<
  AlgorithmName,
  { label: string; color: string; blockedColor: string; icon: React.ElementType }
> = {
  token_bucket: {
    label: "Token Bucket",
    color: "#22d3ee", // cyan
    blockedColor: "#0e7490",
    icon: Container,
  },
  sliding_window_counter: {
    label: "Sliding Window Counter",
    color: "#8b5cf6", // violet
    blockedColor: "#5b21b6",
    icon: BarChart2,
  },
  sliding_window_log: {
    label: "Sliding Window Log",
    color: "#34d399", // emerald
    blockedColor: "#065f46",
    icon: ScrollText,
  },
};

const ALGORITHM_NAMES: AlgorithmName[] = [
  "token_bucket",
  "sliding_window_counter",
  "sliding_window_log",
];

const PATTERN_OPTIONS: { value: TrafficPattern; label: string; description: string }[] = [
  { value: "steady", label: "Steady", description: "Constant rate of requests" },
  { value: "spike", label: "Single Spike", description: "Steady baseline + one burst" },
  { value: "double_spike", label: "Double Spike", description: "Steady baseline + two bursts" },
];

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

function buildChartData(response: SimulationResponse): ChartDataPoint[] {
  const bucketSize = 0.5; // seconds
  const maxTime = Math.max(...response.timestamps, 0);
  const bucketCount = Math.ceil(maxTime / bucketSize) + 1;

  const buckets: ChartDataPoint[] = Array.from({ length: bucketCount }, (_, i) => ({
    bucket: `${(i * bucketSize).toFixed(1)}s`,
    tb_allowed: 0, tb_blocked: 0,
    swc_allowed: 0, swc_blocked: 0,
    swl_allowed: 0, swl_blocked: 0,
  }));

  const keyMap: Record<AlgorithmName, { allowed: keyof ChartDataPoint; blocked: keyof ChartDataPoint }> = {
    token_bucket: { allowed: "tb_allowed", blocked: "tb_blocked" },
    sliding_window_counter: { allowed: "swc_allowed", blocked: "swc_blocked" },
    sliding_window_log: { allowed: "swl_allowed", blocked: "swl_blocked" },
  };

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

function SummaryCard({ name, allowed, blocked }: { name: AlgorithmName; allowed: number; blocked: number }) {
  const meta = ALGORITHM_META[name];
  const Icon = meta.icon;
  const total = allowed + blocked;
  const blockRate = total > 0 ? ((blocked / total) * 100).toFixed(1) : "0.0";
  const allowRate = total > 0 ? ((allowed / total) * 100).toFixed(1) : "0.0";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-6 backdrop-blur-xl transition-all duration-300 hover:border-white/10 hover:bg-white/[0.04] shadow-2xl"
    >
      {/* Ambient glow behind icon */}
      <div 
        className="absolute -top-10 -right-10 w-32 h-32 blur-[50px] opacity-20 pointer-events-none"
        style={{ backgroundColor: meta.color }}
      />
      
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-black/40 ring-1 ring-white/10 shadow-inner">
          <Icon size={20} color={meta.color} />
        </div>
        <h3 className="text-sm font-semibold tracking-wide uppercase" style={{ color: meta.color }}>
          {meta.label}
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-5">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1">Allowed</p>
          <p className="text-3xl font-light text-emerald-400 tracking-tight">{allowed}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1">Blocked</p>
          <p className="text-3xl font-light text-rose-400 tracking-tight">{blocked}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1">Total</p>
          <p className="text-3xl font-light text-white tracking-tight">{total}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs text-slate-400 font-medium">
          <span>Allow Rate</span>
          <span style={{ color: meta.color }}>{allowRate}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-black/40 overflow-hidden ring-1 ring-white/5 shadow-inner">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${allowRate}%` }}
            transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
            className="h-full rounded-full relative"
            style={{ backgroundColor: meta.color }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/30" />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-[#0f172a]/90 backdrop-blur-md p-4 shadow-2xl text-sm min-w-[150px]">
      <p className="font-semibold text-white mb-3 flex items-center gap-2">
        <Clock size={14} className="text-slate-400" />
        {label}
      </p>
      <div className="space-y-2">
        {payload.map((entry) => (
          <div key={entry.name} className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-slate-300 capitalize">{entry.name}</span>
            </div>
            <span className="font-mono font-medium text-white">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Theory Content Component
// ---------------------------------------------------------------------------

function AlgorithmTheory() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-8 text-slate-300"
    >
      <div className="prose prose-invert max-w-none">
        <p className="text-lg leading-relaxed text-slate-400 mb-8">
          This dashboard runs identical traffic timelines through three separate rate-limiting instances in real-time. 
          By observing how each algorithm handles traffic <strong>bursts</strong>, we can visually prove their distinct mathematical tradeoffs.
        </p>

        {/* Token Bucket */}
        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 md:p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <Container size={120} color={ALGORITHM_META.token_bucket.color} />
          </div>
          <h3 className="text-2xl font-semibold text-white flex items-center gap-3 mb-4">
            <Container className="text-cyan-400" />
            Token Bucket
          </h3>
          <p className="mb-6">
            A bucket holds up to <code className="text-cyan-300 bg-cyan-400/10 px-1.5 py-0.5 rounded">capacity</code> tokens and is refilled continuously at a constant <code className="text-cyan-300 bg-cyan-400/10 px-1.5 py-0.5 rounded">refill_rate</code>. Each request costs one token.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Zap className="text-cyan-400 mt-1 shrink-0" size={18} />
                <div>
                  <strong className="text-white block">Key Behavior: Burst Tolerance</strong>
                  It allows bursts of traffic exactly equal to its bucket capacity. Once empty, it throttles strictly to the refill rate.
                </div>
              </div>
            </div>
            <div className="bg-black/30 rounded-xl p-4 border border-white/5 font-mono text-sm">
              <div className="text-slate-400 mb-2">Complexity</div>
              <div className="flex justify-between mb-1"><span>Time:</span> <span className="text-white">O(1)</span></div>
              <div className="flex justify-between"><span>Space:</span> <span className="text-white">O(1) (2 scalars)</span></div>
            </div>
          </div>
        </div>

        {/* Sliding Window Counter */}
        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 md:p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <BarChart2 size={120} color={ALGORITHM_META.sliding_window_counter.color} />
          </div>
          <h3 className="text-2xl font-semibold text-white flex items-center gap-3 mb-4">
            <BarChart2 className="text-violet-400" />
            Sliding Window Counter
          </h3>
          <p className="mb-6">
            Tracks request counts in fixed windows. To smooth out the boundary between windows, it mathematically blends the previous window's count based on how much time has elapsed in the current window.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Activity className="text-violet-400 mt-1 shrink-0" size={18} />
                <div>
                  <strong className="text-white block">Key Behavior: Approximate Smoothing</strong>
                  It assumes requests in the previous window were evenly distributed. Depending on burst timing, it can slightly overcount or undercount the true rate.
                </div>
              </div>
            </div>
            <div className="bg-black/30 rounded-xl p-4 border border-white/5 font-mono text-sm">
              <div className="text-slate-400 mb-2">Complexity</div>
              <div className="flex justify-between mb-1"><span>Time:</span> <span className="text-white">O(1)</span></div>
              <div className="flex justify-between"><span>Space:</span> <span className="text-white">O(1) (3 scalars)</span></div>
            </div>
          </div>
        </div>

        {/* Sliding Window Log */}
        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 md:p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <ScrollText size={120} color={ALGORITHM_META.sliding_window_log.color} />
          </div>
          <h3 className="text-2xl font-semibold text-white flex items-center gap-3 mb-4">
            <ScrollText className="text-emerald-400" />
            Sliding Window Log
          </h3>
          <p className="mb-6">
            Maintains a precise queue (deque) of exact timestamps for every allowed request. When a new request arrives, it evicts timestamps older than the window size and counts what remains.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <ShieldAlert className="text-emerald-400 mt-1 shrink-0" size={18} />
                <div>
                  <strong className="text-white block">Key Behavior: Strict Accuracy</strong>
                  The strictest algorithm. It never approximates and never allows bursts beyond the limit within any given trailing window.
                </div>
              </div>
            </div>
            <div className="bg-black/30 rounded-xl p-4 border border-white/5 font-mono text-sm">
              <div className="text-slate-400 mb-2">Complexity</div>
              <div className="flex justify-between mb-1"><span>Time:</span> <span className="text-white">O(1) amortized</span></div>
              <div className="flex justify-between"><span>Space:</span> <span className="text-white">O(limit)</span></div>
            </div>
          </div>
        </div>

      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function Home() {
  const [request, setRequest] = useState<SimulationRequest>(DEFAULT_REQUEST);
  const [response, setResponse] = useState<SimulationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "theory">("dashboard");

  const handleRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await runSimulation(request);
      setResponse(data);
      setActiveTab("dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  const updateField = <K extends keyof SimulationRequest>(key: K, value: SimulationRequest[K]) => {
    setRequest((prev) => ({ ...prev, [key]: value }));
  };

  const chartData = response ? buildChartData(response) : null;

  return (
    <div className="min-h-screen bg-[#060a13] text-slate-200 selection:bg-cyan-500/30 overflow-hidden flex flex-col lg:flex-row">
      
      {/* Background Ambient Glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-cyan-900/20 blur-[120px]" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[60%] rounded-full bg-violet-900/20 blur-[120px]" />
        <div className="absolute -bottom-[20%] left-[20%] w-[60%] h-[40%] rounded-full bg-emerald-900/10 blur-[120px]" />
      </div>

      {/* ── Sidebar (Controls) ─────────────────────────────────────────── */}
      <aside className="relative z-10 w-full lg:w-[400px] xl:w-[440px] shrink-0 border-r border-white/5 bg-[#0a0f1c]/80 backdrop-blur-2xl flex flex-col h-auto lg:h-screen lg:overflow-y-auto">
        <div className="p-6 md:p-8 flex-1">
          <header className="mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-[11px] font-medium tracking-wide uppercase text-slate-300 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              Live Simulation
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-3">
              Rate Limiter<br />
              <span className="bg-gradient-to-r from-cyan-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent">Comparison</span>
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              Configure traffic patterns and algorithmic constraints, then simulate identical requests through three limiters simultaneously.
            </p>
          </header>

          <div className="space-y-8">
            {/* Traffic Config */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                <Activity size={14} /> Traffic Pattern
              </h2>
              <div className="space-y-4 bg-black/20 rounded-2xl p-4 border border-white/5">
                <div>
                  <select
                    value={request.pattern}
                    onChange={(e) => updateField("pattern", e.target.value as TrafficPattern)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 appearance-none cursor-pointer"
                  >
                    {PATTERN_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-[#0f172a]">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Duration (s)</label>
                    <input type="number" min={1} max={60}
                      value={request.duration_seconds}
                      onChange={(e) => updateField("duration_seconds", Number(e.target.value))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-shadow"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Base Rate (req/s)</label>
                    <input type="number" min={1} max={50}
                      value={request.base_rate_per_second}
                      onChange={(e) => updateField("base_rate_per_second", Number(e.target.value))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-shadow"
                    />
                  </div>
                </div>
                {request.pattern !== "steady" && (
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Spike Multiplier</label>
                    <input type="number" min={2} max={20}
                      value={request.spike_multiplier}
                      onChange={(e) => updateField("spike_multiplier", Number(e.target.value))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-shadow"
                    />
                  </div>
                )}
              </div>
            </section>

            {/* Window Limits Config */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                <Settings size={14} /> Algorithmic Limits
              </h2>
              <div className="space-y-4 bg-black/20 rounded-2xl p-4 border border-white/5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Window Size (s)</label>
                    <input type="number" min={0.1} max={10} step={0.1}
                      value={request.window_size}
                      onChange={(e) => updateField("window_size", Number(e.target.value))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Limit (reqs)</label>
                    <input type="number" min={1} max={100}
                      value={request.limit}
                      onChange={(e) => updateField("limit", Number(e.target.value))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    />
                  </div>
                </div>
                <div className="w-full h-px bg-white/5 my-2" />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Bucket Capacity</label>
                    <input type="number" min={1} max={100}
                      value={request.bucket_capacity}
                      onChange={(e) => updateField("bucket_capacity", Number(e.target.value))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Refill (tok/s)</label>
                    <input type="number" min={1} max={100}
                      value={request.bucket_refill_rate}
                      onChange={(e) => updateField("bucket_refill_rate", Number(e.target.value))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="p-6 md:p-8 pt-0 mt-auto sticky bottom-0 bg-gradient-to-t from-[#0a0f1c] via-[#0a0f1c] to-transparent">
          <button
            onClick={handleRun}
            disabled={loading}
            className="group relative w-full overflow-hidden rounded-2xl bg-white text-[#0a0f1c] font-semibold py-4 px-8 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100 disabled:cursor-not-allowed shadow-[0_0_40px_rgba(255,255,255,0.1)] hover:shadow-[0_0_60px_rgba(255,255,255,0.2)]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/20 via-violet-400/20 to-emerald-400/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="relative flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Simulating Traffic...
                </>
              ) : (
                <>
                  <Play size={18} className="fill-[#0a0f1c]" />
                  Run Simulation
                </>
              )}
            </span>
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ──────────────────────────────────────── */}
      <main className="relative z-10 flex-1 h-auto lg:h-screen lg:overflow-y-auto p-6 md:p-10 lg:p-12">
        
        {/* Tab Switcher */}
        <div className="flex items-center gap-2 mb-10 border-b border-white/5 pb-px">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-6 py-3 text-sm font-medium transition-all relative ${
              activeTab === "dashboard" ? "text-white" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <Server size={16} /> Visualization Dashboard
            </div>
            {activeTab === "dashboard" && (
              <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("theory")}
            className={`px-6 py-3 text-sm font-medium transition-all relative ${
              activeTab === "theory" ? "text-white" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <BookOpen size={16} /> Algorithm Theory
            </div>
            {activeTab === "theory" && (
              <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-400 shadow-[0_0_10px_rgba(139,92,246,0.5)]" />
            )}
          </button>
        </div>

        {/* Error Banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-5 py-4 mb-8 text-sm text-rose-300 backdrop-blur-sm">
                <ShieldAlert size={18} className="shrink-0" />
                <p><strong>System Error:</strong> {error}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="max-w-6xl">
          <AnimatePresence mode="wait">
            {activeTab === "theory" ? (
              <AlgorithmTheory key="theory" />
            ) : (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {!response && !loading && !error ? (
                  <div className="flex flex-col items-center justify-center h-[50vh] text-center border border-white/5 border-dashed rounded-3xl bg-white/[0.01]">
                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6 ring-1 ring-white/10 shadow-[0_0_50px_rgba(255,255,255,0.05)]">
                      <Activity size={32} className="text-slate-400" />
                    </div>
                    <h2 className="text-xl font-semibold text-white mb-2">Ready for Simulation</h2>
                    <p className="text-slate-400 max-w-sm">
                      Configure your traffic parameters in the sidebar and run the simulation to see the architectural tradeoffs in action.
                    </p>
                  </div>
                ) : loading && !response ? (
                  <div className="flex flex-col items-center justify-center h-[50vh] text-center border border-white/5 border-dashed rounded-3xl bg-white/[0.01]">
                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6 ring-1 ring-white/10 shadow-[0_0_50px_rgba(34,211,238,0.1)]">
                      <Loader2 size={32} className="text-cyan-400 animate-spin" />
                    </div>
                    <h2 className="text-xl font-semibold text-white mb-2">Simulating Traffic...</h2>
                    <p className="text-slate-400 max-w-sm">
                      Running algorithms and calculating results. 
                      <br /><span className="text-xs opacity-70">(Note: The first request may take ~30s if the free tier server is asleep)</span>
                    </p>
                  </div>
                ) : response ? (
                  <div className="space-y-12">
                    
                    {/* Summaries */}
                    <section>
                      <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-500 mb-6 flex items-center gap-2">
                        <Activity size={16} /> Aggregate Results
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

                    {/* Charts */}
                    <section>
                      <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-500 mb-6 flex items-center gap-2">
                        <BarChart2 size={16} /> Timeline Analysis (0.5s Buckets)
                      </h2>
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {ALGORITHM_NAMES.map((algo) => {
                          const meta = ALGORITHM_META[algo];
                          const Icon = meta.icon;
                          const algoChartData = chartData!.map((point) => {
                            const keyPrefix = algo === "token_bucket" ? "tb" : algo === "sliding_window_counter" ? "swc" : "swl";
                            return {
                              bucket: point.bucket,
                              Allowed: point[`${keyPrefix}_allowed` as keyof ChartDataPoint] as number,
                              Blocked: point[`${keyPrefix}_blocked` as keyof ChartDataPoint] as number,
                            };
                          });

                          return (
                            <motion.div
                              key={algo}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.5, delay: 0.2 }}
                              className="rounded-3xl border border-white/5 bg-black/20 p-6 backdrop-blur-sm relative overflow-hidden group hover:bg-black/30 transition-colors"
                            >
                              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                              
                              <h3 className="text-sm font-medium mb-8 flex items-center gap-2 text-white">
                                <Icon size={16} color={meta.color} />
                                {meta.label}
                              </h3>
                              <div className="h-[240px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={algoChartData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                    <XAxis 
                                      dataKey="bucket" 
                                      tick={{ fill: "#64748b", fontSize: 10 }} 
                                      axisLine={{ stroke: "#ffffff10" }} 
                                      tickLine={false} 
                                      tickMargin={12}
                                      interval="preserveStartEnd" 
                                    />
                                    <YAxis 
                                      tick={{ fill: "#64748b", fontSize: 10 }} 
                                      axisLine={false} 
                                      tickLine={false} 
                                      tickMargin={8}
                                      allowDecimals={false} 
                                    />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
                                    <Bar dataKey="Allowed" fill={meta.color} radius={[4, 4, 0, 0]} maxBarSize={24} />
                                    <Bar dataKey="Blocked" fill={meta.blockedColor} radius={[4, 4, 0, 0]} maxBarSize={24} />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
