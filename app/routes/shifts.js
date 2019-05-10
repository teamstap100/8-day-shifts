var express = require('express');
var router = express.Router();

var ShiftHandler = require(process.cwd() + '/controllers/shiftHandler.server.js');

var shiftHandler = new ShiftHandler();

/* GET /shifts */
router.post('/api/shifts',
    shiftHandler.createShift);

module.exports = router;