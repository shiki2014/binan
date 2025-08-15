/**
 * 重试监控工具
 * 监控和统计重试情况，帮助分析网络问题
 */

class RetryMonitor {
  constructor() {
    this.retryStats = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      errorTypes: {},
      recentRetries: []
    };
    
    this.maxRecentRetries = 100;
  }

  /**
   * 记录重试尝试
   * @param {Object} error - 错误对象
   * @param {number} retryCount - 重试次数
   * @param {number} delay - 延迟时间
   */
  recordRetryAttempt(error, retryCount, delay) {
    const errorType = this.getErrorType(error);
    const timestamp = new Date();
    
    this.retryStats.totalRetries++;
    
    // 统计错误类型
    if (!this.retryStats.errorTypes[errorType]) {
      this.retryStats.errorTypes[errorType] = 0;
    }
    this.retryStats.errorTypes[errorType]++;
    
    // 记录最近的重试
    const retryRecord = {
      timestamp,
      errorType,
      retryCount,
      delay,
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      code: error.code,
      message: error.message
    };
    
    this.retryStats.recentRetries.unshift(retryRecord);
    
    // 保持最近重试记录数量限制
    if (this.retryStats.recentRetries.length > this.maxRecentRetries) {
      this.retryStats.recentRetries = this.retryStats.recentRetries.slice(0, this.maxRecentRetries);
    }
  }

  /**
   * 记录重试成功
   * @param {Object} error - 原始错误
   * @param {number} finalRetryCount - 最终重试次数
   */
  recordRetrySuccess(error, finalRetryCount) {
    this.retryStats.successfulRetries++;
    
    if (global.logger) {
      global.logger.info(`重试成功: ${this.getErrorType(error)}, 总计重试${finalRetryCount}次`);
    }
  }

  /**
   * 记录重试最终失败
   * @param {Object} error - 错误对象
   * @param {number} finalRetryCount - 最终重试次数
   */
  recordRetryFailure(error, finalRetryCount) {
    this.retryStats.failedRetries++;
    
    if (global.logger) {
      global.logger.error(`重试失败: ${this.getErrorType(error)}, 总计重试${finalRetryCount}次`);
    }
  }

  /**
   * 获取错误类型
   * @param {Object} error - 错误对象
   * @returns {string} 错误类型
   */
  getErrorType(error) {
    if (this.isProxyError(error)) return '代理错误';
    if (this.isNetworkError(error)) return '网络错误';
    if (error.response?.status === 429) return '限流错误';
    if (error.response?.status >= 500) return '服务器错误';
    if (error.code === 'ECONNABORTED') return '超时错误';
    return '未知错误';
  }

  /**
   * 判断是否为网络错误
   */
  isNetworkError(error) {
    const networkErrorCodes = [
      'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 
      'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN'
    ];
    return networkErrorCodes.includes(error.code) || !error.response;
  }

  /**
   * 判断是否为代理错误
   */
  isProxyError(error) {
    const proxyErrorIndicators = [
      'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH',
      'socket hang up', 'getaddrinfo ENOTFOUND', 'socks'
    ];
    
    const errorMessage = error.message?.toLowerCase() || '';
    return proxyErrorIndicators.some(indicator => 
      error.code === indicator || errorMessage.includes(indicator)
    );
  }

  /**
   * 获取重试统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const successRate = this.retryStats.totalRetries > 0 
      ? (this.retryStats.successfulRetries / this.retryStats.totalRetries * 100).toFixed(2)
      : 0;

    return {
      ...this.retryStats,
      successRate: `${successRate}%`,
      mostCommonError: this.getMostCommonError(),
      recentRetriesCount: this.retryStats.recentRetries.length
    };
  }

  /**
   * 获取最常见的错误类型
   * @returns {string} 最常见的错误类型
   */
  getMostCommonError() {
    const errorTypes = this.retryStats.errorTypes;
    let maxCount = 0;
    let mostCommon = '无';
    
    for (const [errorType, count] of Object.entries(errorTypes)) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = errorType;
      }
    }
    
    return `${mostCommon} (${maxCount}次)`;
  }

  /**
   * 打印统计报告
   */
  printReport() {
    const stats = this.getStats();
    
    console.log('\n=== 重试监控报告 ===');
    console.log(`总重试次数: ${stats.totalRetries}`);
    console.log(`成功重试: ${stats.successfulRetries}`);
    console.log(`失败重试: ${stats.failedRetries}`);
    console.log(`成功率: ${stats.successRate}`);
    console.log(`最常见错误: ${stats.mostCommonError}`);
    
    console.log('\n错误类型分布:');
    for (const [errorType, count] of Object.entries(stats.errorTypes)) {
      const percentage = ((count / stats.totalRetries) * 100).toFixed(1);
      console.log(`  ${errorType}: ${count}次 (${percentage}%)`);
    }
    
    if (stats.recentRetries.length > 0) {
      console.log('\n最近5次重试:');
      stats.recentRetries.slice(0, 5).forEach((retry, index) => {
        console.log(`  ${index + 1}. ${retry.timestamp.toLocaleString()} - ${retry.errorType} - ${retry.url}`);
      });
    }
    
    console.log('==================\n');
  }

  /**
   * 获取代理健康状态
   * @returns {Object} 代理健康状态
   */
  getProxyHealth() {
    const recentProxyErrors = this.retryStats.recentRetries
      .filter(retry => retry.errorType === '代理错误')
      .slice(0, 10);
      
    const proxyErrorRate = recentProxyErrors.length / Math.min(this.retryStats.recentRetries.length, 10);
    
    let status = 'healthy';
    if (proxyErrorRate > 0.5) status = 'unhealthy';
    else if (proxyErrorRate > 0.2) status = 'degraded';
    
    return {
      status,
      errorRate: (proxyErrorRate * 100).toFixed(1) + '%',
      recentErrors: recentProxyErrors.length,
      recommendation: this.getProxyRecommendation(status)
    };
  }

  /**
   * 获取代理建议
   * @param {string} status - 代理状态
   * @returns {string} 建议
   */
  getProxyRecommendation(status) {
    switch (status) {
      case 'unhealthy':
        return '建议检查代理服务器状态或更换代理';
      case 'degraded':
        return '代理连接不稳定，建议监控';
      default:
        return '代理工作正常';
    }
  }

  /**
   * 重置统计信息
   */
  reset() {
    this.retryStats = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      errorTypes: {},
      recentRetries: []
    };
    
    console.log('重试统计已重置');
  }
}

// 创建全局实例
const retryMonitor = new RetryMonitor();

module.exports = {
  RetryMonitor,
  retryMonitor
};