// 为了向后兼容，保持原有导出，但现在从常量模块获取配置
const { API_CONFIG, TRADING_CONFIG, TIMEZONE_CONFIG } = require('../core/constants');

// 向后兼容的导出
const apiDomain = API_CONFIG.SPOT_DOMAINS.PRIMARY;
const apiDomain1 = API_CONFIG.SPOT_DOMAINS.BACKUP_1;
const apiDomain2 = API_CONFIG.SPOT_DOMAINS.BACKUP_2;
const apiDomain3 = API_CONFIG.SPOT_DOMAINS.BACKUP_3;
const apiDomain4 = API_CONFIG.SPOT_DOMAINS.BACKUP_4;
const apiDomainContract = API_CONFIG.CONTRACT_DOMAIN;
const apiSocks = API_CONFIG.SOCKS_PROXY;
const apiKey = API_CONFIG.API_KEY;
const apiSecret = API_CONFIG.API_SECRET;
const cycle = TRADING_CONFIG.KLINE_INTERVAL;
const timezoneOffset = TIMEZONE_CONFIG.DEFAULT_OFFSET;

// 向后兼容的函数
function getTimezoneOffset() {
  return TIMEZONE_CONFIG.getTimezoneOffset();
}

module.exports = {
  apiDomain,
  apiDomain1,
  apiDomain2,
  apiDomain3,
  apiDomain4,
  apiDomainContract,
  apiSocks,
  apiKey,
  cycle,
  timezoneOffset,
  apiSecret,
  getTimezoneOffset
};