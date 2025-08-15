/**
 * 系统核心常量配置
 * 集中管理所有系统级别的配置常量
 */

require('dotenv').config();

// ==================== API 配置 ====================
const API_CONFIG = {
  // Binance 现货 API 域名
  SPOT_DOMAINS: {
    PRIMARY: 'https://api.binance.com',
    BACKUP_1: 'https://api1.binance.com',
    BACKUP_2: 'https://api2.binance.com',
    BACKUP_3: 'https://api3.binance.com',
    BACKUP_4: 'https://api4.binance.com'
  },

  // Binance 合约 API 域名
  CONTRACT_DOMAIN: 'https://fapi.binance.com',

  // API 认证
  API_KEY: process.env.API_KEY || '',
  API_SECRET: process.env.API_SECRET || '',

  // 代理配置
  SOCKS_PROXY: process.env.API_SOCKS || 'socks5://127.0.0.1:7890',

  // 请求头配置
  USER_AGENT: 'Mozilla/5.0 (compatible; BinanceAPI/1.0)',

  // 超时配置 (毫秒)
  TIMEOUT: {
    DEFAULT: 10000,
    LONG: 30000,
    SHORT: 5000
  },

  // 重试配置
  RETRY: {
    MAX_ATTEMPTS: 5,              // 最大重试次数
    INITIAL_DELAY: 1000,          // 初始延迟(毫秒)
    BACKOFF_FACTOR: 1.5,          // 退避因子
    MAX_DELAY: 10000,             // 最大延迟
    PROXY_RETRY_ATTEMPTS: 3,      // 代理失败重试次数
    PROXY_RETRY_DELAY: 2000       // 代理重试延迟
  }
};

// ==================== 应用配置 ====================
const APP_CONFIG = {
  // 服务器端口
  PORT: {
    DEVELOPMENT: 3000,
    PRODUCTION: 80
  },

  // 环境配置
  NODE_ENV: process.env.NODE_ENV || 'development',

  // 日志配置
  LOG_CONFIG: {
    appenders: {
      console: { type: 'console' },
      appFile: { type: 'file', filename: 'logs/app.log' },
      errorFile: { type: 'file', filename: 'logs/error.log' }
    },
    categories: {
      error: { appenders: ['errorFile', 'console'], level: 'error' },
      default: { appenders: ['console', 'appFile'], level: 'debug' }
    }
  }
};

// ==================== 交易配置 ====================
const TRADING_CONFIG = {
  // K线周期
  KLINE_INTERVAL: '1d',

  // ATR 相关
  ATR: {
    DEFAULT_PERIOD: 14,
    MIN_PERIOD: 5,
    MAX_PERIOD: 50
  },

  // 精度配置
  PRECISION: {
    DEFAULT_PRICE_TICK_SIZE: '0.0001',
    DEFAULT_QUANTITY_STEP_SIZE: '0.001',
    MAX_DECIMAL_PLACES: 8
  },

  // 仓位管理
  POSITION: {
    MIN_POSITION_VALUE: 10, // USDT
    MAX_LEVERAGE: 20,
    DEFAULT_LEVERAGE: 1
  },

  // 订单配置
  ORDER: {
    MAX_ORDERS_PER_SYMBOL: 10,
    MIN_ORDER_SIZE: 0.001, // BTC
    ORDER_TYPES: {
      MARKET: 'MARKET',
      LIMIT: 'LIMIT',
      STOP_MARKET: 'STOP_MARKET',
      STOP_LIMIT: 'STOP_LIMIT',
      TAKE_PROFIT_MARKET: 'TAKE_PROFIT_MARKET'
    },
    TIME_IN_FORCE: {
      GTC: 'GTC', // Good Till Cancel
      IOC: 'IOC', // Immediate Or Cancel
      FOK: 'FOK'  // Fill Or Kill
    }
  }
};

// ==================== 监控配置 ====================
const MONITOR_CONFIG = {
  // 仓位监控
  POSITION_MONITOR: {
    CHECK_INTERVAL: '0/30 * * * * *', // 30秒检查一次
    ENABLE_HIGH_LOW_TRACKING: true,   // 启用新高新低跟踪
    ENABLE_ORIGINAL_STOP_LOGIC: true, // 启用原有止盈逻辑
    ATR_MULTIPLIER: 2,               // ATR倍数
    MAX_DRAWDOWN_PERCENT: 10         // 最大回撤百分比
  },

  // 价格监控
  PRICE_MONITOR: {
    UPDATE_INTERVAL: 5000,           // 5秒更新一次价格
    ALERT_THRESHOLD: 0.05,           // 5%价格变动告警
    HISTORY_LENGTH: 100              // 保留历史价格数量
  },

  // 风险监控
  RISK_MONITOR: {
    CHECK_INTERVAL: '0 */5 * * * *', // 5分钟检查一次
    MAX_DAILY_LOSS: 1000,            // 最大日亏损 USDT
    MAX_POSITION_RATIO: 0.8,         // 最大仓位占比
    FORCE_CLOSE_THRESHOLD: 0.9       // 强制平仓阈值
  },

  // 性能监控
  PERFORMANCE_MONITOR: {
    CHECK_INTERVAL: '0 0 * * * *',   // 每小时检查一次
    MEMORY_THRESHOLD: 1000,          // MB
    CPU_THRESHOLD: 80                // 百分比
  }
};

// ==================== 策略配置 ====================
const STRATEGY_CONFIG = {
  // ATR 止损策略
  ATR_STOP_LOSS: {
    MULTIPLIER: 2.0,
    MIN_MULTIPLIER: 1.0,
    MAX_MULTIPLIER: 5.0,
    ADJUSTMENT_STEP: 0.1
  },

  // 跟踪止损策略
  TRAILING_STOP: {
    INITIAL_DISTANCE: 0.02,    // 2%
    MIN_DISTANCE: 0.005,       // 0.5%
    MAX_DISTANCE: 0.1,         // 10%
    STEP_SIZE: 0.001          // 0.1%
  },

  // 新高新低策略
  HIGH_LOW_STRATEGY: {
    LOOKBACK_PERIOD: 20,       // 回看周期
    BREAK_THRESHOLD: 0.001,    // 突破阈值
    CONFIRMATION_CANDLES: 2    // 确认K线数量
  },

  // 仓位管理策略
  POSITION_SIZING: {
    RISK_PER_TRADE: 0.02,      // 每笔交易风险 2%
    MAX_RISK_PER_DAY: 0.05,    // 每日最大风险 5%
    KELLY_MULTIPLIER: 0.25     // 凯利公式倍数
  }
};

// ==================== 数据配置 ====================
const DATA_CONFIG = {
  // 文件路径
  FILE_PATHS: {
    ATR_DATA: './data/ATR.json',
    EQUITY_DATA: './data/equity.json',
    POSITION_DATA: './data/data.json',
    VOLATILITY_DATA: './data/volatility.json',
    TREND_OSCILLATION_DATA: './data/trendOscillation.json',
    BLACK_LIST: './data/blackList.json',
    WHITE_LIST: './data/whiteList.json'
  },

  // 缓存配置
  CACHE: {
    EXCHANGE_INFO_TTL: 3600000,    // 1小时
    PRICE_DATA_TTL: 60000,         // 1分钟
    ACCOUNT_DATA_TTL: 30000,       // 30秒
    MAX_CACHE_SIZE: 1000           // 最大缓存项数
  },

  // 数据更新频率
  UPDATE_FREQUENCY: {
    ATR_UPDATE: '0 0 */4 * * *',         // 4小时更新ATR
    VOLATILITY_UPDATE: '0 */30 * * * *',  // 30分钟更新波动率
    EQUITY_UPDATE: '0 */5 * * * *',       // 5分钟更新权益
    EXCHANGE_INFO_UPDATE: '0 0 */6 * * *' // 6小时更新交易对信息
  }
};

// ==================== 系统限制 ====================
const SYSTEM_LIMITS = {
  // API 限制
  API_LIMITS: {
    REQUESTS_PER_MINUTE: 1200,
    REQUESTS_PER_SECOND: 20,
    ORDER_RATE_LIMIT: 100,        // 每10秒
    WEIGHT_LIMIT: 1200,           // 每分钟权重限制
    KLINE_REQUEST_INTERVAL: 1   // K线请求间隔(毫秒)
  },

  // 内存限制
  MEMORY_LIMITS: {
    MAX_KLINE_HISTORY: 1000,      // 最大K线历史数量
    MAX_TRADE_HISTORY: 500,       // 最大交易历史数量
    MAX_LOG_ENTRIES: 10000        // 最大日志条目数
  },

  // 时间限制
  TIME_LIMITS: {
    MAX_EXECUTION_TIME: 30000,    // 最大执行时间 30秒
    CONNECTION_TIMEOUT: 10000,    // 连接超时 10秒
    HEARTBEAT_INTERVAL: 30000     // 心跳间隔 30秒
  }
};

// ==================== 错误代码 ====================
const ERROR_CODES = {
  // API 错误
  API_ERROR: {
    INVALID_SIGNATURE: -1022,
    TIMESTAMP_ERROR: -1021,
    RATE_LIMIT: -1003,
    IP_BANNED: -1002,
    UNKNOWN_ORDER: -2013,
    INSUFFICIENT_BALANCE: -2019
  },

  // 系统错误
  SYSTEM_ERROR: {
    NETWORK_ERROR: 'NETWORK_ERROR',
    DATA_ERROR: 'DATA_ERROR',
    CALCULATION_ERROR: 'CALCULATION_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR'
  }
};

// ==================== 消息模板 ====================
const MESSAGE_TEMPLATES = {
  // 日志消息
  LOG_MESSAGES: {
    SYSTEM_START: '系统启动成功',
    SYSTEM_STOP: '系统停止运行',
    POSITION_OPENED: '{symbol} 开仓成功: {side} {quantity} @ {price}',
    POSITION_CLOSED: '{symbol} 平仓成功: {side} {quantity} @ {price}',
    STOP_LOSS_TRIGGERED: '{symbol} 止损触发: {price}',
    ERROR_OCCURRED: '系统错误: {error}'
  },

  // 告警消息
  ALERT_MESSAGES: {
    HIGH_RISK: '高风险告警: 当前风险水平 {risk}%',
    POSITION_SIZE_WARNING: '仓位过大告警: {symbol} 仓位占比 {ratio}%',
    DRAWDOWN_WARNING: '回撤告警: 当前回撤 {drawdown}%',
    API_ERROR: 'API异常告警: {error}'
  }
};

// ==================== 时区配置 ====================
const TIMEZONE_CONFIG = {
  // 获取时区偏移
  getTimezoneOffset() {
    const date = new Date();
    return date.getTimezoneOffset();
  },

  // 默认时区偏移
  DEFAULT_OFFSET: new Date().getTimezoneOffset(),

  // 时间格式
  DATE_FORMATS: {
    DEFAULT: 'YYYY-MM-DD HH:mm:ss',
    SHORT: 'MM-DD HH:mm',
    LONG: 'YYYY-MM-DD HH:mm:ss.SSS'
  }
};

module.exports = {
  API_CONFIG,
  APP_CONFIG,
  TRADING_CONFIG,
  MONITOR_CONFIG,
  STRATEGY_CONFIG,
  DATA_CONFIG,
  SYSTEM_LIMITS,
  ERROR_CODES,
  MESSAGE_TEMPLATES,
  TIMEZONE_CONFIG
};