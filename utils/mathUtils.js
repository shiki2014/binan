/**
 * 数学工具模块
 * 包含各种数学计算、统计分析和技术指标计算函数
 */

// ==================== 基础数学函数 ====================

/**
 * 获取数值的精度（小数位数）
 * @param {number} number - 要检查的数值
 * @returns {number} 小数位数
 */
function getPrecision(number) {
  const strNumber = number.toString();
  if (strNumber.indexOf('.') !== -1) {
    const decimalPart = strNumber.split('.')[1];
    return decimalPart.length;
  }
  return 0;
}

/**
 * 保留固定位小数，不进行四舍五入（截断）
 * @param {number} number - 原始数值
 * @param {number} decimalPlaces - 保留的小数位数
 * @returns {number} 截断后的数值
 */
function truncateDecimal(number, decimalPlaces) {
  const numberString = number.toString();
  const decimalIndex = numberString.indexOf('.');
  if (decimalIndex !== -1) {
    return parseFloat(numberString.substring(0, decimalIndex + 1 + decimalPlaces));
  }
  return number;
}

/**
 * 精确舍入到指定小数位数
 * @param {number} value - 原始数值
 * @param {number} decimals - 小数位数，默认6位
 * @returns {number} 舍入后的数值
 */
function round(value, decimals = 6) {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * 舍入到6位小数（金融计算常用）
 * @param {number} value - 原始数值
 * @returns {number} 舍入后的数值
 */
function round6(value) {
  return Math.round(value * 1000000) / 1000000;
}

/**
 * 检查数值是否在指定范围内
 * @param {number} value - 要检查的数值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {boolean} 是否在范围内
 */
function isInRange(value, min, max) {
  return value >= min && value <= max;
}

/**
 * 将数值限制在指定范围内
 * @param {number} value - 原始数值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number} 限制后的数值
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// ==================== 统计计算函数 ====================

/**
 * 简单移动平均 (SMA)
 * @param {number[]} data - 数据数组
 * @param {number} period - 周期长度
 * @returns {number} 移动平均值
 */
function SMA(data, period) {
  if (data.length < period) return null;
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  return sum / period;
}

/**
 * 计算数组的简单移动平均
 * @param {number[]} source - 数据源
 * @param {number} length - 计算长度
 * @returns {number} 平均值
 */
function calculateSMA(source, length) {
  if (source.length < length) return null;
  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += source[i] / length;
  }
  return sum;
}

/**
 * 指数移动平均 (EMA)
 * @param {number[]} data - 数据数组
 * @param {number} period - 周期
 * @returns {number[]} EMA数组
 */
function EMA(data, period) {
  if (data.length < period) return [];
  
  const alpha = 2 / (period + 1);
  const emaArray = [];
  
  // 第一个EMA值使用SMA
  emaArray[0] = SMA(data.slice(0, period), period);
  
  // 后续使用EMA公式
  for (let i = 1; i < data.length - period + 1; i++) {
    emaArray[i] = alpha * data[period + i - 1] + (1 - alpha) * emaArray[i - 1];
  }
  
  return emaArray;
}

/**
 * Wilder移动平均 (RMA/SMMA)
 * @param {number[]} data - 数据数组
 * @param {number} period - 周期
 * @returns {number} RMA值
 */
function RMA(data, period) {
  if (data.length < period) return null;
  
  function _zeros(len) {
    const array = [];
    for (let i = 0; i < len; i++) {
      array.push(0);
    }
    return array;
  }
  
  const rmas = _zeros(data.length);
  
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      rmas[i] = 0;
    } else {
      if (rmas[i - 1]) {
        rmas[i] = round6((data[i - 1] + (period - 1) * rmas[i - 1]) / period);
      } else {
        rmas[i] = round6(calculateSMA(data.slice(i - period, i), period));
      }
    }
  }
  
  return rmas[rmas.length - 1];
}

/**
 * 标准差计算
 * @param {number[]} data - 数据数组
 * @returns {number} 标准差
 */
function standardDeviation(data) {
  if (data.length === 0) return 0;
  
  const mean = data.reduce((sum, value) => sum + value, 0) / data.length;
  const squaredDiffs = data.map(value => Math.pow(value - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((sum, value) => sum + value, 0) / data.length;
  
  return Math.sqrt(avgSquaredDiff);
}

/**
 * 方差计算
 * @param {number[]} data - 数据数组
 * @returns {number} 方差
 */
function variance(data) {
  if (data.length === 0) return 0;
  
  const mean = data.reduce((sum, value) => sum + value, 0) / data.length;
  const squaredDiffs = data.map(value => Math.pow(value - mean, 2));
  
  return squaredDiffs.reduce((sum, value) => sum + value, 0) / data.length;
}

// ==================== ATR 技术指标计算 ====================

/**
 * 计算真实波动幅度 (True Range)
 * @param {Object} current - 当前K线数据 {high, low, close}
 * @param {Object} previous - 前一根K线数据 {high, low, close}
 * @returns {number} 真实波动幅度
 */
function calculateTR(current, previous) {
  if (!previous) {
    return current.high - current.low;
  }
  
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close)
  );
}

/**
 * 计算平均真实波动幅度 (ATR)
 * @param {Array} klineData - K线数据数组，每个元素包含 {high, low, close}
 * @param {number} period - ATR周期，默认14
 * @returns {number} ATR值
 */
function calculateATR(klineData, period = 14) {
  if (klineData.length < period + 1) return null;
  
  const trArray = [];
  
  // 计算每根K线的真实波动幅度
  for (let i = 0; i < klineData.length; i++) {
    if (i === 0) {
      trArray.push(klineData[i].high - klineData[i].low);
    } else {
      const tr = calculateTR(klineData[i], klineData[i - 1]);
      trArray.push(tr);
    }
  }
  
  // 使用RMA计算ATR
  return RMA(trArray, period);
}

/**
 * 获取ATR计算（兼容原有接口）
 * @param {Array} data - K线数据
 * @param {number} cycle - 周期
 * @returns {number} ATR值
 */
function getATRCompute(data, cycle) {
  return calculateATR(data, cycle);
}

// ==================== 波动率计算 ====================

/**
 * 计算价格波动率
 * @param {number[]} prices - 价格数组
 * @param {number} period - 计算周期
 * @returns {number} 波动率
 */
function calculateVolatility(prices, period) {
  if (prices.length < period + 1) return null;
  
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    const returnRate = (prices[i] - prices[i - 1]) / prices[i - 1];
    returns.push(returnRate);
  }
  
  return standardDeviation(returns.slice(-period));
}

/**
 * 计算振幅百分比
 * @param {number} high - 最高价
 * @param {number} low - 最低价
 * @param {number} close - 收盘价
 * @returns {number} 振幅百分比
 */
function calculateAmplitudePercent(high, low, close) {
  if (close === 0) return 0;
  return ((high - low) / close) * 100;
}

// ==================== 数组工具函数 ====================

/**
 * 创建指定长度的零数组
 * @param {number} length - 数组长度
 * @returns {number[]} 零数组
 */
function zeros(length) {
  const array = [];
  for (let i = 0; i < length; i++) {
    array.push(0);
  }
  return array;
}

/**
 * 获取数组中的最大值
 * @param {number[]} array - 数据数组
 * @returns {number} 最大值
 */
function arrayMax(array) {
  return Math.max(...array);
}

/**
 * 获取数组中的最小值
 * @param {number[]} array - 数据数组
 * @returns {number} 最小值
 */
function arrayMin(array) {
  return Math.min(...array);
}

/**
 * 获取数组的和
 * @param {number[]} array - 数据数组
 * @returns {number} 总和
 */
function arraySum(array) {
  return array.reduce((sum, value) => sum + value, 0);
}

/**
 * 获取数组的平均值
 * @param {number[]} array - 数据数组
 * @returns {number} 平均值
 */
function arrayAverage(array) {
  if (array.length === 0) return 0;
  return arraySum(array) / array.length;
}

// ==================== 百分比和比率计算 ====================

/**
 * 计算百分比变化
 * @param {number} oldValue - 原始值
 * @param {number} newValue - 新值
 * @returns {number} 百分比变化
 */
function percentChange(oldValue, newValue) {
  if (oldValue === 0) return 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * 计算变化率
 * @param {number} current - 当前值
 * @param {number} previous - 前一个值
 * @returns {number} 变化率
 */
function changeRate(current, previous) {
  if (previous === 0) return 0;
  return (current - previous) / previous;
}

/**
 * 计算复合增长率
 * @param {number} beginValue - 初始值
 * @param {number} endValue - 结束值
 * @param {number} periods - 周期数
 * @returns {number} 复合增长率
 */
function compoundGrowthRate(beginValue, endValue, periods) {
  if (beginValue <= 0 || periods <= 0) return 0;
  return Math.pow(endValue / beginValue, 1 / periods) - 1;
}

// ==================== 导出所有函数 ====================

module.exports = {
  // 基础数学函数
  getPrecision,
  truncateDecimal,
  round,
  round6,
  isInRange,
  clamp,
  
  // 统计计算函数
  SMA,
  calculateSMA,
  EMA,
  RMA,
  standardDeviation,
  variance,
  
  // ATR 相关函数
  calculateTR,
  calculateATR,
  getATRCompute, // 兼容原有接口
  
  // 波动率计算
  calculateVolatility,
  calculateAmplitudePercent,
  
  // 数组工具函数
  zeros,
  arrayMax,
  arrayMin,
  arraySum,
  arrayAverage,
  
  // 百分比和比率计算
  percentChange,
  changeRate,
  compoundGrowthRate
};