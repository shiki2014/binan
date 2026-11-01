const sqliteDatabase = require('./database')

function getActiveDialect() {
  return String(process.env.DB_DIALECT || 'sqlite').trim().toLowerCase()
}

function normalizePostgresSql(sql) {
  let index = 0
  return String(sql || '')
    .replace(/datetime\('now'\)/g, 'CURRENT_TIMESTAMP')
    .replace(/\?/g, () => {
      index += 1
      return `$${index}`
    })
}

function shouldAppendReturning(sql) {
  const normalized = String(sql || '').trim().toUpperCase()
  if (!normalized.startsWith('INSERT INTO')) return false
  return !/\bRETURNING\b/i.test(normalized)
}

async function execute(sql, params = [], client = null) {
  const dialect = getActiveDialect()
  if (dialect === 'postgres') {
    const postgresDatabase = require('./postgresDatabase')
    let compiledSql = normalizePostgresSql(sql)
    if (shouldAppendReturning(compiledSql)) {
      compiledSql = `${compiledSql.trim()} RETURNING *`
    }
    const result = await postgresDatabase.query(compiledSql, params, client)
    return {
      lastID: result.rows?.[0]?.id || null,
      changes: result.rowCount || 0,
      rows: result.rows || []
    }
  }
  return sqliteDatabase.run(sql, params)
}

async function queryOne(sql, params = [], client = null) {
  const dialect = getActiveDialect()
  if (dialect === 'postgres') {
    const postgresDatabase = require('./postgresDatabase')
    const compiledSql = normalizePostgresSql(sql)
    const result = await postgresDatabase.query(compiledSql, params, client)
    return result.rows[0] || null
  }
  return sqliteDatabase.get(sql, params)
}

async function queryAll(sql, params = [], client = null) {
  const dialect = getActiveDialect()
  if (dialect === 'postgres') {
    const postgresDatabase = require('./postgresDatabase')
    const compiledSql = normalizePostgresSql(sql)
    const result = await postgresDatabase.query(compiledSql, params, client)
    return result.rows || []
  }
  return sqliteDatabase.all(sql, params)
}

function createScopedAdapter(client = null) {
  return {
    dialect: getActiveDialect(),
    execute: (sql, params = []) => execute(sql, params, client),
    queryOne: (sql, params = []) => queryOne(sql, params, client),
    queryAll: (sql, params = []) => queryAll(sql, params, client)
  }
}

async function withTransaction(work) {
  if (typeof work !== 'function') {
    throw new Error('withTransaction 需要传入函数')
  }

  const dialect = getActiveDialect()
  if (dialect === 'postgres') {
    const postgresDatabase = require('./postgresDatabase')
    const pool = await postgresDatabase.getPool()
    const client = await pool.connect()
    const adapter = createScopedAdapter(client)
    try {
      await client.query('BEGIN')
      const result = await work(adapter)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  await sqliteDatabase.run('BEGIN IMMEDIATE TRANSACTION')
  try {
    const result = await work(createScopedAdapter())
    await sqliteDatabase.run('COMMIT')
    return result
  } catch (error) {
    await sqliteDatabase.run('ROLLBACK')
    throw error
  }
}

module.exports = {
  getActiveDialect,
  execute,
  queryOne,
  queryAll,
  withTransaction,
  run: execute,
  get: queryOne,
  all: queryAll
}
