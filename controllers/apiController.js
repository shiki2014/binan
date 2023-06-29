const binanceService = require('../services/binanceService');
const { getPositionRisk, getAccountData, getPositionSideDual } = require('../services/binanceContractService');
const fs = require('fs');

async function getAccountPosition() {
  let res = await getAccountData()
  let allPositions = res.positions
  return allPositions.filter((item)=>{
    return Math.abs(item.positionAmt) > 0
  }) // 保证金总余额
}

async function getPrice(req, res) {
  try {
    // const price = await binanceService.getPrice();
	  // const klines = await binanceService.getKlines('BTCUSDT');
    // // res.send(`BTC/USDT Price: ${price},getUserData: ${JSON.stringify(g20)}`);
    // res.send(klines);
    const data = await getAccountPosition()
    res.send(data)
  } catch (error) {
    global.errorLogger('Error fetching market data:', error);
    res.status(500).send('An error occurred while fetching market data');
  }
}
async function getLog (req, res) {
  fs.readFile('./logs/error.log', (err, data) => {
    if (err) {
      global.errorLogger(err)
      process.exit(1)
    }
    res.send(data.toString())
  });
}


module.exports = {
  getPrice,
  getLog
};