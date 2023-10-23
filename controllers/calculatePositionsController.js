// 计算仓位控制器
const {  getKlines  } = require('../services/binanceContractService');
const fs = require('fs');
const breakthroughCoefficient = 20 // 突破系数
const bc = 20 // 突破系数
const breakthroughCoefficient20 = 20 // 多少根k线内算第一次突破
// 整体逻辑

// 在每天的19点和早上的7点进行时间校准合约交易对的数据更新
// 在每天的20点和早上的8点进行获取所有合约的K线数据
// 对每一个合约进行数据分析
// 如果符合进场再通过ATR均衡计算仓位做多做空设置止损
// 符合条件后做止盈移动
// 如果最近10跟k线低点大于开仓均价，则移动

// 读取数据
function readFile(callback){
  return new Promise(function (resolve, reject) {
    fs.readFile('./data/data.json', function (err, data) {
      if (err) {
        reject(err);
        global.errorLogger(err)
        process.exit(1)
      }
      resolve(data.toString())
    })
  })
}

// 单品种K线初始化函数
function klinesInit(symbol, data, quantityPrecision, pricePrecision) {
  let klinesAdd20 = data.map((item) => {
    return {
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[7]),
      transactionsNumber: parseFloat(item[8])
    }
  })
  let klines = klinesAdd20.length > (breakthroughCoefficient + 2) ? klinesAdd20.slice(klinesAdd20.length-breakthroughCoefficient-2,klinesAdd20.length) : klinesAdd20
  // 获取ATR高点低点
  let HAL = getHighAndLow(klines.slice(0, klines.length - 2),symbol) // 高点低点
  let ATR = getATR(klines.slice(0, klines.length - 1), 14, symbol)
  return {
    ...HAL,
    ATR,
    quantityPrecision, // 仓位精度
    pricePrecision, // 价格精度
    currentPrice: klines[klines.length - 1].close,
    closePrice: klines[klines.length - 2].close,
    openPrice: klines[klines.length - 2].open,
    highPrice: klines[klines.length - 2].high,
    lowPrice: klines[klines.length - 2].low,
    transactionsNumber:klines[klines.length - 2].transactionsNumber,
    symbol,
    klines,
    klinesAdd20
  }
}

// 计算24小时波幅
function getAmplitude(item){
  let open = item.klines[item.klines.length - 3].open
  let close = item.klines[item.klines.length - 2].close
  return Math.abs(open - close)/open
}

// 标的物权重排序
function weightSorting(data){
  // x * 0.6 + y * 0.4
  // 根据品种的趋势特征进行排序
  // let TO = JSON.parse(getTrendOscillation())
  // let sortList = data.map((item)=>{
  //   item.TO = TO[item.symbol]
  //   return item
  // }).sort((a, b)=>{
  //   return a.TO - b.TO
  // })
  // 根据品种的波幅进行排序
  let sortList = data.map((item)=>{
    return item
  }).sort((a, b)=>{
    return getAmplitude(b) - getAmplitude(a)
  })
  // 排序规则根据 transactionsNumber（成交笔数）大在前小在后
  // let data2 = data.map((item)=>{
  //   return item
  // }).sort((a, b)=>{
  //   return b.klines[b.klines.length - 2].transactionsNumber - a.klines[a.klines.length - 2].transactionsNumber
  // })
  // 新规则根据过去震荡频率
  return sortList
}

// 寻找k线的最高点和最低点
function getHighAndLow(klines, symbol) {
  // 解析K线数据
  const parsedKlines = klines.map(kline => ({
    high: parseFloat(kline.high), // 最高价
    low: parseFloat(kline.low) // 最低价
  }))
  // 找到最高点和最低点
  let highestPoint = parsedKlines[0].high
  let lowestPoint = parsedKlines[0].low
  parsedKlines.forEach(kline => {
    if (kline.high > highestPoint) {
      highestPoint = kline.high;
    }
    if (kline.low < lowestPoint) {
      lowestPoint = kline.low;
    }
  })
  return {
    highestPoint,
    lowestPoint
  }
}

// 获取震荡和趋势平均值
function getTrendOscillation () {
  try {
    let data = fs.readFileSync('./data/trendOscillation.json')
    return data.toString()
  } catch (err) {
    global.errorLogger(err);
  }
}

// 获取白名单
function getWhiteList () {
  try {
    let data = fs.readFileSync('./data/whiteList.json')
    return data.toString()
  } catch (err) {
    global.errorLogger(err);
  }
}

// 获取黑名单
function getBlackList () {
  try {
    let data = fs.readFileSync('./data/blackList.json')
    return data.toString()
  } catch (err) {
    global.errorLogger(err);
  }
}

// 获取所有合约的K线数据并处理
function getAllKlines() {
  return new Promise(async function (resolve, reject) {
    global.logger.info('getAllKlines','开始获取所有K线数据并处理')
    let data = []
    let allExchangeInfo = await getAllExchangeInfo()
    if (!allExchangeInfo) {
      reject()
    }
    let count = 0
    let blackList = JSON.parse(getBlackList() || '[]')
    let whiteList = JSON.parse(getWhiteList() || '[]')
    let symbols = allExchangeInfo.filter((item) =>{
      return !blackList.includes(item.symbol) || whiteList.includes(item.symbol)
    })
    let allCount = symbols.length
    async function getData(symbol,quantityPrecision,pricePrecision) {
      let res = await getKlines(symbol,42).catch((err)=>{
        reject(err)
      })
      count++
      // 同时初始化
      if (res.data.length >= 22){
        data.push(klinesInit(symbol,res.data,quantityPrecision,pricePrecision))
      }
      if (count === allCount) {
        global.logger.info('所有K线数据获取完毕')
        resolve(data)
      }
    }
    for (let i in symbols) {
      if(!blackList.includes(symbols[i].symbol) || whiteList.includes(symbols[i].symbol)){
        getData(symbols[i].symbol,symbols[i].quantityPrecision,symbols[i].pricePrecision)
      }
    }
  })
}

// 信号
function signal(symbolData,profitableSymbol) {
  // k线收盘时，最高点突破，并且是阳线
  // k线收盘时，最低点突破，并且是阴线
  // 循环遍历，如果是在40根K线内是第一次突破，那么信号返回真 或者 标的物已经拥有浮盈
  let klines20 = symbolData.klinesAdd20
  function ng (data){
    let solidHeight = Math.abs(data.closePrice - data.openPrice)
    let upHatchedHeight = Math.abs(data.closePrice - data.highPrice) // 阳线的上影线
    let downHatchedHeight = Math.abs(data.closePrice - data.lowPrice) // 阴线的下阴线
    let LONG = data.highPrice > data.highestPoint && data.closePrice >= data.openPrice && ( solidHeight > upHatchedHeight || data.closePrice > data.highestPoint )
    let SHORT = data.lowPrice < data.lowestPoint && data.closePrice <= data.openPrice && ( solidHeight > downHatchedHeight || data.closePrice < data.lowestPoint )
    return {LONG,SHORT}
  }
  let ls = ng(symbolData) // 当前信号是要做多还是做空还是没有信号
  if (ls.LONG||ls.SHORT){
    let name = ls.LONG ? 'LONG' : 'SHORT'
    let fname = ls.LONG ? 'SHORT' : 'LONG'
    function klinesData(klines){
      let HAL = getHighAndLow(klines.slice(0, klines.length - 2),symbolData.symbol) // 高点低点
      return {
        ...HAL,
        closePrice: klines[klines.length - 2].close,
        openPrice: klines[klines.length - 2].open,
        highPrice: klines[klines.length - 2].high,
        lowPrice: klines[klines.length - 2].low,
        transactionsNumber:klines[klines.length - 2].transactionsNumber
      }
    }
    let maxNum = klines20.length
    let cs = breakthroughCoefficient + 2
    let isOne = true
    for(let i = maxNum - cs - 1; i >= 0; i--){
      let objn = ng(klinesData(klines20.slice(i , i + cs)))
      if (objn[name]){
        isOne = false
      }
      if (objn[fname]){
        break
      }
    }
    return isOne || profitableSymbol.includes(symbolData.symbol)
  }
  return false
}

// 完全数据初始化函数 获取准备下单的数据
async function getPreparingOrders(equity, positionIng){
  let primitiveData = weightSorting(await getAllKlines())
  let preparingOrders = [] // 准备下单的数据
  let profitableSymbol = positionIng.filter(item=>{
    return Number(item.unrealizedProfit) > 0
  }).map(item=>item.symbol) // 当前正收益的仓位
  let data = primitiveData.filter((item) => signal(item,profitableSymbol)) // 符合条件的下单
  for (let i in data) {
    // 符合下单条件
    let symbol = data[i].symbol
    let positionLeverage = 1
    // positionLeverage = positionIng.find(item => item.symbol === symbol).leverage || 1
    for(let j in positionIng) {
      if (positionIng[j].symbol === symbol){
        positionLeverage = positionIng[j].leverage
      }
    }
    let direction = data[i].highPrice > data[i].highestPoint ? 1 : -1
    let position = getPosition(data[i].ATR, data[i].currentPrice, equity, direction, data[i].pricePrecision, positionLeverage)
    preparingOrders.push({
      ...position,
      amplitude: getAmplitude(data[i]),
      ATR:data[i].ATR,
      closePrice:data[i].closePrice,
      quantityPrecision: data[i].quantityPrecision,
      pricePrecision: data[i].pricePrecision,
      quantity:(position.position / data[i].closePrice).toFixed(data[i].quantityPrecision),
      direction,
      transactionsNumber:data[i].klines[data[i].klines.length - 1].transactionsNumber,
      symbol: data[i].symbol
    })
  }
  return preparingOrders
}

// 读取历史ATR使用同步
function getHistoryATR(){
  try {
    let data = fs.readFileSync('./data/ATR.json')
    return data.toString()
  } catch (err) {
    global.errorLogger(err);
  }
}

// 根据已经测量的ATR计算精确ATR
function getATR(data, cycle, symbol) {
  function round6 (x) {
    return Math.round(x * 1000000) / 1000000
  }
  let historyATR = JSON.parse(getHistoryATR() || '{}')
  let kline = data[data.length - 1]
  let kline_1 = data[data.length - 2]
  let atr = historyATR[symbol]
  let tr = Math.max(kline.high - kline.low, Math.abs(kline.high - kline_1.close), Math.abs(kline.low - kline_1.close))
  return round6((tr + (cycle-1) * atr) / cycle)
}

// 根据k线计算波动率
function getVolCompute(priceData){
  // 计算对数收益率
  const returns = [];
  for (let i = 1; i < priceData.length; i++) {
    const currentPrice = priceData[i].close; // 使用收盘价进行计算
    const previousPrice = priceData[i - 1].close;
    const logReturn = Math.log(currentPrice / previousPrice);
    returns.push(logReturn);
  }
  // 计算平均对数收益率
  const sumReturns = returns.reduce((sum, ret) => sum + ret, 0);
  const averageReturn = sumReturns / returns.length;
  // 计算标准差
  const squaredDeviations = returns.map(ret => Math.pow(ret - averageReturn, 2));
  const sumSquaredDeviations = squaredDeviations.reduce((sum, dev) => sum + dev, 0);
  const standardDeviation = Math.sqrt(sumSquaredDeviations / (returns.length - 1));
  // 根据比例因子计算波动率
  const scalingFactor = Math.sqrt(200); // 假设一年有200个交易日
  const volatility = standardDeviation * scalingFactor;
  return volatility;
}

// 根据K线计算震荡或趋势
function averageAmplitudeCompute (klineData) {
  // 计算平均幅度
  let sumAmplitude = 0;
  for (let i = 0; i < klineData.length; i++) {
    const amplitude = klineData[i].high - klineData[i].low;
    sumAmplitude += amplitude;
  }
  const averageAmplitude = sumAmplitude / klineData.length;
  // 判断趋势或震荡
  // if (averageAmplitude < 2) {
  //   console.log("这个品种更倾向于震荡市",averageAmplitude);
  // } else {
  //   console.log("这个品种更倾向于趋势市",averageAmplitude);
  // }
  return averageAmplitude
}

// 平均交差次数用于判断一个品种趋势多还是震荡多。
function trendOscillationCompute (klines) {
  function calculateEMACrossovers(data) {
    const ema20 = calculateEMA(data, 5);
    const ema50 = calculateEMA(data, 10);
    let goldenCrossCount = 0;
    let deathCrossCount = 0;
    for (let i = 1; i < data.length; i++) {
      if (ema20[i - 1] < ema50[i - 1] && ema20[i] > ema50[i]) {
        goldenCrossCount++;
      } else if (ema20[i - 1] > ema50[i - 1] && ema20[i] < ema50[i]) {
        deathCrossCount++;
      }
    }
    return { goldenCrossCount, deathCrossCount };
  }
  function calculateEMA(data, period) {
    const emaArray = [];
    const sma = calculateSMA(data.slice(0, period));
    const multiplier = 2 / (period + 1);
    emaArray[period - 1] = sma;
    for (let i = period; i < data.length; i++) {
      emaArray[i] = (data[i] - emaArray[i - 1]) * multiplier + emaArray[i - 1];
    }
    return emaArray;
  }
  function calculateSMA(data) {
    const sum = data.reduce((acc, value) => acc + value, 0);
    return sum / data.length;
  }
  const kLineData = klines.map(item => item.close)
  const { goldenCrossCount, deathCrossCount } = calculateEMACrossovers(kLineData);
  return goldenCrossCount + deathCrossCount
}

// 根据周期计算ATR
function getATRCompute(data, cycle) {
  function SMA(source, length) {
    let sum = 0.0
    for (let i = 0; i < length; ++i) {
      sum += source[i] / length
    }
    return sum
  }
  function RMA (trs, cycle) {
    function _zeros(len) {
        let n = [];
        for (let i = 0; i < len; i++) {
            n.push(0.0);
        }
        return n;
    }
    function round6 (x) {
      return Math.round(x * 1000000) / 1000000
    }
    let rmas = _zeros(trs.length)
    let alpha = 1 / cycle;
    for (let i in trs){
      if (i < cycle){
         rmas[i] = 0
      } else {
        if (rmas[i-1]) {
          rmas[i] = round6((trs[i-1] + (cycle-1) * rmas[i-1]) / cycle)
        } else {
          rmas[i] = round6(SMA(trs.slice(i-cycle,i),cycle))
        }
      }
    }
    return rmas[rmas.length - 1]
  }
  let trArray = []
  for(let i = 0; i < data.length; i++) {
    if (i) {
      let tr = Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i-1].close), Math.abs(data[i].low - data[i-1].close))
      trArray.push(tr)
    } else {
      trArray.push(data[i].high - data[i].low)
    }
  }
  return RMA(trArray, cycle)
}

// 仓位管理-ATR均衡 风险管理函数
function getPosition(atr, price, equity, direction, pricePrecision, leverageIng) {
  // direction方向
  // ATR均衡策略规则
  // 每次下单为账号权益的10%
  // 止损为2的ATR
  // 止损小于权益的2% （亏损下单额的20%平仓）
  // 如果2的ATR大于了整体账户权益的2% 则降低账户权益由10%下降到直到条件满足
  // 在规则内选择最大的杠杆
  let quotaRatio = 0.1 // 额度比例
  let stopMargin = 0.02 // 止损小于总体账户权益的2%
  let leverage = 1 // 杠杆
  let ATR14 = 2 * atr // 使用ATR周期为14计算ATR
  let stopPrice = (direction > 0 ? (price - ATR14) :(price + ATR14)).toFixed(pricePrecision) // 止损价格
  let decline = ATR14 / price // 跌幅
  // 计算部分
  if ( decline > 0.2 ) {
    // 如果跌幅大于20%
    let position = leverageIng > leverage ? ((leverage/leverageIng) * ((equity * stopMargin) / decline)) : (equity * stopMargin) / decline
    return {
      leverage: leverageIng > 1 ? leverageIng : 1, // 杠杆
      position, // 仓位
      stopPrice // 止损价格
    }
  } else {
    leverage = Math.floor((equity  * stopMargin) / (quotaRatio * equity * decline))
    let position = leverageIng > leverage ? ((leverage/leverageIng) * (equity * quotaRatio * leverage)) : equity * quotaRatio * leverage
    return {
      leverage: leverageIng > leverage ? leverageIng : leverage, // 杠杆
      position, // 仓位
      stopPrice // 止损价格
    }
  }
}

// 从数据文件中获取合约交易对
async function getAllExchangeInfo () {
  let data = await readFile()
  return JSON.parse(data)
}

// 获取单个交易对计算指标
async function getOneIndex(symbol) {
  let res = await getKlines(symbol, 300)
  if (res.data.length < 19) return 0
  let klines = klinesInit(symbol, res.data).klines
  let ATR = getATRCompute(klines,14) // ATR
  let vol = getVolCompute(klines) // 波动率
  let averageAmplitude = averageAmplitudeCompute(klines) // 振幅
  let trendOscillation = trendOscillationCompute(klines) // 金死叉次数
  return {ATR, averageAmplitude, vol, trendOscillation}
}

// 获取单个交易对的ATR
async function getOneATR(symbol) {
  let res = await getKlines(symbol, 300)
  if (res.data.length < 19) return 0
  let klines = klinesInit(symbol, res.data).klines
  let ATR = getATRCompute(klines,14)
  return ATR
}

// 获取单个品种的波动率
async function getOneVol(symbol) {
  let res = await getKlines(symbol, 200)
  if (res.data.length < 19) return 0
  let klines = klinesInit(symbol, res.data).klines
  return getVolCompute(klines)
}

// 获取单个品种的震荡趋势性
async function getAverageAmplitude(symbol) {
  let res = await getKlines(symbol, 300)
  if (res.data.length < 19) return 9999
  let klines = klinesInit(symbol, res.data).klines
  return trendOscillationCompute(klines)
}

module.exports = {
  getPreparingOrders,
  getAllExchangeInfo,
  getHighAndLow,
  klinesInit,
  getOneIndex,
  getOneVol,
  getATR,
  getAverageAmplitude,
  getOneATR
}
