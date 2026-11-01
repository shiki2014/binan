const {
  getKlines,
  setStopPrice,
  getOneOpenOrders,
  getOpenOrders,
  getOpenAlgoOrders,
  deleteOrder,
  deleteAlgoOrder
} = require('./binanceContractService')
const { getAllExchangeInfo, getHighAndLow, klinesInit, getATR } = require('./strategyEngineService')
const { getOpenPositions } = require('./positionStateService')

async function setTakeProfit() {
  const positionList = await getOpenPositions()
  const orders1 = await getOpenOrders()
  const orders2 = await getOpenAlgoOrders()
  const orders = (orders1 || []).concat(orders2 || []).map(item => {
    item.orderId = (item.orderId || item.algoId).toString()
    item.stopPrice = item.stopPrice || item.triggerPrice
    item.time = item.time || item.updateTime
    return item
  })
  const allExchange = await getAllExchangeInfo()

  function getPricePrecisionFromTickSize(tickSize) {
    const tickSizeStr = tickSize.toString()
    if (tickSizeStr.includes('.')) {
      return tickSizeStr.split('.')[1].length
    }
    return 0
  }

  function getTickSize(symbol) {
    const symbolInfo = allExchange.find(item => item.symbol === symbol)
    if (symbolInfo) {
      const priceFilter = symbolInfo.filters.find(filter => filter.filterType === 'PRICE_FILTER')
      return priceFilter ? priceFilter.tickSize : '0.0001'
    }
    return '0.0001'
  }

  function formatPriceByTickSize(price, tickSize) {
    const tickSizeNum = parseFloat(tickSize)
    const precision = getPricePrecisionFromTickSize(tickSize)
    const adjustedPrice = Math.round(price / tickSizeNum) * tickSizeNum
    return parseFloat(adjustedPrice.toFixed(precision))
  }

  function getOneOrder(symbol) {
    for (const item of orders) {
      if (item.symbol === symbol) {
        return item
      }
    }
  }

  const takeProfitList = []
  function signal(item) {
    const oneOrder = getOneOrder(item.symbol)
    if (!oneOrder || !oneOrder.stopPrice) {
      return false
    }
    if (item.positionSide === 'SHORT') {
      return item.highestPoint < Number(oneOrder.stopPrice)
    }
    if (item.positionSide === 'LONG') {
      return item.lowestPoint > Number(oneOrder.stopPrice)
    }
    return false
  }

  for (let i in positionList) {
    const res = await getKlines(positionList[i].symbol, 11)
    const klines = klinesInit(positionList[i].symbol, res.data).klines
    const ATR = getATR(klines.slice(0, klines.length - 1), positionList[i].symbol)
    const data = {
      ...getHighAndLow(klines.slice(0, klines.length - 1), positionList[i].symbol),
      ...positionList[i],
      ATR
    }
    if (signal(data)) {
      takeProfitList.push(data)
      const stopPrice = data.positionSide === 'SHORT' ? data.highestPoint : data.lowestPoint
      const formattedStopPrice = formatPriceByTickSize(stopPrice, getTickSize(data.symbol))
      await setStopPrice(data.symbol, data.positionSide, formattedStopPrice)
      if (data.positionSide === 'SHORT') {
        global.logger.info(data.highestPoint < Number(data.entryPrice) ? `${data.symbol}设置止盈成功` : `${data.symbol}设置止损移动成功`)
      }
      if (data.positionSide === 'LONG') {
        global.logger.info(data.lowestPoint > Number(data.entryPrice) ? `${data.symbol}设置止盈成功` : `${data.symbol}设置止损移动成功`)
      }
    }
  }
  if (takeProfitList.length === 0) {
    global.logger.info('没有需要设置止盈的标的物')
  }
  return takeProfitList
}

async function getOneRisk(symbol, entryPrice, leverage, isolatedWallet) {
  const data = await getOneOpenOrders(symbol)
  const stopPrice = data[data.length - 1]?.stopPrice
  const ads = Math.abs(Number(entryPrice) - Number(stopPrice))
  const ratio = (ads / entryPrice) * Number(leverage)
  return Number(isolatedWallet) * ratio
}

async function getPositionRisk() {
  const positions = await getOpenPositions()
  let unrealizedProfit = 0
  let maxRisk = 0
  let marginAlreadyUsed = 0
  for (let i in positions) {
    unrealizedProfit += Number(positions[i].unrealizedProfit)
    maxRisk += await getOneRisk(positions[i].symbol, positions[i].entryPrice, positions[i].leverage, positions[i].isolatedWallet)
    marginAlreadyUsed += Number(positions[i].isolatedWallet)
  }
  console.log('已经使用的保证金', marginAlreadyUsed)
  console.log('可能出现的最大亏损', maxRisk)
  console.log('仓位盈亏', unrealizedProfit)
  return {
    maxRisk,
    unrealizedProfit,
    marginAlreadyUsed
  }
}

async function deleteAllInvalidOrders(isDeleteReducedOrders) {
  const orders1 = await getOpenOrders()
  const orders2 = await getOpenAlgoOrders()
  const orders = (orders1 || []).concat(orders2 || []).map(item => {
    item.orderId = (item.orderId || item.algoId).toString()
    item.time = item.time || item.updateTime
    return item
  })
  const positions = await getOpenPositions()
  const symbols = positions.map(item => item.symbol + item.positionSide)
  const invalidOrders = []

  for (let i in symbols) {
    const listData = orders.filter(item => (item.symbol + item.positionSide) === symbols[i]).sort((a, b) => b.time - a.time)
    for (let i2 in listData) {
      if (i2 !== '0') {
        invalidOrders.push(listData[i2])
      }
    }
  }

  if (isDeleteReducedOrders) {
    for (let i in orders) {
      const symbolKey = orders[i].symbol + orders[i].positionSide
      if (symbols.indexOf(symbolKey) === -1) {
        invalidOrders.push(orders[i])
      }
    }
  }

  if (invalidOrders.length > 0) {
    global.logger.info('开始删除无效订单')
    for (let i in invalidOrders) {
      if (invalidOrders[i].algoId) {
        await deleteAlgoOrder(invalidOrders[i].symbol, invalidOrders[i].algoId)
      } else {
        await deleteOrder(invalidOrders[i].symbol, invalidOrders[i].orderId)
      }
      global.logger.info('撤销挂单完成', invalidOrders[i].symbol, invalidOrders[i].orderId, invalidOrders[i].stopPrice)
    }
  } else {
    global.logger.info('没有需要删除的订单')
  }
}

module.exports = {
  setTakeProfit,
  getPositionRisk,
  deleteAllInvalidOrders
}
