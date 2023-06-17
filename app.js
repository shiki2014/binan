const express = require('express');
const apiRoutes = require('./routes/apiRoutes');
const path = require('path');
const app = express();
const port = 3000;
const timing = require('./controllers/timingController');
const test =  require('./test/test');
// 配置中间件
// ...

// 设置路由
app.use('/api', apiRoutes);

// 将所有其他请求转发到 Vue
app.use(express.static('dist'));
app.get('*', (req, res) => {
	res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
});

// 启动应用程序
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});

// 定时应用程序
timing()

// // 测试用例

test()
