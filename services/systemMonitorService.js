const { all, get, run } = require('../core/dbClient')
const { getAccountData } = require('./binanceContractService')
const { getSettings } = require('./systemSettingsService')
const { getRuntimeChainStatus } = require('./runtimeChainService')
const { sendAlertForEvent } = require('./alertService')
const { writePositionSnapshotRows, mirrorMonitorEventToRiskEvent } = require('./tradeJournalService')
const { formatDbDate, minutesAgo, daysAgo } = require('../utils/timeUtils')

let monitorTimer = null
let monitorRunning = false

const MAX_RECENT_SNAPSHOT_LIMIT = 2000
const DEFAULT_TREND_MAX_POINTS = 1000
const MAX_TREND_MAX_POINTS = 1000
const TREND_DIRECT_FETCH_LIMIT = 2000

function toNumber(value, defaultValue = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : defaultValue
}

function clampInteger(value, defaultValue, min, max) {
  const num = Number(value)
  const parsed = Number.isFinite(num) ? Math.floor(num) : defaultValue
  return Math.min(Math.max(parsed, min), max)
}

function normalizeDbDate(value, options = {}) {
  if (value === null || value === undefined || value === '') return ''
  if (value instanceof Date) return formatDbDate(value)
  if (typeof value === 'number' && Number.isFinite(value)) {
    return formatDbDate(new Date(value))
  }

  const text = String(value || '').trim()
  if (!text) return ''
  if (/^\d+$/.test(text)) {
    const numeric = Number(text)
    if (!Number.isFinite(numeric)) return ''
    return formatDbDate(new Date(text.length <= 10 ? numeric * 1000 : numeric))
  }

  const dbDateMatch = text.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?$/)
  if (dbDateMatch) {
    const time = dbDateMatch[2]
      ? (dbDateMatch[2].length === 5 ? `${dbDateMatch[2]}:00` : dbDateMatch[2])
      : (options.endOfDay ? '23:59:59' : '00:00:00')
    return `${dbDateMatch[1]} ${time}`
  }

  const date = new Date(text)
  if (!Number.isFinite(date.getTime())) return ''
  return formatDbDate(date)
}

function parseTrendRangeDays(range) {
  const value = String(range || '').trim().toLowerCase()
  if (value === '7d') return 7
  if (value === '30d') return 30
  if (value === '90d') return 90
  return 0
}

function downsampleRows(rows, maxPoints) {
  const list = Array.isArray(rows) ? rows : []
  const size = clampInteger(maxPoints, DEFAULT_TREND_MAX_POINTS, 1, MAX_TREND_MAX_POINTS)
  if (list.length <= size) return list
  if (size === 1) return [list[list.length - 1]]

  const result = []
  const step = (list.length - 1) / (size - 1)
  let lastIndex = -1
  for (let i = 0; i < size; i++) {
    const index = Math.round(i * step)
    if (index === lastIndex) continue
    result.push(list[index])
    lastIndex = index
  }
  if (result[result.length - 1] !== list[list.length - 1]) {
    result.push(list[list.length - 1])
  }
  return result.slice(0, size)
}

function toOpenPositions(positions = []) {
  if (!Array.isArray(positions)) return []
  return positions.filter(item => Math.abs(toNumber(item.positionAmt, 0)) > 0)
}

function buildSnapshotFromAccount(account) {
  const positions = toOpenPositions(account?.positions || [])
  const positionNotional = positions.reduce((sum, item) => {
    return sum + Math.abs(toNumber(item.notional, 0))
  }, 0)
  const walletBalance = toNumber(account?.totalWalletBalance, 0)
  const unrealizedPnl = toNumber(account?.totalUnrealizedProfit, 0)
  const marginBalance = toNumber(account?.totalMarginBalance, walletBalance + unrealizedPnl)
  const riskRatio = marginBalance > 0 ? positionNotional / marginBalance : 0

  return {
    walletBalance,
    unrealizedPnl,
    marginBalance,
    openPositions: positions.length,
    positionNotional,
    riskRatio,
    payload: {
      assets: account?.assets || [],
      positions
    }
  }
}

async function addEvent(level, category, message, payload = null) {
  const result = await run(
    `
    INSERT INTO monitor_events(level, category, message, payload)
    VALUES (?, ?, ?, ?)
    `,
    [level, category, message, payload ? JSON.stringify(payload) : null]
  )
  if (result && result.lastID) {
    mirrorMonitorEventToRiskEvent(result.lastID, { level, category, message, payload }).catch(error => {
      global.errorLogger && global.errorLogger('镜像风险事件失败:', error?.message || error)
    })
  }
  sendAlertForEvent({ level, category, message, payload }).catch(error => {
    global.errorLogger && global.errorLogger('告警发送异常:', error?.message || error)
  })
}

async function shouldEmitRiskAlert() {
  return shouldEmitCategory('risk_ratio_high', 10)
}

async function shouldEmitCategory(category, minutes = 10) {
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

async function collectSystemSnapshot() {
  const account = await getAccountData()
  if (!account) {
    const canEmit = await shouldEmitCategory('account_fetch_failed', 10)
    if (canEmit) {
      await addEvent('warn', 'account_fetch_failed', '采集账户数据失败')
    }
    return null
  }

  const snapshot = buildSnapshotFromAccount(account)
  const insertResult = await run(
    `
    INSERT INTO account_snapshots(
      wallet_balance,
      unrealized_pnl,
      margin_balance,
      open_positions,
      position_notional,
      risk_ratio,
      payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      snapshot.walletBalance,
      snapshot.unrealizedPnl,
      snapshot.marginBalance,
      snapshot.openPositions,
      snapshot.positionNotional,
      snapshot.riskRatio,
      JSON.stringify(snapshot.payload)
    ]
  )
  if (insertResult && insertResult.lastID) {
    writePositionSnapshotRows(insertResult.lastID, snapshot.payload.positions).catch(error => {
      global.errorLogger && global.errorLogger('写入持仓快照失败:', error?.message || error)
    })
  }

  const settings = await getSettings()
  if (settings.risk_control_enabled && snapshot.riskRatio > settings.max_risk_ratio) {
    const canEmit = await shouldEmitRiskAlert()
    if (canEmit) {
      await addEvent(
        'error',
        'risk_ratio_high',
        `风险比超过阈值: ${snapshot.riskRatio.toFixed(2)} > ${settings.max_risk_ratio}`,
        {
          riskRatio: snapshot.riskRatio,
          threshold: settings.max_risk_ratio
        }
      )
    }
  }
  return snapshot
}

async function getLatestSnapshot() {
  const row = await get(
    `
    SELECT id, wallet_balance, unrealized_pnl, margin_balance, open_positions, position_notional, risk_ratio, created_at
    FROM account_snapshots
    ORDER BY id DESC
    LIMIT 1
    `
  )
  return row || null
}

async function getRecentSnapshots(limit = 50) {
  const size = clampInteger(limit, 50, 1, MAX_RECENT_SNAPSHOT_LIMIT)
  return all(
    `
    SELECT id, wallet_balance, unrealized_pnl, margin_balance, open_positions, position_notional, risk_ratio, created_at
    FROM account_snapshots
    ORDER BY id DESC
    LIMIT ?
    `,
    [size]
  )
}

async function getSnapshotTrend(options = {}) {
  const maxPoints = clampInteger(options.maxPoints, DEFAULT_TREND_MAX_POINTS, 1, MAX_TREND_MAX_POINTS)
  const rangeDays = parseTrendRangeDays(options.range)
  const startDate = normalizeDbDate(options.startDate) || (rangeDays ? daysAgo(rangeDays) : '')
  const endDate = normalizeDbDate(options.endDate, { endOfDay: true }) || (startDate ? formatDbDate() : '')
  const clauses = []
  const params = []

  if (startDate) {
    clauses.push('created_at >= ?')
    params.push(startDate)
  }
  if (endDate) {
    clauses.push('created_at <= ?')
    params.push(endDate)
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const countRow = await get(
    `
    SELECT COUNT(*) AS total, MIN(id) AS min_id, MAX(id) AS max_id
    FROM account_snapshots
    ${whereClause}
    `,
    params
  )
  const total = Number(countRow?.total || 0)
  if (!total) return []

  if (maxPoints === 1) {
    return all(
      `
      SELECT id, wallet_balance, unrealized_pnl, margin_balance, open_positions, position_notional, risk_ratio, created_at
      FROM account_snapshots
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      `,
      params
    )
  }

  if (total <= TREND_DIRECT_FETCH_LIMIT) {
    const rows = await all(
      `
      SELECT id, wallet_balance, unrealized_pnl, margin_balance, open_positions, position_notional, risk_ratio, created_at
      FROM account_snapshots
      ${whereClause}
      ORDER BY id ASC
      `,
      params
    )
    return downsampleRows(rows, maxPoints).reverse()
  }

  const minId = Number(countRow?.min_id || 0)
  const maxId = Number(countRow?.max_id || 0)
  if (!Number.isFinite(minId) || !Number.isFinite(maxId) || minId <= 0 || maxId <= 0 || minId > maxId) {
    return []
  }

  const targetCount = Math.min(maxPoints, total)
  const targetIds = []
  const targetSpan = Math.max(targetCount - 1, 1)
  for (let i = 0; i < targetCount; i++) {
    const id = Math.round(minId + ((maxId - minId) * i / targetSpan))
    if (id >= minId && id <= maxId && targetIds[targetIds.length - 1] !== id) {
      targetIds.push(id)
    }
  }
  if (!targetIds.length || targetIds[0] !== minId) targetIds.unshift(minId)
  if (targetIds[targetIds.length - 1] !== maxId) targetIds.push(maxId)

  const candidateClauses = [
    'candidate.id >= targets.target_id',
    'candidate.id <= ?'
  ]
  const sampleParams = [maxId]

  const targetValues = targetIds.map(id => `(${id})`).join(', ')
  const rows = await all(
    `
    WITH targets(target_id) AS (
      VALUES ${targetValues}
    ),
    picked_snapshots AS (
      SELECT DISTINCT (
        SELECT candidate.id
        FROM account_snapshots candidate
        WHERE ${candidateClauses.join(' AND ')}
        ORDER BY candidate.id ASC
        LIMIT 1
      ) AS picked_id
      FROM targets
    )
    SELECT id, wallet_balance, unrealized_pnl, margin_balance, open_positions, position_notional, risk_ratio, created_at
    FROM account_snapshots
    WHERE id IN (
      SELECT picked_id
      FROM picked_snapshots
      WHERE picked_id IS NOT NULL
    )
    ORDER BY id DESC
    LIMIT ?
    `,
    sampleParams.concat([maxPoints])
  )
  return rows
}

async function getMonitorEvents(limit = 100) {
  const size = Math.min(Math.max(Number(limit) || 100, 1), 300)
  const rows = await all(
    `
    SELECT id, level, category, message, payload, created_at
    FROM monitor_events
    ORDER BY id DESC
    LIMIT ?
    `,
    [size]
  )
  return rows.map(item => {
    let payload = null
    if (item.payload) {
      try {
        payload = JSON.parse(item.payload)
      } catch (error) {
        payload = item.payload
      }
    }
    return {
      ...item,
      payload
    }
  })
}

async function getOverview() {
  const settings = await getSettings()
  const runtimeChain = await getRuntimeChainStatus(settings)
  const latestSnapshot = await getLatestSnapshot()
  const latestEvent = await get(
    `
    SELECT id, level, category, message, created_at
    FROM monitor_events
    ORDER BY id DESC
    LIMIT 1
    `
  )
  const lastMaintenanceRun = await get(
    `
    SELECT id, job_name, status, detail, created_at
    FROM maintenance_runs
    ORDER BY id DESC
    LIMIT 1
    `
  )
  const status = monitorTimer ? 'running' : 'stopped'
  const securityStatus = {
    tradingMode: String(process.env.TRADING_MODE || 'paper').toLowerCase(),
    liveTradingConfirmed: process.env.LIVE_TRADING_CONFIRMED === '1',
    apiTokenConfigured: Boolean(process.env.API_TOKEN),
    ipWhitelistConfigured: Boolean(String(process.env.API_IP_WHITELIST || '').trim()),
    rateLimitEnabled: String(process.env.API_RATE_LIMIT_ENABLED || '1') !== '0',
    highRiskTokenRequired: Boolean(String(process.env.HIGH_RISK_ACTION_TOKEN || '').trim()),
    highRiskAckRequired: process.env.REQUIRE_HIGH_RISK_ACK === '1'
  }
  let parsedMaintenance = null
  if (lastMaintenanceRun && lastMaintenanceRun.detail) {
    try {
      parsedMaintenance = JSON.parse(lastMaintenanceRun.detail)
    } catch (error) {
      parsedMaintenance = lastMaintenanceRun.detail
    }
  }

  return {
    status,
    settings,
    runtimeChain,
    latestSnapshot,
    latestEvent,
    securityStatus,
    lastMaintenanceRun: lastMaintenanceRun
      ? {
          ...lastMaintenanceRun,
          detail: parsedMaintenance
        }
      : null
  }
}

async function monitorTick() {
  if (monitorRunning) return
  monitorRunning = true
  try {
    const settings = await getSettings()
    if (!settings.monitor_enabled) return
    await collectSystemSnapshot()
  } catch (error) {
    global.errorLogger && global.errorLogger('系统监控任务失败:', error.message || error)
  } finally {
    monitorRunning = false
  }
}

async function startSystemMonitor() {
  const settings = await getSettings()
  const intervalMs = Math.max(settings.monitor_interval_seconds * 1000, 10000)
  if (monitorTimer) {
    clearInterval(monitorTimer)
    monitorTimer = null
  }
  monitorTimer = setInterval(monitorTick, intervalMs)
  await monitorTick()
  global.logger && global.logger.info(`系统监控已启动，间隔 ${intervalMs / 1000}s`)
}

function stopSystemMonitor() {
  if (monitorTimer) {
    clearInterval(monitorTimer)
    monitorTimer = null
  }
}

async function restartSystemMonitor() {
  stopSystemMonitor()
  await startSystemMonitor()
}

module.exports = {
  startSystemMonitor,
  stopSystemMonitor,
  restartSystemMonitor,
  getOverview,
  getMonitorEvents,
  getRecentSnapshots,
  getSnapshotTrend,
  collectSystemSnapshot
}
