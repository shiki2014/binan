const express = require('express');
const apiController = require('../controllers/apiController');
const systemController = require('../controllers/systemController');

const router = express.Router();

router.get('/price', apiController.getPrice);
router.get('/appLog', apiController.getAppLog);
router.get('/errorLog', apiController.getErrorLog);
router.get('/users',  apiController.getUsers);
router.get('/positions',  apiController.getPositions);
router.get('/orders/open',  apiController.getOpenOrderList);
router.get('/klines/:symbol', apiController.getSymbolKlines);
router.get('/system/overview', systemController.getSystemOverview);
router.get('/system/settings', systemController.getSystemSettings);
router.post('/system/settings', systemController.updateSystemSettings);
router.get('/system/trading-params', systemController.getTradingSettings);
router.post('/system/trading-params', systemController.updateTradingSettings);
router.get('/system/events', systemController.getSystemEvents);
router.get('/system/snapshots', systemController.getSystemSnapshots);
router.get('/system/audits', systemController.getSystemAudits);
router.post('/system/alerts/test', systemController.sendTestAlert);
router.post('/system/reconciliation/run', systemController.runSystemReconciliation);
router.post('/system/maintenance/run', systemController.runSystemMaintenance);
router.get('/system/change-requests', systemController.getSystemChangeRequests);
router.post('/system/change-requests', systemController.createSystemChangeRequest);
router.post('/system/change-requests/:id/approve', systemController.approveSystemChangeRequest);
router.post('/system/change-requests/:id/reject', systemController.rejectSystemChangeRequest);

router.get('*', (req, res) => {
  // 处理 其他的api 请求
  res.send('Hello from Node.js API');
});

module.exports = router;
