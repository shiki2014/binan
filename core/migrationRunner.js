const fs = require('fs')
const path = require('path')
const { formatDbDate } = require('../utils/timeUtils')

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations')

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return []
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(name => /^\d+.*\.js$/.test(name))
    .sort()
    .map(name => ({
      name,
      fullPath: path.join(MIGRATIONS_DIR, name)
    }))
}

async function ensureMigrationTable({ execute, dialect }) {
  if (dialect === 'postgres') {
    await execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    return
  }

  await execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}

async function getAppliedMigrationNames({ queryAll }) {
  const rows = await queryAll(`
    SELECT name
    FROM schema_migrations
    ORDER BY id ASC
  `).catch(() => [])
  return new Set((rows || []).map(item => String(item.name || '')))
}

async function markMigrationApplied({ execute }, name) {
  await execute(
    `
    INSERT INTO schema_migrations(name, applied_at)
    VALUES (?, ?)
    ON CONFLICT(name) DO NOTHING
    `,
    [name, formatDbDate()]
  )
}

async function runMigrations(adapter) {
  if (!adapter || typeof adapter.execute !== 'function' || typeof adapter.queryAll !== 'function') {
    throw new Error('runMigrations 缺少可用的数据库适配器')
  }

  const dialect = String(adapter.dialect || 'sqlite')
  await ensureMigrationTable({ execute: adapter.execute, dialect })
  const appliedNames = await getAppliedMigrationNames({ queryAll: adapter.queryAll })
  const migrationFiles = getMigrationFiles()

  for (const migration of migrationFiles) {
    if (appliedNames.has(migration.name)) continue
    delete require.cache[require.resolve(migration.fullPath)]
    const definition = require(migration.fullPath)
    if (!definition || typeof definition.up !== 'function') {
      throw new Error(`迁移文件缺少 up 方法: ${migration.name}`)
    }
    await definition.up({
      dialect,
      execute: adapter.execute,
      queryAll: adapter.queryAll
    })
    await markMigrationApplied(adapter, migration.name)
  }
}

module.exports = {
  runMigrations
}
