const { getExchangeInfo, getAccountData } = require('./binanceContractService')
const { getAllExchangeInfo, getOneIndex } = require('./strategyEngineService')
const {
  LIST_TYPES,
  STATE_KEYS,
  replaceExchangeSymbols,
  upsertSymbolIndicators,
  replaceSymbolList,
  setRuntimeState,
  getRuntimeStateSync
} = require('./runtimeDataService')

async function updateAllATR(callback) {
  let indexObject = {}
  const exchangeInfo = await getAllExchangeInfo()
  const symbols = exchangeInfo.map(item => item.symbol)
  let count = 0
  async function getOne(symbol) {
    indexObject[symbol] = await getOneIndex(symbol)
    count++
    if (count === exchangeInfo.length) {
      await upsertSymbolIndicators(indexObject)
      callback && callback(true)
      global.logger.info('更新 ATR/波动率/趋势震荡指标成功')
    }
  }
  for (const symbol of symbols) {
    getOne(symbol)
  }
}

async function setBlackList(volatilityObject) {
  const symbols = Object.keys(volatilityObject || {})
  const blockList = []
  for (const symbol of symbols) {
    const volatility = volatilityObject[symbol]
    if (volatility < 0.001) {
      blockList.push(symbol)
    }
  }
  await replaceSymbolList(LIST_TYPES.BLACK, blockList)
  global.logger.info('设置黑名单成功')
}

async function setUpdateEquity() {
  const res = await getAccountData()
  if (!res) {
    global.errorLogger('账号历史最大权益更新失败: 账户信息为空')
    return false
  }
  const equity = Number(res.totalMarginBalance)
  let data = getRuntimeStateSync(STATE_KEYS.EQUITY_PEAK, { equity: 0 })
  if (equity > Number(data.equity || 0)) {
    data = { equity }
  }
  await setRuntimeState(STATE_KEYS.EQUITY_PEAK, data)
  global.logger.info('账号历史最大权益更新成功')
  return true
}

async function updateAllExchangeInfo() {
  const res = await getExchangeInfo()
  if (!res) {
    global.logger.info('更新交易对失败')
    return false
  }
  const symbols = res.data.symbols
  const data = symbols.filter(item => item.symbol.includes('USDT')).filter(item => item.status === 'TRADING')
  await replaceExchangeSymbols(data)
  global.logger.info('更新交易对成功')
  setUpdateEquity()
  updateAllATR()
  return true
}

module.exports = {
  updateAllATR,
  setBlackList,
  setUpdateEquity,
  updateAllExchangeInfo
}
