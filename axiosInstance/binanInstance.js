const { apiSocks, apiKey, apiSecret, apiDomain1 } = require('../config/config.js');
const SocksProxyAgent = require('socks-proxy-agent');
const httpsAgent = new SocksProxyAgent.SocksProxyAgent(apiSocks)
const crypto = require('crypto');

function getSignature(accountId){
  return crypto.createHash('sha256',apiSecret).update(apiKey+accountId).digest('hex');
}

// 创建一个新的币安api实例 并返回
const { Spot } = require('@binance/connector')
// 定义请求的URL和参数
module.exports = new Spot(apiKey, apiSecret,{
  baseURL:apiDomain1,
  proxy: {
    protocol: 'http',
    host: '127.0.0.1',
    port: 10809
  }
})


