const axios = require('axios')
const { apiSocks, apiKey, apiDomainContract, apiDomain1 } = require('../config/config.js')
const { SocksProxyAgent } = require('socks-proxy-agent')
const { createHmac } = require('crypto')
const { apiSecret } = require('../config/config')
const httpsAgent = new SocksProxyAgent(apiSocks)
const JSONbig = require('json-bigint')
require('dotenv').config();
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
let transformResponse = [
  function(data){
    return JSONbig.parse(data)
  }
]
let obj = {
  baseURL: apiDomain1,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-MBX-APIKEY': apiKey
  },
  transformResponse
}
let obj2 = {
  baseURL: apiDomainContract,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-MBX-APIKEY': apiKey
  },
  transformResponse
}
if (process.env.API_SOCKS_OPEN == '1'){
  obj.httpsAgent = httpsAgent
  obj2.httpsAgent = httpsAgent
}
let spotsAxios = axios.create(obj)
let contractAxios = axios.create(obj2)

function setConfig(config) {
  if (config.method === 'get' || config.method === 'GET' || config.method === 'delete' || config.method === 'DELETE') {
    if (config.params) {
      let signature = getSignature(objectToUrlParams(config.params));
      config.params.signature = signature
    }
  }
  if (config.method === 'post' || config.method === 'POST' || config.method === 'PUT' ) {
    if (config.data) {
      let signature = getSignature(objectToUrlParams(config.data || {}))
      config.data.signature = signature
    }
  }
  return config
}

function errorSet(error){
  if (error.config) {
    global.errorLogger(`请求类型: ${error.config.method}`)
    global.errorLogger(`请求路径: ${error.config.url}`)
    global.errorLogger(`请求参数: ${JSON.stringify(error.config.params || error.config.data)}`)
  }
  error.message && global.errorLogger(error.message)
  error.response && global.errorLogger(error.response.data)
  return Promise.reject(error)
}

// 请求拦截器
contractAxios.interceptors.request.use(setConfig)
spotsAxios.interceptors.request.use(setConfig)

// 响应拦截器
spotsAxios.interceptors.response.use(response => {
  return Promise.resolve(response)
}, error => {
  return errorSet(error)
})
contractAxios.interceptors.response.use(response => {
  return Promise.resolve(response)
}, error => {
  return errorSet(error)
})

module.exports = {
  contractAxios,
  spotsAxios
}


