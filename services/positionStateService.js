const { getAccountData } = require('./binanceContractService')
const { STATE_KEYS, getRuntimeStateSync } = require('./runtimeDataService')

function normalizeAccountSnapshot(accountSnapshot) {
  if (!accountSnapshot || typeof accountSnapshot !== 'object') {
    return null
  }
  return accountSnapshot
}

async function getOpenPositions(accountSnapshot = null) {
  const res = normalizeAccountSnapshot(accountSnapshot) || await getAccountData()
  if (!res || !Array.isArray(res.positions)) return []
  return res.positions.filter(item => {
    return Math.abs(Number(item.positionAmt || 0)) > 0
  })
}

async function getEquityAmount(accountSnapshot = null) {
  const res = normalizeAccountSnapshot(accountSnapshot) || await getAccountData()
  if (!res) {
    const error = new Error('获取账户信息失败，无法计算权益')
    error.code = 'ACCOUNT_DATA_UNAVAILABLE'
    throw error
  }
  const availableBalance = Number(res.availableBalance || 0)
  const totalMarginBalance = Number(res.totalMarginBalance || 0) / 2
  const equity = totalMarginBalance > availableBalance ? availableBalance : totalMarginBalance
  const equityMaxHistory = getRuntimeStateSync(STATE_KEYS.EQUITY_PEAK, { equity: 0 })
  let withdrawalAmplitude = 0
  if (Number(equityMaxHistory.equity || 0) > Number(res.totalMarginBalance || 0)) {
    withdrawalAmplitude = (Number(equityMaxHistory.equity) - Number(res.totalMarginBalance || 0)) / Number(equityMaxHistory.equity)
  }
  global.logger.info('回撤幅度', withdrawalAmplitude.toFixed(3))
  return {
    num: (equity / 3) * Math.pow((1 - Number(withdrawalAmplitude.toFixed(3))), 2),
    withdrawalAmplitude: withdrawalAmplitude.toFixed(3)
  }
}

module.exports = {
  getOpenPositions,
  getEquityAmount
}
