const binanceService = require('../services/binanceService');

async function getPrice(req, res) {
  try {
    // const price = await binanceService.getPrice();
	  const klines = await binanceService.getKlines('BTCUSDT');
    // res.send(`BTC/USDT Price: ${price},getUserData: ${JSON.stringify(g20)}`);
    res.send(klines);
  } catch (error) {
    console.error('Error fetching market data:', error);
    res.status(500).send('An error occurred while fetching market data');
  }
}

module.exports = {
  getPrice,
};