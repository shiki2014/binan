const { getPositionRisk, getAccountData, getPositionSideDual, getListenKey } = require('../services/binanceContractService');
const { getPreparingOrders, getAllExchangeInfo, getHighAndLow, klinesInit, getATR, getOneIndex } = require('../controllers/calculatePositionsController');
// 获取账户头寸
async function getAccountPosition() {
  let res = await getAccountData()
  let allPositions = res.positions
  return allPositions.filter((item)=>{
    return Math.abs(item.positionAmt) > 0
  }) // 保证金总余额
}

module.exports = async function () {
  // console.log('合约属性', await getPositionRisk('KEYUSDT'));
  // console.log('当前仓位', await getAccountPosition());
  let position = await getAccountPosition()

  let orderListOriginal = await getPreparingOrders(1000 , position)
  console.log(orderListOriginal)
  // console.log('getListenKey', await getListenKey());
  // console.log(await getPositionSideDual());
}