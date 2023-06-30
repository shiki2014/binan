const { getPositionRisk, getAccountData, getPositionSideDual } = require('../services/binanceContractService');
const fs = require('fs');

async function getAccountPosition() {
  let res = await getAccountData()
  let allPositions = res.positions
  return allPositions.filter((item)=>{
    return Math.abs(item.positionAmt) > 0
  }) // 仓位
}

async function getPrice(req, res) {
  try {
    const data = await getAccountPosition()
    res.send(data)
  } catch (error) {
    global.errorLogger('Error fetching market data:', error);
    res.status(500).send('An error occurred while fetching market data');
  }
}

async function getErrorLog (req, res) {
  fs.readFile('./logs/error.log', (err, data) => {
    if (err) {
      global.errorLogger(err)
      process.exit(1)
    }
    res.send(data.toString())
  });
}

async function getAppLog (req, res) {
  fs.readFile('./logs/app.log', (err, data) => {
    if (err) {
      global.errorLogger(err)
      process.exit(1)
    }
    res.send(data.toString())
  });
}

async function getUsers(req, res) {
  try {
    const data = await getAccountData()
    res.send(data)
  } catch (error) {
    global.errorLogger('Error fetching market data:', error);
    res.status(500).send('An error occurred while fetching market data');
  }
}

async function getPositions(req, res) {
  try {
    const data = await getAccountPosition()
    res.send(data)
  } catch (error) {
    global.errorLogger('Error fetching market data:', error);
    res.status(500).send('An error occurred while fetching market data');
  }
}

module.exports = {
  getPrice,
  getErrorLog,
  getPositions,
  getUsers,
  getAppLog
};