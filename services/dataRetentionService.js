const fs = require('fs')
const path = require('path')
const { execute, queryOne } = require('../core/dbClient')
const { getSettings } = require('./systemSettingsService')
const { daysAgo, formatDbDate } = require('../utils/timeUtils')

const ARCHIVE_DIR = path.resolve(__dirname, '..', 'data', 'archive', 'legacy-runtime')
const LEGACY_FILES = [
  path.resolve(__dirname, '..', 'data', 'data.json'),
  path.resolve(__dirname, '..', 'data', 'ATR.json'),
  path.resolve(__dirname, '..', 'data', 'volatility.json'),
  path.resolve(__dirname, '..', 'data', 'trendOscillation.json'),
  path.resolve(__dirname, '..', 'data', 'blackList.json'),
  path.resolve(__dirname, '..', 'data', 'whiteList.json'),
  path.resolve(__dirname, '..', 'data', 'equity.json'),
  path.resolve(__dirname, '..', 'logs', 'app.log'),
  path.resolve(__dirname, '..', 'logs', 'error.log')
]
const ARCHIVE_STATE_KEY = 'legacy_runtime_archived_at'

let retentionTimer = null
let retentionRunning = false

function safeStringify(value) {
  try {
    return JSON.stringify(value)
  } catch (error) {
    return JSON.stringify({ error: 'STRINGIFY_FAILED' })
  }
}

function toInt(value, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.floor(parsed)
}

async function recordMaintenanceRun(jobName, status, detail) {
  await execute(
    `
    INSERT INTO maintenance_runs(job_name, status, detail, created_at)
    VALUES (?, ?, ?, ?)
    `,
    [
      String(jobName || 'maintenance'),
      String(status || 'ok'),
      safeStringify(detail),
      formatDbDate()
    ]
  ).catch(() => {})
}

async function deleteByRetention(tableName, days, columnName = 'created_at') {
  const retentionDays = Math.max(toInt(days, 1), 1)
  const cutoff = daysAgo(retentionDays)
  const result = await execute(
    `DELETE FROM ${tableName} WHERE ${columnName} < ?`,
    [cutoff]
  )
  return {
    tableName,
    retentionDays,
    cutoff,
    deleted: Number(result?.changes || 0)
  }
}

async function runDataRetention() {
  const settings = await getSettings()
  if (!settings.data_retention_enabled) {
    const summary = {
      skipped: true,
      reason: 'data_retention_disabled'
    }
    await recordMaintenanceRun('data_retention', 'skipped', summary)
    return summary
  }

  const summaries = []
  summaries.push(await deleteByRetention('system_logs', settings.log_retention_days))
  summaries.push(await deleteByRetention('position_snapshots', settings.snapshot_retention_days))
  summaries.push(await deleteByRetention('account_snapshots', settings.snapshot_retention_days))
  summaries.push(await deleteByRetention('monitor_events', settings.event_retention_days))
  summaries.push(await deleteByRetention('risk_events', settings.event_retention_days))
  summaries.push(await deleteByRetention('operation_audits', settings.audit_retention_days))
  summaries.push(await deleteByRetention('maintenance_runs', settings.audit_retention_days))
  summaries.push(await deleteByRetention('change_requests', settings.audit_retention_days))
  summaries.push(await deleteByRetention('trade_orders', settings.trade_order_retention_days))

  const summary = {
    skipped: false,
    ranAt: new Date().toISOString(),
    summaries,
    totalDeleted: summaries.reduce((sum, item) => sum + Number(item.deleted || 0), 0)
  }
  await recordMaintenanceRun('data_retention', 'ok', summary)
  return summary
}

async function hasArchivedLegacyFiles() {
  const row = await queryOne(
    `
    SELECT value
    FROM runtime_state
    WHERE key = ?
    LIMIT 1
    `,
    [ARCHIVE_STATE_KEY]
  ).catch(() => null)
  return !!row
}

async function markLegacyArchived(detail) {
  await execute(
    `
    INSERT INTO runtime_state(key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
    `,
    [ARCHIVE_STATE_KEY, safeStringify(detail), formatDbDate()]
  )
}

async function archiveLegacyFiles() {
  if (await hasArchivedLegacyFiles()) {
    return {
      skipped: true,
      reason: 'already_archived'
    }
  }

  const existingFiles = LEGACY_FILES.filter(filePath => fs.existsSync(filePath))
  if (!existingFiles.length) {
    const summary = {
      skipped: true,
      reason: 'no_legacy_files'
    }
    await recordMaintenanceRun('legacy_archive', 'skipped', summary)
    return summary
  }

  const stamp = formatDbDate().replace(/[: ]/g, '-')
  const targetDir = path.join(ARCHIVE_DIR, stamp)
  fs.mkdirSync(targetDir, { recursive: true })
  const copiedFiles = []
  for (const sourcePath of existingFiles) {
    const targetPath = path.join(targetDir, path.basename(sourcePath))
    fs.copyFileSync(sourcePath, targetPath)
    copiedFiles.push({
      sourcePath,
      targetPath
    })
  }

  const manifest = {
    archivedAt: new Date().toISOString(),
    copiedFiles
  }
  fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  await markLegacyArchived(manifest)
  await recordMaintenanceRun('legacy_archive', 'ok', manifest)
  return manifest
}

async function runMaintenanceOnce() {
  const archive = await archiveLegacyFiles()
  const retention = await runDataRetention()
  return {
    archive,
    retention
  }
}

async function maintenanceTick() {
  if (retentionRunning) return
  retentionRunning = true
  try {
    await runMaintenanceOnce()
  } catch (error) {
    await recordMaintenanceRun('maintenance_tick', 'failed', {
      message: error?.message || String(error)
    })
    global.errorLogger && global.errorLogger('维护任务执行失败:', error?.message || error)
  } finally {
    retentionRunning = false
  }
}

async function startDataRetentionMonitor() {
  const intervalSeconds = Math.max(toInt(process.env.DATA_RETENTION_INTERVAL_SECONDS, 21600), 3600)
  if (retentionTimer) {
    clearInterval(retentionTimer)
    retentionTimer = null
  }
  retentionTimer = setInterval(maintenanceTick, intervalSeconds * 1000)
  await maintenanceTick()
  global.logger && global.logger.info(`数据清理任务已启动，间隔 ${intervalSeconds}s`)
}

function stopDataRetentionMonitor() {
  if (retentionTimer) {
    clearInterval(retentionTimer)
    retentionTimer = null
  }
}

module.exports = {
  archiveLegacyFiles,
  runDataRetention,
  runMaintenanceOnce,
  startDataRetentionMonitor,
  stopDataRetentionMonitor
}
