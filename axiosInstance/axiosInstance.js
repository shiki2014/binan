const axios = require('axios')
const { apiSocks, apiKey, apiDomainContract, apiDomain1 } = require('../config/config.js')
const { SocksProxyAgent } = require('socks-proxy-agent')
const httpsAgent = new SocksProxyAgent(apiSocks)
// 创建一个新的axios实例 并返回
let spotsAxios = axios.create({
  baseURL: apiDomain1,
  httpsAgent,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-MBX-APIKEY': apiKey
  }
});
let contractAxios = axios.create({
  baseURL: apiDomainContract,
  httpsAgent,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-MBX-APIKEY': apiKey
  }
});
// 错误拦截器
spotsAxios.interceptors.response.use(response =>{
  return Promise.resolve(response)
}, error =>{
  return Promise.reject(error)
})
contractAxios.interceptors.response.use(response =>{
  return Promise.resolve(response)
}, error =>{
  return Promise.reject(error)
})
module.exports =  {
  contractAxios,
  spotsAxios
}


