/**
 * 精度处理工具模块
 * 用于处理交易所价格精度、数量精度等相关计算
 */

const { getAllExchangeInfo } = require('../controllers/calculatePositionsController');

// 交易对信息缓存
let exchangeInfoCache = null;

/**
 * 获取交易对信息（带缓存）
 * @returns {Promise<Array>} 交易对信息数组
 */
async function getExchangeInfo() {
  if (!exchangeInfoCache) {
    try {
      exchangeInfoCache = await getAllExchangeInfo();
    } catch (error) {
      global.errorLogger('获取交易对信息失败:', error);
      return [];
    }
  }
  return exchangeInfoCache;
}

/**
 * 清除交易对信息缓存
 * 在需要刷新交易对信息时调用
 */
function clearExchangeInfoCache() {
  exchangeInfoCache = null;
}

/**
 * 获取品种的tickSize精度信息
 * @param {string} symbol - 交易对符号，如'BTCUSDT'
 * @returns {Promise<string>} tickSize值，如'0.01'
 */
async function getTickSize(symbol) {
  const allExchange = await getExchangeInfo();
  const symbolInfo = allExchange.find(item => item.symbol === symbol);
  
  if (symbolInfo) {
    const priceFilter = symbolInfo.filters.find(filter => filter.filterType === 'PRICE_FILTER');
    return priceFilter ? priceFilter.tickSize : '0.0001';
  }
  return '0.0001';
}

/**
 * 获取品种的数量精度信息
 * @param {string} symbol - 交易对符号
 * @returns {Promise<string>} stepSize值，如'0.001'
 */
async function getStepSize(symbol) {
  const allExchange = await getExchangeInfo();
  const symbolInfo = allExchange.find(item => item.symbol === symbol);
  
  if (symbolInfo) {
    const lotSizeFilter = symbolInfo.filters.find(filter => filter.filterType === 'LOT_SIZE');
    return lotSizeFilter ? lotSizeFilter.stepSize : '0.001';
  }
  return '0.001';
}

/**
 * 根据tickSize获取价格精度位数
 * @param {string} tickSize - 最小价格变动单位
 * @returns {number} 小数位数
 */
function getPricePrecisionFromTickSize(tickSize) {
  const tickSizeStr = tickSize.toString();
  if (tickSizeStr.includes('.')) {
    return tickSizeStr.split('.')[1].length;
  }
  return 0;
}

/**
 * 根据stepSize获取数量精度位数
 * @param {string} stepSize - 最小数量变动单位
 * @returns {number} 小数位数
 */
function getQuantityPrecisionFromStepSize(stepSize) {
  const stepSizeStr = stepSize.toString();
  if (stepSizeStr.includes('.')) {
    return stepSizeStr.split('.')[1].length;
  }
  return 0;
}

/**
 * 根据tickSize格式化价格
 * @param {number} price - 原始价格
 * @param {string} tickSize - 最小价格变动单位
 * @returns {number} 格式化后的价格
 */
function formatPriceByTickSize(price, tickSize) {
  const tickSizeNum = parseFloat(tickSize);
  const precision = getPricePrecisionFromTickSize(tickSize);
  const adjustedPrice = Math.round(price / tickSizeNum) * tickSizeNum;
  return parseFloat(adjustedPrice.toFixed(precision));
}

/**
 * 根据stepSize格式化数量
 * @param {number} quantity - 原始数量
 * @param {string} stepSize - 最小数量变动单位
 * @returns {number} 格式化后的数量
 */
function formatQuantityByStepSize(quantity, stepSize) {
  const stepSizeNum = parseFloat(stepSize);
  const precision = getQuantityPrecisionFromStepSize(stepSize);
  const adjustedQuantity = Math.round(quantity / stepSizeNum) * stepSizeNum;
  return parseFloat(adjustedQuantity.toFixed(precision));
}

/**
 * 获取品种的完整精度信息
 * @param {string} symbol - 交易对符号
 * @returns {Promise<Object>} 精度信息对象
 */
async function getSymbolPrecisionInfo(symbol) {
  const allExchange = await getExchangeInfo();
  const symbolInfo = allExchange.find(item => item.symbol === symbol);
  
  if (!symbolInfo) {
    return {
      tickSize: '0.0001',
      stepSize: '0.001',
      pricePrecision: 4,
      quantityPrecision: 3,
      minPrice: '0.0001',
      maxPrice: '1000000',
      minQty: '0.001',
      maxQty: '9000000'
    };
  }
  
  const priceFilter = symbolInfo.filters.find(f => f.filterType === 'PRICE_FILTER');
  const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
  
  const tickSize = priceFilter?.tickSize || '0.0001';
  const stepSize = lotSizeFilter?.stepSize || '0.001';
  
  return {
    tickSize,
    stepSize,
    pricePrecision: getPricePrecisionFromTickSize(tickSize),
    quantityPrecision: getQuantityPrecisionFromStepSize(stepSize),
    minPrice: priceFilter?.minPrice || '0.0001',
    maxPrice: priceFilter?.maxPrice || '1000000',
    minQty: lotSizeFilter?.minQty || '0.001',
    maxQty: lotSizeFilter?.maxQty || '9000000'
  };
}

/**
 * 验证价格是否符合精度要求
 * @param {number} price - 价格
 * @param {string} tickSize - 最小价格变动单位
 * @returns {boolean} 是否符合精度要求
 */
function validatePricePrecision(price, tickSize) {
  const tickSizeNum = parseFloat(tickSize);
  const remainder = price % tickSizeNum;
  return Math.abs(remainder) < 1e-8 || Math.abs(remainder - tickSizeNum) < 1e-8;
}

/**
 * 验证数量是否符合精度要求
 * @param {number} quantity - 数量
 * @param {string} stepSize - 最小数量变动单位
 * @returns {boolean} 是否符合精度要求
 */
function validateQuantityPrecision(quantity, stepSize) {
  const stepSizeNum = parseFloat(stepSize);
  const remainder = quantity % stepSizeNum;
  return Math.abs(remainder) < 1e-8 || Math.abs(remainder - stepSizeNum) < 1e-8;
}

/**
 * 安全的价格格式化（带验证）
 * @param {number} price - 原始价格
 * @param {string} symbol - 交易对符号
 * @returns {Promise<number>} 格式化后的安全价格
 */
async function safeFormatPrice(price, symbol) {
  try {
    const tickSize = await getTickSize(symbol);
    const formattedPrice = formatPriceByTickSize(price, tickSize);
    
    if (!validatePricePrecision(formattedPrice, tickSize)) {
      global.errorLogger(`价格精度验证失败: ${symbol}, price: ${price}, formatted: ${formattedPrice}, tickSize: ${tickSize}`);
      return formatPriceByTickSize(price, tickSize); // 仍然返回格式化后的价格
    }
    
    return formattedPrice;
  } catch (error) {
    global.errorLogger(`价格格式化失败: ${symbol}, price: ${price}`, error);
    return price; // 失败时返回原始价格
  }
}

/**
 * 安全的数量格式化（带验证）
 * @param {number} quantity - 原始数量
 * @param {string} symbol - 交易对符号
 * @returns {Promise<number>} 格式化后的安全数量
 */
async function safeFormatQuantity(quantity, symbol) {
  try {
    const stepSize = await getStepSize(symbol);
    const formattedQuantity = formatQuantityByStepSize(quantity, stepSize);
    
    if (!validateQuantityPrecision(formattedQuantity, stepSize)) {
      global.errorLogger(`数量精度验证失败: ${symbol}, quantity: ${quantity}, formatted: ${formattedQuantity}, stepSize: ${stepSize}`);
      return formatQuantityByStepSize(quantity, stepSize); // 仍然返回格式化后的数量
    }
    
    return formattedQuantity;
  } catch (error) {
    global.errorLogger(`数量格式化失败: ${symbol}, quantity: ${quantity}`, error);
    return quantity; // 失败时返回原始数量
  }
}

module.exports = {
  // 基础功能
  getExchangeInfo,
  clearExchangeInfoCache,
  getTickSize,
  getStepSize,
  
  // 精度计算
  getPricePrecisionFromTickSize,
  getQuantityPrecisionFromStepSize,
  
  // 格式化功能
  formatPriceByTickSize,
  formatQuantityByStepSize,
  
  // 综合信息
  getSymbolPrecisionInfo,
  
  // 验证功能
  validatePricePrecision,
  validateQuantityPrecision,
  
  // 安全格式化
  safeFormatPrice,
  safeFormatQuantity
};