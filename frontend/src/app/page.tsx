"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
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
  Clock,
  Zap,
  ShieldAlert,
  Loader2,
  Sun,
  Moon,
  Info,
  Sparkles,
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
    color: "var(--accent-cyan)",
    blockedColor: "color-mix(in srgb, var(--accent-cyan) 40%, transparent)",
    icon: Container,
  },
  sliding_window_counter: {
    label: "Sliding Window Counter",
    color: "var(--accent-violet)",
    blockedColor: "color-mix(in srgb, var(--accent-violet) 40%, transparent)",
    icon: BarChart2,
  },
  sliding_window_log: {
    label: "Sliding Window Log",
    color: "var(--accent-emerald)",
    blockedColor: "color-mix(in srgb, var(--accent-emerald) 40%, transparent)",
    icon: ScrollText,
  },
};

const ALGORITHM_NAMES: AlgorithmName[] = [
  "token_bucket",
  "sliding_window_counter",
  "sliding_window_log",
];

const PATTERN_OPTIONS = [
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
  const bucketSize = 0.5;
  const maxTime = Math.max(...response.timestamps, 0);
  const bucketCount = Math.ceil(maxTime / bucketSize) + 1;

  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    bucket: `${(i * bucketSize).toFixed(1)}s`,
    tb_allowed: 0, tb_blocked: 0,
    swc_allowed: 0, swc_blocked: 0,
    swl_allowed: 0, swl_blocked: 0,
  }));

  const keyMap = {
    token_bucket: { allowed: "tb_allowed", blocked: "tb_blocked" },
    sliding_window_counter: { allowed: "swc_allowed", blocked: "swc_blocked" },
    sliding_window_log: { allowed: "swl_allowed", blocked: "swl_blocked" },
  } as const;

  for (let i = 0; i < response.timestamps.length; i++) {
    const bucketIndex = Math.min(Math.floor(response.timestamps[i] / bucketSize), bucketCount - 1);
    for (const algo of ALGORITHM_NAMES) {
      const keys = keyMap[algo];
      if (response.results[algo][i]) {
        (buckets[bucketIndex][keys.allowed] as number) += 1;
      } else {
        (buckets[bucketIndex][keys.blocked] as number) += 1;
      }
    }
  }

  return buckets as unknown as ChartDataPoint[];
}

function generateExecutiveSummary(response: SimulationResponse) {
  const { summary } = response;
  const sortedByAllowed = [...ALGORITHM_NAMES].sort((a, b) => summary[b].allowed - summary[a].allowed);
  
  const mostLenient = sortedByAllowed[0];
  const strictest = sortedByAllowed[2];
  
  if (summary[mostLenient].allowed === summary[strictest].allowed) {
    return "All three algorithms performed identically for this traffic pattern, allowing and blocking the exact same number of requests.";
  }
  
  const diff = summary[mostLenient].allowed - summary[strictest].allowed;
  
  return `During this traffic simulation, the ${ALGORITHM_META[mostLenient].label} was the most lenient (allowing ${summary[mostLenient].allowed} requests), while the ${ALGORITHM_META[strictest].label} was the strictest (allowing only ${summary[strictest].allowed}). The difference of ${diff} requests visually highlights the architectural tradeoffs between burst-tolerance and strict window boundaries.`;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function NumberInput({ label, value, onChange, min, max, step = 1 }: any) {
  return (
    <div>
      <div className="flex justify-between items-end mb-1.5">
        <label className="text-[10px] uppercase tracking-wider text-muted font-semibold">{label}</label>
        <span className="text-[10px] text-muted/50 font-mono">Max {max}</span>
      </div>
      <div className="relative group">
        <input 
          type="number" min={min} max={max} step={step}
          value={value === 0 ? "" : value}
          onChange={(e) => {
            if (e.target.value === "") {
              onChange(0);
              return;
            }
            let val = Number(e.target.value);
            if (val > max) val = max;
            onChange(val);
          }}
          onBlur={(e) => {
            let val = Number(e.target.value);
            if (val < min) onChange(min);
          }}
          className="w-full rounded-xl border border-card-border bg-background/50 px-4 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-accent-cyan/50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none hover:bg-background group-hover:border-card-border/80"
        />
      </div>
    </div>
  );
}


function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="w-9 h-9" />;

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="p-2 rounded-full hover:bg-card-bg transition-colors ring-1 ring-card-border"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun size={18} className="text-muted" /> : <Moon size={18} className="text-muted" />}
    </button>
  );
}

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
      className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-6 transition-all duration-300 hover:border-muted/50 shadow-card hover:shadow-xl"
    >
      <div 
        className="absolute -top-10 -right-10 w-32 h-32 blur-[50px] opacity-10 pointer-events-none"
        style={{ backgroundColor: meta.color }}
      />
      
      <div className="flex items-center gap-3 mb-6 relative">
        <div className="p-2.5 rounded-xl bg-background ring-1 ring-card-border shadow-inner">
          <Icon size={20} style={{ color: meta.color }} />
        </div>
        <h3 className="text-sm font-semibold tracking-wide uppercase" style={{ color: meta.color }}>
          {meta.label}
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-5 relative">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1">Allowed</p>
          <p className="text-3xl font-light text-accent-emerald tracking-tight">{allowed}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1">Blocked</p>
          <p className="text-3xl font-light text-accent-rose tracking-tight">{blocked}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1">Total</p>
          <p className="text-3xl font-light text-foreground tracking-tight">{total}</p>
        </div>
      </div>

      <div className="space-y-2 relative">
        <div className="flex justify-between text-xs text-muted font-medium">
          <span>Allow Rate</span>
          <span style={{ color: meta.color }}>{allowRate}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-background overflow-hidden ring-1 ring-card-border shadow-inner">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${allowRate}%` }}
            transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{ backgroundColor: meta.color }}
          />
        </div>
      </div>
    </motion.div>
  );
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-xl border border-card-border bg-card-bg/95 backdrop-blur-md p-4 shadow-xl text-sm min-w-[150px]">
      <p className="font-semibold text-foreground mb-3 flex items-center gap-2">
        <Clock size={14} className="text-muted" />
        {label}
      </p>
      <div className="space-y-2">
        {payload.map((entry) => (
          <div key={entry.name} className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-muted capitalize">{entry.name}</span>
            </div>
            <span className="font-mono font-medium text-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
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
    <div className="min-h-screen bg-background text-foreground selection:bg-accent-cyan/30 overflow-hidden flex flex-col lg:flex-row transition-colors duration-300">
      
      {/* Background Ambient Glows (Only visible in dark mode via opacity-0 in light) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-0 dark:opacity-100 transition-opacity duration-700">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-accent-cyan/10 blur-[120px]" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[60%] rounded-full bg-accent-violet/10 blur-[120px]" />
        <div className="absolute -bottom-[20%] left-[20%] w-[60%] h-[40%] rounded-full bg-accent-emerald/5 blur-[120px]" />
      </div>

      {/* ── Sidebar (Controls) ─────────────────────────────────────────── */}
      <aside className="relative z-10 w-full lg:w-[400px] xl:w-[440px] shrink-0 border-r border-card-border bg-background/80 backdrop-blur-2xl flex flex-col h-auto lg:h-screen lg:overflow-y-auto transition-colors duration-300">
        <div className="p-6 md:p-8 flex-1">
          <header className="mb-10">
            <div className="flex justify-between items-start mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-card-border bg-card-bg text-[11px] font-medium tracking-wide uppercase text-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                Live Simulation
              </div>
              <ThemeToggle />
            </div>
            
            <div className="flex items-center gap-4 mb-4">
              <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-card ring-1 ring-card-border">
                <Image src="/logo.png" alt="LimitBench Logo" fill className="object-cover" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                LimitBench
              </h1>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              Professional-grade simulation environment for analyzing rate-limiting algorithms and traffic behavior in real-time.
            </p>
          </header>

          <div className="space-y-8">
            {/* Traffic Config */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted mb-4 flex items-center gap-2">
                <Activity size={14} /> Traffic Pattern
              </h2>
              <div className="space-y-5 bg-card-bg rounded-2xl p-5 border border-card-border shadow-sm">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted font-semibold mb-1.5">Pattern</label>
                  <select
                    value={request.pattern}
                    onChange={(e) => updateField("pattern", e.target.value as TrafficPattern)}
                    className="w-full rounded-xl border border-card-border bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-cyan/50 appearance-none cursor-pointer hover:border-card-border/80 transition-colors"
                  >
                    {PATTERN_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <NumberInput 
                    label="Duration (s)" 
                    value={request.duration_seconds} 
                    onChange={(v: number) => updateField("duration_seconds", v)} 
                    min={1} max={60} 
                  />
                  <NumberInput 
                    label="Base Rate (req/s)" 
                    value={request.base_rate_per_second} 
                    onChange={(v: number) => updateField("base_rate_per_second", v)} 
                    min={1} max={50} 
                  />
                </div>
                {request.pattern !== "steady" && (
                  <div>
                    <NumberInput 
                      label="Spike Multiplier" 
                      value={request.spike_multiplier} 
                      onChange={(v: number) => updateField("spike_multiplier", v)} 
                      min={2} max={20} 
                    />
                  </div>
                )}
              </div>
            </section>

            {/* Window Limits Config */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted mb-4 flex items-center gap-2">
                <Settings size={14} /> Algorithmic Limits
              </h2>
              <div className="space-y-5 bg-card-bg rounded-2xl p-5 border border-card-border shadow-sm">
                <div className="grid grid-cols-2 gap-4">
                  <NumberInput 
                    label="Window Size (s)" 
                    value={request.window_size} 
                    onChange={(v: number) => updateField("window_size", v)} 
                    min={0.1} max={60} step={0.1}
                  />
                  <NumberInput 
                    label="Limit (reqs)" 
                    value={request.limit} 
                    onChange={(v: number) => updateField("limit", v)} 
                    min={1} max={1000} 
                  />
                </div>
                <div className="w-full h-px bg-card-border my-2" />
                <div className="grid grid-cols-2 gap-4">
                  <NumberInput 
                    label="Bucket Capacity" 
                    value={request.bucket_capacity} 
                    onChange={(v: number) => updateField("bucket_capacity", v)} 
                    min={1} max={1000} 
                  />
                  <NumberInput 
                    label="Refill (tok/s)" 
                    value={request.bucket_refill_rate} 
                    onChange={(v: number) => updateField("bucket_refill_rate", v)} 
                    min={1} max={1000} 
                  />
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="p-6 md:p-8 pt-0 mt-auto sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent transition-colors duration-300">
          <button
            onClick={handleRun}
            disabled={loading}
            className="group relative w-full overflow-hidden rounded-2xl bg-foreground text-background font-semibold py-4 px-8 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100 disabled:cursor-not-allowed shadow-xl hover:shadow-2xl"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-accent-cyan/20 via-accent-violet/20 to-accent-emerald/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="relative flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Simulating Traffic...
                </>
              ) : (
                <>
                  <Play size={18} className="fill-background" />
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
        <div className="flex items-center gap-2 mb-10 border-b border-card-border pb-px">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-6 py-3 text-sm font-medium transition-all relative ${
              activeTab === "dashboard" ? "text-foreground" : "text-muted hover:text-foreground/80"
            }`}
          >
            <div className="flex items-center gap-2">
              <Server size={16} /> Visualization Dashboard
            </div>
            {activeTab === "dashboard" && (
              <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-cyan shadow-[0_0_10px_rgba(34,211,238,0.5)] dark:shadow-accent-cyan" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("theory")}
            className={`px-6 py-3 text-sm font-medium transition-all relative ${
              activeTab === "theory" ? "text-foreground" : "text-muted hover:text-foreground/80"
            }`}
          >
            <div className="flex items-center gap-2">
              <BookOpen size={16} /> Algorithm Theory
            </div>
            {activeTab === "theory" && (
              <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-violet shadow-[0_0_10px_rgba(139,92,246,0.5)] dark:shadow-accent-violet" />
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
              <div className="flex items-center gap-3 rounded-xl border border-accent-rose/20 bg-accent-rose/10 px-5 py-4 mb-8 text-sm text-accent-rose backdrop-blur-sm">
                <ShieldAlert size={18} className="shrink-0" />
                <p><strong>System Error:</strong> {error}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="max-w-6xl">
          <AnimatePresence mode="wait">
            {activeTab === "theory" ? (
              <motion.div
                key="theory"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8 text-foreground"
              >
                <div className="prose dark:prose-invert max-w-none">
                  <p className="text-lg leading-relaxed text-muted mb-8">
                    This dashboard runs identical traffic timelines through three separate rate-limiting instances in real-time. 
                    By observing how each algorithm handles traffic <strong>bursts</strong>, we can visually prove their distinct mathematical tradeoffs.
                  </p>
                  
                  {/* Token Bucket */}
                  <div className="bg-card-bg border border-card-border rounded-2xl p-6 md:p-8 relative overflow-hidden group shadow-sm">
                    <h3 className="text-2xl font-semibold text-foreground flex items-center gap-3 mb-4">
                      <Container className="text-accent-cyan" />
                      Token Bucket
                    </h3>
                    <p className="mb-6 text-muted">
                      A bucket holds up to <code className="text-accent-cyan bg-accent-cyan/10 px-1.5 py-0.5 rounded">capacity</code> tokens and is refilled continuously at a constant <code className="text-accent-cyan bg-accent-cyan/10 px-1.5 py-0.5 rounded">refill_rate</code>. Each request costs one token.
                    </p>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <Zap className="text-accent-cyan mt-1 shrink-0" size={18} />
                          <div>
                            <strong className="text-foreground block">Key Behavior: Burst Tolerance</strong>
                            It allows bursts of traffic exactly equal to its bucket capacity. Once empty, it throttles strictly to the refill rate.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sliding Window Counter */}
                  <div className="bg-card-bg border border-card-border rounded-2xl p-6 md:p-8 mt-8 relative overflow-hidden group shadow-sm">
                    <h3 className="text-2xl font-semibold text-foreground flex items-center gap-3 mb-4">
                      <BarChart2 className="text-accent-violet" />
                      Sliding Window Counter
                    </h3>
                    <p className="mb-6 text-muted">
                      Tracks request counts in fixed windows. To smooth out the boundary between windows, it mathematically blends the previous window's count based on how much time has elapsed in the current window.
                    </p>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <Activity className="text-accent-violet mt-1 shrink-0" size={18} />
                          <div>
                            <strong className="text-foreground block">Key Behavior: Approximate Smoothing</strong>
                            It assumes requests in the previous window were evenly distributed. Depending on burst timing, it can slightly overcount or undercount the true rate.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sliding Window Log */}
                  <div className="bg-card-bg border border-card-border rounded-2xl p-6 md:p-8 mt-8 relative overflow-hidden group shadow-sm">
                    <h3 className="text-2xl font-semibold text-foreground flex items-center gap-3 mb-4">
                      <ScrollText className="text-accent-emerald" />
                      Sliding Window Log
                    </h3>
                    <p className="mb-6 text-muted">
                      Maintains a precise queue (deque) of exact timestamps for every allowed request. When a new request arrives, it evicts timestamps older than the window size and counts what remains.
                    </p>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <ShieldAlert className="text-accent-emerald mt-1 shrink-0" size={18} />
                          <div>
                            <strong className="text-foreground block">Key Behavior: Strict Accuracy</strong>
                            The strictest algorithm. It never approximates and never allows bursts beyond the limit within any given trailing window.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </motion.div>
            ) : (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {!response && !loading && !error ? (
                  <div className="flex flex-col h-[50vh] justify-center p-8 md:p-12 rounded-3xl border border-card-border bg-gradient-to-br from-card-bg to-background relative overflow-hidden shadow-card">
                    <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                      <Server size={200} className="text-foreground" />
                    </div>
                    
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent-cyan/20 bg-accent-cyan/10 text-[11px] font-semibold tracking-wide uppercase text-accent-cyan w-fit mb-6">
                      <Zap size={14} /> Production Grade
                    </div>
                    
                    <h2 className="text-3xl font-bold text-foreground mb-4">
                      API Gateway & Rate Limiting Simulation
                    </h2>
                    
                    <p className="text-muted text-lg max-w-2xl leading-relaxed mb-8">
                      API gateways rely on rate limiting to prevent abuse, manage resource allocation, and mitigate DDoS attacks. This environment simulates three industry-standard algorithms in real-time, visualizing their strictness and memory tradeoffs during traffic bursts.
                    </p>
                    
                    <div className="flex items-center gap-6 text-sm text-muted font-medium flex-wrap">
                      <span className="flex items-center gap-2">
                        <Container size={16} className="text-accent-cyan" /> Token Bucket
                      </span>
                      <span className="flex items-center gap-2">
                        <BarChart2 size={16} className="text-accent-violet" /> SW Counter
                      </span>
                      <span className="flex items-center gap-2">
                        <ScrollText size={16} className="text-accent-emerald" /> SW Log
                      </span>
                    </div>
                  </div>
                ) : loading && !response ? (
                  <div className="flex flex-col items-center justify-center h-[50vh] text-center border border-card-border border-dashed rounded-3xl bg-card-bg/50">
                    <div className="w-20 h-20 rounded-full bg-background flex items-center justify-center mb-6 ring-1 ring-card-border shadow-sm">
                      <Loader2 size={32} className="text-accent-cyan animate-spin" />
                    </div>
                    <h2 className="text-xl font-semibold text-foreground mb-2">Analyzing Traffic Vectors...</h2>
                    <p className="text-muted max-w-sm">
                      Initializing simulation environment and calculating algorithmic bounds in real-time.
                    </p>
                  </div>
                ) : response ? (
                  <div className="space-y-12">
                    
                    {/* Dynamic AI Summary */}
                    <motion.section
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      <div className="bg-gradient-to-r from-accent-cyan/10 to-accent-violet/5 rounded-2xl p-6 md:p-8 border border-accent-cyan/20 relative overflow-hidden shadow-sm">
                        <div className="flex gap-4">
                          <div className="mt-1 flex-shrink-0">
                            <Sparkles className="text-accent-cyan animate-pulse" size={24} />
                          </div>
                          <div>
                            <h2 className="text-lg font-bold text-foreground mb-2 flex items-center gap-2">
                              Executive Summary
                            </h2>
                            <p className="text-muted leading-relaxed">
                              {generateExecutiveSummary(response)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.section>

                    {/* Summaries */}
                    <section>
                      <h2 className="text-sm font-semibold tracking-wide uppercase text-muted mb-6 flex items-center gap-2">
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
                      <h2 className="text-sm font-semibold tracking-wide uppercase text-muted mb-6 flex items-center gap-2">
                        <BarChart2 size={16} /> Timeline Analysis (0.5s Buckets)
                      </h2>
                      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
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
                              className="rounded-3xl border border-card-border bg-card-bg p-6 relative overflow-hidden group shadow-card"
                            >
                              <h3 className="text-sm font-medium mb-8 flex items-center gap-2 text-foreground">
                                <Icon size={16} style={{ color: meta.color }} />
                                {meta.label}
                              </h3>
                              <div className="h-[240px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={algoChartData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
                                    <XAxis 
                                      dataKey="bucket" 
                                      tick={{ fill: "var(--muted)", fontSize: 10 }} 
                                      axisLine={{ stroke: "var(--card-border)" }} 
                                      tickLine={false} 
                                      tickMargin={12}
                                      interval="preserveStartEnd" 
                                    />
                                    <YAxis 
                                      tick={{ fill: "var(--muted)", fontSize: 10 }} 
                                      axisLine={false} 
                                      tickLine={false} 
                                      tickMargin={8}
                                      allowDecimals={false} 
                                    />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--card-border)", opacity: 0.2 }} />
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
