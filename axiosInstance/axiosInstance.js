const axios = require('axios')
const { apiSocks, apiKey, apiDomainContract, apiDomain1 } = require('../config/config.js')
const { SocksProxyAgent } = require('socks-proxy-agent')
const { createHmac } = require('crypto')
const { apiSecret } = require('../config/config')
const JSONbig = require('json-bigint')
const { SYSTEM_LIMITS, API_CONFIG } = require('../core/constants')
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
function isSensitiveKey(key = '') {
  const normalized = String(key).toLowerCase()
  return [
    'signature',
    'secret',
    'apikey',
    'api_key',
    'token',
    'authorization',
    'x-mbx-apikey'
  ].some(sensitive => normalized.includes(sensitive))
}

function sanitizeStringForLog(value) {
  if (typeof value !== 'string') return value
  return value
    .replace(/(signature=)[^&\s]+/ig, '$1***')
    .replace(/(api[_-]?key=)[^&\s]+/ig, '$1***')
    .replace(/(token=)[^&\s]+/ig, '$1***')
    .replace(/(secret=)[^&\s]+/ig, '$1***')
}

function sanitizeForLog(value, depth = 0) {
  if (depth > 6) return '[Truncated]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return sanitizeStringForLog(value)
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(item => sanitizeForLog(item, depth + 1))

  const output = {}
  for (const [key, val] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      output[key] = '***'
      continue
    }
    output[key] = sanitizeForLog(val, depth + 1)
  }
  return output
}

function handleError(error) {
  const safeParams = sanitizeForLog(error.config?.params || error.config?.data)
  const safeResponseData = sanitizeForLog(error.response?.data)
  const errorInfo = {
    method: error.config?.method,
    url: error.config?.url,
    params: safeParams,
    status: error.response?.status,
    statusText: error.response?.statusText,
    message: error.message,
    responseData: safeResponseData
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
    global.errorLogger(`请求参数: ${JSON.stringify(safeParams)}`)
    global.errorLogger(`错误信息: ${errorInfo.message}`)
    global.errorLogger(`响应数据: ${JSON.stringify(safeResponseData)}`)
  }
  return Promise.reject(error)
}

// 智能重试函数
function createSmartRetryInterceptor(axiosInstance) {
  axiosInstance.interceptors.response.use(
    response => {
      // 检查是否是重试成功的请求
      if (response.config._retryCount && response.config._retryCount > 0) {
        logRetrySuccess(response.config);
      }
      return response;
    },
    async error => {
      const config = error.config;
      const retryConfig = API_CONFIG.RETRY;

      // 初始化重试计数
      if (!config._retryCount) {
        config._retryCount = 0;
      }

      // 判断是否应该重试
      const shouldRetry = shouldRetryRequest(error, config, retryConfig);

      if (shouldRetry && config._retryCount < retryConfig.MAX_ATTEMPTS) {
        config._retryCount += 1;

        // 计算延迟时间
        const delay = calculateRetryDelay(config._retryCount, error, retryConfig);

        // 记录重试信息
        logRetryAttempt(error, config._retryCount, delay);

        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, delay));

        return axiosInstance(config);
      }

      return handleError(error);
    }
  );
}

// 判断是否应该重试
function shouldRetryRequest(error, config, retryConfig) {
  // 网络错误
  if (isNetworkError(error)) {
    return true;
  }

  // 代理相关错误
  if (isProxyError(error)) {
    return config._retryCount < retryConfig.PROXY_RETRY_ATTEMPTS;
  }

  // 服务器错误 (5xx)
  if (error.response && error.response.status >= 500) {
    return true;
  }

  // 限流错误 (429)
  if (error.response && error.response.status === 429) {
    return true;
  }

  // 超时错误
  if (error.code === 'ECONNABORTED') {
    return true;
  }

  return false;
}

// 判断网络错误
function isNetworkError(error) {
  const networkErrorCodes = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EAI_AGAIN'
  ];

  return networkErrorCodes.includes(error.code) || !error.response;
}

// 判断代理错误
function isProxyError(error) {
  const proxyErrorIndicators = [
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'socket hang up',
    'getaddrinfo ENOTFOUND',
    'socks'
  ];

  const errorMessage = error.message?.toLowerCase() || '';

  return proxyErrorIndicators.some(indicator =>
    error.code === indicator || errorMessage.includes(indicator)
  );
}

// 计算重试延迟
function calculateRetryDelay(retryCount, error, retryConfig) {
  let baseDelay = retryConfig.INITIAL_DELAY;

  // 代理错误使用特殊延迟
  if (isProxyError(error)) {
    baseDelay = retryConfig.PROXY_RETRY_DELAY;
  }

  // 限流错误使用更长延迟
  if (error.response?.status === 429) {
    baseDelay = 5000; // 5秒
  }

  // 指数退避算法
  const delay = baseDelay * Math.pow(retryConfig.BACKOFF_FACTOR, retryCount - 1);

  // 添加随机抖动，避免惊群效应
  const jitter = Math.random() * 0.3 * delay;

  // 限制最大延迟
  return Math.min(delay + jitter, retryConfig.MAX_DELAY);
}

// 记录重试信息
function logRetryAttempt(error, retryCount, delay) {
  const errorType = getErrorType(error);
  const message = `${errorType} - 第${retryCount}次重试, 延迟${Math.round(delay)}ms`;

  if (global.logger) {
    global.logger.warn(message, {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      code: error.code
    });
  } else {
    console.warn(`[重试] ${message}`, {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      code: error.code
    });
  }
}

// 记录重试成功信息
function logRetrySuccess(config) {
  const message = `✅ 重试成功! 总计重试${config._retryCount}次后成功`;

  if (global.logger) {
    global.logger.info(message, {
      url: config.url,
      method: config.method,
      retryCount: config._retryCount
    });
  } else {
    console.log(`[重试成功] ${message}`, {
      url: config.url,
      method: config.method,
      retryCount: config._retryCount
    });
  }
}

// 获取错误类型描述
function getErrorType(error) {
  if (isProxyError(error)) return '代理错误';
  if (isNetworkError(error)) return '网络错误';
  if (error.response?.status === 429) return '限流错误';
  if (error.response?.status >= 500) return '服务器错误';
  if (error.code === 'ECONNABORTED') return '超时错误';
  return '未知错误';
}

// 队列拦截器：使用请求拦截器实现队列控制
function createImprovedQueueInterceptor(axiosInstance) {
  // 使用静态变量或全局变量来确保多实例间的协调
  if (!global.apiRequestQueue) {
    global.apiRequestQueue = {
      lastRequestTime: 0,
      pendingRequests: [],
      processing: false
    };
  }

  const queue = global.apiRequestQueue;
  const requestInterval = SYSTEM_LIMITS.API_LIMITS.KLINE_REQUEST_INTERVAL;

  axiosInstance.interceptors.request.use(async (config) => {
    return new Promise((resolve, reject) => {
      // 将请求加入队列
      queue.pendingRequests.push({ config, resolve, reject });

      // 处理队列
      processQueue();
    });
  });

  async function processQueue() {
    if (queue.processing || queue.pendingRequests.length === 0) {
      return;
    }

    queue.processing = true;

    while (queue.pendingRequests.length > 0) {
      const { config, resolve, reject } = queue.pendingRequests.shift();
      try {
        // 计算需要等待的时间
        const now = Date.now();
        const timeSinceLastRequest = now - queue.lastRequestTime;

        if (timeSinceLastRequest < requestInterval) {
          const waitTime = requestInterval - timeSinceLastRequest;
          await new Promise(r => setTimeout(r, waitTime));
        }
        // 处理配置
        const processedConfig = await setConfig(config);
        // 更新时间
        queue.lastRequestTime = Date.now();
        resolve(processedConfig);
      } catch (error) {
        reject(error);
      }
    }

    queue.processing = false;
  }

  return axiosInstance;
}

// 应用队列拦截器
createImprovedQueueInterceptor(spotsAxios);
createImprovedQueueInterceptor(contractAxios);

// 最后设置响应拦截器（智能重试等）
createSmartRetryInterceptor(spotsAxios)
createSmartRetryInterceptor(contractAxios)

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
