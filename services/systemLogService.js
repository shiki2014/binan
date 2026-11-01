const fs = require('fs')
const path = require('path')
const { execute, queryAll } = require('../core/dbClient')
const { formatDbDate } = require('../utils/timeUtils')

const MAX_LOG_ROWS_PER_QUERY = 5000
const MAX_RAW_LOG_LINES = 10000
const PM2_APP_NAME = String(process.env.PM2_APP_NAME || 'app').trim() || 'app'

function getHomeDirectory() {
  return String(process.env.HOME || process.env.USERPROFILE || '').trim()
}

function getPm2LogPath(type = 'out') {
  const homeDir = getHomeDirectory()
  if (!homeDir) return ''
  return path.join(homeDir, '.pm2', 'logs', `${PM2_APP_NAME}-${type}.log`)
}

function getRawLogCandidates(channel = 'app', source = 'file') {
  const cwd = process.cwd()
  if (channel === 'error') {
    if (source === 'pm2') {
      return [
        process.env.PM2_ERROR_LOG_PATH,
        getPm2LogPath('error'),
        path.resolve(cwd, 'logs', 'error.log')
      ].filter(Boolean)
    }
    return [
      process.env.ERROR_RAW_LOG_PATH,
      path.resolve(cwd, 'logs', 'error.log'),
      getPm2LogPath('error')
    ].filter(Boolean)
  }
  if (source === 'pm2') {
    return [
      process.env.PM2_OUT_LOG_PATH,
      getPm2LogPath('out'),
      path.resolve(cwd, 'logs', 'app.log')
    ].filter(Boolean)
  }
  return [
    process.env.APP_RAW_LOG_PATH,
    path.resolve(cwd, 'logs', 'app.log'),
    getPm2LogPath('out')
  ].filter(Boolean)
}

function resolveExistingLogPath(candidates = []) {
  return candidates.find(filePath => filePath && fs.existsSync(filePath)) || ''
}

function normalizeRawLogText(text = '', lineLimit = MAX_RAW_LOG_LINES) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const safeLimit = Math.min(Math.max(Number(lineLimit) || MAX_RAW_LOG_LINES, 1), MAX_RAW_LOG_LINES)
  return lines.slice(-safeLimit).join('\n').trim()
}

function safeStringify(value) {
  if (value === undefined || value === null) return null
  try {
    return JSON.stringify(value)
  } catch (error) {
    return JSON.stringify({ error: 'STRINGIFY_FAILED' })
  }
}

function normalizeDateFilter(value) {
  if (value === undefined || value === null || value === '') return ''
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? formatDbDate(value) : ''
  }
  const text = String(value).trim()
  if (!text) return ''
  if (/^\d+$/.test(text)) {
    const numeric = Number(text)
    if (!Number.isFinite(numeric)) return ''
    const millis = text.length <= 10 ? numeric * 1000 : numeric
    const date = new Date(millis)
    return Number.isFinite(date.getTime()) ? formatDbDate(date) : ''
  }
  const date = new Date(text)
  return Number.isFinite(date.getTime()) ? formatDbDate(date) : ''
}

function buildSystemLogWhereClause(channel = 'app', options = {}) {
  const clauses = ['channel = ?']
  const params = [String(channel || 'app')]
  const level = String(options.level || '').trim().toLowerCase()
  const keyword = String(options.keyword || '').trim().toLowerCase()
  const startDate = normalizeDateFilter(options.startDate)
  const endDate = normalizeDateFilter(options.endDate)

  if (level) {
    clauses.push('LOWER(level) = ?')
    params.push(level)
  }
  if (startDate) {
    clauses.push('created_at >= ?')
    params.push(startDate)
  }
  if (endDate) {
    clauses.push('created_at <= ?')
    params.push(endDate)
  }
  if (keyword) {
    clauses.push('(LOWER(COALESCE(message, \'\')) LIKE ? OR LOWER(COALESCE(payload, \'\')) LIKE ?)')
    const likeKeyword = `%${keyword}%`
    params.push(likeKeyword, likeKeyword)
  }

  return {
    whereSql: clauses.join(' AND '),
    params
  }
}

function normalizeArgs(args = []) {
  const list = Array.isArray(args) ? args : [args]
  const messageParts = []
  const payloadParts = []
  list.forEach(item => {
    if (typeof item === 'string') {
      messageParts.push(item)
      return
    }
    if (item instanceof Error) {
      messageParts.push(item.message || 'Error')
      payloadParts.push({
        name: item.name,
        stack: item.stack
      })
      return
    }
    if (typeof item === 'number' || typeof item === 'boolean' || item === null) {
      messageParts.push(String(item))
      return
    }
    payloadParts.push(item)
  })
  return {
    message: messageParts.join(' ').trim() || '[structured log]',
    payload: payloadParts.length ? (payloadParts.length === 1 ? payloadParts[0] : payloadParts) : null
  }
}

async function writeSystemLog({ channel = 'app', level = 'info', message = '', payload = null }) {
  const normalizedMessage = String(message || '').trim() || '[empty log]'
  try {
    await execute(
      `
      INSERT INTO system_logs(channel, level, message, payload)
      VALUES (?, ?, ?, ?)
      `,
      [
        String(channel || 'app'),
        String(level || 'info'),
        normalizedMessage,
        safeStringify(payload)
      ]
    )
  } catch (error) {}
}

async function writeSystemLogFromArgs({ channel = 'app', level = 'info', args = [] }) {
  const normalized = normalizeArgs(args)
  return writeSystemLog({
    channel,
    level,
    message: normalized.message,
    payload: normalized.payload
  })
}

async function getSystemLogRows(channel = 'app', options = {}) {
  const limitValue = Number(
    options.limit !== undefined && options.limit !== null
      ? options.limit
      : options.lineLimit
  )
  const size = Math.min(Math.max(Number.isFinite(limitValue) ? limitValue : 2000, 1), MAX_LOG_ROWS_PER_QUERY)
  const offsetValue = Number(options.offset)
  const offset = Math.max(Number.isFinite(offsetValue) ? offsetValue : 0, 0)
  const { whereSql, params } = buildSystemLogWhereClause(channel, options)
  const rows = await queryAll(
    `
    SELECT id, channel, level, message, payload, created_at
    FROM system_logs
    WHERE ${whereSql}
    ORDER BY id DESC
    LIMIT ?
    OFFSET ?
    `,
    params.concat([size, offset])
  )
  return rows.reverse().map(row => {
    let payload = null
    if (row.payload) {
      try {
        payload = JSON.parse(row.payload)
      } catch (error) {
        payload = row.payload
      }
    }
    return {
      ...row,
      payload
    }
  })
}

function formatLogRow(row) {
  const timestamp = row.created_at || ''
  const level = String(row.level || 'info').toUpperCase()
  const channel = String(row.channel || 'app')
  const message = String(row.message || '')
  const suffix = row.payload ? ` ${safeStringify(row.payload)}` : ''
  return `[${timestamp}] [${level}] ${channel} - ${message}${suffix}`
}

async function getSystemLogText(channel = 'app', options = {}) {
  const rows = await getSystemLogRows(channel, options)
  return rows.map(formatLogRow).join('\n')
}

async function getRawLogText(channel = 'app', options = {}) {
  const source = String(options.source || 'file').trim().toLowerCase()
  const filePath = resolveExistingLogPath(getRawLogCandidates(channel, source))
  if (!filePath) {
    return ''
  }
  try {
    const text = await fs.promises.readFile(filePath, 'utf8')
    return normalizeRawLogText(text, options.lineLimit)
  } catch (error) {
    return ''
  }
}

async function getLogText(channel = 'app', options = {}) {
  const source = String(options.source || (channel === 'error' ? 'file' : 'db')).trim().toLowerCase()
  if (source === 'file' || source === 'pm2') {
    return getRawLogText(channel, options)
  }
  return getSystemLogText(channel, options)
}

module.exports = {
  writeSystemLog,
  writeSystemLogFromArgs,
  getSystemLogRows,
  getSystemLogText,
  getRawLogText,
  getLogText
}
