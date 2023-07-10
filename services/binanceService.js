// 现货交易
const { spotsAxios } = require('../axiosInstance/axiosInstance')

// 发起请求获取K线数据
async function getKlines (symbol,limit) {
	const res = await spotsAxios({
    url: '/api/v3/klines',
    method: 'get',
    params: {
      symbol,
      interval:'12h',
      limit:limit || 21
    }
  }).catch(error => {
		global.errorLogger('请求失败:', error)
	})
	const klines = res.data;
  return klines
}
// 获取当前价格
async function getPrice() {
	const response = await spotsAxios.get(`/api/v3/ticker/price?symbol=BTCUSDT`)
	return response.data.price;
}

// 获取用户信息
async function getUserData() {
  let timestamp = new Date().getTime()
  const res = await spotsAxios({
    method: 'get',
    url:'/fapi/v1/income',
    params: {
      timestamp
    }
  }).catch(error => {
		global.errorLogger('请求失败:', error)
	})
  console.log(res.data)
  return res.data
}


module.exports = {
  getPrice,
  getKlines,
  getUserData
};