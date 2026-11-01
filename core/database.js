const path = require('path')
const sqlite3 = require('sqlite3').verbose()
const { formatDbDate } = require('../utils/timeUtils')
const { runMigrations } = require('./migrationRunner')

let db = null

const DB_PATH = path.resolve(__dirname, '..', 'data', 'trade_assistant.db')
const DB_DIALECT = String(process.env.DB_DIALECT || 'sqlite').trim().toLowerCase()

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err)
      resolve({
        lastID: this.lastID,
        changes: this.changes
      })
    })
  })
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err)
      resolve(row)
    })
  })
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err)
      resolve(rows)
    })
  })
}

async function ensureSchema() {
  await run('PRAGMA journal_mode = WAL')
  await run('PRAGMA synchronous = NORMAL')

  await run(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS monitor_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS account_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_balance REAL NOT NULL DEFAULT 0,
      unrealized_pnl REAL NOT NULL DEFAULT 0,
      margin_balance REAL NOT NULL DEFAULT 0,
      open_positions INTEGER NOT NULL DEFAULT 0,
      position_notional REAL NOT NULL DEFAULT 0,
      risk_ratio REAL NOT NULL DEFAULT 0,
      payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await run(`
    CREATE INDEX IF NOT EXISTS idx_monitor_events_created_at
    ON monitor_events(created_at DESC)
  `)

  await run(`
    CREATE INDEX IF NOT EXISTS idx_account_snapshots_created_at
    ON account_snapshots(created_at DESC)
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS trading_parameters (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS operation_audits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      actor TEXT,
      actor_ip TEXT,
      before_data TEXT,
      after_data TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await run(`
    CREATE INDEX IF NOT EXISTS idx_operation_audits_created_at
    ON operation_audits(created_at DESC)
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS change_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await run(`
    CREATE INDEX IF NOT EXISTS idx_change_requests_status_created_at
    ON change_requests(status, created_at DESC)
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS trade_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      intent_id TEXT NOT NULL UNIQUE,
      idempotency_key TEXT,
      symbol TEXT NOT NULL,
      position_side TEXT NOT NULL,
      side TEXT NOT NULL,
      order_type TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      notional REAL,
      stop_price REAL,
      leverage INTEGER,
      trading_mode TEXT NOT NULL DEFAULT 'paper',
      status TEXT NOT NULL DEFAULT 'pending',
      exchange_order_id TEXT,
      error_code INTEGER,
      error_message TEXT,
      request_payload TEXT,
      response_payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await run(`
    CREATE INDEX IF NOT EXISTS idx_trade_orders_created_at
    ON trade_orders(created_at DESC)
  `)

  await run(`
    CREATE INDEX IF NOT EXISTS idx_trade_orders_status_created_at
    ON trade_orders(status, created_at DESC)
  `)

  const tradeOrderColumns = await all(`PRAGMA table_info(trade_orders)`)
  const hasIdempotencyKey = tradeOrderColumns.some(item => item && item.name === 'idempotency_key')
  if (!hasIdempotencyKey) {
    await run('ALTER TABLE trade_orders ADD COLUMN idempotency_key TEXT')
  }
  const hasNotional = tradeOrderColumns.some(item => item && item.name === 'notional')
  if (!hasNotional) {
    await run('ALTER TABLE trade_orders ADD COLUMN notional REAL')
  }

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_trade_orders_idempotency_key_active
    ON trade_orders(idempotency_key)
    WHERE idempotency_key IS NOT NULL AND status != 'failed'
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS position_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      position_side TEXT NOT NULL,
      position_amt REAL NOT NULL DEFAULT 0,
      entry_price REAL NOT NULL DEFAULT 0,
      mark_price REAL NOT NULL DEFAULT 0,
      unrealized_profit REAL NOT NULL DEFAULT 0,
      isolated_wallet REAL NOT NULL DEFAULT 0,
      leverage REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(snapshot_id, symbol, position_side)
    )
  `)

  await run(`
    CREATE INDEX IF NOT EXISTS idx_position_snapshots_snapshot_id
    ON position_snapshots(snapshot_id)
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS risk_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_event_id INTEGER NOT NULL UNIQUE,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await run(`
    CREATE INDEX IF NOT EXISTS idx_risk_events_created_at
    ON risk_events(created_at DESC)
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS exchange_symbols (
      symbol TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT '',
      quantity_precision INTEGER NOT NULL DEFAULT 0,
      price_precision INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await run(`
    CREATE INDEX IF NOT EXISTS idx_exchange_symbols_status
    ON exchange_symbols(status)
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS symbol_indicators (
      symbol TEXT PRIMARY KEY,
      atr REAL,
      volatility REAL,
      trend_oscillation INTEGER,
      average_amplitude REAL,
      metadata TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS symbol_lists (
      list_type TEXT NOT NULL,
      symbol TEXT NOT NULL,
      metadata TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (list_type, symbol)
    )
  `)

  await run(`
    CREATE INDEX IF NOT EXISTS idx_symbol_lists_type
    ON symbol_lists(list_type)
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS runtime_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL DEFAULT 'app',
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await run(`
    CREATE INDEX IF NOT EXISTS idx_system_logs_channel_created_at
    ON system_logs(channel, created_at DESC)
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS maintenance_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await run(`
    CREATE INDEX IF NOT EXISTS idx_maintenance_runs_job_created_at
    ON maintenance_runs(job_name, created_at DESC)
  `)
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

  const keys = Object.keys(defaults)
  for (const key of keys) {
    await run(
      `
      INSERT INTO system_settings(key, value, updated_at)
      VALUES (?, ?, ?)
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
  const tradingKeys = Object.keys(tradingDefaults)
  for (const key of tradingKeys) {
    await run(
      `
      INSERT INTO trading_parameters(key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO NOTHING
      `,
      [key, JSON.stringify(tradingDefaults[key]), now]
    )
  }
}

async function initDatabase() {
  if (DB_DIALECT === 'postgres') {
    const { initPostgresDatabase } = require('./postgresDatabase')
    await initPostgresDatabase()
    const { execute, queryAll } = require('./dbClient')
    await runMigrations({ dialect: DB_DIALECT, execute, queryAll })
    const { initRuntimeDataStore } = require('../services/runtimeDataService')
    await initRuntimeDataStore()
    return null
  }

  if (db) return db
  db = await new Promise((resolve, reject) => {
    const instance = new sqlite3.Database(DB_PATH, err => {
      if (err) return reject(err)
      resolve(instance)
    })
  })
  await ensureSchema()
  await seedDefaults()
  const { execute, queryAll } = require('./dbClient')
  await runMigrations({ dialect: DB_DIALECT, execute, queryAll })
  const { initRuntimeDataStore } = require('../services/runtimeDataService')
  await initRuntimeDataStore()
  return db
}

function getDb() {
  if (DB_DIALECT === 'postgres') {
    throw new Error('PostgreSQL 模式下请通过 core/dbClient 访问数据库连接。')
  }
  if (!db) {
    throw new Error('Database has not been initialized yet. Call initDatabase() first.')
  }
  return db
}

module.exports = {
  initDatabase,
  getDb,
  run,
  get,
  all
}
