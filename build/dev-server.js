require('./check-versions')()
var config = require('../config')
if (!process.env.NODE_ENV) process.env.NODE_ENV = JSON.parse(config.dev.env.NODE_ENV)
var path = require('path')
var express = require('express')
var webpack = require('webpack')
const secret = require('../config/secret.config')
var webpackConfig = process.env.NODE_ENV === 'testing'
  ? require('./webpack.prod.conf')
  : require('./webpack.dev.conf')
var expressWinston = require('express-winston');
var winston = require('winston'); // for transports.Console
var api = require('../api/api');
var log = require('../util/logger').getLogger()

var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

// Define HTTP proxies to your custom API backend
// https://github.com/chimurai/http-proxy-middleware
var proxyTable = config.dev.proxyTable

var autoIncrement = require("mongodb-autoincrement");
var mongoose = require('mongoose')
mongoose.Promise = global.Promise
mongoose.plugin(autoIncrement.mongoosePlugin);

if (secret.mongoConnectionString === 'mongo-in-memory') {
  log.info('Using dev mongo-in-memory')
  const MongoInMemory = require('mongo-in-memory');
  var mongoPort = 8000;
  var mongoServerInstance = new MongoInMemory(mongoPort); //DEFAULT PORT is 27017 
  mongoServerInstance.start((error, config) => {
    if (error) {
      log.error(error);
    } else {

      //callback when server has started successfully 

      log.info("HOST " + config.host);
      log.info("PORT " + config.port);

      var mongouri = mongoServerInstance.getMongouri("groupwrite-prod");
      mongoose.connect(mongouri).then(() => {
        // TODO: Make IDs start with 0
        // https://github.com/TheRoSS/mongodb-autoincrement/issues/9

        // You cannot set initial values for auto increment fields by the module. 
        // If you need it you can always set them directly via mongodb. 
        // Find a record with _id 'collectionName' in the collection 'counters' and set field 'seq' to required value.
        // console.log('Setting initial ID to 0')
        // mongoose.connection.db.collection('counters').save(
        //   {
        //     '_id': 'collectionName',
        //     'seq': 0
        //   }
        // )
      }).catch((err) => {
        log.error(err)
        process.exit()
      })
    }
  })
} else {
  log.info('Connecting to mongodb')
  mongoose.connect(secret.mongoConnectionString).then(() => {
    log.info('Successfully connected to mongodb')
    mongoose.connection.db.collection('startups').save({
      'date': Date.now()
    })
  }).catch((err) => {
    log.error(err)
    process.exit()
  })
}

var app = express()
var compiler = webpack(webpackConfig)

var devMiddleware = require('webpack-dev-middleware')(compiler, {
  publicPath: webpackConfig.output.publicPath,
  quiet: true
})

var hotMiddleware = require('webpack-hot-middleware')(compiler, {
  log: () => { }
})
// force page reload when html-webpack-plugin template changes
compiler.plugin('compilation', function (compilation) {
  compilation.plugin('html-webpack-plugin-after-emit', function (data, cb) {
    hotMiddleware.publish({ action: 'reload' })
    cb()
  })
})

// handle fallback for HTML5 history API
// app.use(require('connect-history-api-fallback')())

// serve webpack bundle output
app.use(devMiddleware)

// enable hot-reload and state-preserving
// compilation error display
app.use(hotMiddleware)

// Loggers
app.use(expressWinston.logger({
  transports: [
    new winston.transports.Console({
      json: false,
      colorize: true
    })
  ],
  meta: false, // optional: control whether you want to log the meta data about the request (default to true)
  msg: "HTTP {{req.method}} {{req.url}}", // optional: customize the default logging message. E.g. "{{res.statusCode}} {{req.method}} {{res.responseTime}}ms {{req.url}}"
  expressFormat: true, // Use the default Express/morgan request formatting. Enabling this will override any msg if true. Will only output colors with colorize set to true
  colorize: true, // Color the text and status code, using the Express/morgan color palette (text: gray, status: default green, 3XX cyan, 4XX yellow, 5XX red).
  ignoreRoute: function (req, res) {
    return false;
  } // optional: allows to skip some log messages based on request and/or response
}));
app.use(expressWinston.errorLogger({
  transports: [
    new winston.transports.Console({
      json: true,
      colorize: true
    })
  ]
}));

// serve pure static assets
var staticPath = path.posix.join(config.dev.assetsPublicPath, config.dev.assetsSubDirectory)
app.use(staticPath, express.static('./static'))

// default port where dev server listens for incoming traffic
var port = process.env.PORT || config.dev.port
app.set('port', port)
var uri = 'http://localhost:' + port
devMiddleware.waitUntilValid(function () {
  log.info('> Listening at ' + uri + '\n')
})

// Register handlebars templates
var exphbs = require('express-handlebars');
app.engine('handlebars', exphbs({
  //  defaultLayout: 'main'
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));
app.set("view options", {
  layout: true
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(cookieParser());

// Session
var session = require("express-session")({
  secret: secret.sessionSecret,
  resave: true,
  saveUninitialized: true,
  cookie: { maxAge: 365 * 24 * 3600 * 1000 }
});
app.session = session
app.use(session)
app.use(express.static(path.join(__dirname, 'public')));

// serve API endpoints
app.use('/api', api)

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err = new Error('Not Found: ' + req.path);
  err.status = 404;
  next(err);
});
// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  log.error(err.stack)
  res.status(err.status || 500);
  res.render('error');
});

if (secret.bugsnagId) {
  var bugsnag = require("bugsnag")
  bugsnag.register(secret.bugsnagId)
}

module.exports = app;