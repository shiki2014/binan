const schedule = require('node-schedule')
const { exec } = require('child_process')
const iconv = require('iconv-lite')
const { getAccountData, getServiceTime } = require('../services/binanceContractService')
const { getSettings } = require('../services/systemSettingsService')
const { getRuntimeChainStatus } = require('../services/runtimeChainService')
const {
  LIST_TYPES,
  STATE_KEYS,
  replaceSymbolList,
  setRuntimeState,
  getRuntimeStateSync,
  getSymbolListSync
} = require('../services/runtimeDataService')
const { updateAllExchangeInfo } = require('../services/marketCacheService')
const { executeScheduledOrders } = require('../services/tradeExecutionService')
const { setTakeProfit, deleteAllInvalidOrders } = require('../services/positionLifecycleService')

async function updateTime() {
  const dateObj1 = new Date()
  console.log('本地时间1:', dateObj1.toLocaleString())
  const time = await getServiceTime()
  if (!time) {
    return time
  }
  const timestamp = time.data.serverTime
  const dateObj = new Date(timestamp)
  const dateObj2 = new Date()
  const driftMs = timestamp - Date.now()
  console.log('本地时间2:', dateObj2.toLocaleString())
  console.log('币安服务器时间同步:', dateObj.toLocaleString())

  if (process.env.ENABLE_SYSTEM_TIME_SYNC !== '1') {
    global.logger.info(`检测到服务器时间偏差: ${driftMs}ms，未启用系统时间同步`)
    return { driftMs, synced: false }
  }

  if (process.platform !== 'win32') {
    global.logger.warn(`当前系统(${process.platform})不执行自动校时，请手动同步系统时间。偏差: ${driftMs}ms`)
    return { driftMs, synced: false }
  }

  const command = `set-date -Date '${(new Date(timestamp + 2000)).toLocaleString()}'`
  function execTime(shellCommand) {
    return new Promise(resolve => {
      exec(shellCommand, { shell: 'powershell.exe', encoding: 'buffer' }, (error, stdout) => {
        if (error) {
          global.errorLogger(`exec error: ${error}`)
          resolve({ driftMs, synced: false, error: String(error) })
          return
        }
        console.log('同步完成')
        resolve({ stdout: iconv.decode(stdout, 'cp936'), driftMs, synced: true })
      })
    })
  }
  return execTime(command)
}

async function initData() {
  if (!getRuntimeStateSync(STATE_KEYS.EQUITY_PEAK, null)) {
    const res = await getAccountData()
    if (res) {
      const equity = Number(res.totalMarginBalance || 0)
      await setRuntimeState(STATE_KEYS.EQUITY_PEAK, { equity })
    } else {
      global.errorLogger('初始化历史权益峰值失败: 账户信息为空')
    }
  }

  if (!getRuntimeStateSync('bootstrap_blacklist_initialized', false) && getSymbolListSync(LIST_TYPES.BLACK).length === 0) {
    await replaceSymbolList(LIST_TYPES.BLACK, ['USDCUSDT'])
  }
  await setRuntimeState('bootstrap_blacklist_initialized', true)

  if (!getRuntimeStateSync('bootstrap_whitelist_initialized', false) && getSymbolListSync(LIST_TYPES.WHITE).length === 0) {
    await replaceSymbolList(LIST_TYPES.WHITE, ['BTCUSDT'])
  }
  await setRuntimeState('bootstrap_whitelist_initialized', true)

  await updateAllExchangeInfo()
}

async function refreshMarketCacheJob() {
  try {
    const settings = await getSettings().catch(() => ({ runtime_primary_chain: 'db', runtime_force_file_rollback: false }))
    const chainStatus = await getRuntimeChainStatus(settings)
    if (chainStatus.fallbackReason === 'manual_force_file_rollback') {
      global.logger.warn('检测到手动文件链路回退开关，当前以兼容模式执行定时任务')
    }
    global.logger.info(`当前运行链路: ${chainStatus.effectiveChain}`)
    global.logger.info('更新合约对开始')
    await updateAllExchangeInfo()
  } catch (error) {
    global.errorLogger('更新合约对失败', error)
  }
}

async function executeTradingJob() {
  try {
    const settings = await getSettings().catch(() => ({ trading_enabled: true, risk_control_enabled: true, runtime_primary_chain: 'db' }))
    const chainStatus = await getRuntimeChainStatus(settings)
    if (chainStatus.fallbackReason === 'manual_force_file_rollback') {
      global.logger.warn('检测到手动文件链路回退开关，当前以兼容模式执行交易任务')
    }
    global.logger.info(`当前运行链路: ${chainStatus.effectiveChain}`)
    if (!settings.trading_enabled) {
      global.logger.info('交易开关关闭，跳过本轮定时下单')
      return
    }

    global.logger.info('获取下单交易数据下单')
    await executeScheduledOrders()

    setTimeout(async () => {
      try {
        if (!settings.risk_control_enabled) {
          global.logger.info('风险控制开关关闭，跳过止盈与无效委托清理')
          return
        }
        global.logger.info('开始仓位止盈设置')
        await setTakeProfit()
        setTimeout(async () => {
          try {
            global.logger.info('删除无效委托')
            await deleteAllInvalidOrders(true)
          } catch (error) {
            global.errorLogger('删除无效委托失败', error)
          }
        }, 10000)
      } catch (error) {
        global.errorLogger('止盈设置失败', error)
      }
    }, 3000)
  } catch (error) {
    global.errorLogger('定时下单任务失败', error)
  }
}

module.exports = async function startTimingJobs() {
  global.logger.info('定时交易策略开始')
  await initData().catch(error => {
    global.errorLogger('初始化数据失败', error)
  })

  schedule.scheduleJob('4 0 7 * * *', async function () {
    await refreshMarketCacheJob()
  })

  schedule.scheduleJob('10 0 8 * * *', async function () {
    await executeTradingJob()
  })
}

module.exports.updateTime = updateTime
module.exports.refreshMarketCacheJob = refreshMarketCacheJob
module.exports.executeTradingJob = executeTradingJob
