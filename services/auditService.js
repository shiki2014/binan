const { all, run } = require('../core/dbClient')
const { decodeHeaderText } = require('../utils/headerText')

function safeStringify(value) {
  if (value === undefined) return null
  try {
    return JSON.stringify(value)
  } catch (error) {
    return JSON.stringify({ error: 'STRINGIFY_FAILED' })
  }
}

function getRequestActor(req) {
  if (!req) {
    return {
      actor: 'system',
      actorIp: ''
    }
  }
  const actorHeader = req.headers['x-operator'] || req.headers['x-actor'] || ''
  const actor = decodeHeaderText(actorHeader) || 'api_user'
  const actorIp = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || ''
  return { actor, actorIp }
}

async function addAuditLog({ action, target, req, beforeData, afterData, metadata }) {
  const { actor, actorIp } = getRequestActor(req)
  await run(
    `
    INSERT INTO operation_audits(
      action,
      target,
      actor,
      actor_ip,
      before_data,
      after_data,
      metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      action,
      target,
      actor,
      actorIp,
      safeStringify(beforeData),
      safeStringify(afterData),
      safeStringify(metadata)
    ]
  )
}

function parseJson(raw) {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (error) {
    return raw
  }
}

async function getAuditLogs(limit = 100) {
  const size = Math.min(Math.max(Number(limit) || 100, 1), 300)
  const rows = await all(
    `
    SELECT id, action, target, actor, actor_ip, before_data, after_data, metadata, created_at
    FROM operation_audits
    ORDER BY id DESC
    LIMIT ?
    `,
    [size]
  )
  return rows.map(item => ({
    ...item,
    before_data: parseJson(item.before_data),
    after_data: parseJson(item.after_data),
    metadata: parseJson(item.metadata)
  }))
}

module.exports = {
  addAuditLog,
  getAuditLogs
}
