const { all, get, run } = require('../core/dbClient')
const { mirrorMonitorEventToRiskEvent, writePositionSnapshotRows } = require('./tradeJournalService')
const { minutesAgo, hoursAgo } = require('../utils/timeUtils')

let reconciliationTimer = null
let reconciliationRunning = false

function toInt(value, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.floor(num)
}

function parsePayload(raw) {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (error) {
    return raw
  }
}

async function shouldEmitCategory(category, minutes = 15) {
  const cutoff = minutesAgo(minutes)
  const row = await get(
    `
    SELECT id
    FROM monitor_events
    WHERE category = ?
      AND created_at >= ?
    ORDER BY id DESC
    LIMIT 1
    `,
    [category, cutoff]
  )
  return !row
}

async function emitReconciliationEvent(level, category, message, payload) {
  const insertRes = await run(
    `
    INSERT INTO monitor_events(level, category, message, payload)
    VALUES (?, ?, ?, ?)
    `,
    [level, category, message, payload ? JSON.stringify(payload) : null]
  )
  if (insertRes && insertRes.lastID) {
    await mirrorMonitorEventToRiskEvent(insertRes.lastID, {
      level,
      category,
      message,
      payload
    })
  }
}

async function checkPositionSnapshotConsistency(limit = 80) {
  const maxRows = Math.min(Math.max(toInt(limit, 80), 10), 200)
  const cutoff = hoursAgo(24)
  const rows = await all(
    `
    SELECT
      s.id AS snapshot_id,
      s.open_positions AS open_positions,
      COUNT(p.id) AS position_rows,
      s.payload AS payload,
      s.created_at
    FROM account_snapshots s
    LEFT JOIN position_snapshots p ON p.snapshot_id = s.id
    WHERE s.created_at >= ?
    GROUP BY s.id
    ORDER BY s.id DESC
    LIMIT ?
    `,
    [cutoff, maxRows]
  )
  const mismatches = rows.filter(item => Number(item.open_positions || 0) !== Number(item.position_rows || 0))
  let repaired = 0
  for (const item of mismatches) {
    const payload = parsePayload(item.payload)
    const positions = payload && Array.isArray(payload.positions) ? payload.positions : []
    if (!positions.length) continue
    try {
      await writePositionSnapshotRows(item.snapshot_id, positions)
      repaired += 1
    } catch (error) {
      global.errorLogger && global.errorLogger('修复 position_snapshots 失败:', error?.message || error)
    }
  }

  const rowsAfter = await all(
    `
    SELECT
      s.id AS snapshot_id,
      s.open_positions AS open_positions,
      COUNT(p.id) AS position_rows,
      s.created_at
    FROM account_snapshots s
    LEFT JOIN position_snapshots p ON p.snapshot_id = s.id
    WHERE s.created_at >= ?
    GROUP BY s.id
    ORDER BY s.id DESC
    LIMIT ?
    `,
    [cutoff, maxRows]
  )
  const mismatchesAfter = rowsAfter.filter(item => Number(item.open_positions || 0) !== Number(item.position_rows || 0))
  return {
    checked: rowsAfter.length,
    mismatches: mismatchesAfter.length,
    repaired,
    sample: mismatchesAfter.slice(0, 10)
  }
}

async function checkRiskEventMirrorConsistency(limit = 200) {
  const maxRows = Math.min(Math.max(toInt(limit, 200), 20), 500)
  const cutoff = hoursAgo(24)
  const missingRows = await all(
    `
    SELECT
      m.id,
      m.level,
      m.category,
      m.message,
      m.payload,
      m.created_at
    FROM monitor_events m
    LEFT JOIN risk_events r ON r.monitor_event_id = m.id
    WHERE m.created_at >= ?
      AND r.id IS NULL
    ORDER BY m.id DESC
    LIMIT ?
    `,
    [cutoff, maxRows]
  )

  let repaired = 0
  for (const row of missingRows) {
    try {
      await mirrorMonitorEventToRiskEvent(row.id, {
        level: row.level,
        category: row.category,
        message: row.message,
        payload: parsePayload(row.payload)
      })
      repaired += 1
    } catch (error) {
      global.errorLogger && global.errorLogger('修复 risk_events 镜像失败:', error?.message || error)
    }
  }

  const remainRows = await all(
    `
    SELECT m.id
    FROM monitor_events m
    LEFT JOIN risk_events r ON r.monitor_event_id = m.id
    WHERE m.created_at >= ?
      AND r.id IS NULL
    ORDER BY m.id DESC
    LIMIT ?
    `,
    [cutoff, maxRows]
  )

  return {
    checked: maxRows,
    mismatches: remainRows.length,
    repaired,
    sample: remainRows.slice(0, 10).map(item => item.id)
  }
}

async function checkOrderConsistency(limit = 200) {
  const createdAfter = hoursAgo(48)
  const pendingBefore = minutesAgo(10)
  const rows = await all(
    `
    SELECT
      id,
      intent_id,
      symbol,
      status,
      exchange_order_id,
      error_code,
      error_message,
      created_at
    FROM trade_orders
    WHERE created_at >= ?
      AND (
        (status = 'success' AND (exchange_order_id IS NULL OR exchange_order_id = ''))
        OR (status = 'pending' AND created_at <= ?)
      )
    ORDER BY id DESC
    LIMIT ?
    `,
    [createdAfter, pendingBefore, Math.min(Math.max(toInt(limit, 200), 20), 500)]
  )
  return {
    checked: rows.length,
    mismatches: rows.length,
    sample: rows.slice(0, 10)
  }
}

async function runReconciliationOnce() {
  const positions = await checkPositionSnapshotConsistency()
  const riskEvents = await checkRiskEventMirrorConsistency()
  const orders = await checkOrderConsistency()
  const totalMismatch = positions.mismatches + riskEvents.mismatches + orders.mismatches

  const summary = {
    checkedAt: new Date().toISOString(),
    totalMismatch,
    orders,
    positions,
    riskEvents
  }

  if (totalMismatch > 0) {
    const canEmit = await shouldEmitCategory('dual_write_reconcile_mismatch', 10)
    if (canEmit) {
      await emitReconciliationEvent(
        'warn',
        'dual_write_reconcile_mismatch',
        `双写对账异常: orders=${orders.mismatches}, positions=${positions.mismatches}, risk_events=${riskEvents.mismatches}`,
        summary
      )
    }
  } else {
    const canEmit = await shouldEmitCategory('dual_write_reconcile_ok', 360)
    if (canEmit) {
      await emitReconciliationEvent(
        'info',
        'dual_write_reconcile_ok',
        '双写对账通过',
        summary
      )
    }
  }

  return summary
}

async function reconciliationTick() {
  if (reconciliationRunning) return
  reconciliationRunning = true
  try {
    await runReconciliationOnce()
  } catch (error) {
    global.errorLogger && global.errorLogger('双写对账任务失败:', error?.message || error)
  } finally {
    reconciliationRunning = false
  }
}

async function startReconciliationMonitor() {
  const intervalSeconds = Math.max(toInt(process.env.RECONCILIATION_INTERVAL_SECONDS, 300), 60)
  if (reconciliationTimer) {
    clearInterval(reconciliationTimer)
    reconciliationTimer = null
  }
  reconciliationTimer = setInterval(reconciliationTick, intervalSeconds * 1000)
  await reconciliationTick()
  global.logger && global.logger.info(`双写对账任务已启动，间隔 ${intervalSeconds}s`)
}

function stopReconciliationMonitor() {
  if (reconciliationTimer) {
    clearInterval(reconciliationTimer)
    reconciliationTimer = null
  }
}

module.exports = {
  startReconciliationMonitor,
  stopReconciliationMonitor,
  runReconciliationOnce
}
