const { getSettings, updateSettings } = require('../services/systemSettingsService')
const { getTradingParameters, updateTradingParameters } = require('../services/tradingParameterService')
const {
  getOverview,
  getMonitorEvents,
  getRecentSnapshots,
  getSnapshotTrend,
  restartSystemMonitor
} = require('../services/systemMonitorService')
const { runReconciliationOnce } = require('../services/reconciliationService')
const { addAuditLog, getAuditLogs } = require('../services/auditService')
const { sendAlertForEvent } = require('../services/alertService')
const { runMaintenanceOnce } = require('../services/dataRetentionService')
const {
  createChangeRequest,
  getChangeRequests,
  reviewChangeRequest
} = require('../services/changeRequestService')
const {
  isCriticalSystemSettingsPayload,
  isCriticalTradingParameterPayload,
  requireHighRiskAcknowledgement
} = require('../services/securityService')
const { decodeHeaderText } = require('../utils/headerText')

function getOperationReason(req) {
  const value = req?.headers?.['x-operation-reason']
  return decodeHeaderText(value)
}

async function getSystemOverview(req, res) {
  try {
    const data = await getOverview()
    res.send(data)
  } catch (error) {
    global.errorLogger('读取系统概览失败:', error)
    res.status(500).send('读取系统概览失败')
  }
}

async function getSystemSettings(req, res) {
  try {
    const data = await getSettings()
    res.send(data)
  } catch (error) {
    global.errorLogger('读取系统配置失败:', error)
    res.status(500).send('读取系统配置失败')
  }
}

async function updateSystemSettings(req, res) {
  try {
    if (isCriticalSystemSettingsPayload(req.body || {})) {
      requireHighRiskAcknowledgement(req, '更新关键系统配置')
    }
    const reason = getOperationReason(req)
    const before = await getSettings()
    const data = await updateSettings(req.body || {})
    await addAuditLog({
      action: 'update_system_settings',
      target: 'system_settings',
      req,
      beforeData: before,
      afterData: data,
      metadata: { keys: Object.keys(req.body || {}), reason }
    })
    await restartSystemMonitor()
    res.send(data)
  } catch (error) {
    global.errorLogger('更新系统配置失败:', error)
    res.status(400).send(error.message || '更新系统配置失败')
  }
}

async function getTradingSettings(req, res) {
  try {
    const data = await getTradingParameters()
    res.send(data)
  } catch (error) {
    global.errorLogger('读取交易参数失败:', error)
    res.status(500).send('读取交易参数失败')
  }
}

async function updateTradingSettings(req, res) {
  try {
    if (isCriticalTradingParameterPayload(req.body || {})) {
      requireHighRiskAcknowledgement(req, '更新关键交易参数')
    }
    const reason = getOperationReason(req)
    const before = await getTradingParameters()
    const data = await updateTradingParameters(req.body || {})
    await addAuditLog({
      action: 'update_trading_parameters',
      target: 'trading_parameters',
      req,
      beforeData: before,
      afterData: data,
      metadata: { keys: Object.keys(req.body || {}), reason }
    })
    res.send(data)
  } catch (error) {
    global.errorLogger('更新交易参数失败:', error)
    res.status(400).send(error.message || '更新交易参数失败')
  }
}

async function getSystemEvents(req, res) {
  try {
    const limit = Number(req.query.limit || 100)
    const data = await getMonitorEvents(limit)
    res.send(data)
  } catch (error) {
    global.errorLogger('读取系统事件失败:', error)
    res.status(500).send('读取系统事件失败')
  }
}

async function getSystemSnapshots(req, res) {
  try {
    const isTrendRequest = req.query.trend === '1' ||
      req.query.trend === 'true' ||
      Boolean(req.query.range || req.query.startDate || req.query.endDate || req.query.maxPoints)
    if (isTrendRequest) {
      const data = await getSnapshotTrend({
        range: req.query.range,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        maxPoints: req.query.maxPoints
      })
      res.send(data)
      return
    }
    const limit = Number(req.query.limit || 50)
    const data = await getRecentSnapshots(limit)
    res.send(data)
  } catch (error) {
    global.errorLogger('读取系统快照失败:', error)
    res.status(500).send('读取系统快照失败')
  }
}

async function getSystemAudits(req, res) {
  try {
    const limit = Number(req.query.limit || 100)
    const data = await getAuditLogs(limit)
    res.send(data)
  } catch (error) {
    global.errorLogger('读取操作审计失败:', error)
    res.status(500).send('读取操作审计失败')
  }
}

async function sendTestAlert(req, res) {
  try {
    const reason = getOperationReason(req)
    const level = req.body?.level || 'warn'
    const result = await sendAlertForEvent({
      level,
      category: 'manual_test',
      message: '手动触发测试告警',
      payload: {
        from: 'system_control',
        at: new Date().toISOString()
      }
    })
    await addAuditLog({
      action: 'send_test_alert',
      target: 'alert_channel',
      req,
      beforeData: null,
      afterData: result,
      metadata: { level, reason }
    })
    res.send(result)
  } catch (error) {
    global.errorLogger('发送测试告警失败:', error)
    res.status(500).send('发送测试告警失败')
  }
}

async function runSystemReconciliation(req, res) {
  try {
    const reason = getOperationReason(req)
    const data = await runReconciliationOnce()
    await addAuditLog({
      action: 'run_dual_write_reconciliation',
      target: 'reconciliation',
      req,
      beforeData: null,
      afterData: data,
      metadata: { reason }
    })
    res.send(data)
  } catch (error) {
    global.errorLogger('执行双写对账失败:', error)
    res.status(500).send(error.message || '执行双写对账失败')
  }
}

async function createSystemChangeRequest(req, res) {
  try {
    const reason = req.body?.reason || getOperationReason(req)
    const data = await createChangeRequest({
      requestType: req.body?.request_type,
      payload: req.body?.payload || {},
      reason,
      req
    })
    res.send(data)
  } catch (error) {
    global.errorLogger('创建变更申请失败:', error)
    res.status(400).send(error.message || '创建变更申请失败')
  }
}

async function getSystemChangeRequests(req, res) {
  try {
    const limit = Number(req.query.limit || 100)
    const status = req.query.status || ''
    const data = await getChangeRequests({ limit, status })
    res.send(data)
  } catch (error) {
    global.errorLogger('读取变更申请失败:', error)
    res.status(400).send(error.message || '读取变更申请失败')
  }
}

async function approveSystemChangeRequest(req, res) {
  try {
    requireHighRiskAcknowledgement(req, '审批通过变更申请')
    const data = await reviewChangeRequest({
      id: req.params.id,
      decision: 'approve',
      comment: req.body?.comment || '',
      req
    })
    res.send(data)
  } catch (error) {
    global.errorLogger('审批通过失败:', error)
    res.status(400).send(error.message || '审批通过失败')
  }
}

async function rejectSystemChangeRequest(req, res) {
  try {
    requireHighRiskAcknowledgement(req, '驳回变更申请')
    const data = await reviewChangeRequest({
      id: req.params.id,
      decision: 'reject',
      comment: req.body?.comment || '',
      req
    })
    res.send(data)
  } catch (error) {
    global.errorLogger('审批驳回失败:', error)
    res.status(400).send(error.message || '审批驳回失败')
  }
}

async function runSystemMaintenance(req, res) {
  try {
    requireHighRiskAcknowledgement(req, '执行系统维护')
    const reason = getOperationReason(req)
    const data = await runMaintenanceOnce()
    await addAuditLog({
      action: 'run_system_maintenance',
      target: 'maintenance',
      req,
      beforeData: null,
      afterData: data,
      metadata: { reason }
    })
    res.send(data)
  } catch (error) {
    global.errorLogger('执行系统维护失败:', error)
    res.status(400).send(error.message || '执行系统维护失败')
  }
}

module.exports = {
  getSystemOverview,
  getSystemSettings,
  updateSystemSettings,
  getSystemEvents,
  getSystemSnapshots,
  getTradingSettings,
  updateTradingSettings,
  getSystemAudits,
  sendTestAlert,
  runSystemReconciliation,
  runSystemMaintenance,
  createSystemChangeRequest,
  getSystemChangeRequests,
  approveSystemChangeRequest,
  rejectSystemChangeRequest
}
