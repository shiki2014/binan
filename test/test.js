const { getPositionRisk, getAccountData, getPositionSideDual } = require('../services/binanceContractService');
// 获取账户头寸
async function getAccountPosition() {
  let res = await getAccountData()
  let allPositions = res.positions
  return allPositions.filter((item)=>{
    return Math.abs(item.positionAmt) > 0
  }) // 保证金总余额
}

module.exports = async function () {
  console.log('合约属性', await getPositionRisk('KEYUSDT'));
  console.log('当前仓位', await getAccountPosition());
  console.log(await getPositionSideDual());
}