/**
 * 格式化工具模块
 * 提供数字格式化、字符串格式化、JSON格式化等功能
 */

// ==================== 数字格式化 ====================

/**
 * 格式化数字为指定小数位数的字符串
 * @param {number} number - 要格式化的数字
 * @param {number} decimals - 小数位数，默认2位
 * @param {boolean} removeTrailingZeros - 是否移除尾部零，默认false
 * @returns {string} 格式化后的字符串
 */
function formatNumber(number, decimals = 2, removeTrailingZeros = false) {
  if (typeof number !== 'number' || isNaN(number)) return '0';
  
  let formatted = number.toFixed(decimals);
  
  if (removeTrailingZeros) {
    formatted = parseFloat(formatted).toString();
  }
  
  return formatted;
}

/**
 * 格式化价格，自动选择合适的小数位数
 * @param {number} price - 价格
 * @param {string} tickSize - 价格步长
 * @returns {string} 格式化后的价格
 */
function formatPrice(price, tickSize = '0.01') {
  if (typeof price !== 'number' || isNaN(price)) return '0';
  
  // 根据tickSize确定小数位数
  const decimals = getDecimalPlaces(tickSize);
  return formatNumber(price, decimals, true);
}

/**
 * 格式化数量，根据stepSize确定精度
 * @param {number} quantity - 数量
 * @param {string} stepSize - 数量步长
 * @returns {string} 格式化后的数量
 */
function formatQuantity(quantity, stepSize = '0.001') {
  if (typeof quantity !== 'number' || isNaN(quantity)) return '0';
  
  const decimals = getDecimalPlaces(stepSize);
  return formatNumber(quantity, decimals, true);
}

/**
 * 格式化百分比
 * @param {number} value - 数值（0-1之间表示百分比）
 * @param {number} decimals - 小数位数，默认2位
 * @param {boolean} includeSign - 是否包含%符号，默认true
 * @returns {string} 格式化后的百分比
 */
function formatPercentage(value, decimals = 2, includeSign = true) {
  if (typeof value !== 'number' || isNaN(value)) return '0%';
  
  const percentage = value * 100;
  const formatted = formatNumber(percentage, decimals, true);
  
  return includeSign ? `${formatted}%` : formatted;
}

/**
 * 格式化货币，添加千位分隔符
 * @param {number} amount - 金额
 * @param {number} decimals - 小数位数，默认2位
 * @param {string} separator - 千位分隔符，默认逗号
 * @param {string} symbol - 货币符号，默认空
 * @returns {string} 格式化后的货币
 */
function formatCurrency(amount, decimals = 2, separator = ',', symbol = '') {
  if (typeof amount !== 'number' || isNaN(amount)) return symbol + '0';
  
  const formatted = formatNumber(Math.abs(amount), decimals);
  const parts = formatted.split('.');
  
  // 添加千位分隔符
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  
  const result = parts.join('.');
  const sign = amount < 0 ? '-' : '';
  
  return sign + symbol + result;
}

/**
 * 格式化为科学记数法
 * @param {number} number - 数字
 * @param {number} precision - 精度，默认2位
 * @returns {string} 科学记数法字符串
 */
function formatScientific(number, precision = 2) {
  if (typeof number !== 'number' || isNaN(number)) return '0e+0';
  
  return number.toExponential(precision);
}

// ==================== 字符串格式化 ====================

/**
 * 首字母大写
 * @param {string} str - 字符串
 * @returns {string} 首字母大写的字符串
 */
function capitalize(str) {
  if (typeof str !== 'string') return '';
  
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * 驼峰命名转换
 * @param {string} str - 字符串
 * @returns {string} 驼峰命名的字符串
 */
function toCamelCase(str) {
  if (typeof str !== 'string') return '';
  
  return str.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
}

/**
 * 蛇形命名转换
 * @param {string} str - 字符串
 * @returns {string} 蛇形命名的字符串
 */
function toSnakeCase(str) {
  if (typeof str !== 'string') return '';
  
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).toLowerCase();
}

/**
 * 短横线命名转换
 * @param {string} str - 字符串
 * @returns {string} 短横线命名的字符串
 */
function toKebabCase(str) {
  if (typeof str !== 'string') return '';
  
  return str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`).toLowerCase();
}

/**
 * 截断字符串并添加省略号
 * @param {string} str - 字符串
 * @param {number} maxLength - 最大长度
 * @param {string} suffix - 后缀，默认'...'
 * @returns {string} 截断后的字符串
 */
function truncate(str, maxLength, suffix = '...') {
  if (typeof str !== 'string') return '';
  
  if (str.length <= maxLength) return str;
  
  return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * 填充字符串到指定长度
 * @param {string} str - 原字符串
 * @param {number} length - 目标长度
 * @param {string} padString - 填充字符，默认空格
 * @param {string} direction - 填充方向：'left', 'right', 'both'，默认'left'
 * @returns {string} 填充后的字符串
 */
function padString(str, length, padString = ' ', direction = 'left') {
  if (typeof str !== 'string') str = String(str);
  
  if (str.length >= length) return str;
  
  const padLength = length - str.length;
  
  switch (direction) {
    case 'right':
      return str.padEnd(length, padString);
    case 'both':
      const leftPad = Math.floor(padLength / 2);
      const rightPad = padLength - leftPad;
      return padString.repeat(leftPad) + str + padString.repeat(rightPad);
    default: // 'left'
      return str.padStart(length, padString);
  }
}

// ==================== 时间格式化 ====================

/**
 * 格式化时间间隔为可读字符串
 * @param {number} milliseconds - 毫秒数
 * @param {boolean} short - 是否使用短格式，默认false
 * @returns {string} 可读的时间间隔
 */
function formatTimeInterval(milliseconds, short = false) {
  if (typeof milliseconds !== 'number' || milliseconds < 0) return '0秒';
  
  const units = short 
    ? [
        { name: '年', value: 365 * 24 * 60 * 60 * 1000 },
        { name: '月', value: 30 * 24 * 60 * 60 * 1000 },
        { name: '天', value: 24 * 60 * 60 * 1000 },
        { name: '时', value: 60 * 60 * 1000 },
        { name: '分', value: 60 * 1000 },
        { name: '秒', value: 1000 }
      ]
    : [
        { name: '年', value: 365 * 24 * 60 * 60 * 1000 },
        { name: '个月', value: 30 * 24 * 60 * 60 * 1000 },
        { name: '天', value: 24 * 60 * 60 * 1000 },
        { name: '小时', value: 60 * 60 * 1000 },
        { name: '分钟', value: 60 * 1000 },
        { name: '秒', value: 1000 }
      ];
  
  for (const unit of units) {
    if (milliseconds >= unit.value) {
      const count = Math.floor(milliseconds / unit.value);
      return `${count}${unit.name}`;
    }
  }
  
  return short ? '0秒' : '0秒';
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @param {number} decimals - 小数位数，默认2位
 * @param {boolean} binary - 是否使用二进制单位，默认false
 * @returns {string} 格式化后的文件大小
 */
function formatFileSize(bytes, decimals = 2, binary = false) {
  if (typeof bytes !== 'number' || bytes < 0) return '0 B';
  
  const units = binary 
    ? ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']
    : ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
  const base = binary ? 1024 : 1000;
  
  if (bytes === 0) return '0 B';
  
  const i = Math.floor(Math.log(bytes) / Math.log(base));
  const size = bytes / Math.pow(base, i);
  
  return `${formatNumber(size, decimals, true)} ${units[i]}`;
}

// ==================== JSON格式化 ====================

/**
 * 格式化JSON字符串
 * @param {*} obj - 要格式化的对象
 * @param {number} indent - 缩进空格数，默认2
 * @returns {string} 格式化后的JSON字符串
 */
function formatJSON(obj, indent = 2) {
  try {
    return JSON.stringify(obj, null, indent);
  } catch (error) {
    return '无效的JSON对象';
  }
}

/**
 * 压缩JSON字符串（移除空白字符）
 * @param {*} obj - 要压缩的对象
 * @returns {string} 压缩后的JSON字符串
 */
function compactJSON(obj) {
  try {
    return JSON.stringify(obj);
  } catch (error) {
    return '{}';
  }
}

// ==================== 交易相关格式化 ====================

/**
 * 格式化订单状态
 * @param {string} status - 订单状态
 * @returns {string} 格式化后的状态
 */
function formatOrderStatus(status) {
  if (typeof status !== 'string') return '未知';
  
  const statusMap = {
    'NEW': '新建',
    'PARTIALLY_FILLED': '部分成交',
    'FILLED': '完全成交',
    'CANCELED': '已取消',
    'PENDING_CANCEL': '取消中',
    'REJECTED': '已拒绝',
    'EXPIRED': '已过期'
  };
  
  return statusMap[status.toUpperCase()] || status;
}

/**
 * 格式化订单方向
 * @param {string} side - 订单方向
 * @returns {string} 格式化后的方向
 */
function formatOrderSide(side) {
  if (typeof side !== 'string') return '未知';
  
  const sideMap = {
    'BUY': '买入',
    'SELL': '卖出',
    'LONG': '做多',
    'SHORT': '做空'
  };
  
  return sideMap[side.toUpperCase()] || side;
}

/**
 * 格式化盈亏，添加颜色标识
 * @param {number} pnl - 盈亏数值
 * @param {number} decimals - 小数位数，默认2位
 * @returns {Object} 包含文本和颜色的对象
 */
function formatPnL(pnl, decimals = 2) {
  if (typeof pnl !== 'number' || isNaN(pnl)) {
    return { text: '0.00', color: 'neutral', isProfit: false };
  }
  
  const formatted = formatNumber(pnl, decimals, true);
  const sign = pnl > 0 ? '+' : '';
  
  return {
    text: `${sign}${formatted}`,
    color: pnl > 0 ? 'green' : pnl < 0 ? 'red' : 'neutral',
    isProfit: pnl > 0,
    isLoss: pnl < 0
  };
}

// ==================== 工具函数 ====================

/**
 * 获取字符串的小数位数
 * @param {string} str - 数字字符串
 * @returns {number} 小数位数
 */
function getDecimalPlaces(str) {
  if (typeof str !== 'string') return 0;
  
  const match = str.match(/\.(\d+)/);
  return match ? match[1].length : 0;
}

/**
 * 移除字符串中的HTML标签
 * @param {string} html - HTML字符串
 * @returns {string} 纯文本
 */
function stripHtml(html) {
  if (typeof html !== 'string') return '';
  
  return html.replace(/<[^>]*>/g, '');
}

/**
 * 转义HTML特殊字符
 * @param {string} text - 文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  
  return text.replace(/[&<>"']/g, char => map[char]);
}

// ==================== 导出所有函数 ====================

module.exports = {
  // 数字格式化
  formatNumber,
  formatPrice,
  formatQuantity,
  formatPercentage,
  formatCurrency,
  formatScientific,
  
  // 字符串格式化
  capitalize,
  toCamelCase,
  toSnakeCase,
  toKebabCase,
  truncate,
  padString,
  
  // 时间和大小格式化
  formatTimeInterval,
  formatFileSize,
  
  // JSON格式化
  formatJSON,
  compactJSON,
  
  // 交易相关格式化
  formatOrderStatus,
  formatOrderSide,
  formatPnL,
  
  // 工具函数
  getDecimalPlaces,
  stripHtml,
  escapeHtml
};