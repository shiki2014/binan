# 币安趋势跟踪量化交易系统

该项目是一个自动化交易系统，采用海龟交易法作为交易策略，通过连接币安API实现对加密货币的自动交易。本系统的交易周期为24小时，属于长期持有型策略。

## 简介

海龟交易法是一种基于趋势跟踪的交易策略，常用于股票和期货市场。在加密货币市场中同样适用，其核心思想是追随市场趋势进行交易，同时控制风险和资金管理。本系统通过使用海龟交易法来进行加密货币的交易，旨在获得稳定的收益率。

## 功能

该系统主要包括以下功能：

- 连接币安API，获取市场数据和进行交易
- 实现海龟交易法的交易策略
- 自动执行交易，无需人工干预
- 控制风险和资金管理，确保交易的稳定性和可行性
- 交易U本位合约，使用合约资金逐仓交易。
- 图形化系统控制台（参数开关、监控事件、风险快照）
- SQLite 数据库存储（系统配置、监控事件、账户快照）
- 交易参数数据库化（最小名义价值、止损缓冲、最大加仓比例）
- 操作审计日志（配置变更留痕）
- Webhook 告警通道（支持测试告警）
- 运行时主存储数据库化（交易对、指标、黑白名单、权益峰值）
- 迁移机制与定期数据清理任务
- PostgreSQL 连接能力（可通过 `DB_DIALECT=postgres` 切换）
- 安全控制（IP 白名单、API 限流、高风险操作确认、紧急停机、实盘确认）
  
## 使用

### 环境依赖

- Node.js 14及以上版本
- 相关Node.js库：axios、crypto、binance-futures-connector等

### 配置文件

在运行系统之前，请先配置相关参数，包括API密钥、交易品种、交易周期等。你可以在 `.env` 文件中进行配置。
请在根目录创建`.env` 文件
### 示例代码

```env
API_KEY="your-api-key-here"
API_SECRET="your-api-secret-here"
# 你的代理地址
API_SOCKS='socks://127.0.0.1:7890'
# 是否开启代理 1开启 0关闭
API_SOCKS_OPEN='0'
# 是否在本地环境，如果是本地调试则使用3000端口，其他使用80端口 development 为本地环境 其他为生产环境
NODE_ENV='development'
# 交易模式：paper(默认，模拟) / live(实盘)
TRADING_MODE='paper'
# 远程访问 API 的鉴权令牌（可选）
API_TOKEN='change-this-token'
# 当未配置 API_TOKEN 时，是否允许仅本机访问 API，默认 1
ALLOW_LOCAL_API_WITHOUT_TOKEN='1'
# API IP 白名单，多个 IP 用逗号分隔；为空表示不限制
API_IP_WHITELIST=''
# API 限流，默认开启
API_RATE_LIMIT_ENABLED='1'
API_RATE_LIMIT_MAX_REQUESTS='300'
API_RATE_LIMIT_WINDOW_SECONDS='60'
# 高风险操作确认，可选
REQUIRE_HIGH_RISK_ACK='0'
HIGH_RISK_ACTION_TOKEN=''
# 是否启用系统时间自动同步（默认 0，不修改系统时间）
ENABLE_SYSTEM_TIME_SYNC='0'
# 数据库方言：sqlite / postgres
DB_DIALECT='sqlite'
# PostgreSQL 连接，DB_DIALECT=postgres 时使用
DATABASE_URL=''
PGHOST='127.0.0.1'
PGPORT='5432'
PGUSER='postgres'
PGPASSWORD=''
PGDATABASE='trade_assistant'
PGSSL='0'
PGSSL_INSECURE='0'
# 最小下单名义价值兜底（USDT），默认 5
MIN_ORDER_NOTIONAL='5'
# 止损触发价与当前价的最小缓冲比例，默认 0.001（0.1%）
STOP_TRIGGER_BUFFER='0.001'
# 单笔 / 日内 / 最大持仓名义价值上限
SINGLE_ORDER_NOTIONAL_LIMIT='200'
DAILY_ORDER_NOTIONAL_LIMIT='2000'
MAX_POSITION_NOTIONAL_LIMIT='1000'
# 实盘前必须显式确认
LIVE_TRADING_CONFIRMED='0'
# 双写对账任务间隔（秒），默认 300
RECONCILIATION_INTERVAL_SECONDS='300'
# 数据清理任务间隔（秒），默认 21600（6小时）
DATA_RETENTION_INTERVAL_SECONDS='21600'
# 下单幂等窗口（分钟），同窗口内相同订单参数只允许一次，默认 30
ORDER_IDEMPOTENCY_WINDOW_MINUTES='30'
```

### 安装

要运行这个项目，你需要先安装所需的npm软件包。请按照以下步骤进行安装：

1. 确保你已经安装了Node.js和npm。你可以从官方网站下载并安装：[https://nodejs.org](https://nodejs.org)

2. 打开终端或命令提示符，并导航到项目的根目录。

3. 运行以下命令来安装所有依赖项：
```shell
  npm install
```

安装完成后，程序会自动在 `data/trade_assistant.db` 创建数据库文件和表结构。
如果切换到 PostgreSQL，则会自动初始化对应表结构、运行迁移，并从历史 JSON 导入运行时数据。

### 运行
运行 `app.js` 文件即可启动程序，本系统会自动连接币安API并执行交易。你也可以将系统部署在服务器上，实现24小时不间断的交易。
```shell
  node app.js
```

## 风险提示

加密货币市场具有高度风险性，请在投资前审慎考虑个人风险承受能力和投资经验。本系统仅提供一种自动化交易策略，并不能保证投资收益或避免损失，所有投资操作均由投资者自行决定并承担相应风险。

## 当前架构

- 前端：`binan-view` 图形化控制台
- 后端：`Node.js + Express`
- 主存储：
  - `SQLite`（默认）
  - `PostgreSQL`（可切换）
- 数据库存储内容：
  - 系统配置、交易参数
  - 审批流、审计日志
  - 监控事件、风险事件、账户快照、持仓快照
  - 订单流水、运行时交易对、指标、黑白名单、运行状态
  - 应用日志、错误日志
- 外部实时源：
  - Binance 当前持仓、当前委托、K 线
