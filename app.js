const express = require('express')
const apiRoutes = require('./routes/apiRoutes')
const path = require('path')
const { APP_CONFIG } = require('./core/constants')
const { initDatabase } = require('./core/database')
const { startSystemMonitor } = require('./services/systemMonitorService')
const { startReconciliationMonitor } = require('./services/reconciliationService')
const { startDataRetentionMonitor } = require('./services/dataRetentionService')
const { writeSystemLogFromArgs } = require('./services/systemLogService')
const { isIpAllowed, createApiRateLimitMiddleware } = require('./services/securityService')
const app = express()
const port = Number(process.env.PORT) || (process.env.NODE_ENV === 'development' ? APP_CONFIG.PORT.DEVELOPMENT : APP_CONFIG.PORT.PRODUCTION)
const timing = require('./controllers/timingController')
const tracking = require('./controllers/priceTrackingController')
const test =  require('./test/test')
const log4js = require('log4js')
const util = require('./utils/util')
const API_TOKEN = process.env.API_TOKEN || ''
const ALLOW_LOCAL_API_WITHOUT_TOKEN = process.env.ALLOW_LOCAL_API_WITHOUT_TOKEN !== '0'
const apiRateLimitMiddleware = createApiRateLimitMiddleware()

global.utils = util

log4js.configure(APP_CONFIG.LOG_CONFIG);

const logger = log4js.getLogger();
const errorLogger = log4js.getLogger('error');
function wrapLogger(target, channel) {
  const methods = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
  const wrapped = Object.create(target)
  methods.forEach(method => {
    wrapped[method] = (...args) => {
      target[method](...args)
      const level = method === 'fatal' ? 'error' : method
      writeSystemLogFromArgs({ channel, level, args }).catch(() => {})
    }
  })
  return wrapped
}
global.logger = wrapLogger(logger, 'app')
global.errorLogger = (...msg) =>{
  errorLogger.error(...msg)
  writeSystemLogFromArgs({ channel: 'error', level: 'error', args: msg }).catch(() => {})
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

function getRequestTokens(req) {
  const tokens = []
  const authHeader = req.headers.authorization || ''
  if (authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.replace('Bearer ', '').trim()
    if (bearerToken) {
      tokens.push(bearerToken)
    }
  }
  const headerToken = String(req.headers['x-api-token'] || '').trim()
  if (headerToken) {
    tokens.push(headerToken)
  }
  return tokens
}

function apiAuthMiddleware(req, res, next) {
  if (!isIpAllowed(req)) {
    global.errorLogger('拒绝非白名单IP访问', req.ip, req.originalUrl)
    return res.status(403).send('Forbidden')
  }

  if (API_TOKEN) {
    const tokens = getRequestTokens(req)
    if (tokens.some(token => token === API_TOKEN)) return next()
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

app.use(express.json())

// 设置路由
app.use('/api', apiRateLimitMiddleware, apiAuthMiddleware, apiRoutes)

// 将所有其他请求转发到 Vue
app.use(express.static('dist'))
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'dist', 'index.html'))
})

app.use((err, req, res, next) => {
  if (err instanceof URIError) {
    global.logger.warn('拦截非法URI请求', {
      method: req.method,
      url: req.originalUrl || req.url,
      ip: req.ip
    })
    return res.status(400).send('Bad Request')
  }
  global.errorLogger('未处理请求异常:', err?.message || err)
  if (res.headersSent) {
    return next(err)
  }
  return res.status(500).send('Internal Server Error')
})

async function bootstrap() {
  try {
    await initDatabase()
    startSystemMonitor().catch(error => {
      global.errorLogger('启动系统监控失败:', error)
    })
    startReconciliationMonitor().catch(error => {
      global.errorLogger('启动双写对账任务失败:', error)
    })
    startDataRetentionMonitor().catch(error => {
      global.errorLogger('启动数据清理任务失败:', error)
    })
    global.logger.info('数据库初始化完成')
  } catch (error) {
    global.errorLogger('数据库或监控初始化失败，系统继续启动:', error)
  }

  app.listen(port, () => {
    const tradingMode = (process.env.TRADING_MODE || 'paper').toLowerCase()
    console.log(`Server started on port ${port}`)
    global.logger.info('开启系统成功')
    global.logger.info(`交易模式: ${tradingMode}`)
  })

  // 定时应用程序
  timing()
}

bootstrap()

// 测试用例
// test()

// 实时跟踪
// tracking()
