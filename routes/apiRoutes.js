const express = require('express');
const apiController = require('../controllers/apiController');

const router = express.Router();

router.get('/price', apiController.getPrice);


router.get('/users', function(req, res) {
  res.send('Hello from Node.js API');
});



router.get('*', (req, res) => {
	// 处理 其他的api 请求
	res.send('Hello from Node.js API');
});

module.exports = router;