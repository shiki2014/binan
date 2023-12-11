const { getPositionRisk, getAccountData, getPositionSideDual, getListenKey,getKlines } = require('../services/binanceContractService');
const { getPreparingOrders, getAllExchangeInfo, getHighAndLow, klinesInit, getATR, getOneIndex } = require('../controllers/calculatePositionsController');
// 获取账户头寸
async function getAccountPosition() {
  let res = await getAccountData()
  if (!res) return
  let allPositions = res.positions
  return allPositions.filter((item)=>{
    return Math.abs(item.positionAmt) > 0
  })
}
async function setTakeProfit () {
  let positionList = await getAccountPosition() // 所有头寸
  console.log(positionList)
  let takeProfitList = []
  function signal (item){
    console.log(item.positionSide,item.entryPrice,item.lowestPoint,item.highestPoint)
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
      // let stopPrice = data.positionSide == 'SHORT' ? data.highestPoint : data.lowestPoint
      // await setStopPrice(data.symbol, data.positionSide, stopPrice)
      // global.logger.info(`${data.symbol}设置止盈成功`)
    }
  }
  if (takeProfitList.length === 0){
    global.logger.info('没有需要设置止盈的标的物')
  }
  return takeProfitList
}
module.exports = async function () {
  // console.log('合约属性', await getPositionRisk('KEYUSDT'));
  // console.log('当前仓位', await getAccountPosition());
  console.log(await setTakeProfit())
  // let position = await getAccountPosition()

  // let orderListOriginal = await getPreparingOrders(1000 , position)
  // console.log(orderListOriginal)
  // console.log('getListenKey', await getListenKey());
  // console.log(await getPositionSideDual());
}