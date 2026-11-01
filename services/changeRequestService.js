const { all, get, run } = require('../core/dbClient')
const { getSettings, updateSettings, validateSettingsUpdate } = require('./systemSettingsService')
const {
  getTradingParameters,
  updateTradingParameters,
  validateTradingParameterUpdate
} = require('./tradingParameterService')
const { restartSystemMonitor } = require('./systemMonitorService')
const { addAuditLog } = require('./auditService')
const { decodeHeaderText } = require('../utils/headerText')

const CHANGE_REQUEST_TYPES = {
  system_settings: 'system_settings',
  trading_parameters: 'trading_parameters'
}

const CHANGE_REQUEST_STATUSES = {
  pending: 'pending',
  applied: 'applied',
  rejected: 'rejected',
  failed: 'failed'
}

function parseJson(raw) {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (error) {
    return raw
  }
}

function safeStringify(value) {
  if (value === undefined || value === null) return null
  try {
    return JSON.stringify(value)
  } catch (error) {
    return JSON.stringify({ error: 'STRINGIFY_FAILED' })
  }
}

function normalizeRequestType(value) {
  const type = String(value || '').trim().toLowerCase()
  if (!CHANGE_REQUEST_TYPES[type]) {
    throw new Error('request_type 必须是 system_settings 或 trading_parameters')
  }
  return type
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase()
  if (!status) return ''
  if (!CHANGE_REQUEST_STATUSES[status]) {
    throw new Error('status 必须是 pending / applied / rejected / failed')
  }
  return status
}

function normalizeReviewDecision(value) {
  const decision = String(value || '').trim().toLowerCase()
  if (decision !== 'approve' && decision !== 'reject') {
    throw new Error('decision 必须是 approve 或 reject')
  }
  return decision
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

function normalizeId(id) {
  const requestId = Number(id)
  if (!Number.isInteger(requestId) || requestId <= 0) {
    throw new Error('无效的申请ID')
  }
  return requestId
}

function toResponse(row) {
  if (!row) return null
  return {
    ...row,
    change_payload: parseJson(row.change_payload),
    apply_result: parseJson(row.apply_result)
  }
}

function validateReason(reason) {
  const text = String(reason || '').trim()
  if (text.length < 4) {
    throw new Error('reason 至少需要 4 个字符')
  }
  return text
}

function validateChangePayload(requestType, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('payload 必须是对象')
  }
  let validated = {}
  if (requestType === CHANGE_REQUEST_TYPES.system_settings) {
    validated = validateSettingsUpdate(payload)
  } else if (requestType === CHANGE_REQUEST_TYPES.trading_parameters) {
    validated = validateTradingParameterUpdate(payload)
  }
  if (!Object.keys(validated).length) {
    throw new Error('申请内容为空或无有效字段')
  }
  return validated
}

async function getRawRequestById(id) {
  return get(
    `
    SELECT
      id,
      request_type,
      change_payload,
      reason,
      status,
      requested_by,
      requested_ip,
      reviewed_by,
      reviewed_ip,
      review_comment,
      apply_result,
      created_at,
      updated_at
    FROM change_requests
    WHERE id = ?
    LIMIT 1
    `,
    [id]
  )
}

async function createChangeRequest({ requestType, payload, reason, req }) {
  const type = normalizeRequestType(requestType)
  const validatedPayload = validateChangePayload(type, payload)
  const normalizedReason = validateReason(reason)
  const { actor, actorIp } = getRequestActor(req)

  const result = await run(
    `
    INSERT INTO change_requests(
      request_type,
      change_payload,
      reason,
      status,
      requested_by,
      requested_ip,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `,
    [
      type,
      safeStringify(validatedPayload),
      normalizedReason,
      CHANGE_REQUEST_STATUSES.pending,
      actor,
      actorIp
    ]
  )

  const row = await getRawRequestById(result.lastID)
  const response = toResponse(row)
  await addAuditLog({
    action: 'create_change_request',
    target: 'change_request',
    req,
    beforeData: null,
    afterData: response,
    metadata: {
      requestId: response.id,
      request_type: response.request_type,
      keys: Object.keys(validatedPayload),
      reason: normalizedReason
    }
  })
  return response
}

async function getChangeRequests({ limit = 100, status = '' } = {}) {
  const size = Math.min(Math.max(Number(limit) || 100, 1), 300)
  const normalizedStatus = normalizeStatus(status)
  const params = []
  let sql = `
    SELECT
      id,
      request_type,
      change_payload,
      reason,
      status,
      requested_by,
      requested_ip,
      reviewed_by,
      reviewed_ip,
      review_comment,
      apply_result,
      created_at,
      updated_at
    FROM change_requests
  `
  if (normalizedStatus) {
    sql += ' WHERE status = ?'
    params.push(normalizedStatus)
  }
  sql += ' ORDER BY id DESC LIMIT ?'
  params.push(size)
  const rows = await all(sql, params)
  return rows.map(toResponse)
}

async function updateRequestReview({
  id,
  status,
  reviewedBy,
  reviewedIp,
  reviewComment,
  applyResult
}) {
  await run(
    `
    UPDATE change_requests
    SET
      status = ?,
      reviewed_by = ?,
      reviewed_ip = ?,
      review_comment = ?,
      apply_result = ?,
      updated_at = datetime('now')
    WHERE id = ?
    `,
    [status, reviewedBy, reviewedIp, reviewComment || '', safeStringify(applyResult), id]
  )
  return getRawRequestById(id)
}

async function reviewChangeRequest({ id, decision, comment, req }) {
  const requestId = normalizeId(id)
  const normalizedDecision = normalizeReviewDecision(decision)
  const reviewComment = String(comment || '').trim()
  const rawRequest = await getRawRequestById(requestId)
  if (!rawRequest) {
    throw new Error('变更申请不存在')
  }
  if (rawRequest.status !== CHANGE_REQUEST_STATUSES.pending) {
    throw new Error(`该申请当前状态为 ${rawRequest.status}，无法重复审批`)
  }

  const { actor, actorIp } = getRequestActor(req)
  const beforeRequest = toResponse(rawRequest)

  if (normalizedDecision === 'reject') {
    const rejectedRow = await updateRequestReview({
      id: requestId,
      status: CHANGE_REQUEST_STATUSES.rejected,
      reviewedBy: actor,
      reviewedIp: actorIp,
      reviewComment,
      applyResult: {
        ok: false,
        message: '审批驳回'
      }
    })
    const response = toResponse(rejectedRow)
    await addAuditLog({
      action: 'reject_change_request',
      target: 'change_request',
      req,
      beforeData: beforeRequest,
      afterData: response,
      metadata: {
        requestId,
        reviewComment
      }
    })
    return response
  }

  const requestType = normalizeRequestType(rawRequest.request_type)
  const payload = validateChangePayload(requestType, parseJson(rawRequest.change_payload))
  let beforeData = null
  let afterData = null

  try {
    if (requestType === CHANGE_REQUEST_TYPES.system_settings) {
      beforeData = await getSettings()
      afterData = await updateSettings(payload)
      await restartSystemMonitor()
    } else if (requestType === CHANGE_REQUEST_TYPES.trading_parameters) {
      beforeData = await getTradingParameters()
      afterData = await updateTradingParameters(payload)
    }
  } catch (error) {
    const failedRow = await updateRequestReview({
      id: requestId,
      status: CHANGE_REQUEST_STATUSES.failed,
      reviewedBy: actor,
      reviewedIp: actorIp,
      reviewComment,
      applyResult: {
        ok: false,
        message: error.message || '执行失败'
      }
    })
    const failedResponse = toResponse(failedRow)
    await addAuditLog({
      action: 'apply_change_request_failed',
      target: requestType,
      req,
      beforeData: beforeData || beforeRequest,
      afterData: failedResponse,
      metadata: {
        requestId,
        reviewComment,
        error: error.message || String(error)
      }
    })
    throw error
  }

  const appliedRow = await updateRequestReview({
    id: requestId,
    status: CHANGE_REQUEST_STATUSES.applied,
    reviewedBy: actor,
    reviewedIp: actorIp,
    reviewComment,
    applyResult: {
      ok: true,
      keys: Object.keys(payload)
    }
  })
  const response = toResponse(appliedRow)
  await addAuditLog({
    action: 'approve_change_request',
    target: 'change_request',
    req,
    beforeData: beforeRequest,
    afterData: response,
    metadata: {
      requestId,
      reviewComment
    }
  })
  await addAuditLog({
    action: 'apply_change_request',
    target: requestType,
    req,
    beforeData,
    afterData,
    metadata: {
      requestId,
      keys: Object.keys(payload),
      reviewComment
    }
  })
  return response
}

module.exports = {
  CHANGE_REQUEST_STATUSES,
  CHANGE_REQUEST_TYPES,
  createChangeRequest,
  getChangeRequests,
  reviewChangeRequest
}
