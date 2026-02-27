// 合约交易
const { contractAxios } = require('../axiosInstance/axiosInstance')
require('dotenv').config();
const TRADING_MODE = (process.env.TRADING_MODE || 'paper').toLowerCase()
const IS_LIVE_TRADING = TRADING_MODE === 'live'
const STOP_TRIGGER_BUFFER = Number(process.env.STOP_TRIGGER_BUFFER || 0.001)
let tradFiAgreementSigned = false

function getDecimalPlaces(value) {
  const text = String(value)
  if (!text.includes('.')) return 0
  return text.split('.')[1].length
}

function formatByReferencePrecision(value, reference) {
  const precision = getDecimalPlaces(reference)
  return Number(Number(value).toFixed(precision))
}

function getErrorCode(error) {
  return Number(error?.response?.data?.code)
}

async function getLatestPrice(symbol) {
  const markRes = await contractAxios({
    method: 'get',
    url: '/fapi/v1/premiumIndex',
    params: { symbol }
  }).catch(error => {
    global.errorLogger('获取标记价格失败:', error?.response?.data || error)
  })
  const markPrice = Number(markRes?.data?.markPrice)
  if (Number.isFinite(markPrice) && markPrice > 0) {
    return markPrice
  }

  const res = await contractAxios({
    method: 'get',
    url: '/fapi/v1/ticker/price',
    params: { symbol }
  }).catch(error => {
    global.errorLogger('获取最新价格失败:', error?.response?.data || error)
  })
  return Number(res?.data?.price)
}

async function normalizeTriggerPrice(symbol, side, triggerPrice, bufferMultiplier = 1) {
  const trigger = Number(triggerPrice)
  if (!Number.isFinite(trigger)) return triggerPrice
  const latestPrice = await getLatestPrice(symbol)
  if (!Number.isFinite(latestPrice) || latestPrice <= 0) return trigger

  const buffer = Math.max(0.0001, STOP_TRIGGER_BUFFER * bufferMultiplier)
  let normalized = trigger
  if (side === 'SELL' && normalized >= latestPrice) {
    normalized = latestPrice * (1 - buffer)
  }
  if (side === 'BUY' && normalized <= latestPrice) {
    normalized = latestPrice * (1 + buffer)
  }
  return formatByReferencePrecision(normalized, triggerPrice)
}

async function signTradFiPerpsAgreement() {
  if (!IS_LIVE_TRADING) return true
  if (tradFiAgreementSigned) return true
  const res = await contractAxios({
    method: 'post',
    url: '/fapi/v1/stock/contract',
    data: {
      timestamp: new Date().getTime()
    }
  }).catch(error => {
    global.errorLogger('签署 TradFi-Perps 协议失败:', error?.response?.data || error)
  })
  if (res) {
    tradFiAgreementSigned = true
    global.logger.info('签署 TradFi-Perps 协议成功')
  }
  return !!res
}
// 获取服务器时间
async function getServiceTime() {
  const res = await contractAxios({
    method: 'get',
    url: '/fapi/v1/time',
  }).catch(error => {
    global.errorLogger('请求失败:', error)
  })
  return res
}

// 获取交易规则和交易对
async function getExchangeInfo() {
  const res = await contractAxios({
    method: 'get',
    url: '/fapi/v1/exchangeInfo',
  }).catch(error => {
    global.errorLogger('请求失败:', error)
  })
  return res
}

// 获取单个合约的K线数据
async function getKlines(symbol, limit) {
  const res = await contractAxios({
    method: 'get',
    url: '/fapi/v1/klines',
    params: {
      symbol,
      limit: limit || 22,
      interval: '1d'
    }
  }).catch(error => {
    global.errorLogger('K线请求失败:', error?.response?.data || error)
  })
  return res
}

// 获取用户持仓模式
async function getPositionSideDual() {
  const res = await contractAxios({
    method: 'get',
    url: '/fapi/v1/positionSide/dual',
    params: {
      timestamp: new Date().getTime()
    }
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data)
  })
  return res && res.data
}

// 获取用户持仓风险
async function getPositionRisk(symbol, limit) {
  const res = await contractAxios({
    method: 'get',
    url: '/fapi/v2/positionRisk',
    params: {
      symbol,
      timestamp: new Date().getTime()
    }
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data)
  })
  return res && res.data
}

// 变换逐全仓模式
async function setMarginType(symbol, marginType) {
  if (!IS_LIVE_TRADING) {
    global.logger && global.logger.info('模拟盘跳过设置逐全仓模式', symbol)
    return '模拟盘'
  }
  await contractAxios({
    method: 'post',
    url: '/fapi/v1/marginType',
    data: {
      symbol,
      marginType: marginType || 'ISOLATED', // 保证金模式 ISOLATED(逐仓), CROSSED(全仓)
      timestamp: new Date().getTime()
    }
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data, symbol)
  })
  return '成功'
}

// 调整开仓杠杆
async function setLeverage(symbol, leverage) {
  if (!IS_LIVE_TRADING) {
    global.logger && global.logger.info('模拟盘跳过设置杠杆', { symbol, leverage })
    return { data: { symbol, leverage, simulated: true } }
  }
  const res = await contractAxios({
    method: 'post',
    url: '/fapi/v1/leverage',
    data: {
      symbol,
      leverage, // 目标杠杆倍数：1 到 125 整数
      timestamp: new Date().getTime()
    }
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data)
  })
  return res
}

// 合约下单带止损
async function contractOrder({ symbol, positionSide, quantity, stopPrice, leverage }) {
  if (!IS_LIVE_TRADING) {
    global.logger && global.logger.info('模拟盘下单', { symbol, positionSide, quantity, stopPrice, leverage })
    return { data: { symbol, positionSide, quantity, stopPrice, leverage, simulated: true } }
  }
  let marginTypeResData = await getPositionRisk(symbol)
  let marginType = marginTypeResData[0].marginType
  if (marginType == 'ISOLATED' || marginType == 'isolated') {
    global.logger.info('无需设置逐全仓模式设置', symbol)
  } else {
    await setMarginType(symbol, 'ISOLATED')
    global.logger.info('逐全仓模式设置成功', symbol)
  }
  await setLeverage(symbol, leverage)
  global.logger.info('杠杆设置成功', symbol)
  const orderPayload = {
    symbol,
    side: positionSide == 'LONG' ? 'BUY' : 'SELL', // BUY or SELL
    positionSide, // LONG 做多或 SHORT做空
    type: 'MARKET', // 订单类型 LIMIT, MARKET, STOP, TAKE_PROFIT, STOP_MARKET, TAKE_PROFIT_MARKET, TRAILING_STOP_MARKET
    timestamp: new Date().getTime(),
    quantity, // 下单数量
  }
  let orderError = null
  let res = await contractAxios({
    method: 'post',
    url: '/fapi/v1/order',
    data: orderPayload
  }).catch(error => {
    orderError = error
    global.errorLogger('下单失败:', error?.response?.data)
  })

  if (!res && getErrorCode(orderError) === -4411) {
    global.logger.warn(`${symbol} 需要签署 TradFi-Perps 协议，尝试自动签署后重试`)
    const agreementSigned = await signTradFiPerpsAgreement()
    if (agreementSigned) {
      res = await contractAxios({
        method: 'post',
        url: '/fapi/v1/order',
        data: {
          ...orderPayload,
          timestamp: new Date().getTime()
        }
      }).catch(error => {
        global.errorLogger('签署协议后重试下单失败:', error?.response?.data)
      })
    }
  }

  if (res) {
    global.logger.info('下单成功', {symbol, quantity, stopPrice})
    await deleteSetStopPrice(symbol)
    await setStopPrice(symbol, positionSide, stopPrice)
  }
  return res
}

// 删除全部条件单
async function deleteSetStopPrice(symbol) {
  console.log('删除全部条件单', symbol)
  if (!IS_LIVE_TRADING){
    return {}
  }
  const res = await contractAxios({
    method: 'delete',
    url: '/fapi/v1/algoOpenOrders',
    params: {
      symbol,
      timestamp: new Date().getTime()
    }
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data)
  })
  if (res) {
    global.logger.info('删除全部条件单成功', {symbol})
  }
  return res
}

// 设置修改止损止盈价格
async function setStopPrice(symbol, positionSide, stopPrice) {
  if (!IS_LIVE_TRADING){
    return {}
  }
  const side = positionSide == 'LONG' ? 'SELL' : 'BUY'
  let normalizedStopPrice = await normalizeTriggerPrice(symbol, side, stopPrice)
  if (Number(normalizedStopPrice) !== Number(stopPrice)) {
    global.logger.warn(`${symbol} 止损触发价已按当前价格修正: ${stopPrice} -> ${normalizedStopPrice}`)
  }
  let stopError = null
  let res = await contractAxios({
    method: 'post',
    url: '/fapi/v1/algoOrder',
    data: {
      algoType: 'CONDITIONAL',
      symbol,
      positionSide,
      side,
      type: 'STOP_MARKET',
      closePosition: true,
      timestamp: new Date().getTime(),
      triggerPrice: normalizedStopPrice
    }
  }).catch(error => {
    stopError = error
    global.errorLogger('请求失败:', error?.response?.data)
  })
  if (!res && getErrorCode(stopError) === -2021) {
    const retryStopPrice = await normalizeTriggerPrice(symbol, side, normalizedStopPrice, 2)
    if (Number(retryStopPrice) !== Number(normalizedStopPrice)) {
      global.logger.warn(`${symbol} 触发价过近，二次修正后重试: ${normalizedStopPrice} -> ${retryStopPrice}`)
      res = await contractAxios({
        method: 'post',
        url: '/fapi/v1/algoOrder',
        data: {
          algoType: 'CONDITIONAL',
          symbol,
          positionSide,
          side,
          type: 'STOP_MARKET',
          closePosition: true,
          timestamp: new Date().getTime(),
          triggerPrice: retryStopPrice
        }
      }).catch(error => {
        global.errorLogger('二次重试设置止损失败:', error?.response?.data)
      })
    }
  }
  if (res) {
    global.logger.info('修改止损止盈成功', {symbol,stopPrice: normalizedStopPrice})
  }
  return res
}

// 获取全部挂单
async function getOpenOrders(symbol) {
  const res = await contractAxios({
    method: 'get',
    url: '/fapi/v1/openOrders',
    params: {
      timestamp: new Date().getTime()
    }
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data)
  })
  return res && res.data
}
// 获取全部条件单
async function getOpenAlgoOrders(symbol) {
  const res = await contractAxios({
    method: 'get',
    url: '/fapi/v1/openAlgoOrders',
    params: {
      timestamp: new Date().getTime()
    }
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data)
  })
  return res && res.data
}

// 获取单个合约的挂单必须传symbol
// 可以获取单个品种的止损价格
async function getOneOpenOrders(symbol) {
  const normalRes = await contractAxios({
    method: 'get',
    url: '/fapi/v1/openOrders',
    params: {
      symbol,
      timestamp: new Date().getTime()
    }
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data)
  })
  const algoRes = await contractAxios({
    method: 'get',
    url: '/fapi/v1/openAlgoOrders',
    params: {
      symbol,
      timestamp: new Date().getTime()
    }
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data)
  })

  const normalOrders = normalRes?.data || []
  const algoOrders = (algoRes?.data || []).map(item => ({
    ...item,
    orderId: item.orderId || item.algoId,
    stopPrice: item.stopPrice || item.triggerPrice,
    time: item.time || item.updateTime
  }))
  return normalOrders.concat(algoOrders)
}

// 删除挂单接口
async function deleteOrder(symbol, orderId) {
  if (!IS_LIVE_TRADING) {
    global.logger && global.logger.info('模拟盘跳过撤单', { symbol, orderId })
    return {}
  }
  const res = await contractAxios({
    method: 'delete',
    url: '/fapi/v1/order',
    params: {
      symbol,
      orderId,
      timestamp: new Date().getTime()
    }
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data)
  })
  return res && res.data
}
// 删除订单接口
async function deleteAlgoOrder(symbol, algoid) {
  if (!IS_LIVE_TRADING) {
    global.logger && global.logger.info('模拟盘跳过删除条件单', { symbol, algoid })
    return {}
  }
  const res = await contractAxios({
    method: 'delete',
    url: '/fapi/v1/algoOrder',
    params: {
      symbol,
      algoid,
      timestamp: new Date().getTime()
    }
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data)
  })
  return res && res.data
}

// 查询所有订单(包括历史订单)
async function getOrderAmendment(symbol) {
  const res = await contractAxios({
    method: 'get',
    url: '/fapi/v1/allOrders',
    params: {
      symbol,
      timestamp: new Date().getTime()
    }
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data)
  })
  return res && res.data
}

// 账户成交历史 (USER_DATA)
async function getUserTrades(symbol) {
  const res = await contractAxios({
    method: 'get',
    url: '/fapi/v1/userTrades',
    params: {
      symbol,
      timestamp: new Date().getTime()
    }
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data)
  })
  return res && res.data
}

// 获取账户信息
async function getAccountData() {
  const res = await contractAxios({
    method: 'get',
    url: '/fapi/v2/account',
    params: {
      timestamp: new Date().getTime()
    }
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data)
  })
  return res && res.data
}

// 生成listenKey
async function getListenKey() {
  const res = await contractAxios({
    method: 'post',
    url: '/fapi/v1/listenKey',
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data)
  })
  return res && res.data
}

// 延长listenKey有效期
async function putListenKey() {
  const res = await contractAxios({
    method: 'put',
    url: '/fapi/v1/listenKey',
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data)
  })
  return res && res.data
}

// 关闭listenKey
async function deleteListenKey() {
  const res = await contractAxios({
    method: 'delete',
    url: '/fapi/v1/listenKey',
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data)
  })
  return res && res.data
}


module.exports = {
  getServiceTime,
  getKlines,
  setStopPrice,
  deleteSetStopPrice,
  setLeverage,
  setMarginType,
  contractOrder,
  getAccountData,
  getPositionRisk,
  getPositionSideDual,
  getExchangeInfo,
  putListenKey,
  deleteOrder,
  deleteAlgoOrder,
  getOrderAmendment,
  getUserTrades,
  getOneOpenOrders,
  getOpenOrders,
  getOpenAlgoOrders,
  getListenKey
};
