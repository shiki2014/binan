// 合约交易
const { contractAxios } = require('../axiosInstance/axiosInstance')

// 获取服务器时间
async function getServiceTime() {
  const res = await contractAxios({
    method: 'get',
    url: '/fapi/v1/time',
  }).catch(error => {
    console.error('请求失败:', error)
  })
  return res
}

// 获取交易规则和交易对
async function getExchangeInfo() {
  const res = await contractAxios({
    method: 'get',
    url: '/fapi/v1/exchangeInfo',
  }).catch(error => {
    console.error('请求失败:', error)
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
      interval: '12h'
    }
  }).catch(error => {
    console.error('请求失败:', error)
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
    console.error('请求失败:', error.response.data)
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
    console.error('请求失败:', error.response.data)
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
    console.error('请求失败:', error.response.data, symbol)
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
    console.error('请求失败:', error.response.data)
  })
  return res
}

// 合约下单带止损
async function contractOrder({ symbol, positionSide, quantity, stopPrice, leverage }) {
  let marginTypeResData = await getPositionRisk(symbol)
  let marginType = marginTypeResData[0].marginType
  console.log(marginType, symbol)
  if (marginType == 'ISOLATED' || marginType == 'isolated') {
    console.log('无需设置逐全仓模式设置')
  } else {
    let setMarginTypeRes = await setMarginType(symbol, 'ISOLATED')
    console.log('逐全仓模式设置成功', setMarginTypeRes, symbol)
  }
  let leverageRes = await setLeverage(symbol, leverage)
  console.log('杠杆设置成功', leverageRes)
  const res = await contractAxios({
    method: 'post',
    url: '/fapi/v1/order',
    data: {
      symbol,
      side: positionSide == 'LONG' ? 'BUY' : 'SELL', // BUY or SELL
      positionSide, // LONG 做多或 SHORT做空
      type: 'MARKET', // 订单类型 LIMIT, MARKET, STOP, TAKE_PROFIT, STOP_MARKET, TAKE_PROFIT_MARKET, TRAILING_STOP_MARKET
      timestamp: new Date().getTime(),
      quantity, // 下单数量
    }
  }).catch(error => {
    console.error('下单失败:', error.response.data)
  })
  if (res) {
    console.log('下单成功', res)
    await setStopPrice(symbol, positionSide, stopPrice)
  }
  return res
}

// 设置修改止损止盈价格
async function setStopPrice(symbol, positionSide, stopPrice) {
  console.log(symbol, stopPrice)
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
    console.error('请求失败:', error.response.data)
  })
  if (res) {
    console.log('修改止损止盈成功', res)
  }
  return res
}

// 获取账户信息
async function getAccountData() {
  const res = await contractAxios({
    method: 'get',
    url: '/fapi/v1/account',
    params: {
      timestamp: new Date().getTime()
    }
  }).catch(error => {
    console.error('请求失败:', error.response.data)
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
  getExchangeInfo
};