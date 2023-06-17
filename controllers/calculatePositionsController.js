
const {  getKlines  } = require('../services/binanceContractService');
const fs = require('fs');
// 整体逻辑

// 在每天的19点和早上的7点进行时间校准合约交易对的数据更新
// 在每天的20点和早上的8点进行获取所有合约的K线数据
// 对每一个合约进行数据分析
// 如果符合进场再通过ATR均衡计算仓位做多做空设置止损
// 下个版本 对有仓位的进行并且符合移动移动止盈的仓位进行移动止盈


// 读取数据
function readFile(callback){
  return new Promise(function (resolve, reject) {
    fs.readFile('./data/data.json', function (err, data) {
      if (err) {
        reject(err);
        console.error(err)
        process.exit(1)
      }
      resolve(data.toString())
    })
  })
}


// 单品种K线初始化函数
function klinesInit(symbol,data,quantityPrecision,pricePrecision) {
  let klines = data.map((item) => {
    return {
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[7]),
      transactionsNumber: parseFloat(item[8])
    }
  })
  // 获取ATR高点低点
  let HALAAtr = getHighAndLowAndATR(klines.slice(0, klines.length - 2)) // 高点低点和ATR
  return {
    ...HALAAtr,
    quantityPrecision, // 仓位精度
    pricePrecision, // 价格精度
    closePrice: klines[klines.length - 2].close,
    transactionsNumber:klines[klines.length - 2].transactionsNumber,
    symbol,
    klines
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
  let data1 = data.map((item)=>{
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
  return data1
}


// 寻找k线的最高点和最低点 ATR
function getHighAndLowAndATR(klines) {
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
    lowestPoint,
    ATR: getATR(klines, 18)
  }
}
// 获取所有合约的K线数据并处理
function getAllKlines() {
  return new Promise(async function (resolve, reject) {
    console.log('getAllKlines','开始获取所有K线数据')
    let data = []
    let symbols = await getAllExchangeInfo()
    let count = 0
    let allCount = symbols.length
    async function getData(symbol,quantityPrecision,pricePrecision) {
      let res = await getKlines(symbol,22).catch((err)=>{
        reject(err)
      })
      count++
      // 同时初始化
      if (res.data.length == 22){
        data.push(klinesInit(symbol,res.data,quantityPrecision,pricePrecision))
      }
      if (count === allCount) {
        console.log('所有K线数据获取完毕')
        resolve(data)
      }
    }
    for (let i in symbols) {
      getData(symbols[i].symbol,symbols[i].quantityPrecision,symbols[i].pricePrecision)
    }
  })
}
// 完全数据初始化函数 获取准备下单的数据
async function getPreparingOrders(equity){
  // 信号
  function signal(symbolData) {
    return symbolData.closePrice > symbolData.highestPoint || symbolData.closePrice < symbolData.lowestPoint
  }
  let data = weightSorting(await getAllKlines())
  let preparingOrders = [] // 准备下单的数据
  for (let i in data) {
    if (signal(data[i])){
      // 符合下单条件
      let direction = data[i].closePrice > data[i].highestPoint ? 1 : -1
      let position = getPosition(data[i].ATR, data[i].closePrice, equity, direction, data[i].pricePrecision)
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
  }
  return preparingOrders
}


// 根据周期计算ATR
function getATR(data, cycle) {
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
function getPosition(atr, price, equity, direction, pricePrecision) {
  // direction方向
  // ATR均衡策略规则
  // 每次下单为账号权益的10%
  // 止损为1.8的ATR
  // 止损小于总体账户权益的2% （亏损下单额的20%平仓）
  // 如果1.8的ATR大于了整体账户权益的2% 则降低账户权益由10%下降到直到条件满足
  // 在规则内选择最大的杠杆
  let leverage = 1 // 杠杆
  let ATR18 = 1.8 * atr // 使用ATR周期为18计算ATR
  let stopPrice = (direction > 0 ? (price - ATR18) :(price + ATR18)).toFixed(pricePrecision) // 止损价格
  let decline = ATR18 / price // 跌幅
  // 计算部分
  if ( decline > 0.2 ){
    // 如果跌幅大于20%
    return {
      leverage, // 杠杆
      position: (equity * 0.02) / decline, // 仓位
      stopPrice // 止损价格
    }
  } else {
    leverage = Math.floor((equity  * 0.02) / (0.1 * equity * decline))
    return {
      leverage, // 杠杆
      position: equity * 0.1 * leverage, // 仓位
      stopPrice // 止损价格
    }
  }
}


// 从数据文件中获取合约交易对
async function getAllExchangeInfo () {
  let data = await readFile()
  return JSON.parse(data)
}

// 获取单个交易对的ATR
async function getOneATR(symbol) {
  let res = await getKlines(symbol, 200)
  let ATR = getATR(klinesInit(symbol, res.data).klines,18)
  return ATR
}


module.exports = {
  getPreparingOrders,
  getAllExchangeInfo,
  getHighAndLowAndATR,
  klinesInit,
  getOneATR
}
