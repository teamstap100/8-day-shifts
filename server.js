'use strict';

require('dotenv').config();

var jwt = require('jsonwebtoken');
var config = require('./config.js');

var express = require('express'),
    routes = require('./app/routes/index.js');

var bodyParser = require('body-parser');


var app = express();

app.set('view engine', 'hbs');
app.set('views', './views');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/api/validateToken', function (req, res) {
    var token = req.headers.authorization;
    if (token.startsWith('Bearer ')) {
        // Remove Bearer from string
        token = token.slice(7, token.length);
    }

    // Validating the token requires an undocumented set of steps. See this blog:
    // https://stevelathrop.net/securing-a-node-js-rest-api-with-azure-ad-jwt-bearer-tokens/

    // First, get the right x5t value from the decoded token
    var decoded = jwt.decode(token, { complete: true });
    var x5t = decoded.header.x5t;

    var publicKey = '-----BEGIN CERTIFICATE-----\n' + config.x5cStrings[x5t] + '\n-----END CERTIFICATE-----';

    jwt.verify(token, publicKey, function (err, verified) {
        var tokenResp = {};
        console.log(err);
        console.log(verified);
        res.json(verified);
    });
});

app.use('/public', express.static(__dirname + '/public'));
app.use('/', routes);

app.use('/controllers', express.static(__dirname + '/app/controllers'));

app.listen(process.env.PORT || 3000, function () {
    console.log('Listening on port 3000...');
});
