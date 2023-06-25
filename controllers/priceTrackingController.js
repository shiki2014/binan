// 价格跟踪控制器
const { getExchangeInfo, contractOrder, getAccountData, getServiceTime, getKlines, setStopPrice, getListenKey  } = require('../services/binanceContractService');
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
    console.error(err);
  });
}


function positionMonitor(){
  schedule.scheduleJob('0 0/1 * * * ?',async function () {
    let position = await getAccountPosition()
    for (let i in position) {
      let unrealizedProfit = Number(position[i].unrealizedProfit) // 未实现盈亏
      let isolatedWallet = Number(position[i].isolatedWallet)
      if (unrealizedProfit > isolatedWallet) {
        console.log(position[i].symbol,'盈利已经大于保证金')
      }
    }
  })
}

function stopPrice(position) {
  // 新的止盈规则
}


module.exports = async function () {
  startTracking()
  positionMonitor()
}











