/**
 * 时间处理工具模块
 * 提供时间格式化、时区转换、时间计算等功能
 */

// ==================== 时间格式化 ====================

/**
 * 格式化时间戳为可读格式
 * @param {number} timestamp - 时间戳（毫秒）
 * @param {string} format - 格式字符串，默认 'YYYY-MM-DD HH:mm:ss'
 * @returns {string} 格式化后的时间字符串
 */
function formatTimestamp(timestamp, format = 'YYYY-MM-DD HH:mm:ss') {
  const date = new Date(timestamp);
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

/**
 * 获取当前时间戳
 * @returns {number} 当前时间戳（毫秒）
 */
function getCurrentTimestamp() {
  return Date.now();
}

/**
 * 获取当前格式化时间
 * @param {string} format - 格式字符串
 * @returns {string} 格式化的当前时间
 */
function getCurrentTime(format = 'YYYY-MM-DD HH:mm:ss') {
  return formatTimestamp(getCurrentTimestamp(), format);
}

/**
 * 将日期对象转换为时间戳
 * @param {Date} date - 日期对象
 * @returns {number} 时间戳（毫秒）
 */
function dateToTimestamp(date) {
  return date.getTime();
}

// ==================== 时间计算 ====================

/**
 * 计算两个时间戳之间的时间差
 * @param {number} timestamp1 - 时间戳1
 * @param {number} timestamp2 - 时间戳2
 * @returns {Object} 时间差对象 {days, hours, minutes, seconds, milliseconds}
 */
function getTimeDifference(timestamp1, timestamp2) {
  const diff = Math.abs(timestamp1 - timestamp2);
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  const milliseconds = diff % 1000;
  
  return { days, hours, minutes, seconds, milliseconds };
}

/**
 * 添加指定天数到时间戳
 * @param {number} timestamp - 原始时间戳
 * @param {number} days - 要添加的天数
 * @returns {number} 新的时间戳
 */
function addDays(timestamp, days) {
  return timestamp + (days * 24 * 60 * 60 * 1000);
}

/**
 * 添加指定小时到时间戳
 * @param {number} timestamp - 原始时间戳
 * @param {number} hours - 要添加的小时数
 * @returns {number} 新的时间戳
 */
function addHours(timestamp, hours) {
  return timestamp + (hours * 60 * 60 * 1000);
}

/**
 * 添加指定分钟到时间戳
 * @param {number} timestamp - 原始时间戳
 * @param {number} minutes - 要添加的分钟数
 * @returns {number} 新的时间戳
 */
function addMinutes(timestamp, minutes) {
  return timestamp + (minutes * 60 * 1000);
}

/**
 * 添加指定秒数到时间戳
 * @param {number} timestamp - 原始时间戳
 * @param {number} seconds - 要添加的秒数
 * @returns {number} 新的时间戳
 */
function addSeconds(timestamp, seconds) {
  return timestamp + (seconds * 1000);
}

// ==================== 时间验证 ====================

/**
 * 检查时间戳是否有效
 * @param {number} timestamp - 时间戳
 * @returns {boolean} 是否有效
 */
function isValidTimestamp(timestamp) {
  return !isNaN(timestamp) && timestamp > 0 && new Date(timestamp).getTime() === timestamp;
}

/**
 * 检查时间字符串格式是否正确
 * @param {string} timeString - 时间字符串
 * @param {string} format - 期望的格式
 * @returns {boolean} 格式是否正确
 */
function isValidTimeFormat(timeString, format = 'YYYY-MM-DD HH:mm:ss') {
  const regex = format
    .replace('YYYY', '\\d{4}')
    .replace('MM', '\\d{2}')
    .replace('DD', '\\d{2}')
    .replace('HH', '\\d{2}')
    .replace('mm', '\\d{2}')
    .replace('ss', '\\d{2}');
  
  return new RegExp(`^${regex}$`).test(timeString);
}

// ==================== 时区处理 ====================

/**
 * 将UTC时间戳转换为本地时间戳
 * @param {number} utcTimestamp - UTC时间戳
 * @returns {number} 本地时间戳
 */
function utcToLocal(utcTimestamp) {
  const date = new Date(utcTimestamp);
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return utcTimestamp - offset;
}

/**
 * 将本地时间戳转换为UTC时间戳
 * @param {number} localTimestamp - 本地时间戳
 * @returns {number} UTC时间戳
 */
function localToUtc(localTimestamp) {
  const date = new Date(localTimestamp);
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return localTimestamp + offset;
}

/**
 * 获取时区偏移量（分钟）
 * @returns {number} 时区偏移量
 */
function getTimezoneOffset() {
  return new Date().getTimezoneOffset();
}

// ==================== 特定用途时间函数 ====================

/**
 * 获取今天开始时间戳（00:00:00）
 * @returns {number} 今天开始的时间戳
 */
function getTodayStart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

/**
 * 获取今天结束时间戳（23:59:59）
 * @returns {number} 今天结束的时间戳
 */
function getTodayEnd() {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return today.getTime();
}

/**
 * 检查时间戳是否为今天
 * @param {number} timestamp - 要检查的时间戳
 * @returns {boolean} 是否为今天
 */
function isToday(timestamp) {
  const today = new Date();
  const checkDate = new Date(timestamp);
  
  return today.getFullYear() === checkDate.getFullYear() &&
         today.getMonth() === checkDate.getMonth() &&
         today.getDate() === checkDate.getDate();
}

/**
 * 获取指定时间戳的小时
 * @param {number} timestamp - 时间戳
 * @returns {number} 小时（0-23）
 */
function getHour(timestamp) {
  return new Date(timestamp).getHours();
}

/**
 * 检查是否在指定时间范围内
 * @param {number} timestamp - 要检查的时间戳
 * @param {number} startHour - 开始小时
 * @param {number} endHour - 结束小时
 * @returns {boolean} 是否在范围内
 */
function isInTimeRange(timestamp, startHour, endHour) {
  const hour = getHour(timestamp);
  if (startHour <= endHour) {
    return hour >= startHour && hour <= endHour;
  } else {
    // 跨日情况，如 22:00-06:00
    return hour >= startHour || hour <= endHour;
  }
}

/**
 * 解析时间字符串为时间戳
 * @param {string} timeString - 时间字符串
 * @param {string} format - 时间格式
 * @returns {number|null} 时间戳或null（解析失败）
 */
function parseTimeString(timeString, format = 'YYYY-MM-DD HH:mm:ss') {
  try {
    // 简单解析，支持常见格式
    if (format === 'YYYY-MM-DD HH:mm:ss') {
      const parts = timeString.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
      if (parts) {
        const [, year, month, day, hour, minute, second] = parts;
        const date = new Date(year, month - 1, day, hour, minute, second);
        return date.getTime();
      }
    }
    
    // 回退到原生解析
    const date = new Date(timeString);
    return isNaN(date.getTime()) ? null : date.getTime();
  } catch (error) {
    return null;
  }
}

// ==================== 导出所有函数 ====================

module.exports = {
  // 时间格式化
  formatTimestamp,
  getCurrentTimestamp,
  getCurrentTime,
  dateToTimestamp,
  
  // 时间计算
  getTimeDifference,
  addDays,
  addHours,
  addMinutes,
  addSeconds,
  
  // 时间验证
  isValidTimestamp,
  isValidTimeFormat,
  
  // 时区处理
  utcToLocal,
  localToUtc,
  getTimezoneOffset,
  
  // 特定用途函数
  getTodayStart,
  getTodayEnd,
  isToday,
  getHour,
  isInTimeRange,
  parseTimeString
};