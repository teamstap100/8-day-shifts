var express = require('express');
var router = express.Router();

var ShiftHandler = require(process.cwd() + '/app/controllers/shiftHandler.server.js');

var shiftHandler = new ShiftHandler();

/* GET home page. */
router.get('/', function(req, res, next) {

  res.render('index');
});

/* GET auth callback. */
router.get('/auth/silent-start',
    function (req, res, next) {
        res.render('silent-start');
    }
);

router.get('/auth/silent-end',
    function (req, res, next) {
        res.render('silent-end');
    }
);

router.get('/auth/signout',
    function (req, res) {
        req.session.destroy(function (err) {
            req.logout();
            res.redirect('/');
        });
    }
);

/* GET config page. */
router.get('/config/', function (req, res, next) {

    res.render('config');
});

// Shift creation API
router.post('/api/shifts',
    shiftHandler.assignShifts);

module.exports = router;
