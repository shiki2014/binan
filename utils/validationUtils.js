/**
 * 数据验证工具模块
 * 提供各种数据类型验证、格式验证和业务规则验证功能
 */

// ==================== 基础类型验证 ====================

/**
 * 检查值是否为数字
 * @param {*} value - 要检查的值
 * @returns {boolean} 是否为数字
 */
function isNumber(value) {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * 检查值是否为字符串
 * @param {*} value - 要检查的值
 * @returns {boolean} 是否为字符串
 */
function isString(value) {
  return typeof value === 'string';
}

/**
 * 检查值是否为布尔值
 * @param {*} value - 要检查的值
 * @returns {boolean} 是否为布尔值
 */
function isBoolean(value) {
  return typeof value === 'boolean';
}

/**
 * 检查值是否为对象
 * @param {*} value - 要检查的值
 * @returns {boolean} 是否为对象
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 检查值是否为数组
 * @param {*} value - 要检查的值
 * @returns {boolean} 是否为数组
 */
function isArray(value) {
  return Array.isArray(value);
}

/**
 * 检查值是否为函数
 * @param {*} value - 要检查的值
 * @returns {boolean} 是否为函数
 */
function isFunction(value) {
  return typeof value === 'function';
}

/**
 * 检查值是否为null或undefined
 * @param {*} value - 要检查的值
 * @returns {boolean} 是否为null或undefined
 */
function isNullOrUndefined(value) {
  return value === null || value === undefined;
}

/**
 * 检查值是否为空（null、undefined、空字符串、空数组、空对象）
 * @param {*} value - 要检查的值
 * @returns {boolean} 是否为空
 */
function isEmpty(value) {
  if (isNullOrUndefined(value)) return true;
  if (isString(value)) return value.trim() === '';
  if (isArray(value)) return value.length === 0;
  if (isObject(value)) return Object.keys(value).length === 0;
  return false;
}

// ==================== 数字验证 ====================

/**
 * 检查数字是否为正数
 * @param {number} value - 要检查的数值
 * @returns {boolean} 是否为正数
 */
function isPositive(value) {
  return isNumber(value) && value > 0;
}

/**
 * 检查数字是否为负数
 * @param {number} value - 要检查的数值
 * @returns {boolean} 是否为负数
 */
function isNegative(value) {
  return isNumber(value) && value < 0;
}

/**
 * 检查数字是否为零
 * @param {number} value - 要检查的数值
 * @returns {boolean} 是否为零
 */
function isZero(value) {
  return isNumber(value) && value === 0;
}

/**
 * 检查数字是否为整数
 * @param {number} value - 要检查的数值
 * @returns {boolean} 是否为整数
 */
function isInteger(value) {
  return isNumber(value) && Number.isInteger(value);
}

/**
 * 检查数字是否在指定范围内
 * @param {number} value - 要检查的数值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @param {boolean} inclusive - 是否包含边界值，默认true
 * @returns {boolean} 是否在范围内
 */
function isInRange(value, min, max, inclusive = true) {
  if (!isNumber(value) || !isNumber(min) || !isNumber(max)) return false;
  
  if (inclusive) {
    return value >= min && value <= max;
  } else {
    return value > min && value < max;
  }
}

/**
 * 检查数字精度是否符合要求
 * @param {number} value - 要检查的数值
 * @param {number} maxDecimals - 最大小数位数
 * @returns {boolean} 精度是否符合要求
 */
function hasValidPrecision(value, maxDecimals) {
  if (!isNumber(value) || !isInteger(maxDecimals) || maxDecimals < 0) return false;
  
  const decimalStr = value.toString();
  const decimalIndex = decimalStr.indexOf('.');
  
  if (decimalIndex === -1) return true; // 整数
  
  const decimalPart = decimalStr.substring(decimalIndex + 1);
  return decimalPart.length <= maxDecimals;
}

// ==================== 字符串验证 ====================

/**
 * 检查字符串长度是否在指定范围内
 * @param {string} value - 要检查的字符串
 * @param {number} minLength - 最小长度
 * @param {number} maxLength - 最大长度
 * @returns {boolean} 长度是否符合要求
 */
function hasValidLength(value, minLength, maxLength) {
  if (!isString(value)) return false;
  const length = value.length;
  return length >= minLength && length <= maxLength;
}

/**
 * 检查字符串是否只包含数字
 * @param {string} value - 要检查的字符串
 * @returns {boolean} 是否只包含数字
 */
function isNumericString(value) {
  if (!isString(value)) return false;
  return /^\d+$/.test(value);
}

/**
 * 检查字符串是否只包含字母
 * @param {string} value - 要检查的字符串
 * @returns {boolean} 是否只包含字母
 */
function isAlphabetic(value) {
  if (!isString(value)) return false;
  return /^[a-zA-Z]+$/.test(value);
}

/**
 * 检查字符串是否只包含字母和数字
 * @param {string} value - 要检查的字符串
 * @returns {boolean} 是否只包含字母和数字
 */
function isAlphanumeric(value) {
  if (!isString(value)) return false;
  return /^[a-zA-Z0-9]+$/.test(value);
}

/**
 * 检查是否为有效的电子邮件格式
 * @param {string} email - 电子邮件地址
 * @returns {boolean} 是否为有效格式
 */
function isValidEmail(email) {
  if (!isString(email)) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 检查是否为有效的URL格式
 * @param {string} url - URL字符串
 * @returns {boolean} 是否为有效格式
 */
function isValidUrl(url) {
  if (!isString(url)) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// ==================== 交易相关验证 ====================

/**
 * 检查交易对格式是否正确
 * @param {string} symbol - 交易对符号
 * @returns {boolean} 格式是否正确
 */
function isValidSymbol(symbol) {
  if (!isString(symbol)) return false;
  // 检查是否符合币安交易对格式，如 BTCUSDT
  return /^[A-Z]{2,10}USDT?$/.test(symbol.toUpperCase());
}

/**
 * 检查订单方向是否有效
 * @param {string} side - 订单方向
 * @returns {boolean} 是否有效
 */
function isValidOrderSide(side) {
  if (!isString(side)) return false;
  const validSides = ['BUY', 'SELL', 'LONG', 'SHORT'];
  return validSides.includes(side.toUpperCase());
}

/**
 * 检查订单类型是否有效
 * @param {string} type - 订单类型
 * @returns {boolean} 是否有效
 */
function isValidOrderType(type) {
  if (!isString(type)) return false;
  const validTypes = ['MARKET', 'LIMIT', 'STOP', 'STOP_MARKET', 'TAKE_PROFIT', 'TAKE_PROFIT_MARKET'];
  return validTypes.includes(type.toUpperCase());
}

/**
 * 检查仓位方向是否有效
 * @param {string} positionSide - 仓位方向
 * @returns {boolean} 是否有效
 */
function isValidPositionSide(positionSide) {
  if (!isString(positionSide)) return false;
  const validSides = ['LONG', 'SHORT', 'BOTH'];
  return validSides.includes(positionSide.toUpperCase());
}

/**
 * 检查交易数量是否有效
 * @param {number} quantity - 交易数量
 * @param {number} minQty - 最小数量
 * @param {number} maxQty - 最大数量
 * @param {number} stepSize - 数量步长
 * @returns {boolean} 是否有效
 */
function isValidQuantity(quantity, minQty, maxQty, stepSize) {
  if (!isPositive(quantity)) return false;
  if (minQty && quantity < minQty) return false;
  if (maxQty && quantity > maxQty) return false;
  
  if (stepSize && stepSize > 0) {
    const remainder = (quantity - minQty) % stepSize;
    return Math.abs(remainder) < 1e-8; // 考虑浮点数精度
  }
  
  return true;
}

/**
 * 检查价格是否有效
 * @param {number} price - 价格
 * @param {string} tickSize - 价格步长
 * @returns {boolean} 是否有效
 */
function isValidPrice(price, tickSize) {
  if (!isPositive(price)) return false;
  
  if (tickSize) {
    const tick = parseFloat(tickSize);
    if (tick > 0) {
      const remainder = price % tick;
      return Math.abs(remainder) < 1e-8; // 考虑浮点数精度
    }
  }
  
  return true;
}

// ==================== 数组验证 ====================

/**
 * 检查数组是否包含指定值
 * @param {Array} array - 数组
 * @param {*} value - 要检查的值
 * @returns {boolean} 是否包含
 */
function arrayContains(array, value) {
  if (!isArray(array)) return false;
  return array.includes(value);
}

/**
 * 检查数组是否只包含指定类型的元素
 * @param {Array} array - 数组
 * @param {string} type - 类型名称
 * @returns {boolean} 是否只包含指定类型
 */
function arrayContainsOnly(array, type) {
  if (!isArray(array)) return false;
  
  const typeCheckers = {
    number: isNumber,
    string: isString,
    boolean: isBoolean,
    object: isObject,
    array: isArray,
    function: isFunction
  };
  
  const checker = typeCheckers[type];
  if (!checker) return false;
  
  return array.every(checker);
}

/**
 * 检查数组长度是否在指定范围内
 * @param {Array} array - 数组
 * @param {number} minLength - 最小长度
 * @param {number} maxLength - 最大长度
 * @returns {boolean} 长度是否符合要求
 */
function hasValidArrayLength(array, minLength, maxLength) {
  if (!isArray(array)) return false;
  const length = array.length;
  return length >= minLength && length <= maxLength;
}

// ==================== 复合验证函数 ====================

/**
 * 批量验证多个规则
 * @param {*} value - 要验证的值
 * @param {Array} rules - 验证规则数组
 * @returns {Object} 验证结果 {isValid: boolean, errors: string[]}
 */
function validateMultiple(value, rules) {
  const errors = [];
  
  for (const rule of rules) {
    const { validator, message, ...params } = rule;
    
    let isValid = false;
    
    if (typeof validator === 'function') {
      isValid = validator(value, ...Object.values(params));
    } else if (typeof validator === 'string') {
      // 支持内置验证器名称
      const validators = {
        isNumber, isString, isBoolean, isObject, isArray, isFunction,
        isEmpty, isPositive, isNegative, isZero, isInteger,
        isNumericString, isAlphabetic, isAlphanumeric,
        isValidEmail, isValidUrl, isValidSymbol, isValidOrderSide
      };
      
      const validatorFn = validators[validator];
      if (validatorFn) {
        isValid = validatorFn(value, ...Object.values(params));
      }
    }
    
    if (!isValid) {
      errors.push(message || `验证失败: ${validator}`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// ==================== 导出所有函数 ====================

module.exports = {
  // 基础类型验证
  isNumber,
  isString,
  isBoolean,
  isObject,
  isArray,
  isFunction,
  isNullOrUndefined,
  isEmpty,
  
  // 数字验证
  isPositive,
  isNegative,
  isZero,
  isInteger,
  isInRange,
  hasValidPrecision,
  
  // 字符串验证
  hasValidLength,
  isNumericString,
  isAlphabetic,
  isAlphanumeric,
  isValidEmail,
  isValidUrl,
  
  // 交易相关验证
  isValidSymbol,
  isValidOrderSide,
  isValidOrderType,
  isValidPositionSide,
  isValidQuantity,
  isValidPrice,
  
  // 数组验证
  arrayContains,
  arrayContainsOnly,
  hasValidArrayLength,
  
  // 复合验证
  validateMultiple
};