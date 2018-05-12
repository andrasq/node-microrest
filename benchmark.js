// npm install microreq qtimeit restify express qrpc connect restiq
// wrk -d4s -t2 -c8 'http://localhost:1337/echo?a=1&b=2&c=3


var util = require('util');
var cluster = require('cluster');
var child_process = require('child_process');
var http = require('http');
var microreq = require('microreq');
var qtimeit = require('qtimeit');

var mw = require('./mw');
var rest = require('./rest');

var basePort = 1337;
var frameworks = {
    restify: { pkg: require('restify'), ver: require('restify/package').version, port: 1337 },
    express: { pkg: require('express'), ver: require('express/package').version, port: 1338 },
    restiq:  { pkg: require('restiq'), ver: require('restiq/package').version, port: 1345 },
    connect: { pkg: require('connect'), ver: require('connect/package').version, port: 1346 },
    rest_mw: { pkg: require('./'), ver: require('./package').version, port: 1342 },
    rest_ha: { pkg: require('./'), ver: require('./package').version, port: 1347 },
    rest:    { pkg: require('./'), ver: require('./package').version, port: 1339 },
    http_buf: { pkg: require('http'), ver: process.version, port: 1344 },
    http:     { pkg: require('http'), ver: process.version, port: 1340 },
    http_raw: { pkg: require('http'), ver: process.version, port: 1343 },
    qrpc:    { pkg: require('qrpc'), ver: require('qrpc/package').version, port: 1341 },
}

var path1 = '/test1';
var request1 = new Array(21).join('x');
var response1 = new Array(201).join('y');

if (cluster.isMaster) {

    // master runs the servers, worker runs the benchmarks
    cluster.fork();

    var servers = {};

    function readBody( req, res, next ) {
        if (res.body !== undefined) return next();

        req.encoding = 'utf8';
        var body = '';
        req.on('data', function(chunk) {
            body += chunk
        })
        req.on('end', function() {
            req.body = body;
            next();
        })
    }

    if (frameworks.restify) {
        // 13.8k/s 259us
        servers.restify = frameworks.restify.pkg.createServer();
        servers.restify.listen(frameworks.restify.port);
        servers.restify.use(readBody);
        servers.restify.get(path1, function(req, res, next) { res.send(200, response1); next(); })      // no res.send in restify 5.x and up
        //servers.restify.get(path1, function(req, res, next) { res.end(response1); next(); })
    }

    if (frameworks.express) {
        // 20.3k/s 182us
        servers.express = frameworks.express.pkg();
        servers.express.listen(frameworks.express.port);
        servers.express.use(readBody);
        servers.express.get(path1, function(req, res, next) { res.status(200).send(response1); next(); })
        // 12.3k/s 344us stddev 59.1us
        //servers.express.get(path1, function(req, res, next) { res.status(200).send(response1); })
        // 13.3k/s
        //servers.express.get(path1, function(req, res, next) { res.end(response1); })
        // 23.6k/s
    }

    if (frameworks.restiq) {
        // 13.8k/s 259us
        servers.restiq = frameworks.restiq.pkg.createServer({ restify: true });
        servers.restiq.listen(frameworks.restiq.port);
        servers.express.use(readBody);
        servers.restiq.get(path1, function(req, res, next) { res.send(200, response1); next(); })
    }

    if (frameworks.connect) {
        // 44.5k/s 85us
        servers.connect = frameworks.connect.pkg();
        servers.express.use(readBody);
        servers.connect.use(path1, function(req, res, next) { res.end(response1); next(); })
        http.createServer(servers.connect).listen(frameworks.connect.port);
    }

    if (frameworks.rest_mw) {
        // 44.1k/s 85.1us
        servers.rest_mw = frameworks.rest_mw.pkg.createServer({ port: frameworks.rest_mw.port, /*router: new rest.NanoRouter()*/ });
        servers.rest_mw._rest.router = new (require('./router'))();
        //servers.rest_mw._rest.setRoute('/test1', function(req, res, next) { mw.sendResponse(req, res, noop, null, 200, response1); });
        // 43.3k/s
        servers.rest_mw._rest.setRoute('/test1', function test1(req, res, next) { res.end(response1); });
        // 44.1k/s
        function noop(){}
    }

    if (frameworks.rest_ha) {
        // 49.3k/s, 76.8us
        // 46.6k/s routed, 82.7us
        // 46.5k/s using NanoRouter (45.3k/s w sendResponse)
        //servers.rest_ha = frameworks.rest_ha.pkg({ processRequest: processRequest });                                         // 46.6k/s
        servers.rest_ha = frameworks.rest_ha.pkg({ router: new rest.NanoRouter() });
        servers.rest_ha.use(path1, function(req, res, next) { res.end(response1); next() });                                    // 46.5k/s
        //servers.rest_ha.use(path1, function(req, res, next) { mw.sendResponse(req, res, noop, null, 200, response1); });      // 46.2k/s
        http.createServer(servers.rest_ha).listen(frameworks.rest_ha.port);
        function noop(){}
        function processRequest(req, res) {
            if (req.url === path1 && req.method === 'GET') {
                //return mw.sendResponse(req, res, noop, null, 200, response1);
                mw.writeResponse(res, 200, response1, null);    // same speed as sendResponse
            }
            mw.sendResponse(req, res, noop, new servers.rest_ha._rest.HttpError(404, req.method + ' ' + req.url + ': path not routed'));
        }
    }

    if (frameworks.rest) {
        // 50.0k 77.1us
        servers.rest = frameworks.rest.pkg.createServer({ port: frameworks.rest.port });
        function noop(){}
        servers.rest._rest.processRequest = function(req, res) {
            if (req.url === path1 && req.method === 'GET') {
                //res.end(response1);
                return mw.sendResponse(req, res, noop, null, 200, response1);
            }
            mw.sendResponse(req, res, noop, new servers.rest._rest.HttpError(404, req.method + ' ' + req.url + ': path not routed'));
        }
    }

    if (frameworks.http_buf) {
        // 51.6k/s 74.3us
        servers.http = frameworks.http.pkg.createServer();
        servers.http.listen(frameworks.http_buf.port);
        servers.http.on('request', function(req, res) {
            if (req.url === path1 && req.method === 'GET') {
                var chunks = new Array();
                req.on('data', function(chunk) { chunks.push(chunk) });
                req.on('end', function() {
                    var body = Buffer.concat(chunks);
                    res.end(response1);
                })
            }
            else { res.writeHead(404); res.end(); }
        })
    }

    if (frameworks.http) {
        // 52.2k/s 73.8us
        servers.http = frameworks.http.pkg.createServer();
        servers.http.listen(frameworks.http.port);
        servers.http.on('request', function(req, res) {
            if (req.url === path1 && req.method === 'GET') {
                readBody(req, res, function(err) {
                    res.end(response1);
                })
            }
            else { res.writeHead(404); res.end(); }
        })
    }

    if (frameworks.http_raw) {
        // 54.5k 70.3us
        servers.http = frameworks.http.pkg.createServer();
        servers.http.listen(frameworks.http_raw.port);
        servers.http.on('request', function(req, res) {
            // speed of light test: discard request body, send response
            req.resume();
            req.on('end', function() { res.end(response1) });
        })
    }

    if (frameworks.qrpc) {
        // 145k/s, <33us
        servers.qrpc = frameworks.qrpc.pkg.createServer(function(socket) {
            socket.setNoDelay();
        });
        servers.qrpc.listen(frameworks.qrpc.port, function(err, ret) {
            console.log("AR: qrpc server listening on", frameworks.qrpc.port);
        });
        servers.qrpc.addHandler(path1, function(req, res, next) { next(null, response1) });
    }
}
// end isMaster, else isWorker
else {
    console.log("AR: testing frameworks:");
    for (var name in frameworks) console.log("%s\t%s\t%d", name, frameworks[name].ver, frameworks[name].port);
    console.log("");

    var parallelTests = {};
    var serialTests = {};
    var agents = {};    // reuse all agents, else qrpc consumes all sockets
    var verifyResponse = true;
    var parallelCallCount = 100;

    setTimeout(setupTests, 200);

    function setupTests() {
        for (var name in frameworks) {
            agents[name] = (name === 'qrpc')
                ? frameworks.qrpc.pkg.connect(frameworks[name].port, 'localhost', confirmConnect)
                : new http.Agent({ keepAlive: true });
            parallelTests[name] = buildTestFunction(name, frameworks[name].port, parallelCallCount);
            serialTests[name] = buildTestFunction(name, frameworks[name].port, 1);
        }
        setTimeout(runSuite, 100);

        function confirmConnect(socket) {
            socket.setNoDelay();
            console.log("AR: qrpc client connected");
        }
    }

    function buildTestFunction( name, port, callCount ) {
        var uri = {
            agent: agents[name],
            //keepAlive: true,
            host: 'localhost',
            port: port,
            method: 'GET',
            path: path1,
        };

        var responseIndex = name === 'qrpc' ? 1 : 2;
        var makeCall = name === 'qrpc'
            ? function(cb) { uri.agent.call(uri.path, null, cb) }
            : function(cb) { microreq(uri, request1, cb) }

        function makeQrpcCb(cb) {
            return function(err, ret) { cb(err, {}, ret) }
        }

        if (name === 'qrpc' && callCount === 1) return function(callback ) {
            agents.qrpc.call(path1, request1, function(err, ret) {
                doVerifyResponse(err, ret);
                callback();
            })
        }

        return function(callback) {
            var ncalls = callCount, ndone = 0;
            for (var i=0; i<ncalls; i++) makeCall(onBack);
            function onBack(err, res, body) {
                doVerifyResponse(err, arguments[responseIndex]);
                if (++ndone === ncalls) {
                    process.nextTick(callback);
                }
            }
        }

        function doVerifyResponse(err, rawBody) {
            if (err) { console.log("AR: call err", err); process.exit(); }
            if (verifyResponse && String(rawBody) != response1 && JSON.parse(rawBody) != response1) {
                console.log("AR: wrong response:", String(rawBody), response1);
                throw new Error("wrong response")
            }
        }
    }

    function runSuite() {
        console.log("AR: runSuite: req = %sB, res = %sB", request1.length, response1.length);

        var cmdline = 'wrk -d2s -t2 -c8 http://localhost:%d/test1';

        if (0) {
            console.log("");
            for (var name in frameworks) {
                var cmd = util.format(cmdline, frameworks[name].port);
                console.log("# %s %s", name, cmd);
                if (name !== 'qrpc') console.log(String(child_process.execSync(cmd)));
            }
        }
        setTimeout(function() {

            qtimeit.bench.timeGoal = .4;
            qtimeit.bench.visualize = true;
            qtimeit.bench.showRunDetails = false;
            qtimeit.bench.opsPerTest = 100;     // 100 http calls per test

            console.log("\nAR: bursts of %d parallel calls\n", parallelCallCount);
            if (1)
            qtimeit.bench(parallelTests, function() {
            qtimeit.bench(parallelTests, function() {
            qtimeit.bench(parallelTests, function() {

            console.log("\nAR: sequential calls:\n");
            qtimeit.bench.opsPerTest = 1;       // 1 http call in per test
            qtimeit.bench(serialTests, function() {

            console.log("AR: Done.");
            })

            }) }) })
        }, 200);
    }
}
