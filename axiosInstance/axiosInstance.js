const axios = require('axios')
const { apiSocks, apiKey, apiDomainContract, apiDomain1 } = require('../config/config.js')
const { SocksProxyAgent } = require('socks-proxy-agent')
const { createHmac } = require('crypto')
const { apiSecret } = require('../config/config')
const JSONbig = require('json-bigint')
require('dotenv').config();

// 创建代理实例
let httpsAgent = null
if (process.env.API_SOCKS_OPEN == '1' && apiSocks) {
  console.log('代理开始启用')
  try {
    httpsAgent = new SocksProxyAgent(apiSocks)
    console.log('代理已启用:', apiSocks)
  } catch (error) {
    console.error('代理配置错误:', error.message)
  }
}

// 签名函数
function getSignature(paramsString) {
  return createHmac('sha256', apiSecret).update(paramsString).digest('hex')
}

// 对象转URL参数
function objectToUrlParams(object) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(object)) {
    if (typeof value === 'object') {
      params.append(key, JSON.stringify(value))
    } else {
      params.append(key, value)
    }
  }
  return params.toString()
}

// JSON解析配置
const transformResponse = [
  function (data) {
    try {
      return JSONbig.parse(data)
    } catch (error) {
      console.warn('JSON解析失败，返回原始数据:', error.message)
      return data
    }
  }
]

// 基础配置
const createBaseConfig = (baseURL) => ({
  baseURL,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-MBX-APIKEY': apiKey,
    'User-Agent': 'Mozilla/5.0 (compatible; BinanceAPI/1.0)'
  },
  transformResponse,
  timeout: 30000, // 30秒超时
  ...(httpsAgent && { httpsAgent })
})

// 创建axios实例
const spotsAxios = axios.create(createBaseConfig(apiDomain1))
const contractAxios = axios.create(createBaseConfig(apiDomainContract))

// 请求配置函数
function setConfig(config) {
  // 添加时间戳
  const timestamp = Date.now()

  if (['get', 'GET', 'delete', 'DELETE'].includes(config.method)) {
    config.params = config.params || {}
    config.params.timestamp = timestamp
    const queryString = objectToUrlParams(config.params)
    config.params.signature = getSignature(queryString)
  }
  if (['post', 'POST', 'put', 'PUT'].includes(config.method)) {
    config.data = config.data || {}
    config.data.timestamp = timestamp

    const dataString = objectToUrlParams(config.data)
    config.data.signature = getSignature(dataString)
  }

  return config
}

// 错误处理函数
function handleError(error) {
  const errorInfo = {
    method: error.config?.method,
    url: error.config?.url,
    params: error.config?.params || error.config?.data,
    status: error.response?.status,
    statusText: error.response?.statusText,
    message: error.message,
    responseData: error.response?.data
  }
  // 记录详细错误信息
  console.error('API请求错误:', JSON.stringify(errorInfo, null, 2))
  // 特定错误处理
  if (error.response?.status === 451) {
    console.error('地区限制错误: 当前位置不支持币安服务，请检查网络代理设置')
  } else if (error.response?.status === 418) {
    console.error('IP被暂时封禁，请稍后重试')
  } else if (error.response?.status === 429) {
    console.error('请求频率过高，请降低请求频率')
  }
  // 使用全局错误记录器（如果存在）
  if (global.errorLogger) {
    global.errorLogger(`请求类型: ${errorInfo.method}`)
    global.errorLogger(`请求路径: ${errorInfo.url}`)
    global.errorLogger(`请求参数: ${JSON.stringify(errorInfo.params)}`)
    global.errorLogger(`错误信息: ${errorInfo.message}`)
    global.errorLogger(`响应数据: ${JSON.stringify(errorInfo.responseData)}`)
  }
  return Promise.reject(error)
}

// 请求重试函数
function createRetryInterceptor(axiosInstance) {
  axiosInstance.interceptors.response.use(
    response => response,
    async error => {
      const config = error.config
      // 如果是网络错误且未达到重试上限，进行重试
      if (!config._retry && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')) {
        config._retry = true
        config._retryCount = (config._retryCount || 0) + 1
        if (config._retryCount <= 3) {
          console.log(`网络错误，正在进行第${config._retryCount}次重试...`)
          await new Promise(resolve => setTimeout(resolve, 1000 * config._retryCount))
          return axiosInstance(config)
        }
      }
      return handleError(error)
    }
  )
}

// 设置拦截器
spotsAxios.interceptors.request.use(setConfig)
contractAxios.interceptors.request.use(setConfig)

createRetryInterceptor(spotsAxios)
createRetryInterceptor(contractAxios)

// 健康检查函数
async function healthCheck() {
  try {
    const response = await spotsAxios.get('/api/v3/ping')
    console.log('币安API连接正常')
    return true
  } catch (error) {
    console.error('币安API连接失败:', error.message)
    return false
  }
}

// 导出
module.exports = {
  contractAxios,
  spotsAxios,
  healthCheck
}