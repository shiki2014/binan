const { contractAxios } = require('../axiosInstance/axiosInstance')
const { createHmac } = require('crypto')
const { apiSecret } = require('../config/config')

// 签名
function getSignature(paramsString) {
  let signature = createHmac('sha256',apiSecret).update(paramsString).digest('hex')
  return signature
}

// 对象转URL参数
function objectToUrlParams(object) {
  let params = '';
  for (let key in object) {
    let value = object[key];
    // 如果属性是一个对象或者数组，将其序列化为JSON格式字符串
    if (typeof value === 'object') {
      value = JSON.stringify(value);
    }
    params += `${encodeURIComponent(key)}=${encodeURIComponent(value)}&`;
  }
  // 删除最后一个"&"符号
  params = params.substring(0, params.length - 1);
  return params;
}

// 获取服务器时间
async function getServiceTime(){
  const res = await contractAxios({
    method: 'get',
    url:'/fapi/v1/time',
  }).catch(error => {
		console.error('请求失败:', error)
	})
  return res
}

// 获取交易规则和交易对
async function getExchangeInfo() {
  const res = await contractAxios({
    method: 'get',
    url:'/fapi/v1/exchangeInfo',
  }).catch(error => {
		console.error('请求失败:', error)
	})
  return res
}

// 获取单个合约的K线数据
async function getKlines(symbol,limit) {
  const res = await contractAxios({
    method: 'get',
    url:'/fapi/v1/klines',
    params: {
      symbol,
      limit:limit || 22,
      interval:'12h'
    }
  }).catch(error => {
		console.error('请求失败:', error)
	})
  return res
}

// 获取用户持仓模式
async function getPositionSideDual() {
  let timestamp = new Date().getTime()
  let params = {
    timestamp
  }
  let signature = getSignature(objectToUrlParams(params))
  params.signature = signature
  const res = await contractAxios({
    method: 'get',
    url:'/fapi/v1/positionSide/dual',
    params
  }).catch(error => {
		console.error('请求失败:', error.response.data)
	})
  return res.data
}

// 获取用户持仓风险
async function getPositionRisk(symbol,limit) {
  let timestamp = new Date().getTime()
  let params = {
    symbol,
    timestamp
  }
  let signature = getSignature(objectToUrlParams(params))
  params.signature = signature
  const res = await contractAxios({
    method: 'get',
    url:'/fapi/v2/positionRisk',
    params
  }).catch(error => {
		console.error('请求失败:', error.response.data)
	})
  return res.data
}

// 变换逐全仓模式
async function setMarginType (symbol,marginType) {
  let timestamp = new Date().getTime()
  let data = {
    symbol,
    marginType: marginType || 'ISOLATED', // 保证金模式 ISOLATED(逐仓), CROSSED(全仓)
    timestamp
  }
  let signature = getSignature(objectToUrlParams(data))
  data.signature = signature
  await contractAxios({
    method: 'post',
    url:'/fapi/v1/marginType',
    data
  }).catch(error => {
		console.error('请求失败:', error.response.data, symbol)
	})
  return '成功'
}

// 调整开仓杠杆
async function setLeverage (symbol,leverage) {
  let timestamp = new Date().getTime()
  let data = {
    symbol,
    leverage, // 目标杠杆倍数：1 到 125 整数
    timestamp
  }
  let signature = getSignature(objectToUrlParams(data))
  data.signature = signature
  const res = await contractAxios({
    method: 'post',
    url:'/fapi/v1/leverage',
    data
  }).catch(error => {
		console.error('请求失败:', error.response.data)
	})
  return res
}

// 合约下单带止损
async function contractOrder({ symbol, positionSide, quantity, stopPrice, leverage }) {
  let marginTypeResData = await getPositionRisk(symbol)
  let marginType = marginTypeResData[0].marginType
  console.log(marginType,symbol)
  if (marginType == 'ISOLATED' || marginType == 'isolated'){
    console.log('无需设置逐全仓模式设置')
  } else {
    let setMarginTypeRes = await setMarginType(symbol,'ISOLATED')
    console.log('逐全仓模式设置成功',setMarginTypeRes,symbol)
  }
  let leverageRes = await setLeverage(symbol,leverage)
  console.log('杠杆设置成功',leverageRes)
  let timestamp = new Date().getTime()
  let orderData = {
    symbol,
    side: positionSide == 'LONG' ? 'BUY' : 'SELL', // BUY or SELL
    positionSide, // LONG 做多或 SHORT做空
    type: 'MARKET', // 订单类型 LIMIT, MARKET, STOP, TAKE_PROFIT, STOP_MARKET, TAKE_PROFIT_MARKET, TRAILING_STOP_MARKET
    timestamp,
    quantity, // 下单数量
  }
  let signature = getSignature(objectToUrlParams(orderData))
  orderData.signature = signature
  console.log(orderData)
  const res = await contractAxios({
    method: 'post',
    url:'/fapi/v1/order',
    data:orderData
  }).catch(error => {
		console.error('下单失败:', error.response.data)
	})
  if (res){
    console.log('下单成功',res)
    await setStopPrice(symbol,positionSide,stopPrice)
  }
  return res
}

// 设置修改止损止盈价格
async function setStopPrice(symbol,positionSide,stopPrice) {
  console.log(symbol,stopPrice)
  let timestamp = new Date().getTime()
  let stopData = {
    symbol,
    positionSide,
    side: positionSide == 'LONG' ? 'SELL' : 'BUY',
    type: 'STOP_MARKET',
    closePosition : true,
    timestamp,
    stopPrice
  }
  stopData.signature = getSignature(objectToUrlParams(stopData))
  const res = await contractAxios({
    method: 'post',
    url:'/fapi/v1/order',
    data:stopData
  }).catch(error => {
		console.error('请求失败:', error.response.data)
	})
  if (res) {
    console.log('修改止损成功',res)
  }
  return res
}

// 获取账户信息
async function getAccountData() {
  let timestamp = new Date().getTime()
  const res = await contractAxios({
    method: 'get',
    url:'/fapi/v1/account',
    params: {
      timestamp,
      signature:getSignature(`timestamp=${timestamp}`)
    }
  }).catch(error => {
		console.error('请求失败:', error.response.data)
	})
  return res.data
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