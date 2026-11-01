const { contractOrder, getAccountData } = require('./binanceContractService')
const { getTradingParameters } = require('./tradingParameterService')
const { getSettings } = require('./systemSettingsService')
const { getTodaySubmittedNotional } = require('./tradeJournalService')
const { getPreparingOrders, getAllExchangeInfo } = require('./strategyEngineService')
const { getOpenPositions, getEquityAmount } = require('./positionStateService')

const TRADING_MODE = String(process.env.TRADING_MODE || 'paper').toLowerCase()
const MIN_ORDER_NOTIONAL_BUFFER_RATIO = Number(process.env.MIN_ORDER_NOTIONAL_BUFFER_RATIO || 1.05)

async function executeScheduledOrders() {
  const accountData = await getAccountData()
  if (!accountData || typeof accountData !== 'object') {
    throw new Error('获取账户信息失败，无法执行本轮定时下单')
  }
  const positions = await getOpenPositions(accountData)
  const equityAmount = await getEquityAmount(accountData)
  const allExchange = await getAllExchangeInfo()
  const settings = await getSettings().catch(error => {
    global.errorLogger('读取系统配置失败，使用默认安全配置', error)
    return {
      emergency_stop_enabled: false,
      live_trade_confirm_required: true
    }
  })
  if (settings.emergency_stop_enabled) {
    global.logger.warn('紧急停机已启用，阻止本轮下单')
    return []
  }
  if (TRADING_MODE === 'live' && settings.live_trade_confirm_required && process.env.LIVE_TRADING_CONFIRMED !== '1') {
    global.errorLogger('实盘确认未完成，阻止本轮下单。请设置 LIVE_TRADING_CONFIRMED=1 后再执行实盘策略。')
    return []
  }
  const tradingParameters = await getTradingParameters().catch(error => {
    global.errorLogger('读取交易参数失败，使用默认参数', error)
    return {
      min_order_notional: Number(process.env.MIN_ORDER_NOTIONAL || 5),
      max_add_order_ratio: 1,
      single_order_notional_limit: Number(process.env.SINGLE_ORDER_NOTIONAL_LIMIT || 200),
      daily_order_notional_limit: Number(process.env.DAILY_ORDER_NOTIONAL_LIMIT || 2000),
      max_position_notional_limit: Number(process.env.MAX_POSITION_NOTIONAL_LIMIT || 1000)
    }
  })
  const minOrderNotional = Number(tradingParameters.min_order_notional)
  const validMinOrderNotional = Number.isFinite(minOrderNotional) && minOrderNotional > 0 ? minOrderNotional : 5
  const maxAddOrderRatio = Number(tradingParameters.max_add_order_ratio)
  const validMaxAddOrderRatio = Number.isFinite(maxAddOrderRatio) && maxAddOrderRatio >= 0 && maxAddOrderRatio <= 1
    ? maxAddOrderRatio
    : 1
  const singleOrderNotionalLimit = Number(tradingParameters.single_order_notional_limit)
  const validSingleOrderNotionalLimit = Number.isFinite(singleOrderNotionalLimit) && singleOrderNotionalLimit > 0
    ? singleOrderNotionalLimit
    : 200
  const dailyOrderNotionalLimit = Number(tradingParameters.daily_order_notional_limit)
  const validDailyOrderNotionalLimit = Number.isFinite(dailyOrderNotionalLimit) && dailyOrderNotionalLimit > 0
    ? dailyOrderNotionalLimit
    : 2000
  const maxPositionNotionalLimit = Number(tradingParameters.max_position_notional_limit)
  const validMaxPositionNotionalLimit = Number.isFinite(maxPositionNotionalLimit) && maxPositionNotionalLimit > 0
    ? maxPositionNotionalLimit
    : 1000
  const validMinOrderNotionalBufferRatio = Number.isFinite(MIN_ORDER_NOTIONAL_BUFFER_RATIO) && MIN_ORDER_NOTIONAL_BUFFER_RATIO >= 1
    ? MIN_ORDER_NOTIONAL_BUFFER_RATIO
    : 1.05
  let submittedTodayNotional = await getTodaySubmittedNotional().catch(error => {
    global.errorLogger('读取当日下单名义价值失败，使用 0 继续', error)
    return 0
  })
  let projectedPositionNotional = positions.reduce((sum, item) => {
    return sum + Math.abs(Number(item.notional || 0))
  }, 0)

  const tradingExchangeNum = allExchange.filter(symbol => symbol.status === 'TRADING').length
  const orderNumber = parseInt(tradingExchangeNum / 24 * (1 - Number(equityAmount.withdrawalAmplitude)))
  const orderList = await getPreparingOrders(equityAmount.num, positions, allExchange, orderNumber)
  if (orderList.length === 0) {
    global.logger.info('没有符合条件的标的')
    return []
  }

  let count = 0
  const addOrderNumber = orderList.reduce((total, item) => {
    return !item.isOne ? total + 1 : total
  }, 0)
  let maxAddOrderNumber = Math.floor(addOrderNumber * validMaxAddOrderRatio)
  if (addOrderNumber > 0 && validMaxAddOrderRatio > 0 && maxAddOrderNumber === 0) {
    maxAddOrderNumber = 1
  }
  let addCount = 0
  const allCount = orderList.length
  global.logger.info('交易参数', {
    minOrderNotional: validMinOrderNotional,
    minOrderNotionalBufferRatio: validMinOrderNotionalBufferRatio,
    maxAddOrderRatio: validMaxAddOrderRatio,
    maxAddOrderNumber,
    singleOrderNotionalLimit: validSingleOrderNotionalLimit,
    dailyOrderNotionalLimit: validDailyOrderNotionalLimit,
    maxPositionNotionalLimit: validMaxPositionNotionalLimit,
    submittedTodayNotional,
    projectedPositionNotional
  })
  global.logger.info('开始下单', orderList.map(item => item.symbol).join(', '))

  function generateArray(length) {
    if (length === 1) {
      return [1]
    }
    const startValue = 1.2
    const endValue = 0.8
    const step = (startValue - endValue) / (length - 1)
    const resultArray = []
    for (let i = 0; i < length; i++) {
      resultArray.push(parseFloat((startValue - i * step).toFixed(4)))
    }
    return resultArray
  }

  function getNum(num, refNum) {
    const precision = global.utils.getPrecision(refNum)
    return global.utils.truncateDecimal(num, precision)
  }

  function getReferencePrice(item) {
    const closePrice = Number(item.closePrice)
    const currentPrice = Number(item.currentPrice)
    const prices = [closePrice, currentPrice].filter(price => Number.isFinite(price) && price > 0)
    return prices.length ? Math.min(...prices) : 0
  }

  function alignQuantityByStep(quantity, stepSize, roundUp = false) {
    const validStepSize = Number(stepSize)
    if (!Number.isFinite(validStepSize) || validStepSize <= 0) {
      return Number(quantity)
    }
    const precision = global.utils.getPrecision(validStepSize)
    const scaled = Number(quantity) / validStepSize
    const units = roundUp ? Math.ceil(scaled - 1e-12) : Math.floor(scaled + 1e-12)
    return Number((units * validStepSize).toFixed(precision))
  }

  function getRequiredMinNotional(item) {
    const symbolMinNotional = Number(item.notional)
    const baseMinNotional = Number.isFinite(symbolMinNotional) && symbolMinNotional > 0
      ? Math.max(symbolMinNotional, validMinOrderNotional)
      : validMinOrderNotional
    return Number((baseMinNotional * validMinOrderNotionalBufferRatio).toFixed(8))
  }

  function getQuantity(item, ratio) {
    const referencePrice = getReferencePrice(item)
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
      global.errorLogger(item.symbol, '价格异常，跳过下单')
      return 0
    }
    let quantity = getNum(parseFloat(item.quantity) * ratio, parseFloat(item.quantity))
    let minQuantity = 0
    let minQty = parseFloat(item.minQty)
    let maxQty = parseFloat(item.maxQty)
    let stepSize = parseFloat(item.stepSize)
    const requiredMinNotional = getRequiredMinNotional(item)

    if (!Number.isFinite(minQty) || minQty <= 0) minQty = 0
    if (!Number.isFinite(maxQty) || maxQty <= 0) maxQty = Number.MAX_SAFE_INTEGER
    if (!Number.isFinite(stepSize) || stepSize <= 0) {
      const quantityPrecision = Number(item.quantityPrecision || 3)
      stepSize = 1 / Math.pow(10, quantityPrecision)
    }

    quantity = alignQuantityByStep(quantity, stepSize)

    if (minQty * referencePrice <= requiredMinNotional) {
      minQuantity = alignQuantityByStep(requiredMinNotional / referencePrice, stepSize, true)
    } else {
      minQuantity = alignQuantityByStep(minQty, stepSize, true)
    }
    if (quantity < minQuantity) quantity = minQuantity
    if (quantity > maxQty) quantity = alignQuantityByStep(maxQty, stepSize)
    if (quantity * referencePrice < requiredMinNotional) {
      quantity = alignQuantityByStep(requiredMinNotional / referencePrice, stepSize, true)
    }
    if (quantity > maxQty) {
      global.logger.info(item.symbol, `最小名义价值要求(${requiredMinNotional})超过最大下单数量，跳过`)
      return 0
    }
    const finalQuantity = getNum(alignQuantityByStep(quantity, stepSize), parseFloat(item.quantity))
    const finalNotional = finalQuantity * referencePrice
    if (!Number.isFinite(finalNotional) || finalNotional < requiredMinNotional) {
      global.logger.warn(item.symbol, '最小名义价值缓冲校验未通过，跳过下单', {
        finalQuantity,
        finalNotional,
        requiredMinNotional,
        referencePrice,
        closePrice: item.closePrice,
        currentPrice: item.currentPrice
      })
      return 0
    }
    global.logger.info(item.symbol, '下单处理的数量', finalQuantity, getNum(finalQuantity, parseFloat(item.quantity)), {
      referencePrice,
      requiredMinNotional
    })
    return finalQuantity
  }

  const generatedArray = generateArray(orderList.length)

  async function setOrder(item, callback, ratio) {
    try {
      const quantity = getQuantity(item, ratio)
      const referencePrice = getReferencePrice(item)
      const orderNotional = Number(quantity) * referencePrice
      const requiredMinNotional = getRequiredMinNotional(item)
      if (quantity === 0) {
        global.logger.info(item.symbol, '数量为0不再下单')
      } else if (!Number.isFinite(orderNotional) || orderNotional <= 0) {
        global.logger.warn(item.symbol, '名义价值异常，跳过下单', {
          quantity,
          closePrice: item.closePrice,
          currentPrice: item.currentPrice,
          referencePrice
        })
      } else if (orderNotional < requiredMinNotional) {
        global.logger.warn(item.symbol, `低于最小名义价值缓冲(${requiredMinNotional})，跳过`, {
          orderNotional,
          referencePrice,
          closePrice: item.closePrice,
          currentPrice: item.currentPrice
        })
      } else if (orderNotional > validSingleOrderNotionalLimit) {
        global.logger.warn(item.symbol, `超过单笔名义价值上限(${validSingleOrderNotionalLimit})，跳过`, { orderNotional })
      } else if ((submittedTodayNotional + orderNotional) > validDailyOrderNotionalLimit) {
        global.logger.warn(item.symbol, `超过当日名义价值上限(${validDailyOrderNotionalLimit})，跳过`, {
          submittedTodayNotional,
          orderNotional
        })
      } else if ((projectedPositionNotional + orderNotional) > validMaxPositionNotionalLimit) {
        global.logger.warn(item.symbol, `超过最大持仓名义价值上限(${validMaxPositionNotionalLimit})，跳过`, {
          projectedPositionNotional,
          orderNotional
        })
      } else {
        const orderResult = await contractOrder({
          symbol: item.symbol,
          positionSide: item.direction > 0 ? 'LONG' : 'SHORT',
          quantity,
          notional: orderNotional,
          stopPrice: item.stopPrice,
          leverage: item.leverage
        })
        if (orderResult && !orderResult.data?.duplicated) {
          submittedTodayNotional += orderNotional
          projectedPositionNotional += orderNotional
        }
      }
    } catch (error) {
      global.errorLogger(item.symbol, '下单执行异常', error?.message || error)
    } finally {
      count++
      if (count === allCount) {
        callback()
      }
    }
  }

  function runOrders() {
    return new Promise(resolve => {
      for (let i in orderList) {
        if (!orderList[i].isOne) {
          addCount++
          if (addCount > maxAddOrderNumber) {
            global.logger.info(orderList[i].symbol, '不再加仓')
            count++
            if (count === allCount) resolve()
            continue
          }
        }
        setOrder(orderList[i], resolve, generatedArray[i])
      }
    })
  }

  await runOrders()
  global.logger.info('下单完毕')
  return orderList
}

module.exports = {
  executeScheduledOrders
}
