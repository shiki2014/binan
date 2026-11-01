const axios = require('axios')
const { apiDomainContract } = require('../config/config')
const { getTradingParameters } = require('./tradingParameterService')

const DEFAULT_TREND_FILTER_CONFIG = {
  trend_filter_enabled: true,
  trend_filter_timeframe: '1d',
  trend_filter_ma_type: 'EMA',
  trend_filter_fast_period: 20,
  trend_filter_slow_period: 60,
  trend_filter_slope_lookback: 5,
  trend_filter_deadband_pct: 0.002,
  trend_filter_neutral_policy: 'allow',
  trend_filter_fail_mode: 'block'
}

const TREND_UP = 'up'
const TREND_DOWN = 'down'
const TREND_NEUTRAL = 'neutral'
const CACHE_TTL_MS = Math.max(Number(process.env.TREND_FILTER_CACHE_TTL_MS || 10 * 60 * 1000), 60 * 1000)
const trendCache = new Map()
const publicContractAxios = axios.create({
  baseURL: apiDomainContract,
  timeout: 30000
})

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
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

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeConfig(input = {}) {
  const timeframe = ['1d', '1h'].includes(normalizeText(input.trend_filter_timeframe))
    ? normalizeText(input.trend_filter_timeframe)
    : DEFAULT_TREND_FILTER_CONFIG.trend_filter_timeframe
  const maType = normalizeText(input.trend_filter_ma_type) === 'sma' ? 'SMA' : 'EMA'
  const fastPeriod = Math.max(Math.floor(toNumber(input.trend_filter_fast_period, 20)), 2)
  const slowPeriod = Math.max(Math.floor(toNumber(input.trend_filter_slow_period, 60)), fastPeriod + 1)
  const slopeLookback = Math.max(Math.floor(toNumber(input.trend_filter_slope_lookback, 5)), 1)
  const deadbandPct = Math.min(Math.max(toNumber(input.trend_filter_deadband_pct, 0.002), 0), 0.05)
  const neutralPolicy = normalizeText(input.trend_filter_neutral_policy) === 'block' ? 'block' : 'allow'
  const failMode = normalizeText(input.trend_filter_fail_mode) === 'allow' ? 'allow' : 'block'

  return {
    trend_filter_enabled: toBoolean(input.trend_filter_enabled, true),
    trend_filter_timeframe: timeframe,
    trend_filter_ma_type: maType,
    trend_filter_fast_period: fastPeriod,
    trend_filter_slow_period: slowPeriod,
    trend_filter_slope_lookback: slopeLookback,
    trend_filter_deadband_pct: deadbandPct,
    trend_filter_neutral_policy: neutralPolicy,
    trend_filter_fail_mode: failMode
  }
}

function parseKline(row) {
  if (!Array.isArray(row)) return null
  const close = Number(row[4])
  const closeTime = Number(row[6])
  if (!Number.isFinite(close) || close <= 0) return null
  return {
    close,
    closeTime: Number.isFinite(closeTime) ? closeTime : 0
  }
}

function getClosedKlines(rawKlines = []) {
  const now = Date.now()
  return (Array.isArray(rawKlines) ? rawKlines : [])
    .map(parseKline)
    .filter(item => item && (!item.closeTime || item.closeTime <= now))
}

function computeSma(values, period) {
  const result = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) {
      result[i] = sum / period
    }
  }
  return result
}

function computeEma(values, period) {
  const result = new Array(values.length).fill(null)
  if (values.length < period) return result
  let sum = 0
  for (let i = 0; i < period; i++) {
    sum += values[i]
  }
  let ema = sum / period
  result[period - 1] = ema
  const multiplier = 2 / (period + 1)
  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema
    result[i] = ema
  }
  return result
}

function computeMa(values, period, maType) {
  return maType === 'SMA' ? computeSma(values, period) : computeEma(values, period)
}

function getKlineLimit(config) {
  const warmupLimit = config.trend_filter_slow_period * 3
  const minimumLimit = config.trend_filter_slow_period + config.trend_filter_slope_lookback + 20
  return Math.min(Math.max(warmupLimit, minimumLimit, 120), 500)
}

async function fetchContractKlines(symbol, config) {
  const res = await publicContractAxios({
    method: 'get',
    url: '/fapi/v1/klines',
    params: {
      symbol,
      interval: config.trend_filter_timeframe,
      limit: getKlineLimit(config)
    }
  })
  return res?.data || []
}

function buildCacheKey(symbol, config) {
  return [
    String(symbol || '').toUpperCase(),
    config.trend_filter_timeframe,
    config.trend_filter_ma_type,
    config.trend_filter_fast_period,
    config.trend_filter_slow_period,
    config.trend_filter_slope_lookback,
    config.trend_filter_deadband_pct
  ].join('|')
}

function buildTrendDecision(symbol, config, klines) {
  const closedKlines = getClosedKlines(klines)
  const requiredLength = config.trend_filter_slow_period + config.trend_filter_slope_lookback
  if (closedKlines.length < requiredLength) {
    return {
      trend: TREND_NEUTRAL,
      reason: `K线数量不足: ${closedKlines.length} < ${requiredLength}`,
      insufficientData: true,
      details: {
        symbol,
        timeframe: config.trend_filter_timeframe,
        closedKlines: closedKlines.length,
        requiredLength
      }
    }
  }

  const closes = closedKlines.map(item => item.close)
  const fastMa = computeMa(closes, config.trend_filter_fast_period, config.trend_filter_ma_type)
  const slowMa = computeMa(closes, config.trend_filter_slow_period, config.trend_filter_ma_type)
  const lastIndex = closes.length - 1
  const slopeIndex = lastIndex - config.trend_filter_slope_lookback
  const close = closes[lastIndex]
  const fast = fastMa[lastIndex]
  const slow = slowMa[lastIndex]
  const pastSlow = slowMa[slopeIndex]

  if (![close, fast, slow, pastSlow].every(item => Number.isFinite(item) && item > 0)) {
    return {
      trend: TREND_NEUTRAL,
      reason: '均线计算结果无效',
      insufficientData: true,
      details: {
        symbol,
        close,
        fast,
        slow,
        pastSlow
      }
    }
  }

  const deadbandPct = config.trend_filter_deadband_pct
  const slope = slow - pastSlow
  const slopeThreshold = slow * deadbandPct
  const closeAboveSlow = close > slow * (1 + deadbandPct)
  const closeBelowSlow = close < slow * (1 - deadbandPct)
  const fastAboveSlow = fast > slow * (1 + deadbandPct)
  const fastBelowSlow = fast < slow * (1 - deadbandPct)
  const slowRising = slope > slopeThreshold
  const slowFalling = slope < -slopeThreshold
  let trend = TREND_NEUTRAL

  if (closeAboveSlow && fastAboveSlow && slowRising) {
    trend = TREND_UP
  } else if (closeBelowSlow && fastBelowSlow && slowFalling) {
    trend = TREND_DOWN
  }

  return {
    trend,
    reason: `trend=${trend}`,
    insufficientData: false,
    details: {
      symbol,
      timeframe: config.trend_filter_timeframe,
      maType: config.trend_filter_ma_type,
      close,
      fastMa: fast,
      slowMa: slow,
      pastSlowMa: pastSlow,
      slowSlope: slope,
      deadbandPct,
      fastPeriod: config.trend_filter_fast_period,
      slowPeriod: config.trend_filter_slow_period,
      slopeLookback: config.trend_filter_slope_lookback,
      closedKlines: closedKlines.length
    }
  }
}

async function getSymbolTrend(symbol, config) {
  const key = buildCacheKey(symbol, config)
  const cached = trendCache.get(key)
  if (cached && (Date.now() - cached.createdAt) < CACHE_TTL_MS) {
    return cached.value
  }

  const klines = await fetchContractKlines(symbol, config)
  const value = buildTrendDecision(symbol, config, klines)
  trendCache.set(key, {
    createdAt: Date.now(),
    value
  })
  return value
}

function buildFailResult(symbol, positionSide, config, reason, error = null) {
  const allowed = config.trend_filter_fail_mode === 'allow'
  return {
    allowed,
    blocked: !allowed,
    symbol,
    positionSide,
    trend: TREND_NEUTRAL,
    reason,
    details: {
      symbol,
      positionSide,
      failMode: config.trend_filter_fail_mode,
      error: error ? (error?.response?.data || error?.message || String(error)) : null
    }
  }
}

async function shouldAllowOrderByTrend({ symbol, positionSide }) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase()
  const normalizedPositionSide = String(positionSide || '').trim().toUpperCase()
  let params = null
  try {
    params = await getTradingParameters()
  } catch (error) {
    const config = normalizeConfig(DEFAULT_TREND_FILTER_CONFIG)
    return buildFailResult(normalizedSymbol, normalizedPositionSide, config, '读取趋势过滤配置失败', error)
  }
  const config = normalizeConfig(params)

  if (!config.trend_filter_enabled) {
    return {
      allowed: true,
      blocked: false,
      symbol: normalizedSymbol,
      positionSide: normalizedPositionSide,
      trend: 'disabled',
      reason: '趋势过滤未启用',
      details: { symbol: normalizedSymbol, positionSide: normalizedPositionSide }
    }
  }

  if (!normalizedSymbol || !['LONG', 'SHORT'].includes(normalizedPositionSide)) {
    return buildFailResult(normalizedSymbol, normalizedPositionSide, config, '趋势过滤参数无效')
  }

  let trendResult
  try {
    trendResult = await getSymbolTrend(normalizedSymbol, config)
  } catch (error) {
    return buildFailResult(normalizedSymbol, normalizedPositionSide, config, '趋势过滤获取K线失败', error)
  }

  if (trendResult.insufficientData) {
    return buildFailResult(normalizedSymbol, normalizedPositionSide, config, trendResult.reason)
  }

  const trend = trendResult.trend
  let blocked = false
  let reason = trendResult.reason
  if (normalizedPositionSide === 'LONG' && trend === TREND_DOWN) {
    blocked = true
    reason = '大趋势向下，禁止做多'
  } else if (normalizedPositionSide === 'SHORT' && trend === TREND_UP) {
    blocked = true
    reason = '大趋势向上，禁止做空'
  } else if (trend === TREND_NEUTRAL && config.trend_filter_neutral_policy === 'block') {
    blocked = true
    reason = '趋势中性，按配置禁止开仓'
  }

  return {
    allowed: !blocked,
    blocked,
    symbol: normalizedSymbol,
    positionSide: normalizedPositionSide,
    trend,
    reason,
    details: trendResult.details
  }
}

module.exports = {
  DEFAULT_TREND_FILTER_CONFIG,
  shouldAllowOrderByTrend,
  buildTrendDecision,
  computeEma,
  computeSma,
  normalizeConfig
}
