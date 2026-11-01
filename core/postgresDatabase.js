const { Pool } = require('pg')
const { formatDbDate } = require('../utils/timeUtils')

let pool = null

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === false) return value
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function buildPoolConfig() {
  const databaseUrl = process.env.DATABASE_URL || ''
  const sslEnabled = toBool(process.env.PGSSL, false) || String(process.env.PGSSLMODE || '').toLowerCase() === 'require'
  const sslRejectUnauthorized = !toBool(process.env.PGSSL_INSECURE, false)
  const config = databaseUrl
    ? { connectionString: databaseUrl }
    : {
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
        database: process.env.PGDATABASE || 'trade_assistant'
      }
  if (sslEnabled) {
    config.ssl = { rejectUnauthorized: sslRejectUnauthorized }
  }
  return config
}

async function getPool() {
  if (pool) return pool
  pool = new Pool(buildPoolConfig())
  await pool.query('SELECT 1')
  return pool
}

async function query(sql, params = [], client = null) {
  const runner = client || await getPool()
  return runner.query(sql, params)
}

async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS monitor_events (
      id BIGSERIAL PRIMARY KEY,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      payload TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS account_snapshots (
      id BIGSERIAL PRIMARY KEY,
      wallet_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
      unrealized_pnl DOUBLE PRECISION NOT NULL DEFAULT 0,
      margin_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
      open_positions INTEGER NOT NULL DEFAULT 0,
      position_notional DOUBLE PRECISION NOT NULL DEFAULT 0,
      risk_ratio DOUBLE PRECISION NOT NULL DEFAULT 0,
      payload TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await query('CREATE INDEX IF NOT EXISTS idx_monitor_events_created_at ON monitor_events(created_at DESC)')
  await query('CREATE INDEX IF NOT EXISTS idx_account_snapshots_created_at ON account_snapshots(created_at DESC)')

  await query(`
    CREATE TABLE IF NOT EXISTS trading_parameters (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS operation_audits (
      id BIGSERIAL PRIMARY KEY,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      actor TEXT,
      actor_ip TEXT,
      before_data TEXT,
      after_data TEXT,
      metadata TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await query('CREATE INDEX IF NOT EXISTS idx_operation_audits_created_at ON operation_audits(created_at DESC)')

  await query(`
    CREATE TABLE IF NOT EXISTS change_requests (
      id BIGSERIAL PRIMARY KEY,
      request_type TEXT NOT NULL,
      change_payload TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      requested_by TEXT,
      requested_ip TEXT,
      reviewed_by TEXT,
      reviewed_ip TEXT,
      review_comment TEXT,
      apply_result TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await query('CREATE INDEX IF NOT EXISTS idx_change_requests_status_created_at ON change_requests(status, created_at DESC)')

  await query(`
    CREATE TABLE IF NOT EXISTS trade_orders (
      id BIGSERIAL PRIMARY KEY,
      intent_id TEXT NOT NULL UNIQUE,
      idempotency_key TEXT,
      symbol TEXT NOT NULL,
      position_side TEXT NOT NULL,
      side TEXT NOT NULL,
      order_type TEXT NOT NULL,
      quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
      notional DOUBLE PRECISION,
      stop_price DOUBLE PRECISION,
      leverage INTEGER,
      trading_mode TEXT NOT NULL DEFAULT 'paper',
      status TEXT NOT NULL DEFAULT 'pending',
      exchange_order_id TEXT,
      error_code INTEGER,
      error_message TEXT,
      request_payload TEXT,
      response_payload TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await query('CREATE INDEX IF NOT EXISTS idx_trade_orders_created_at ON trade_orders(created_at DESC)')
  await query('CREATE INDEX IF NOT EXISTS idx_trade_orders_status_created_at ON trade_orders(status, created_at DESC)')
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_trade_orders_idempotency_key_active
    ON trade_orders(idempotency_key)
    WHERE idempotency_key IS NOT NULL AND status <> 'failed'
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS position_snapshots (
      id BIGSERIAL PRIMARY KEY,
      snapshot_id BIGINT NOT NULL,
      symbol TEXT NOT NULL,
      position_side TEXT NOT NULL,
      position_amt DOUBLE PRECISION NOT NULL DEFAULT 0,
      entry_price DOUBLE PRECISION NOT NULL DEFAULT 0,
      mark_price DOUBLE PRECISION NOT NULL DEFAULT 0,
      unrealized_profit DOUBLE PRECISION NOT NULL DEFAULT 0,
      isolated_wallet DOUBLE PRECISION NOT NULL DEFAULT 0,
      leverage DOUBLE PRECISION NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(snapshot_id, symbol, position_side)
    )
  `)
  await query('CREATE INDEX IF NOT EXISTS idx_position_snapshots_snapshot_id ON position_snapshots(snapshot_id)')

  await query(`
    CREATE TABLE IF NOT EXISTS risk_events (
      id BIGSERIAL PRIMARY KEY,
      monitor_event_id BIGINT NOT NULL UNIQUE,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      payload TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await query('CREATE INDEX IF NOT EXISTS idx_risk_events_created_at ON risk_events(created_at DESC)')

  await query(`
    CREATE TABLE IF NOT EXISTS exchange_symbols (
      symbol TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT '',
      quantity_precision INTEGER NOT NULL DEFAULT 0,
      price_precision INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await query('CREATE INDEX IF NOT EXISTS idx_exchange_symbols_status ON exchange_symbols(status)')

  await query(`
    CREATE TABLE IF NOT EXISTS symbol_indicators (
      symbol TEXT PRIMARY KEY,
      atr DOUBLE PRECISION,
      volatility DOUBLE PRECISION,
      trend_oscillation INTEGER,
      average_amplitude DOUBLE PRECISION,
      metadata TEXT,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS symbol_lists (
      list_type TEXT NOT NULL,
      symbol TEXT NOT NULL,
      metadata TEXT,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (list_type, symbol)
    )
  `)
  await query('CREATE INDEX IF NOT EXISTS idx_symbol_lists_type ON symbol_lists(list_type)')

  await query(`
    CREATE TABLE IF NOT EXISTS runtime_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id BIGSERIAL PRIMARY KEY,
      channel TEXT NOT NULL DEFAULT 'app',
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      payload TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await query('CREATE INDEX IF NOT EXISTS idx_system_logs_channel_created_at ON system_logs(channel, created_at DESC)')

  await query(`
    CREATE TABLE IF NOT EXISTS maintenance_runs (
      id BIGSERIAL PRIMARY KEY,
      job_name TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await query('CREATE INDEX IF NOT EXISTS idx_maintenance_runs_job_created_at ON maintenance_runs(job_name, created_at DESC)')
}

async function seedDefaults() {
  const now = formatDbDate()
  const defaults = {
    trading_enabled: true,
    risk_control_enabled: true,
    max_risk_ratio: 3,
    monitor_interval_seconds: 60,
    monitor_enabled: true,
    alert_webhook_enabled: false,
    alert_webhook_url: '',
    alert_min_level: 'error',
    pnl_flash_threshold: 100,
    runtime_primary_chain: 'db',
    runtime_force_file_rollback: false,
    emergency_stop_enabled: false,
    live_trade_confirm_required: true,
    data_retention_enabled: true,
    log_retention_days: 14,
    snapshot_retention_days: 30,
    event_retention_days: 30,
    audit_retention_days: 180,
    trade_order_retention_days: 180
  }

  for (const key of Object.keys(defaults)) {
    await query(
      `
      INSERT INTO system_settings(key, value, updated_at)
      VALUES ($1, $2, $3)
      ON CONFLICT(key) DO NOTHING
      `,
      [key, JSON.stringify(defaults[key]), now]
    )
  }

  const tradingDefaults = {
    min_order_notional: Number(process.env.MIN_ORDER_NOTIONAL || 5),
    stop_trigger_buffer: Number(process.env.STOP_TRIGGER_BUFFER || 0.001),
    max_add_order_ratio: 1,
    single_order_notional_limit: Number(process.env.SINGLE_ORDER_NOTIONAL_LIMIT || 200),
    daily_order_notional_limit: Number(process.env.DAILY_ORDER_NOTIONAL_LIMIT || 2000),
    max_position_notional_limit: Number(process.env.MAX_POSITION_NOTIONAL_LIMIT || 1000),
    trend_filter_enabled: process.env.TREND_FILTER_ENABLED !== '0',
    trend_filter_timeframe: process.env.TREND_FILTER_TIMEFRAME || '1d',
    trend_filter_ma_type: process.env.TREND_FILTER_MA_TYPE || 'EMA',
    trend_filter_fast_period: Number(process.env.TREND_FILTER_FAST_PERIOD || 20),
    trend_filter_slow_period: Number(process.env.TREND_FILTER_SLOW_PERIOD || 60),
    trend_filter_slope_lookback: Number(process.env.TREND_FILTER_SLOPE_LOOKBACK || 5),
    trend_filter_deadband_pct: Number(process.env.TREND_FILTER_DEADBAND_PCT || 0.002),
    trend_filter_neutral_policy: process.env.TREND_FILTER_NEUTRAL_POLICY || 'allow',
    trend_filter_fail_mode: process.env.TREND_FILTER_FAIL_MODE || 'block'
  }

  for (const key of Object.keys(tradingDefaults)) {
    await query(
      `
      INSERT INTO trading_parameters(key, value, updated_at)
      VALUES ($1, $2, $3)
      ON CONFLICT(key) DO NOTHING
      `,
      [key, JSON.stringify(tradingDefaults[key]), now]
    )
  }
}

async function initPostgresDatabase() {
  await getPool()
  await ensureSchema()
  await seedDefaults()
  return pool
}

module.exports = {
  initPostgresDatabase,
  getPool,
  query
}
