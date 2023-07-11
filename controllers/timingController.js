// 定时控制器
const schedule = require('node-schedule');
const { getExchangeInfo, contractOrder, setLeverage, getAccountData, getServiceTime, getKlines, setStopPrice, getOrderAmendment, getOpenOrders, deleteOrder } = require('../services/binanceContractService');
const { exec } = require('child_process');
const iconv = require('iconv-lite')
const fs = require('fs');
const { getPreparingOrders, getAllExchangeInfo, getOneATR, getHighAndLow, klinesInit, getATR, getOneVol, getAverageAmplitude, getOneIndex } = require('./calculatePositionsController');

// 写入数据
function writeFile(jsonString, callback){
  fs.writeFile('./data/data.json', jsonString, (err) => {
    if (err) {
      global.errorLogger(err)
      process.exit(1)
    }
    callback && callback(true)
  });
}

// 获取币安服务器时间更新服务器时间
async function updateTime() {
  const dateObj1 = new Date()
  console.log("本地时间1:",dateObj1.toLocaleString())
  let time =  await getServiceTime()
  if (!time){
    return time
  }
  // 更新时间通过时间戳
  let timestamp = time.data.serverTime
  const dateObj = new Date(timestamp);
  const dateObj2 = new Date()
  console.log("本地时间2:",dateObj2.toLocaleString())
  console.log("币安服务器时间同步:", dateObj.toLocaleString());
  const command = `set-date -Date '${(new Date(timestamp + 2000)).toLocaleString()}'`
  async function execTime (command) {
    return new Promise((resolve, reject) => {
      exec(command, {'shell':'powershell.exe', encoding: 'buffer'}, (error, stdout, stderr) => {
        if (error) {
          global.errorLogger(`exec error: ${error}`)
          reject()
          return
        }
        console.log(`同步完成`);
        resolve({ stdout: iconv.decode(stdout, 'cp936')})
      });
    })
  }
  let execData = await execTime(command)
  return execData
}

// 更新所有交易对的ATR和波动率
async function updateAllATR(callback) {
  let indexObject = {}
  let res = await getAllExchangeInfo()
  let symbols = res.map((item)=>item.symbol)
  let count = 0
  function writeFile (url,obj,info){
    fs.writeFile(url, JSON.stringify(obj), (err) => {
      if (err) {
        global.errorLogger(err)
        process.exit(1)
        return false
      }
      callback && callback(true)
      global.logger.info(info)
    })
  }
  // 获取单个品种的指标
  async function getOne (symbol) {
    indexObject[symbol] = await getOneIndex(symbol)
    count++
    if (count === res.length){
      let ATRObj = {} // ATR
      let TOJ = {}  // 金死叉次数
      let volObj = {} // 波动率
      let AAObj = {} // 振幅
      Object.keys(indexObject).forEach(itemKey => {
        ATRObj[itemKey] = indexObject[itemKey].ATR
        TOJ[itemKey] = indexObject[itemKey].trendOscillation
        volObj[itemKey] = indexObject[itemKey].vol
        AAObj[itemKey] = indexObject[itemKey].averageAmplitude
      })
      writeFile('./data/ATR.json',ATRObj,'更新ATR成功')
      writeFile('./data/trendOscillation.json',TOJ,'更新金叉死叉数成功')
      writeFile('./data/volatility.json',volObj,'更新波动率成功')
    };
  }
  for (let i in symbols) {
    let symbol = symbols[i]
    getOne(symbol)
  }
}

// 根据波动率设置黑名单
function setBlackList (VolatilityObject) {
  let symbols = Object.keys(VolatilityObject)
  let blockList = []
  for (let i in symbols) {
    let symbol = symbols[i]
    let volatility = VolatilityObject[symbol]
    if (volatility < 0.001){
      blockList.push(symbol)
      continue
    }
  }
  fs.writeFile('./data/blackList.json', JSON.stringify(blockList), (err) => {
    if (err) {
      global.errorLogger(err)
      process.exit(1)
      return false
    }
    console.log('设置黑名单成功')
  })
}

// 更新合约交易对
async function updateAllExchangeInfo(){
  let res = await getExchangeInfo()
  let symbols = res.data.symbols
  let data = symbols.filter(item => item.symbol.includes("USDT"))
  writeFile(JSON.stringify(data), ()=>{
    console.log('更新交易对成功')
    updateAllATR()
  })
  return true
}

// 最多下单头寸
async function getMaxAvailableBalance (){
  let res = await getAccountData()
  let availableBalance = Number(res.availableBalance) // 账户余额
  let totalMarginBalance = Number(res.totalMarginBalance)/2 // 对半账户权益
  return totalMarginBalance > availableBalance ? availableBalance : totalMarginBalance
}

// 获取账户头寸
async function getAccountPosition() {
  let res = await getAccountData()
  if (!res) return
  let allPositions = res.positions
  return allPositions.filter((item)=>{
    return Math.abs(item.positionAmt) > 0
  })
}

// 下单！
async function order (){
  let equity = await getMaxAvailableBalance()
  let position = await getAccountPosition()
  let orderListOriginal = await getPreparingOrders(equity/4, position)
  if (orderListOriginal.length == 0){
    global.logger.info('没有符合条件的标的')
    return
  }
  let orderList = orderListOriginal.slice(0, 8) // 符合条件的前10
  let count = 0
  let allCount = orderList.length
  global.logger.info('开始下单',orderListOriginal.map(item => item.symbol))
  async function setOrder(item){
    await contractOrder({
      symbol: item.symbol,
      positionSide: item.direction > 0 ? 'LONG' : 'SHORT',
      quantity: parseFloat(item.quantity),
      stopPrice: item.stopPrice,
      leverage: item.leverage
    })
    count++
    if(count == allCount){
      global.logger.info('下单完毕')
    }
  }
  for (let i in orderList){
    setOrder(orderList[i])
  }
}

// 对所有开仓并符合条件的标的物设置止盈
async function setTakeProfit () {
  let positionList = await getAccountPosition() // 所有头寸
  let takeProfitList = []
  function signal (item){
    if (item.positionSide == 'SHORT'){
      return item.highestPoint < Number(item.entryPrice)
    }
    if (item.positionSide == 'LONG'){
      return item.lowestPoint > Number(item.entryPrice)
    }
    return false
  }
  for (let i in positionList){
    let res = await getKlines(positionList[i].symbol, 11)
    let klines = klinesInit(positionList[i].symbol, res.data).klines
    let ATR = getATR(klines.slice(0, klines.length - 1), positionList[i].symbol)
    let data = {
      ...getHighAndLow(klines.slice(0, klines.length - 1), positionList[i].symbol),
      ...positionList[i],
      ATR
    }
    if (signal(data)){
      takeProfitList.push(data)
      let stopPrice = data.positionSide == 'SHORT' ? data.highestPoint : data.lowestPoint
      await setStopPrice(data.symbol, data.positionSide, stopPrice)
      global.logger.info(`${data.symbol}设置止盈成功`)
    }
  }
  if (takeProfitList.length === 0){
    global.logger.info('没有需要设置止盈的标的物')
  }
  return takeProfitList
}

// 获取单个品种的风险
async function getOneRisk(symbol, entryPrice, leverage, isolatedWallet){
  let data = await getOrderAmendment(symbol)
  console.log(data,symbol)
  let stopPrice = data[data.length - 1]?.stopPrice
  let ads = Math.abs(Number(entryPrice) - Number(stopPrice))
  let b = (ads/entryPrice) * Number(leverage)
  return Number(isolatedWallet) * b
}

// 获取仓位盈亏以及风险
async function getPositionRisk () {
  let position = await getAccountPosition()
  console.log('当前仓位', position);
  let unrealizedProfit = 0
  let maxRisk = 0
  let marginAlreadyUsed = 0
  for (let i in position) {
    unrealizedProfit += Number(position[i].unrealizedProfit)
    maxRisk += await getOneRisk(position[i].symbol,position[i].entryPrice,position[i].leverage,position[i].isolatedWallet)
    marginAlreadyUsed += Number(position[i].isolatedWallet)
  }
  // console.log('已经使用的保证金', marginAlreadyUsed)
  // console.log('可能出现的最大亏损', maxRisk)
  // console.log('仓位盈亏', unrealizedProfit);
  return {
    maxRisk,
    unrealizedProfit,
    marginAlreadyUsed
  }
}

// 获取当前仓位
async function start () {
  // let time = await updateTime()
  // if (!time) return global.errorLogger('时间同步失败', time)
  // getPositionRisk()
  // let data = await getOpenOrders()
  // console.log(data)
  deleteAllInvalidOrders()
  // updateAllExchangeInfo()
  // console.log('符合条件可以下单的仓位')
  // let list = await getPreparingOrders(3000)
  // console.log(list)
  // let orders = list.slice(0, 5)
  // for (let i in orders) {
  //   console.log(`===========\n名字 ${orders[i].symbol}\n方向 ${orders[i].direction < 0 ? '做空' : '做多'}\n杠杆 ${orders[i].leverage}\n数量USDT ${orders[i].position}\n价格 ${orders[i].closePrice}\n止损 ${orders[i].stopPrice}`)
  // }
}

// 获取当前ATR
async function getCurrentATR (symbol) {
  let res = await getKlines(symbol, 20)
  let klines = klinesInit(symbol, res.data).klines
  let ATR = getATR(klines, 18, symbol)
  return ATR
}

// 删除已经无用的委托
async function deleteAllInvalidOrders(){
  let orders = await getOpenOrders()
  orders = orders.map(function(item){
    item.orderId = item.orderId.toString()
    return item
  })
  let position = await getAccountPosition()
  let symbols = position.map(item => item.symbol)
  // 分类
  let obj = {}
  let invalidOrders = []
  for (let i in symbols) {
    let lData = orders.filter(item => item.symbol === symbols[i]).sort((a,b) =>{
      return b.time - a.time
    })
    obj[symbols[i]] = lData
    for(let i2 in lData){
      if (i2 != 0){
        invalidOrders.push(lData[i2])
      }
    }
  }
  if (invalidOrders.length > 0){
    global.logger.info('开始删除无效订单')
    for (let i in invalidOrders){
      await deleteOrder(invalidOrders[i].symbol, invalidOrders[i].orderId)
      global.logger.info('撤销挂单完成',invalidOrders[i].symbol,invalidOrders[i].orderId,invalidOrders[i].stopPrice)
    }
  } else {
    global.logger.info('没有需要删除的订单')
  }
}


// 初始化数据
function initData () {
  // 判断data文件夹存不存在
  if (!fs.existsSync('./data')){
    fs.mkdirSync('./data')
  }
  if (!fs.existsSync('./data/ATR.json')){
    fs.writeFileSync('./data/ATR.json','')
  }
  updateAllExchangeInfo()
}

module.exports = async function () {
  global.logger.info('定时交易策略开始')
  // start()
  initData()
  schedule.scheduleJob('4 0 7,19 * * *',async function () {
    // 更新合约交易
    global.logger.info('更新合约对开始');
    // await updateTime()
    updateAllExchangeInfo()
  })
  schedule.scheduleJob('10 0 8,20 * * *', async function () {
    // 获取最新数据
    global.logger.info('获取下单交易数据下单')
    await order()
    global.logger.info('开始仓位止盈设置')
    await setTakeProfit()
    global.logger.info('删除无效委托')
    deleteAllInvalidOrders()
  })
};