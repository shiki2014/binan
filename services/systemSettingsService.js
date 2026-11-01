const { all, run } = require('../core/dbClient')
const { formatDbDate } = require('../utils/timeUtils')

const DEFAULT_SETTINGS = {
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

function parseValue(raw) {
  try {
    return JSON.parse(raw)
  } catch (error) {
    return raw
  }
}

function normalizeSettings(settings) {
  const alertMinLevel = ['info', 'warn', 'error'].includes(String(settings.alert_min_level || '').toLowerCase())
    ? String(settings.alert_min_level).toLowerCase()
    : 'error'
  const runtimePrimaryChain = ['file', 'db'].includes(String(settings.runtime_primary_chain || '').toLowerCase())
    ? String(settings.runtime_primary_chain).toLowerCase()
    : 'file'

  return {
    trading_enabled: Boolean(settings.trading_enabled),
    risk_control_enabled: Boolean(settings.risk_control_enabled),
    max_risk_ratio: Number(settings.max_risk_ratio) > 0 ? Number(settings.max_risk_ratio) : 3,
    monitor_interval_seconds: Number(settings.monitor_interval_seconds) >= 10 ? Number(settings.monitor_interval_seconds) : 60,
    monitor_enabled: Boolean(settings.monitor_enabled),
    alert_webhook_enabled: Boolean(settings.alert_webhook_enabled),
    alert_webhook_url: String(settings.alert_webhook_url || ''),
    alert_min_level: alertMinLevel,
    pnl_flash_threshold: Number(settings.pnl_flash_threshold) > 0 ? Number(settings.pnl_flash_threshold) : 100,
    runtime_primary_chain: runtimePrimaryChain,
    runtime_force_file_rollback: Boolean(settings.runtime_force_file_rollback),
    emergency_stop_enabled: Boolean(settings.emergency_stop_enabled),
    live_trade_confirm_required: Boolean(settings.live_trade_confirm_required),
    data_retention_enabled: Boolean(settings.data_retention_enabled),
    log_retention_days: Number(settings.log_retention_days) >= 1 ? Number(settings.log_retention_days) : 14,
    snapshot_retention_days: Number(settings.snapshot_retention_days) >= 1 ? Number(settings.snapshot_retention_days) : 30,
    event_retention_days: Number(settings.event_retention_days) >= 1 ? Number(settings.event_retention_days) : 30,
    audit_retention_days: Number(settings.audit_retention_days) >= 1 ? Number(settings.audit_retention_days) : 180,
    trade_order_retention_days: Number(settings.trade_order_retention_days) >= 1 ? Number(settings.trade_order_retention_days) : 180
  }
}

async function getSettings() {
  const rows = await all('SELECT key, value FROM system_settings')
  const dbSettings = {}
  for (const item of rows) {
    dbSettings[item.key] = parseValue(item.value)
  }
  return normalizeSettings({
    ...DEFAULT_SETTINGS,
    ...dbSettings
  })
}

function validateSettingsUpdate(payload = {}) {
  const output = {}

  if (Object.prototype.hasOwnProperty.call(payload, 'trading_enabled')) {
    output.trading_enabled = Boolean(payload.trading_enabled)
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'risk_control_enabled')) {
    output.risk_control_enabled = Boolean(payload.risk_control_enabled)
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'monitor_enabled')) {
    output.monitor_enabled = Boolean(payload.monitor_enabled)
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'alert_webhook_enabled')) {
    output.alert_webhook_enabled = Boolean(payload.alert_webhook_enabled)
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'emergency_stop_enabled')) {
    output.emergency_stop_enabled = Boolean(payload.emergency_stop_enabled)
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'live_trade_confirm_required')) {
    output.live_trade_confirm_required = Boolean(payload.live_trade_confirm_required)
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'data_retention_enabled')) {
    output.data_retention_enabled = Boolean(payload.data_retention_enabled)
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'alert_webhook_url')) {
    const value = String(payload.alert_webhook_url || '').trim()
    if (value && !/^https?:\/\//i.test(value)) {
      throw new Error('alert_webhook_url 必须以 http:// 或 https:// 开头')
    }
    output.alert_webhook_url = value
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'alert_min_level')) {
    const value = String(payload.alert_min_level || '').toLowerCase()
    if (!['info', 'warn', 'error'].includes(value)) {
      throw new Error('alert_min_level 必须是 info / warn / error')
    }
    output.alert_min_level = value
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'max_risk_ratio')) {
    const value = Number(payload.max_risk_ratio)
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('max_risk_ratio 必须是大于 0 的数字')
    }
    output.max_risk_ratio = value
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'monitor_interval_seconds')) {
    const value = Number(payload.monitor_interval_seconds)
    if (!Number.isInteger(value) || value < 10) {
      throw new Error('monitor_interval_seconds 必须是 >= 10 的整数')
    }
    output.monitor_interval_seconds = value
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'pnl_flash_threshold')) {
    const value = Number(payload.pnl_flash_threshold)
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('pnl_flash_threshold 必须是大于 0 的数字')
    }
    output.pnl_flash_threshold = value
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'runtime_primary_chain')) {
    const value = String(payload.runtime_primary_chain || '').trim().toLowerCase()
    if (!['file', 'db'].includes(value)) {
      throw new Error('runtime_primary_chain 必须是 file 或 db')
    }
    output.runtime_primary_chain = value
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'runtime_force_file_rollback')) {
    output.runtime_force_file_rollback = Boolean(payload.runtime_force_file_rollback)
  }
  const retentionFields = [
    'log_retention_days',
    'snapshot_retention_days',
    'event_retention_days',
    'audit_retention_days',
    'trade_order_retention_days'
  ]
  for (const field of retentionFields) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) continue
    const value = Number(payload[field])
    if (!Number.isInteger(value) || value < 1 || value > 3650) {
      throw new Error(`${field} 必须是 1 到 3650 之间的整数`)
    }
    output[field] = value
  }
  return output
}

async function updateSettings(payload = {}) {
  const updates = validateSettingsUpdate(payload)
  const entries = Object.entries(updates)
  if (!entries.length) {
    return getSettings()
  }

  const now = formatDbDate()
  for (const [key, value] of entries) {
    await run(
      `
      INSERT INTO system_settings(key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
      `,
      [key, JSON.stringify(value), now]
    )
  }
  return getSettings()
}

module.exports = {
  DEFAULT_SETTINGS,
  validateSettingsUpdate,
  getSettings,
  updateSettings
}
