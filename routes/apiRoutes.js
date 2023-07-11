const express = require('express');
const apiController = require('../controllers/apiController');

const router = express.Router();

router.get('/price', apiController.getPrice);
router.get('/appLog', apiController.getAppLog);
router.get('/errorLog', apiController.getErrorLog);
router.get('/users',  apiController.getUsers);
router.get('/positions',  apiController.getPositions);

router.get('*', (req, res) => {
  // 处理 其他的api 请求
  res.send('Hello from Node.js API');
});

module.exports = router;