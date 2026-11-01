const rateLimitBuckets = new Map()

const CRITICAL_SYSTEM_SETTING_KEYS = [
  'trading_enabled',
  'risk_control_enabled',
  'runtime_primary_chain',
  'runtime_force_file_rollback',
  'emergency_stop_enabled',
  'alert_webhook_url',
  'alert_webhook_enabled'
]

const CRITICAL_TRADING_PARAMETER_KEYS = [
  'min_order_notional',
  'single_order_notional_limit',
  'daily_order_notional_limit',
  'max_position_notional_limit',
  'stop_trigger_buffer',
  'trend_filter_enabled',
  'trend_filter_timeframe',
  'trend_filter_ma_type',
  'trend_filter_fast_period',
  'trend_filter_slow_period',
  'trend_filter_slope_lookback',
  'trend_filter_deadband_pct',
  'trend_filter_neutral_policy',
  'trend_filter_fail_mode'
]

function normalizeIp(ip) {
  return String(ip || '')
    .trim()
    .replace(/^::ffff:/, '')
}

function isLocalIp(ip) {
  const normalized = normalizeIp(ip)
  return normalized === '127.0.0.1' || normalized === '::1'
}

function getRequestIp(req) {
  return normalizeIp(
    req.ip
    || req.connection?.remoteAddress
    || req.socket?.remoteAddress
    || ''
  )
}

function getWhitelistedIps() {
  return String(process.env.API_IP_WHITELIST || '')
    .split(',')
    .map(item => normalizeIp(item))
    .filter(Boolean)
}

function isIpAllowed(req) {
  const ip = getRequestIp(req)
  if (isLocalIp(ip)) return true
  const whitelist = getWhitelistedIps()
  if (!whitelist.length) return true
  return whitelist.includes(ip)
}

function createApiRateLimitMiddleware() {
  return function apiRateLimitMiddleware(req, res, next) {
    if (String(process.env.API_RATE_LIMIT_ENABLED || '1') === '0') {
      return next()
    }
    const ip = getRequestIp(req)
    if (isLocalIp(ip)) {
      return next()
    }
    const maxRequests = Math.max(Number(process.env.API_RATE_LIMIT_MAX_REQUESTS || 300), 20)
    const windowMs = Math.max(Number(process.env.API_RATE_LIMIT_WINDOW_SECONDS || 60), 10) * 1000
    const now = Date.now()
    const bucket = rateLimitBuckets.get(ip) || { count: 0, startedAt: now }
    if ((now - bucket.startedAt) >= windowMs) {
      bucket.count = 0
      bucket.startedAt = now
    }
    bucket.count += 1
    rateLimitBuckets.set(ip, bucket)
    if (bucket.count > maxRequests) {
      return res.status(429).send('Too Many Requests')
    }
    next()
  }
}

function hasCriticalKeys(payload, keys) {
  if (!payload || typeof payload !== 'object') return false
  return keys.some(key => Object.prototype.hasOwnProperty.call(payload, key))
}

function isCriticalSystemSettingsPayload(payload) {
  return hasCriticalKeys(payload, CRITICAL_SYSTEM_SETTING_KEYS)
}

function isCriticalTradingParameterPayload(payload) {
  return hasCriticalKeys(payload, CRITICAL_TRADING_PARAMETER_KEYS)
}

function requireHighRiskAcknowledgement(req, actionName = '当前操作') {
  const forceEnabled = process.env.REQUIRE_HIGH_RISK_ACK === '1' || !!process.env.HIGH_RISK_ACTION_TOKEN
  if (!forceEnabled) return

  const token = String(req.headers['x-risk-token'] || '').trim()
  const expectedToken = String(process.env.HIGH_RISK_ACTION_TOKEN || '').trim()
  if (expectedToken) {
    if (token && token === expectedToken) {
      return
    }
    throw new Error(`${actionName} 需要有效的高风险令牌 x-risk-token`)
  }

  const ack = String(req.headers['x-risk-ack'] || '').trim().toUpperCase()
  if (ack === 'CONFIRM') {
    return
  }

  throw new Error(`${actionName} 需要高风险确认，请提供 x-risk-ack: CONFIRM 或有效的 x-risk-token`)
}

module.exports = {
  getRequestIp,
  isIpAllowed,
  createApiRateLimitMiddleware,
  isCriticalSystemSettingsPayload,
  isCriticalTradingParameterPayload,
  requireHighRiskAcknowledgement
}
