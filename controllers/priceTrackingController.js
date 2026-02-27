// 价格跟踪控制器
const { getAccountData, getKlines, setStopPrice, getListenKey, getOneOpenOrders } = require('../services/binanceContractService');
const { klinesInit } = require('./calculatePositionsController');
const { safeFormatPrice } = require('../utils/precisionUtils');
const { getATRCompute } = require('../utils/mathUtils');
const { API_CONFIG, MONITOR_CONFIG } = require('../core/constants');
const WebSocket = require('ws');
const { SocksProxyAgent } = require('socks-proxy-agent');
const agent = new SocksProxyAgent(API_CONFIG.SOCKS_PROXY);
const schedule = require('node-schedule');
const fs = require('fs');


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
  return allPositions.filter((item) => {
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


// 存储品种历史最高价/最低价
let symbolHighLowCache = {}


// 获取ATR数据
function getATRData() {
  try {
    const data = fs.readFileSync('./data/ATR.json', 'utf8')
    return JSON.parse(data || '{}')
  } catch (error) {
    global.errorLogger('读取ATR数据失败:', error)
    return {}
  }
}

// 获取品种最近价格和K线数据
async function getSymbolKlineData(symbol, limit = 50) {
  try {
    const res = await getKlines(symbol, limit)
    const klines = klinesInit(symbol, res.data).klines
    return klines
  } catch (error) {
    global.errorLogger(`获取${symbol}K线数据失败:`, error)
    return null
  }
}

// 计算品种当前ATR
async function getCurrentATR(klines) {
  if (!klines || klines.length < 14) return null
  return getATRCompute(klines.slice(-14), 14)
}

// 监控做多品种新高并调整止损
async function monitorLongPosition(position) {
  const symbol = position.symbol
  const currentPrice = Number(position.markPrice)

  // 获取K线数据
  const klines = await getSymbolKlineData(symbol)
  if (!klines) return

  // 获取ATR
  const atrData = getATRData()
  const currentATR = atrData[symbol] || await getCurrentATR(klines)
  if (!currentATR) return

  // 初始化或更新历史最高价
  if (!symbolHighLowCache[symbol]) {
    symbolHighLowCache[symbol] = { high: currentPrice, low: currentPrice }
  }

  const isNewHigh = currentPrice > symbolHighLowCache[symbol].high

  if (isNewHigh) {
    symbolHighLowCache[symbol].high = currentPrice
    global.logger.info(`${symbol} 创新高: ${currentPrice}`)

    // 计算新的止损价格：从新高向下N个ATR
    const rawStopPrice = currentPrice - (MONITOR_CONFIG.POSITION_MONITOR.ATR_MULTIPLIER * currentATR)

    // 使用精度工具格式化止损价格
    const newStopPrice = await safeFormatPrice(rawStopPrice, symbol)

    // 获取当前设置的止损价格
    const currentStopPrice = await getStopPrice(symbol)

    // 如果新止损价格大于当前止损价格，则更新
    if (!Number.isFinite(currentStopPrice) || newStopPrice > currentStopPrice) {
      await setNewStopPrice(symbol, newStopPrice, 1)
      global.logger.info(`${symbol} 做多止损调整: ${currentStopPrice} -> ${newStopPrice}`)
    }
  }
}

// 监控做空品种新低并调整止损
async function monitorShortPosition(position) {
  const symbol = position.symbol
  const currentPrice = Number(position.markPrice)

  // 获取K线数据
  const klines = await getSymbolKlineData(symbol)
  if (!klines) return

  // 获取ATR
  const atrData = getATRData()
  const currentATR = atrData[symbol] || await getCurrentATR(klines)
  if (!currentATR) return

  // 初始化或更新历史最低价
  if (!symbolHighLowCache[symbol]) {
    symbolHighLowCache[symbol] = { high: currentPrice, low: currentPrice }
  }

  const isNewLow = currentPrice < symbolHighLowCache[symbol].low

  if (isNewLow) {
    symbolHighLowCache[symbol].low = currentPrice
    global.logger.info(`${symbol} 创新低: ${currentPrice}`)

    // 计算新的止损价格：从新低向上N个ATR
    const rawStopPrice = currentPrice + (MONITOR_CONFIG.POSITION_MONITOR.ATR_MULTIPLIER * currentATR)

    // 使用精度工具格式化止损价格
    const newStopPrice = await safeFormatPrice(rawStopPrice, symbol)

    // 获取当前设置的止损价格
    const currentStopPrice = await getStopPrice(symbol)

    // 如果新止损价格小于当前止损价格，则更新
    if (!Number.isFinite(currentStopPrice) || newStopPrice < currentStopPrice) {
      await setNewStopPrice(symbol, newStopPrice, -1)
      global.logger.info(`${symbol} 做空止损调整: ${currentStopPrice} -> ${newStopPrice}`)
    }
  }
}

// 增强的仓位监控系统
function positionMonitor() {
  global.logger.info('开始增强仓位监控系统')
  global.logger.info(`监控配置: 检查间隔=${MONITOR_CONFIG.POSITION_MONITOR.CHECK_INTERVAL}, ATR倍数=${MONITOR_CONFIG.POSITION_MONITOR.ATR_MULTIPLIER}`)

  // 根据配置的时间间隔检查所有持仓
  schedule.scheduleJob(MONITOR_CONFIG.POSITION_MONITOR.CHECK_INTERVAL, async function () {
    try {
      const positions = await getAccountPosition()
      if (!positions || positions.length === 0) return

      global.logger.info(`监控 ${positions.length} 个持仓品种`)

      for (const position of positions) {
        const positionSide = Number(position.positionAmt) > 0 ? 'LONG' : 'SHORT'

        // 新高新低跟踪止损逻辑
        if (MONITOR_CONFIG.POSITION_MONITOR.ENABLE_HIGH_LOW_TRACKING) {
          if (positionSide === 'LONG') {
            await monitorLongPosition(position)
          } else {
            await monitorShortPosition(position)
          }
        }

        // 保持原有的止盈逻辑
        if (MONITOR_CONFIG.POSITION_MONITOR.ENABLE_ORIGINAL_STOP_LOGIC) {
          let unrealizedProfit = Number(position.unrealizedProfit)
          let isolatedWallet = Number(position.isolatedWallet)
          if (unrealizedProfit > isolatedWallet) {
            await stopPrice(position)
          }
        }
      }
    } catch (error) {
      global.errorLogger('仓位监控错误:', error)
    }
  })
}



// 获取合约价格
async function getPrice(symbol) {
  let res = await getKlines(symbol, 3)
  if (!res || !res.data || res.data.length < 3) return null
  let klines = klinesInit(symbol, res.data).klines
  return klines[klines.length - 1].close
}


//  获取合约的止损价格
async function getStopPrice(symbol) {
  let data = await getOneOpenOrders(symbol)
  if (!Array.isArray(data) || data.length === 0) return null
  let lData = data.sort((a, b) => {
    return b.time - a.time
  })
  return Number(lData[0]?.stopPrice)
}


async function stopPrice(position) {
  // 新的止盈规则
  let unrealizedProfit = Number(position.unrealizedProfit) // 未实现盈亏
  let isolatedWallet = Number(position.isolatedWallet) // 保证金
  let direction = Number(position.positionAmt) > 0 ? 1 : -1  // 方向
  function getNewStopPrice(isolatedWallet, unrealizedProfit, price, direction) {
    // 计算要承担多少亏损
    // 如果盈利2个保证金承担1.8个保证金的亏损。
    // 每向上增长1一个保证金多承担0.1个保证金的亏损。
    let num = Math.floor(unrealizedProfit / isolatedWallet)
    let s = (num - 2) * 0.1 + 1.8 // 需要承担亏损多个保证金的倍数
    let f = price * (s / num) // 跌幅
    return direction > 0 ? price - f : price + f
  }
  if (unrealizedProfit / 2 > isolatedWallet) {
    const [stopPriceIng, price] = await Promise.all([
      getStopPrice(position.symbol),
      getPrice(position.symbol)
    ])
    if (!Number.isFinite(stopPriceIng) || !Number.isFinite(price)) {
      return
    }
    let rawStopPrice = getNewStopPrice(isolatedWallet, unrealizedProfit, price, direction)
    let newStopPrice = await safeFormatPrice(rawStopPrice, position.symbol)
    let isStart = direction > 0 ? newStopPrice > stopPriceIng : newStopPrice < stopPriceIng
    // 如果做空，止损价格大于历史止损价格，如果做多，止损价格小于历史止损价格，
    if (isStart) {
      await setNewStopPrice(position.symbol, newStopPrice, direction)
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








