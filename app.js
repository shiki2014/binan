const express = require('express')
const apiRoutes = require('./routes/apiRoutes')
const path = require('path')
const { APP_CONFIG } = require('./core/constants')
const app = express()
const port = process.env.NODE_ENV === 'development' ? APP_CONFIG.PORT.DEVELOPMENT : APP_CONFIG.PORT.PRODUCTION
const timing = require('./controllers/timingController')
const tracking = require('./controllers/priceTrackingController')
const test =  require('./test/test')
const log4js = require('log4js')
const util = require('./utils/util')
const API_TOKEN = process.env.API_TOKEN || ''
const ALLOW_LOCAL_API_WITHOUT_TOKEN = process.env.ALLOW_LOCAL_API_WITHOUT_TOKEN !== '0'

global.utils = util

log4js.configure(APP_CONFIG.LOG_CONFIG);

const logger = log4js.getLogger();
const errorLogger = log4js.getLogger('error');
global.logger = logger;
global.errorLogger = (...msg) =>{
  errorLogger.error(...msg)
}

function isLocalRequest(req) {
  // 未启用受信任代理时，x-forwarded-for/x-real-ip 可能被客户端伪造，
  // 因此本地访问判定只依赖 socket/ip 信息。
  if (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.headers.forwarded) {
    return false
  }

  const candidates = [
    req.ip,
    req.connection && req.connection.remoteAddress,
    req.socket && req.socket.remoteAddress
  ].filter(Boolean)

  return candidates.some(ip => {
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
  })
}

function getRequestToken(req) {
  const authHeader = req.headers.authorization || ''
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '').trim()
  }
  return req.headers['x-api-token']
}

function apiAuthMiddleware(req, res, next) {
  if (API_TOKEN) {
    const token = getRequestToken(req)
    if (token === API_TOKEN) return next()
    return res.status(401).send('Unauthorized')
  }

  if (ALLOW_LOCAL_API_WITHOUT_TOKEN && isLocalRequest(req)) {
    return next()
  }

  global.errorLogger('拒绝未鉴权远程访问', req.ip, req.originalUrl)
  return res.status(403).send('Forbidden')
}

if (!API_TOKEN) {
  logger.warn('API_TOKEN 未配置，/api 仅允许本机访问。若需远程访问请设置 API_TOKEN。')
}

// 设置路由
app.use('/api', apiAuthMiddleware, apiRoutes)

// 将所有其他请求转发到 Vue
app.use(express.static('dist'))
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'dist', 'index.html'))
})

// 启动应用程序
app.listen(port, () => {
  const tradingMode = (process.env.TRADING_MODE || 'paper').toLowerCase()
  console.log(`Server started on port ${port}`)
  global.logger.info('开启系统成功')
  global.logger.info(`交易模式: ${tradingMode}`)
});

// 定时应用程序
timing()

// 测试用例
// test()

// 实时跟踪
// tracking()
