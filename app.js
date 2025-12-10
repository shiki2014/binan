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

global.utils = util

log4js.configure(APP_CONFIG.LOG_CONFIG);

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