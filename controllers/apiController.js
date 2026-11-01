const {
  getPositionRisk,
  getAccountData,
  getPositionSideDual,
  getOpenOrders,
  getOpenAlgoOrders,
  getKlines
} = require('../services/binanceContractService');
const { getLogText } = require('../services/systemLogService')

function buildLogOptions(req, defaultSource = 'db') {
  const source = String(req.query.source || defaultSource).trim().toLowerCase()
  const lineLimit = Number(req.query.lineLimit || req.query.limit || 0)
  const offset = Number(req.query.offset || 0)
  const level = String(req.query.level || '').trim().toLowerCase()
  const keyword = String(req.query.keyword || '').trim()
  const startDate = String(req.query.startDate || '').trim()
  const endDate = String(req.query.endDate || '').trim()
  return {
    source,
    lineLimit: Number.isFinite(lineLimit) && lineLimit > 0 ? lineLimit : undefined,
    limit: Number.isFinite(lineLimit) && lineLimit > 0 ? lineLimit : undefined,
    offset: Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0,
    level: level || undefined,
    keyword: keyword || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined
  }
}

async function getAccountPosition() {
  let res = await getAccountData()
  if (!res || !Array.isArray(res.positions)) return []
  let allPositions = res.positions
  return allPositions.filter((item)=>{
    return Math.abs(item.positionAmt) > 0
  }) // 仓位
}

async function getPrice(req, res) {
  try {
    const data = await getAccountPosition()
    res.send(data)
  } catch (error) {
    global.errorLogger('Error fetching market data:', error);
    res.status(500).send('An error occurred while fetching market data');
  }
}

async function getErrorLog (req, res) {
  try {
    const text = await getLogText('error', buildLogOptions(req, 'file'))
    res.send(text)
  } catch (err) {
    global.errorLogger(err)
    res.status(500).send('读取错误日志失败')
  }
}

async function getAppLog (req, res) {
  try {
    const text = await getLogText('app', buildLogOptions(req, 'db'))
    res.send(text)
  } catch (err) {
    global.errorLogger(err)
    res.status(500).send('读取应用日志失败')
  }
}

async function getUsers(req, res) {
  try {
    const data = await getAccountData()
    res.send(data)
  } catch (error) {
    global.errorLogger('Error fetching market data:', error);
    res.status(500).send('An error occurred while fetching market data');
  }
}

async function getPositions(req, res) {
  try {
    const data = await getAccountPosition()
    res.send(data)
  } catch (error) {
    global.errorLogger('Error fetching market data:', error);
    res.status(500).send('An error occurred while fetching market data');
  }
}

function normalizeOpenOrder(order = {}, source = 'normal') {
  return {
    source,
    orderId: order.orderId || order.algoId || '',
    symbol: order.symbol || '',
    side: order.side || '',
    positionSide: order.positionSide || '',
    type: order.type || order.origType || order.orderType || '',
    status: order.status || order.state || '',
    price: Number(order.price || 0),
    stopPrice: Number(order.stopPrice || order.triggerPrice || 0),
    quantity: Number(order.origQty || order.quantity || 0),
    executedQty: Number(order.executedQty || 0),
    reduceOnly: Boolean(order.reduceOnly),
    closePosition: Boolean(order.closePosition),
    time: order.time || order.updateTime || order.createTime || order.createdTime || ''
  }
}

async function getOpenOrderList(req, res) {
  try {
    const [normalOrders, algoOrders] = await Promise.all([
      getOpenOrders().catch(() => []),
      getOpenAlgoOrders().catch(() => [])
    ])
    const merged = []
      .concat((normalOrders || []).map(item => normalizeOpenOrder(item, 'normal')))
      .concat((algoOrders || []).map(item => normalizeOpenOrder(item, 'algo')))
      .sort((a, b) => Number(b.time || 0) - Number(a.time || 0))
    res.send(merged)
  } catch (error) {
    global.errorLogger('读取挂单失败:', error)
    res.status(500).send('读取挂单失败')
  }
}

async function getSymbolKlines(req, res) {
  try {
    const symbol = String(req.params.symbol || '').trim().toUpperCase()
    if (!symbol) {
      res.status(400).send('symbol 不能为空')
      return
    }
    const interval = String(req.query.interval || '1d').toLowerCase()
    if (!['1d', '1h'].includes(interval)) {
      res.status(400).send('interval 仅支持 1d 或 1h')
      return
    }
    const limit = Number(req.query.limit || 240)
    const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 240, 20), 1500)
    const startTime = Number(req.query.startTime)
    const endTime = Number(req.query.endTime)
    const queryOptions = {}
    if (Number.isFinite(startTime) && startTime > 0) {
      queryOptions.startTime = Math.floor(startTime)
    }
    if (Number.isFinite(endTime) && endTime > 0) {
      queryOptions.endTime = Math.floor(endTime)
    }
    const response = await getKlines(symbol, safeLimit, interval, queryOptions)
    const raw = response && Array.isArray(response.data) ? response.data : []
    const data = raw.map(item => ({
      openTime: Number(item[0]),
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5]),
      closeTime: Number(item[6])
    })).filter(item => {
      return Number.isFinite(item.open) &&
        Number.isFinite(item.high) &&
        Number.isFinite(item.low) &&
        Number.isFinite(item.close)
    })
    res.send({
      symbol,
      interval,
      limit: safeLimit,
      startTime: queryOptions.startTime || null,
      endTime: queryOptions.endTime || null,
      data
    })
  } catch (error) {
    global.errorLogger('读取K线失败:', error)
    res.status(500).send('读取K线失败')
  }
}

module.exports = {
  getPrice,
  getErrorLog,
  getPositions,
  getOpenOrderList,
  getSymbolKlines,
  getUsers,
  getAppLog
};
