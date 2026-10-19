// DARKPOOL config — single source of truth for tunables.
// Reads from environment with sensible defaults.

export const config = {
  // HTTP
  port: Number(process.env.PORT || 3000),
  publicUrl: process.env.PUBLIC_URL || "http://localhost:3000",

  // Auth
  jwtSecret: process.env.JWT_SECRET || "dev-only-secret-CHANGE-ME",
  sessionTtlMs: Number(process.env.SESSION_TTL_MS || 24 * 60 * 60 * 1000), // 24h
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),

  // Heartbeat
  heartbeatIntervalMs: Number(process.env.HEARTBEAT_INTERVAL_MS || 10_000),
  heartbeatStaleMs: Number(process.env.HEARTBEAT_STALE_MS || 30_000), // after 30s → unstable
  heartbeatOfflineMs: Number(process.env.HEARTBEAT_OFFLINE_MS || 60_000), // after 60s → offline
  gracePeriodMs: Number(process.env.GRACE_PERIOD_MS || 5 * 60_000), // don't destroy workloads for 5m

  // Resource reserves — never allocate the entire node
  cpuReserveCores: Number(process.env.CPU_RESERVE || 1),
  ramReserveMb: Number(process.env.RAM_RESERVE_MB || 1024),
  diskReserveGb: Number(process.env.DISK_RESERVE_GB || 5),

  // Scheduler
  schedulerWeights: {
    cpu: Number(process.env.SCHED_WEIGHT_CPU || 1.0),
    ram: Number(process.env.SCHED_WEIGHT_RAM || 1.0),
    disk: Number(process.env.SCHED_WEIGHT_DISK || 0.5),
    load: Number(process.env.SCHED_WEIGHT_LOAD || 0.8),
    runningCount: Number(process.env.SCHED_WEIGHT_RUNNING || 0.3),
  },

  // Overcommit (DISABLED by default — per spec)
  overcommitEnabled: process.env.OVERCOMMIT_ENABLED === "true",

  // Metrics retention
  metricsRetentionHours: Number(process.env.METRICS_RETENTION_HOURS || 24),

  // Rate limiting
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
    max: Number(process.env.RATE_LIMIT_MAX || 120),
  },
} as const;

export type Config = typeof config;
