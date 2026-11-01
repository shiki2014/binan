const axios = require('axios')
const { getSettings } = require('./systemSettingsService')

const LEVEL_WEIGHT = {
  info: 1,
  warn: 2,
  error: 3
}

function normalizeLevel(level) {
  const value = String(level || 'info').toLowerCase()
  if (!LEVEL_WEIGHT[value]) return 'info'
  return value
}

function shouldSendAlert(level, minLevel) {
  const current = LEVEL_WEIGHT[normalizeLevel(level)] || 1
  const minimum = LEVEL_WEIGHT[normalizeLevel(minLevel)] || 3
  return current >= minimum
}

async function sendWebhookAlert(payload) {
  const settings = await getSettings()
  const enabled = Boolean(settings.alert_webhook_enabled)
  const url = settings.alert_webhook_url || ''
  const minLevel = settings.alert_min_level || 'error'

  if (!enabled || !url) {
    return { sent: false, reason: 'disabled_or_empty_url' }
  }
  if (!shouldSendAlert(payload.level, minLevel)) {
    return { sent: false, reason: 'below_min_level' }
  }

  await axios.post(url, payload, {
    timeout: 5000,
    headers: { 'Content-Type': 'application/json' }
  })
  return { sent: true }
}

async function sendAlertForEvent({ level, category, message, payload }) {
  const alertPayload = {
    source: 'trade-assistant',
    level: normalizeLevel(level),
    category: category || 'system',
    message: message || '',
    payload: payload || null,
    timestamp: new Date().toISOString()
  }

  try {
    return await sendWebhookAlert(alertPayload)
  } catch (error) {
    global.errorLogger && global.errorLogger('发送告警失败:', error?.response?.data || error.message || error)
    return { sent: false, reason: 'send_failed', error: error?.message || String(error) }
  }
}

module.exports = {
  sendAlertForEvent
}
