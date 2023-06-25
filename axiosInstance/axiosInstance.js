const axios = require('axios')
const { apiSocks, apiKey, apiDomainContract, apiDomain1 } = require('../config/config.js')
const { SocksProxyAgent } = require('socks-proxy-agent')
const { createHmac } = require('crypto')
const { apiSecret } = require('../config/config')
const httpsAgent = new SocksProxyAgent(apiSocks)

// 签名
function getSignature(paramsString) {
  let signature = createHmac('sha256', apiSecret).update(paramsString).digest('hex')
  return signature
}

// 对象转URL参数
function objectToUrlParams(object) {
  let params = '';
  for (let key in object) {
    let value = object[key];
    // 如果属性是一个对象或者数组，将其序列化为JSON格式字符串
    if (typeof value === 'object') {
      value = JSON.stringify(value);
    }
    params += `${encodeURIComponent(key)}=${encodeURIComponent(value)}&`;
  }
  // 删除最后一个"&"符号
  params = params.substring(0, params.length - 1);
  return params;
}

// 创建一个新的axios实例 并返回
let spotsAxios = axios.create({
  baseURL: apiDomain1,
  httpsAgent,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-MBX-APIKEY': apiKey
  }
})
let contractAxios = axios.create({
  baseURL: apiDomainContract,
  httpsAgent,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-MBX-APIKEY': apiKey
  }
})

function setConfig(config) {
  if (config.method === 'get' || config.method === 'GET') {
    if (config.params) {
      let signature = getSignature(objectToUrlParams(config.params));
      config.params.signature = signature
    }
  }
  if (config.method === 'post' || config.method === 'POST') {
    if (config.data) {
      let signature = getSignature(objectToUrlParams(config.data || {}))
      config.data.signature = signature
    }
  }
  return config
}
// 请求拦截器
contractAxios.interceptors.request.use(setConfig)
spotsAxios.interceptors.request.use(setConfig)

// 响应拦截器
spotsAxios.interceptors.response.use(response => {
  return Promise.resolve(response)
}, error => {
  error.message && global.errorLogger(error.message)
  error.response && global.errorLogger(error.response.data)
  return Promise.reject(error)
})
contractAxios.interceptors.response.use(response => {
  return Promise.resolve(response)
}, error => {
  error.message && global.errorLogger(error.message)
  error.response && global.errorLogger(error.response.data)
  return Promise.reject(error)
})

module.exports = {
  contractAxios,
  spotsAxios
}


