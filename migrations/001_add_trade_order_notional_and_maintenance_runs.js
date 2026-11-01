async function addTradeOrderNotional({ dialect, execute, queryAll }) {
  if (dialect === 'postgres') {
    await execute('ALTER TABLE trade_orders ADD COLUMN IF NOT EXISTS notional DOUBLE PRECISION')
    return
  }

  const columns = await queryAll('PRAGMA table_info(trade_orders)')
  const hasColumn = (columns || []).some(item => item && item.name === 'notional')
  if (!hasColumn) {
    await execute('ALTER TABLE trade_orders ADD COLUMN notional REAL')
  }
}

async function ensureMaintenanceRuns({ dialect, execute }) {
  if (dialect === 'postgres') {
    await execute(`
      CREATE TABLE IF NOT EXISTS maintenance_runs (
        id BIGSERIAL PRIMARY KEY,
        job_name TEXT NOT NULL,
        status TEXT NOT NULL,
        detail TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await execute(`
      CREATE INDEX IF NOT EXISTS idx_maintenance_runs_job_created_at
      ON maintenance_runs(job_name, created_at DESC)
    `)
    return
  }

  await execute(`
    CREATE TABLE IF NOT EXISTS maintenance_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_maintenance_runs_job_created_at
    ON maintenance_runs(job_name, created_at DESC)
  `)
}

module.exports = {
  up: async context => {
    await addTradeOrderNotional(context)
    await ensureMaintenanceRuns(context)
  }
}
