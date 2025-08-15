// 合约交易
const { contractAxios } = require('../axiosInstance/axiosInstance')
require('dotenv').config();
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
  const res = await contractAxios({
    method: 'post',
    url: process.env.NODE_ENV === 'development' ? '/fapi/v1/order/test' :'/fapi/v1/order',
    data: {
      symbol,
      side: positionSide == 'LONG' ? 'BUY' : 'SELL', // BUY or SELL
      positionSide, // LONG 做多或 SHORT做空
      type: 'MARKET', // 订单类型 LIMIT, MARKET, STOP, TAKE_PROFIT, STOP_MARKET, TAKE_PROFIT_MARKET, TRAILING_STOP_MARKET
      timestamp: new Date().getTime(),
      quantity, // 下单数量
    }
  }).catch(error => {
    global.errorLogger('下单失败:', error?.response?.data)
  })
  if (res) {
    global.logger.info('下单成功', {symbol,quantity})
    await setStopPrice(symbol, positionSide, stopPrice)
  }
  return res
}

// 设置修改止损止盈价格
async function setStopPrice(symbol, positionSide, stopPrice) {
  if (process.env.NODE_ENV === 'development'){
    return {}
  }
  const res = await contractAxios({
    method: 'post',
    url: '/fapi/v1/order',
    data: {
      symbol,
      positionSide,
      side: positionSide == 'LONG' ? 'SELL' : 'BUY',
      type: 'STOP_MARKET',
      closePosition: true,
      timestamp: new Date().getTime(),
      stopPrice
    }
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data)
  })
  if (res) {
    global.logger.info('修改止损止盈成功', {symbol,stopPrice})
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

// 获取单个合约的挂单必须传symbol
// 可以获取单个品种的止损价格
async function getOneOpenOrders(symbol) {
  const res = await contractAxios({
    method: 'get',
    url: '/fapi/v1/openOrders',
    params: {
      symbol,
      timestamp: new Date().getTime()
    }
  }).catch(error => {
    global.errorLogger('请求失败:', error?.response?.data)
  })
  return res && res.data
}

// 删除挂单接口
async function deleteOrder(symbol, orderId) {
  const res = await contractAxios({
    method: 'delete',
    url: '/fapi/v1/order',
    params: {
      symbol,
      orderId,
      timestamp: new Date().getTime()
    }
  }).catch(error => {
    console.log(error)
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
  setLeverage,
  setMarginType,
  contractOrder,
  getAccountData,
  getPositionRisk,
  getPositionSideDual,
  getExchangeInfo,
  putListenKey,
  deleteOrder,
  getOrderAmendment,
  getUserTrades,
  getOneOpenOrders,
  getOpenOrders,
  getListenKey
};