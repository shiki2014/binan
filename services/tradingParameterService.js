const { all, run } = require('../core/dbClient')
const { formatDbDate } = require('../utils/timeUtils')

const DEFAULT_TRADING_PARAMETERS = {
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

function parseValue(raw) {
  try {
    return JSON.parse(raw)
  } catch (error) {
    return raw
  }
}

function toBoolean(value, fallback = true) {
  if (value === true || value === false) return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  const text = String(value || '').trim().toLowerCase()
  if (text === 'true') return true
  if (text === 'false') return false
  return fallback
}

function normalizeOption(value, allowedValues, fallbackValue) {
  const text = String(value || '').trim().toLowerCase()
  return allowedValues.includes(text) ? text : fallbackValue
}

function normalizeParameters(input = {}) {
  const minOrderNotional = Number(input.min_order_notional)
  const stopTriggerBuffer = Number(input.stop_trigger_buffer)
  const maxAddOrderRatio = Number(input.max_add_order_ratio)
  const singleOrderNotionalLimit = Number(input.single_order_notional_limit)
  const dailyOrderNotionalLimit = Number(input.daily_order_notional_limit)
  const maxPositionNotionalLimit = Number(input.max_position_notional_limit)
  const trendFilterFastPeriod = Math.floor(Number(input.trend_filter_fast_period))
  const trendFilterSlowPeriod = Math.floor(Number(input.trend_filter_slow_period))
  const normalizedFastPeriod = Number.isFinite(trendFilterFastPeriod) && trendFilterFastPeriod >= 2 ? trendFilterFastPeriod : 20
  const normalizedSlowPeriod = Number.isFinite(trendFilterSlowPeriod) && trendFilterSlowPeriod > normalizedFastPeriod
    ? trendFilterSlowPeriod
    : Math.max(60, normalizedFastPeriod + 1)
  const trendFilterSlopeLookback = Math.floor(Number(input.trend_filter_slope_lookback))
  const trendFilterDeadbandPct = Number(input.trend_filter_deadband_pct)

  return {
    min_order_notional: Number.isFinite(minOrderNotional) && minOrderNotional > 0 ? minOrderNotional : 5,
    stop_trigger_buffer: Number.isFinite(stopTriggerBuffer) && stopTriggerBuffer > 0 ? stopTriggerBuffer : 0.001,
    max_add_order_ratio: Number.isFinite(maxAddOrderRatio) && maxAddOrderRatio >= 0 && maxAddOrderRatio <= 1 ? maxAddOrderRatio : 1,
    single_order_notional_limit: Number.isFinite(singleOrderNotionalLimit) && singleOrderNotionalLimit > 0 ? singleOrderNotionalLimit : 200,
    daily_order_notional_limit: Number.isFinite(dailyOrderNotionalLimit) && dailyOrderNotionalLimit > 0 ? dailyOrderNotionalLimit : 2000,
    max_position_notional_limit: Number.isFinite(maxPositionNotionalLimit) && maxPositionNotionalLimit > 0 ? maxPositionNotionalLimit : 1000,
    trend_filter_enabled: toBoolean(input.trend_filter_enabled, true),
    trend_filter_timeframe: normalizeOption(input.trend_filter_timeframe, ['1d', '1h'], '1d'),
    trend_filter_ma_type: normalizeOption(input.trend_filter_ma_type, ['ema', 'sma'], 'ema').toUpperCase(),
    trend_filter_fast_period: normalizedFastPeriod,
    trend_filter_slow_period: normalizedSlowPeriod,
    trend_filter_slope_lookback: Number.isFinite(trendFilterSlopeLookback) && trendFilterSlopeLookback >= 1 ? trendFilterSlopeLookback : 5,
    trend_filter_deadband_pct: Number.isFinite(trendFilterDeadbandPct) && trendFilterDeadbandPct >= 0 && trendFilterDeadbandPct <= 0.05 ? trendFilterDeadbandPct : 0.002,
    trend_filter_neutral_policy: normalizeOption(input.trend_filter_neutral_policy, ['allow', 'block'], 'allow'),
    trend_filter_fail_mode: normalizeOption(input.trend_filter_fail_mode, ['allow', 'block'], 'block')
  }
}

async function getTradingParameters() {
  const rows = await all('SELECT key, value FROM trading_parameters')
  const fromDb = {}
  for (const row of rows) {
    fromDb[row.key] = parseValue(row.value)
  }
  return normalizeParameters({
    ...DEFAULT_TRADING_PARAMETERS,
    ...fromDb
  })
}

function validateTradingParameterUpdate(payload = {}) {
  const output = {}

  if (Object.prototype.hasOwnProperty.call(payload, 'min_order_notional')) {
    const value = Number(payload.min_order_notional)
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('min_order_notional 必须是大于 0 的数字')
    }
    output.min_order_notional = value
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'stop_trigger_buffer')) {
    const value = Number(payload.stop_trigger_buffer)
    if (!Number.isFinite(value) || value <= 0 || value > 0.1) {
      throw new Error('stop_trigger_buffer 必须在 (0, 0.1] 范围内')
    }
    output.stop_trigger_buffer = value
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'max_add_order_ratio')) {
    const value = Number(payload.max_add_order_ratio)
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error('max_add_order_ratio 必须在 [0, 1] 范围内')
    }
    output.max_add_order_ratio = value
  }
  const positiveLimitFields = [
    'single_order_notional_limit',
    'daily_order_notional_limit',
    'max_position_notional_limit'
  ]
  for (const field of positiveLimitFields) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) continue
    const value = Number(payload[field])
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${field} 必须是大于 0 的数字`)
    }
    output[field] = value
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'trend_filter_enabled')) {
    output.trend_filter_enabled = toBoolean(payload.trend_filter_enabled, true)
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'trend_filter_timeframe')) {
    const value = normalizeOption(payload.trend_filter_timeframe, ['1d', '1h'], '')
    if (!value) {
      throw new Error('trend_filter_timeframe 必须是 1d 或 1h')
    }
    output.trend_filter_timeframe = value
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'trend_filter_ma_type')) {
    const value = normalizeOption(payload.trend_filter_ma_type, ['ema', 'sma'], '')
    if (!value) {
      throw new Error('trend_filter_ma_type 必须是 EMA 或 SMA')
    }
    output.trend_filter_ma_type = value.toUpperCase()
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'trend_filter_fast_period')) {
    const value = Number(payload.trend_filter_fast_period)
    if (!Number.isInteger(value) || value < 2 || value > 500) {
      throw new Error('trend_filter_fast_period 必须是 2 到 500 之间的整数')
    }
    output.trend_filter_fast_period = value
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'trend_filter_slow_period')) {
    const value = Number(payload.trend_filter_slow_period)
    const fastPeriod = Number(output.trend_filter_fast_period || payload.trend_filter_fast_period || DEFAULT_TRADING_PARAMETERS.trend_filter_fast_period)
    if (!Number.isInteger(value) || value <= fastPeriod || value > 500) {
      throw new Error('trend_filter_slow_period 必须是大于快线周期且不超过 500 的整数')
    }
    output.trend_filter_slow_period = value
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'trend_filter_slope_lookback')) {
    const value = Number(payload.trend_filter_slope_lookback)
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      throw new Error('trend_filter_slope_lookback 必须是 1 到 100 之间的整数')
    }
    output.trend_filter_slope_lookback = value
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'trend_filter_deadband_pct')) {
    const value = Number(payload.trend_filter_deadband_pct)
    if (!Number.isFinite(value) || value < 0 || value > 0.05) {
      throw new Error('trend_filter_deadband_pct 必须在 [0, 0.05] 范围内')
    }
    output.trend_filter_deadband_pct = value
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'trend_filter_neutral_policy')) {
    const value = normalizeOption(payload.trend_filter_neutral_policy, ['allow', 'block'], '')
    if (!value) {
      throw new Error('trend_filter_neutral_policy 必须是 allow 或 block')
    }
    output.trend_filter_neutral_policy = value
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'trend_filter_fail_mode')) {
    const value = normalizeOption(payload.trend_filter_fail_mode, ['allow', 'block'], '')
    if (!value) {
      throw new Error('trend_filter_fail_mode 必须是 allow 或 block')
    }
    output.trend_filter_fail_mode = value
  }
  return output
}

async function updateTradingParameters(payload = {}) {
  const updates = validateTradingParameterUpdate(payload)
  const entries = Object.entries(updates)
  if (!entries.length) {
    return getTradingParameters()
  }

  const now = formatDbDate()
  for (const [key, value] of entries) {
    await run(
      `
      INSERT INTO trading_parameters(key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
      `,
      [key, JSON.stringify(value), now]
    )
  }

  return getTradingParameters()
}

async function getTradingParameterValue(key, fallbackValue) {
  const params = await getTradingParameters()
  if (Object.prototype.hasOwnProperty.call(params, key)) {
    return params[key]
  }
  return fallbackValue
}

module.exports = {
  DEFAULT_TRADING_PARAMETERS,
  validateTradingParameterUpdate,
  getTradingParameters,
  updateTradingParameters,
  getTradingParameterValue
}
