// 价格跟踪控制器
const { getAccountData, getKlines, setStopPrice, getListenKey, getOneOpenOrders  } = require('../services/binanceContractService');
const { klinesInit } = require('./calculatePositionsController');
const WebSocket = require('ws');
const { apiSocks } = require('../config/config')
const { SocksProxyAgent } = require('socks-proxy-agent');
const agent = new SocksProxyAgent(apiSocks);
const schedule = require('node-schedule');


// 获取账户权益
async function getEquity() {
  let res = await getAccountData()
  return res.totalMarginBalance // 保证金总余额
}

// 获取账户头寸
async function getAccountPosition() {
  let res = await getAccountData()
  if (!res) return
  let allPositions = res.positions
  return allPositions.filter((item)=>{
    return Math.abs(item.positionAmt) > 0
  }) // 保证金总余额
}


// 生成一个webSocket跟踪流
async function getWebSocket() {
  let data = await getListenKey();
  let listenKey = data.listenKey;
  WebSocket.client
  return new WebSocket(`wss://fstream.binance.com/ws/${listenKey}`, { agent });
}


// 仓位跟踪控制器

// 开始跟踪
async function startTracking() {
  let accountPosition = await getAccountPosition()
  let socket = await getWebSocket()
  let request = {
    "method": "SUBSCRIBE",
    "params":
      [
        "btcusdt@aggTrade"
      ],
    "id": 1
  }
  socket.on('open', () => {
    console.log('WebSocket connected');
    socket.send(JSON.stringify(request))
  });

  socket.on('message', (data) => {
    // 处理收到的消息
    console.log(JSON.parse(data));
  })
  socket.on('error', (err) => {
    global.errorLogger(err);
  });
}


function positionMonitor(){
  global.logger.info('开始跟踪')
  schedule.scheduleJob('0 0/1 * * * ?',async function () {
    let position = await getAccountPosition()
    for (let i in position) {
      let unrealizedProfit = Number(position[i].unrealizedProfit) // 未实现盈亏
      let isolatedWallet = Number(position[i].isolatedWallet) // 保证金
      if (unrealizedProfit > isolatedWallet) {
        stopPrice(position[i])
      }
    }
  })
}



// 获取合约价格
async function getPrice(symbol) {
  let res = await getKlines(symbol, 3)
  let klines = klinesInit(symbol, res.data).klines
  return klines[klines.length -1].close
}


//  获取合约的止损价格
async function getStopPrice(symbol) {
  let data = await getOneOpenOrders(symbol)
  return Number(data[data.length - 1]?.stopPrice)
}


function stopPrice(position) {
  // 新的止盈规则
  let unrealizedProfit = Number(position.unrealizedProfit) // 未实现盈亏
  let isolatedWallet = Number(position.isolatedWallet) // 保证金
  let direction =  Number(position.direction)  // 方向
  function getNewStopPrice(isolatedWallet,unrealizedProfit,price,direction) {
    // 计算要承担多少亏损
    // 如果盈利2个保证金承担1.8个保证金的亏损。
    // 每向上增长1一个保证金多承担0.1个保证金的亏损。
    let num = Math.floor(unrealizedProfit / isolatedWallet)
    let s = (num - 2) * 0.1 + 1.8 // 需要承担亏损多个保证金的倍数
    let f = price*(s/num) // 跌幅
    return direction > 0 ? price - f : price + f
  }
  if (unrealizedProfit / 2 > isolatedWallet){
    // let price
    let stopPriceIng = getStopPrice(position.symbol)
    let price = getPrice(position.symbol)
    let newStopPrice = getNewStopPrice(isolatedWallet,unrealizedProfit,price,direction)
    let isStart = direction > 0 ? newStopPrice > stopPriceIng : newStopPrice < stopPriceIng
    // 如果做空，止损价格大于历史止损价格，如果做多，止损价格小于历史止损价格，
    if (isStart){
      setNewStopPrice(position.symbol, newStopPrice, direction)
    }
  }
}

async function setNewStopPrice(symbol, stopPrice, direction) {
  let positionSide = direction > 0 ? 'LONG' : 'SHORT'
  await setStopPrice(symbol, positionSide, stopPrice)
  global.logger.info(`${symbol}跟踪设置止盈成功`)
}

module.exports = async function () {
  // startTracking()
  positionMonitor()
}











