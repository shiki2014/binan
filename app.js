require('dotenv').config();
const express = require('express')
const apiRoutes = require('./routes/apiRoutes')
const path = require('path')
const app = express()
const port = process.env.NODE_ENV === 'development' ? 3000 : 80
const timing = require('./controllers/timingController')
const tracking = require('./controllers/priceTrackingController')
const test =  require('./test/test')
const log4js = require('log4js')
const util = require('./util/util')

global.util = util

log4js.configure({
  appenders: {
    console: { type: 'console' },
    appFile: { type: 'file', filename: 'logs/app.log' },
    errorFile: { type: 'file', filename: 'logs/error.log' }
  },
  categories: {
    error: { appenders: ['errorFile', 'console'], level: 'error' },
    default: { appenders: ['console', 'appFile'], level: 'debug' }
  }
});

const logger = log4js.getLogger();
const errorLogger = log4js.getLogger('error');
global.logger = logger;
global.errorLogger = (...msg) =>{
  errorLogger.error(...msg)
}
// 配置中间件
// ...

// 设置路由
app.use('/api', apiRoutes)

// 将所有其他请求转发到 Vue
app.use(express.static('dist'))
app.get('*', (req, res) => {
	res.sendFile(path.resolve(__dirname, 'dist', 'index.html'))
})

// 启动应用程序
app.listen(port, () => {
  console.log(`Server started on port ${port}`)
  global.logger.info('开启系统成功')
});

// 定时应用程序
timing()

// 测试用例
// test()

// 实时跟踪
// tracking()