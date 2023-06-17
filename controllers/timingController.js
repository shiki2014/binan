// 定时控制器
const schedule = require('node-schedule');
const axios = require('axios');
const { getExchangeInfo, contractOrder, getAccountData, getServiceTime, getKlines  } = require('../services/binanceContractService');
const { exec } = require('child_process');
const iconv = require('iconv-lite')
const fs = require('fs');
const { getPreparingOrders, getAllExchangeInfo, getOneATR, getHighAndLowAndATR, klinesInit } = require('./calculatePositionsController');

// 写入数据
function writeFile(jsonString, callback){
  fs.writeFile('./data/data.json', jsonString, (err) => {
    if (err) {
      console.error(err)
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
  // 更新时间通过时间戳
  let timestamp = time.data.serverTime
  const dateObj = new Date(timestamp);
  const dateObj2 = new Date()
  console.log("本地时间2:",dateObj2.toLocaleString())
  console.log("币安服务器时间同步:", dateObj.toLocaleString());
  const command = `set-date -Date '${dateObj.toLocaleString()}'`
  exec(command, {'shell':'powershell.exe', encoding: 'buffer'}, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`同步完成`);
    let stdoutstr = iconv.decode(stdout, 'cp936') // 信息解码
    console.log(`stdout: ${stdoutstr}`);
    // if (stderr){
    //   console.error(`stderr: ${stderr.toString()}`);
    // }
  });
}

// 更新所有交易对的ATR
async function updateAllATR(callback) {
  let ATRObject = {}
  let res = await getAllExchangeInfo()
  let symbols = res.map((item)=>item.symbol)
  for (let i in symbols){
    let symbol = symbols[i]
    ATRObject[symbol] = await getOneATR(symbol)
    console.log(ATRObject[symbol],'成功一个')
  }
  fs.writeFile('./data/ATR.json', JSON.stringify(ATRObject), (err) => {
    if (err) {
      console.error(err)
      process.exit(1)
    }
    callback && callback(true)
    console.log('更新ATR成功')
  });
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

// 获取账户权益
async function getEquity() {
  let res = await getAccountData()
  return res.totalMarginBalance // 保证金总余额
}

// 获取账户头寸
async function getAccountPosition() {
  let res = await getAccountData()
  let allPositions = res.positions
  return allPositions.filter((item)=>{
    return Math.abs(item.positionAmt) > 0
  }) // 保证金总余额
}

// 下单！
async function order (){
  let equity = await getEquity()
  let orderListOriginal = await getPreparingOrders(equity/2)
  if (orderListOriginal.length == 0){
    console.log('没有符合条件的标的')
    return
  }
  let orderList = orderListOriginal.slice(0, 3) // 只进行符合条件的前三个
  let count = 0
  let allCount = orderList.length
  console.log('开始下单',orderListOriginal)
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
      console.log('下单完毕');
      console.log('当前仓位',await getAccountPosition())
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
      return item.highestPoint < item.entryPrice
    }
    if (item.positionSide == 'LONG'){
      return item.lowestPoint > item.entryPrice
    }
    return false
  }
  for (let i in positionList){
    let res = await getKlines(positionList[i].symbol, 11)
    let klines = klinesInit(positionList[i].symbol, res.data).klines
    let data = {
      ...getHighAndLowAndATR(klines.slice(0, klines.length - 1)),
      ...positionList[i]
    }
    console.log(data)
    if (signal(data)){
      takeProfitList.push(data)
      let stopPrice = data.positionSide == 'SHORT' ? data.highestPoint : data.lowestPoint
      await setStopPrice(data.symbol, data.positionSide, stopPrice)
      console.log(`${data.symbol}设置止盈成功`)
    }
  }
  if (takeProfitList.length === 0){
    console.log('没有需要设置止盈的标的物')
  }

  return takeProfitList
}


module.exports = async function () {
  console.log('定时交易策略开始')
  schedule.scheduleJob('4 0 7,19 * * *',async function () {
    // 更新合约交易
    console.log('更新合约对开始');
    await updateTime()
    updateAllExchangeInfo()
  })
  schedule.scheduleJob('4 0 8,20 * * *', async function () {
    // 获取最新数据
    console.log('获取下单交易数据下单')
    order()
    console.log('开始仓位止盈设置')
    console.log(await setTakeProfit())
    console.log('二次获取测试')
    console.log(await getPreparingOrders(9000/2))
  })
};