require('dotenv').config();
const apiDomain = 'https://api.binance.com';
const apiDomain1 = 'https://api1.binance.com';
const apiDomain2 = 'https://api2.binance.com';
const apiDomain3 = 'https://api3.binance.com';
const apiDomain4 = 'https://api4.binance.com';
const apiDomainContract = 'https://fapi.binance.com';
const apiSocks = process.env.API_SOCKS || 'socks://127.0.0.1:10808'
const apiKey = process.env.API_KEY || ''
const apiSecret = process.env.API_SECRET || ''
const cycle = '1d'
function getTimezoneOffset () {
  let date = new Date()
  return date.getTimezoneOffset()
}
const timezoneOffset = getTimezoneOffset()
module.exports = {
  apiDomain,
  apiDomain1,
  apiDomain2,
  apiDomain3,
  apiDomain4,
  apiDomainContract,
  apiSocks,
  apiKey,
  cycle,
  timezoneOffset,
  apiSecret
};