const crypto = require('crypto')
const { run, get, all } = require('../core/dbClient')
const { formatDbDate, startOfToday } = require('../utils/timeUtils')

const TRADING_MODE = (process.env.TRADING_MODE || 'paper').toLowerCase()

function safeStringify(value) {
  if (value === undefined || value === null) return null
  try {
    return JSON.stringify(value)
  } catch (error) {
    return JSON.stringify({ error: 'STRINGIFY_FAILED' })
  }
}

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function toInt(value, fallback = 0) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.floor(num)
}

function normalizeNumberForKey(value, digits = 8) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0'
  return num.toFixed(digits)
}

function getIdempotencyWindowMinutes() {
  const parsed = toInt(process.env.ORDER_IDEMPOTENCY_WINDOW_MINUTES, 30)
  if (parsed <= 0) return 30
  return Math.min(parsed, 1440)
}

function createIntentId() {
  return `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`
}

function buildOrderIdempotencyKey({
  symbol,
  positionSide,
  side,
  orderType = 'MARKET',
  quantity,
  stopPrice,
  leverage,
  now
}) {
  const windowMinutes = getIdempotencyWindowMinutes()
  const windowMs = windowMinutes * 60 * 1000
  const timestamp = Number.isFinite(Number(now)) ? Number(now) : Date.now()
  const bucketStart = Math.floor(timestamp / windowMs) * windowMs
  const raw = [
    String(symbol || '').toUpperCase(),
    String(positionSide || '').toUpperCase(),
    String(side || '').toUpperCase(),
    String(orderType || 'MARKET').toUpperCase(),
    normalizeNumberForKey(quantity, 8),
    normalizeNumberForKey(stopPrice, 8),
    normalizeNumberForKey(leverage, 4),
    String(bucketStart),
    TRADING_MODE
  ].join('|')
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  return `${bucketStart}_${hash.slice(0, 40)}`
}

function isIdempotencyConstraintError(error) {
  if (!error) return false
  const code = String(error.code || '')
  const message = String(error.message || '')
  if (!code.includes('SQLITE_CONSTRAINT')) return false
  return message.includes('uq_trade_orders_idempotency_key_active') || message.includes('trade_orders.idempotency_key')
}

async function createOrderIntent({
  symbol,
  positionSide,
  side,
  orderType = 'MARKET',
  quantity,
  notional,
  stopPrice,
  leverage,
  requestPayload,
  idempotencyKey
}) {
  const intentId = createIntentId()
  const normalizedKey = idempotencyKey ? String(idempotencyKey) : null
  const now = formatDbDate()
  try {
    await run(
      `
      INSERT INTO trade_orders(
        intent_id,
        idempotency_key,
        symbol,
        position_side,
        side,
        order_type,
        quantity,
        notional,
        stop_price,
        leverage,
        trading_mode,
        status,
        request_payload,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `,
      [
        String(intentId),
        normalizedKey,
        String(symbol || ''),
        String(positionSide || ''),
        String(side || ''),
        String(orderType || 'MARKET'),
        toNumber(quantity, 0),
        Number.isFinite(Number(notional)) ? Number(notional) : null,
        Number.isFinite(Number(stopPrice)) ? Number(stopPrice) : null,
        Number.isFinite(Number(leverage)) ? Number(leverage) : null,
        TRADING_MODE,
        safeStringify(requestPayload),
        now
      ]
    )
  } catch (error) {
    if (normalizedKey && isIdempotencyConstraintError(error)) {
      const duplicateOrder = await get(
        `
        SELECT id, intent_id, status, exchange_order_id, created_at
        FROM trade_orders
        WHERE idempotency_key = ?
          AND status != 'failed'
        ORDER BY id DESC
        LIMIT 1
        `,
        [normalizedKey]
      )
      return {
        intentId: duplicateOrder ? String(duplicateOrder.intent_id) : '',
        duplicated: true,
        duplicateOrder: duplicateOrder || null,
        idempotencyKey: normalizedKey
      }
    }
    throw error
  }
  return {
    intentId,
    duplicated: false,
    duplicateOrder: null,
    idempotencyKey: normalizedKey
  }
}

async function completeOrderIntent(intentId, {
  status,
  exchangeOrderId,
  errorCode,
  errorMessage,
  responsePayload
}) {
  if (!intentId) return
  const now = formatDbDate()
  await run(
    `
    UPDATE trade_orders
    SET
      status = ?,
      exchange_order_id = ?,
      error_code = ?,
      error_message = ?,
      response_payload = ?,
      updated_at = ?
    WHERE intent_id = ?
    `,
    [
      String(status || 'failed'),
      exchangeOrderId !== undefined && exchangeOrderId !== null ? String(exchangeOrderId) : null,
      Number.isFinite(Number(errorCode)) ? Number(errorCode) : null,
      errorMessage ? String(errorMessage) : null,
      safeStringify(responsePayload),
      now,
      String(intentId)
    ]
  )
}

async function getTodaySubmittedNotional(statusList = ['pending', 'success', 'simulated']) {
  const statuses = Array.isArray(statusList) && statusList.length ? statusList : ['pending', 'success', 'simulated']
  const placeholders = statuses.map(() => '?').join(', ')
  const row = await get(
    `
    SELECT COALESCE(SUM(notional), 0) AS total_notional
    FROM trade_orders
    WHERE created_at >= ?
      AND status IN (${placeholders})
    `,
    [startOfToday(), ...statuses]
  )
  return toNumber(row?.total_notional, 0)
}

async function writePositionSnapshotRows(snapshotId, positions = []) {
  const snapshotKey = Number(snapshotId)
  if (!Number.isInteger(snapshotKey) || snapshotKey <= 0) return 0
  if (!Array.isArray(positions) || !positions.length) return 0

  let count = 0
  for (const item of positions) {
    const symbol = String(item?.symbol || '').trim()
    if (!symbol) continue
    const positionAmt = toNumber(item?.positionAmt, 0)
    if (Math.abs(positionAmt) <= 0) continue
    const positionSide = String(item?.positionSide || 'BOTH').toUpperCase()
    await run(
      `
      INSERT INTO position_snapshots(
        snapshot_id,
        symbol,
        position_side,
        position_amt,
        entry_price,
        mark_price,
        unrealized_profit,
        isolated_wallet,
        leverage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(snapshot_id, symbol, position_side) DO UPDATE SET
        position_amt = excluded.position_amt,
        entry_price = excluded.entry_price,
        mark_price = excluded.mark_price,
        unrealized_profit = excluded.unrealized_profit,
        isolated_wallet = excluded.isolated_wallet,
        leverage = excluded.leverage
      `,
      [
        snapshotKey,
        symbol,
        positionSide,
        positionAmt,
        toNumber(item?.entryPrice, 0),
        toNumber(item?.markPrice, 0),
        toNumber(item?.unrealizedProfit, 0),
        toNumber(item?.isolatedWallet, 0),
        toNumber(item?.leverage, 0)
      ]
    )
    count += 1
  }
  return count
}

async function mirrorMonitorEventToRiskEvent(monitorEventId, {
  level,
  category,
  message,
  payload
}) {
  const eventId = Number(monitorEventId)
  if (!Number.isInteger(eventId) || eventId <= 0) return
  await run(
    `
    INSERT INTO risk_events(
      monitor_event_id,
      level,
      category,
      message,
      payload
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(monitor_event_id) DO UPDATE SET
      level = excluded.level,
      category = excluded.category,
      message = excluded.message,
      payload = excluded.payload
    `,
    [
      eventId,
      String(level || 'info'),
      String(category || ''),
      String(message || ''),
      safeStringify(payload)
    ]
  )
}

module.exports = {
  buildOrderIdempotencyKey,
  createOrderIntent,
  completeOrderIntent,
  getTodaySubmittedNotional,
  writePositionSnapshotRows,
  mirrorMonitorEventToRiskEvent
}
