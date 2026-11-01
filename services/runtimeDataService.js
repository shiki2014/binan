const fs = require('fs')
const path = require('path')
const { execute, queryAll, queryOne, withTransaction } = require('../core/dbClient')

const DATA_DIR = path.resolve(__dirname, '..', 'data')
const LEGACY_FILES = {
  exchangeSymbols: path.join(DATA_DIR, 'data.json'),
  atr: path.join(DATA_DIR, 'ATR.json'),
  volatility: path.join(DATA_DIR, 'volatility.json'),
  trendOscillation: path.join(DATA_DIR, 'trendOscillation.json'),
  blackList: path.join(DATA_DIR, 'blackList.json'),
  whiteList: path.join(DATA_DIR, 'whiteList.json'),
  equity: path.join(DATA_DIR, 'equity.json')
}

const LIST_TYPES = {
  BLACK: 'blacklist',
  WHITE: 'whitelist'
}

const STATE_KEYS = {
  EQUITY_PEAK: 'equity_peak'
}

const cache = {
  initialized: false,
  exchangeSymbols: [],
  indicatorMaps: {
    atr: {},
    volatility: {},
    trendOscillation: {},
    averageAmplitude: {}
  },
  lists: {
    [LIST_TYPES.BLACK]: [],
    [LIST_TYPES.WHITE]: []
  },
  state: {}
}

function safeJsonParse(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback
  try {
    return JSON.parse(raw)
  } catch (error) {
    return fallback
  }
}

function safeStringify(value) {
  try {
    return JSON.stringify(value)
  } catch (error) {
    return JSON.stringify(null)
  }
}

function readLegacyJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return safeJsonParse(fs.readFileSync(filePath, 'utf8'), fallback)
  } catch (error) {
    global.errorLogger && global.errorLogger('读取历史运行时文件失败:', filePath, error.message || error)
    return fallback
  }
}

async function loadCacheFromDatabase() {
  const exchangeRows = await queryAll(`
    SELECT symbol, payload
    FROM exchange_symbols
    ORDER BY symbol ASC
  `)
  cache.exchangeSymbols = exchangeRows
    .map(row => safeJsonParse(row.payload, null))
    .filter(Boolean)

  const indicatorRows = await queryAll(`
    SELECT symbol, atr, volatility, trend_oscillation, average_amplitude
    FROM symbol_indicators
  `)
  const atr = {}
  const volatility = {}
  const trendOscillation = {}
  const averageAmplitude = {}
  indicatorRows.forEach(row => {
    const symbol = String(row.symbol || '').trim()
    if (!symbol) return
    if (Number.isFinite(Number(row.atr))) atr[symbol] = Number(row.atr)
    if (Number.isFinite(Number(row.volatility))) volatility[symbol] = Number(row.volatility)
    if (Number.isFinite(Number(row.trend_oscillation))) trendOscillation[symbol] = Number(row.trend_oscillation)
    if (Number.isFinite(Number(row.average_amplitude))) averageAmplitude[symbol] = Number(row.average_amplitude)
  })
  cache.indicatorMaps = { atr, volatility, trendOscillation, averageAmplitude }

  const listRows = await queryAll(`
    SELECT list_type, symbol
    FROM symbol_lists
    ORDER BY list_type ASC, symbol ASC
  `)
  const black = []
  const white = []
  listRows.forEach(row => {
    if (row.list_type === LIST_TYPES.BLACK) black.push(row.symbol)
    if (row.list_type === LIST_TYPES.WHITE) white.push(row.symbol)
  })
  cache.lists = {
    [LIST_TYPES.BLACK]: black,
    [LIST_TYPES.WHITE]: white
  }

  const stateRows = await queryAll(`
    SELECT key, value
    FROM runtime_state
  `)
  const state = {}
  stateRows.forEach(row => {
    state[row.key] = safeJsonParse(row.value, row.value)
  })
  cache.state = state
  cache.initialized = true
}

async function bootstrapLegacyExchangeSymbols() {
  const row = await queryOne('SELECT symbol FROM exchange_symbols LIMIT 1')
  if (row) return
  const legacyData = readLegacyJson(LEGACY_FILES.exchangeSymbols, [])
  if (!Array.isArray(legacyData) || !legacyData.length) return
  for (const item of legacyData) {
    const symbol = String(item && item.symbol || '').trim()
    if (!symbol) continue
    await execute(
      `
      INSERT INTO exchange_symbols(symbol, status, quantity_precision, price_precision, payload, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(symbol) DO UPDATE SET
        status = excluded.status,
        quantity_precision = excluded.quantity_precision,
        price_precision = excluded.price_precision,
        payload = excluded.payload,
        updated_at = datetime('now')
      `,
      [
        symbol,
        String(item.status || ''),
        Number(item.quantityPrecision || 0),
        Number(item.pricePrecision || 0),
        safeStringify(item)
      ]
    )
  }
}

async function bootstrapLegacyIndicators() {
  const row = await queryOne('SELECT symbol FROM symbol_indicators LIMIT 1')
  if (row) return
  const atrMap = readLegacyJson(LEGACY_FILES.atr, {})
  const volatilityMap = readLegacyJson(LEGACY_FILES.volatility, {})
  const trendOscillationMap = readLegacyJson(LEGACY_FILES.trendOscillation, {})
  const symbols = new Set([
    ...Object.keys(atrMap || {}),
    ...Object.keys(volatilityMap || {}),
    ...Object.keys(trendOscillationMap || {})
  ])
  for (const symbol of symbols) {
    await execute(
      `
      INSERT INTO symbol_indicators(
        symbol,
        atr,
        volatility,
        trend_oscillation,
        metadata,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(symbol) DO UPDATE SET
        atr = excluded.atr,
        volatility = excluded.volatility,
        trend_oscillation = excluded.trend_oscillation,
        metadata = excluded.metadata,
        updated_at = datetime('now')
      `,
      [
        symbol,
        Number.isFinite(Number(atrMap[symbol])) ? Number(atrMap[symbol]) : null,
        Number.isFinite(Number(volatilityMap[symbol])) ? Number(volatilityMap[symbol]) : null,
        Number.isFinite(Number(trendOscillationMap[symbol])) ? Number(trendOscillationMap[symbol]) : null,
        safeStringify({ importedFromLegacy: true })
      ]
    )
  }
}

async function bootstrapLegacyLists() {
  const blackRow = await queryOne('SELECT symbol FROM symbol_lists WHERE list_type = ? LIMIT 1', [LIST_TYPES.BLACK])
  const whiteRow = await queryOne('SELECT symbol FROM symbol_lists WHERE list_type = ? LIMIT 1', [LIST_TYPES.WHITE])
  const blackList = readLegacyJson(LEGACY_FILES.blackList, [])
  const whiteList = readLegacyJson(LEGACY_FILES.whiteList, [])
  if (!blackRow) {
    await replaceSymbolList(LIST_TYPES.BLACK, blackList)
  }
  if (!whiteRow) {
    await replaceSymbolList(LIST_TYPES.WHITE, whiteList)
  }
}

async function bootstrapLegacyState() {
  const row = await queryOne('SELECT key FROM runtime_state WHERE key = ?', [STATE_KEYS.EQUITY_PEAK])
  if (row) return
  const equity = readLegacyJson(LEGACY_FILES.equity, {})
  const value = Number(equity && equity.equity)
  if (!Number.isFinite(value) || value <= 0) return
  await setRuntimeState(STATE_KEYS.EQUITY_PEAK, { equity: value, importedFromLegacy: true })
}

async function initRuntimeDataStore() {
  await bootstrapLegacyExchangeSymbols()
  await bootstrapLegacyIndicators()
  await bootstrapLegacyLists()
  await bootstrapLegacyState()
  await loadCacheFromDatabase()
}

function ensureInitialized() {
  if (!cache.initialized) {
    throw new Error('Runtime data store has not been initialized yet.')
  }
}

function getExchangeSymbolsSync() {
  ensureInitialized()
  return cache.exchangeSymbols.slice()
}

function getIndicatorMapSync(indicatorName) {
  ensureInitialized()
  return { ...(cache.indicatorMaps[indicatorName] || {}) }
}

function getIndicatorValueSync(indicatorName, symbol, fallbackValue = 0) {
  ensureInitialized()
  const map = cache.indicatorMaps[indicatorName] || {}
  if (Object.prototype.hasOwnProperty.call(map, symbol)) {
    return map[symbol]
  }
  return fallbackValue
}

function getSymbolListSync(listType) {
  ensureInitialized()
  return (cache.lists[listType] || []).slice()
}

function getRuntimeStateSync(key, fallbackValue = null) {
  ensureInitialized()
  if (Object.prototype.hasOwnProperty.call(cache.state, key)) {
    return cache.state[key]
  }
  return fallbackValue
}

async function replaceExchangeSymbols(items = []) {
  const list = Array.isArray(items) ? items : []
  await withTransaction(async tx => {
    await tx.execute('DELETE FROM exchange_symbols')
    for (const item of list) {
      const symbol = String(item && item.symbol || '').trim()
      if (!symbol) continue
      await tx.execute(
        `
        INSERT INTO exchange_symbols(symbol, status, quantity_precision, price_precision, payload, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        `,
        [
          symbol,
          String(item.status || ''),
          Number(item.quantityPrecision || 0),
          Number(item.pricePrecision || 0),
          safeStringify(item)
        ]
      )
    }
  })
  cache.exchangeSymbols = list.slice()
  return cache.initialized ? getExchangeSymbolsSync() : list.slice()
}

async function upsertSymbolIndicators(indicators = {}) {
  const entries = Object.entries(indicators || {})
  for (const [symbol, item] of entries) {
    const payload = item && typeof item === 'object' ? item : {}
    await execute(
      `
      INSERT INTO symbol_indicators(
        symbol,
        atr,
        volatility,
        trend_oscillation,
        average_amplitude,
        metadata,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(symbol) DO UPDATE SET
        atr = COALESCE(excluded.atr, symbol_indicators.atr),
        volatility = COALESCE(excluded.volatility, symbol_indicators.volatility),
        trend_oscillation = COALESCE(excluded.trend_oscillation, symbol_indicators.trend_oscillation),
        average_amplitude = COALESCE(excluded.average_amplitude, symbol_indicators.average_amplitude),
        metadata = excluded.metadata,
        updated_at = datetime('now')
      `,
      [
        symbol,
        Number.isFinite(Number(payload.atr)) ? Number(payload.atr) : null,
        Number.isFinite(Number(payload.volatility)) ? Number(payload.volatility) : null,
        Number.isFinite(Number(payload.trendOscillation)) ? Number(payload.trendOscillation) : null,
        Number.isFinite(Number(payload.averageAmplitude)) ? Number(payload.averageAmplitude) : null,
        safeStringify(payload.metadata || null)
      ]
    )
  }
  await loadCacheFromDatabase()
  return cache.indicatorMaps
}

async function replaceSymbolList(listType, symbols = []) {
  const normalizedListType = String(listType || '').trim().toLowerCase()
  const list = Array.isArray(symbols) ? symbols.map(item => String(item || '').trim()).filter(Boolean) : []
  await withTransaction(async tx => {
    await tx.execute('DELETE FROM symbol_lists WHERE list_type = ?', [normalizedListType])
    for (const symbol of list) {
      await tx.execute(
        `
        INSERT INTO symbol_lists(list_type, symbol, metadata, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        `,
        [normalizedListType, symbol, null]
      )
    }
  })
  cache.lists[normalizedListType] = list
  return cache.initialized ? getSymbolListSync(normalizedListType) : list.slice()
}

async function setRuntimeState(key, value) {
  await execute(
    `
    INSERT INTO runtime_state(key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
    `,
    [String(key), safeStringify(value)]
  )
  cache.state[String(key)] = value
  return value
}

module.exports = {
  LIST_TYPES,
  STATE_KEYS,
  initRuntimeDataStore,
  getExchangeSymbolsSync,
  getIndicatorMapSync,
  getIndicatorValueSync,
  getSymbolListSync,
  getRuntimeStateSync,
  replaceExchangeSymbols,
  upsertSymbolIndicators,
  replaceSymbolList,
  setRuntimeState
}
