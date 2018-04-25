// npm install microreq qtimeit restify express qrpc
// wrk -d4s -t2 -c8 'http://localhost:1337/echo?a=1&b=2&c=3


var util = require('util');
var cluster = require('cluster');
var child_process = require('child_process');
var http = require('http');
var microreq = require('microreq');
var qtimeit = require('qtimeit');

var frameworks = {
    restify: { pkg: require('restify'), ver: require('restify/package').version, port: 1337 },
    express: { pkg: require('express'), ver: require('express/package').version, port: 1338 },
    rest_mw: { pkg: require('./'), ver: require('./package').version, port: 1342 },
    rest: { pkg: require('./'), ver: require('./package').version, port: 1339 },
    http_buf: { pkg: require('http'), ver: process.version, port: 1344 },
    http: { pkg: require('http'), ver: process.version, port: 1340 },
    http_raw: { pkg: require('http'), ver: process.version, port: 1343 },
    qrpc: { pkg: require('qrpc'), ver: require('qrpc/package').version, port: 1341 },
}

var path1 = '/test1';
var response1 = 'response body\n';

if (cluster.isMaster) {

    // master runs the servers, worker runs the benchmarks
    cluster.fork();

    var servers = {};
    var basePort = 1337;

    if (frameworks.restify) {
        // 13.8k/s 259us
        servers.restify = frameworks.restify.pkg.createServer();
        servers.restify.listen(frameworks.restify.port);
        servers.restify.get(path1, function(req, res, next) { res.send(200, response1); next(); })
    }

    if (frameworks.express) {
        // 20.3k/s 182us
        servers.express = frameworks.express.pkg();
        servers.express.listen(frameworks.express.port);
        servers.express.get(path1, function(req, res, next) { res.status(200).send(response1); next(); })
        // 12.3k/s 344us stddev 59.1us
        //servers.express.get(path1, function(req, res, next) { res.status(200).send(response1); })
        // 13.3k/s
        //servers.express.get(path1, function(req, res, next) { res.end(response1); })
        // 23.6k/s
    }

    if (frameworks.rest_mw) {
        // 44.5k/s 86.6us
        servers.rest_mw = frameworks.rest.pkg.createServer({ port: frameworks.rest_mw.port });
        servers.rest_mw._rest.router = new (require('./router'))();
        //servers.rest_mw._rest.addRoute('/test1', function(req, res, next) { servers.rest._rest.sendResponse(req, res, noop, null, 200, response1); });
        // 41k/s
        servers.rest_mw._rest.addRoute('/test1', function test1(req, res, next) { res.end(response1); });
        // 42.6k/s
        function noop(){}
    }

    if (frameworks.rest) {
        // 48.8k 77.2us
        servers.rest = frameworks.rest.pkg.createServer({ port: frameworks.rest.port });
        servers.rest._rest.processRequest = function(req, res) {
            if (req.url === path1 && req.method === 'GET') {
                //res.end(response1);
                // 31k/s
                servers.rest._rest.sendResponse(req, res, noop, null, 200, response1);
                // 32k/s, 128us stddev 24.1us
            }
            else {
                servers.rest._rest.sendResponse(req, res, noop, new servers.rest._rest.HttpError(404, 'path not routed'));
            }
            function noop(){}
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
                var body = '';
                req.setEncoding('utf8');
                req.on('data', function(chunk) { body += chunk });
                req.on('end', function() {
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
            req.resume();
            req.on('end', function() { res.end(response1) });
        })
    }

    if (frameworks.qrpc) {
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
    var agents = {};    // reuse all agents, else qrpc consumes all sockets
    var verifyResponse = false;
    var parallelCallCount = 100;

    setTimeout(setupTests, 100);

    function setupTests() {
        for (var name in frameworks) {
            agents[name] = (name === 'qrpc')
                ? frameworks.qrpc.pkg.connect(frameworks[name].port, 'localhost', confirmConnect)
                : new http.Agent({ keepAlive: true });
            parallelTests[name] = buildTestFunction(name, frameworks[name].port, parallelCallCount);
        }
        setTimeout(runSuite, 100);

        function confirmConnect(socket) {
            socket.setNoDelay();
            console.log("AR: qrpc client connected");
        }
    }

    function buildTestFunction(name, port, callCount) {
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
            : function(cb) { microreq(uri, '', cb) }

        function makeQrpcCb(cb) {
            return function(err, ret) { cb(err, {}, ret) }
        }

        return function(callback) {
            var ncalls = callCount, ndone = 0;
            for (var i=0; i<ncalls; i++) makeCall(onBack);
            function onBack(err, res, body) {
                if (verifyResponse && String(arguments[responseIndex]) != response1 && JSON.parse(arguments[responseIndex]) != response1) {
                    console.log("AR: wrong response:", err, String(arguments[responseIndex]));
                    throw new Error("wrong response")
                }
                if (++ndone === ncalls) {
                    process.nextTick(callback);
                }
            }
        }
    }

    function runSuite() {
        console.log("AR: runSuite");

        // NOTE: to disable, set -d to 0 sec
        var cmdline = 'wrk -d2s -t2 -c4 http://localhost:%d/test1';
        console.log("AR: restify:");
        child_process.exec(util.format(cmdline, frameworks.restify.port), function(err, stdout, stderr) {
            if (!err) console.log(stdout + '\n');
        console.log("AR: express:");
        child_process.exec(util.format(cmdline, frameworks.express.port), function(err, stdout, stderr) {
            if (!err) console.log(stdout + '\n');
        console.log("AR: rest_mw:");
        child_process.exec(util.format(cmdline, frameworks.rest_mw.port), function(err, stdout, stderr) {
            if (!err) console.log(stdout + '\n');
        console.log("AR: rest:");
        child_process.exec(util.format(cmdline, frameworks.rest.port), function(err, stdout, stderr) {
            if (!err) console.log(stdout + '\n');
        console.log("AR: http_buf:");
        child_process.exec(util.format(cmdline, frameworks.http_buf.port), function(err, stdout, stderr) {
            if (!err) console.log(stdout + '\n');
        console.log("AR: http:");
        child_process.exec(util.format(cmdline, frameworks.http.port), function(err, stdout, stderr) {
            if (!err) console.log(stdout + '\n');
        console.log("AR: http_raw:");
        child_process.exec(util.format(cmdline, frameworks.http_raw.port), function(err, stdout, stderr) {
            if (!err) console.log(stdout + '\n');

        qtimeit.bench.timeGoal = .2;
        qtimeit.bench.visualize = true;
        qtimeit.bench.showRunDetails = false;

        console.log("AR: bursts of %d calls", parallelCallCount);
        if (1)
        qtimeit.bench(parallelTests, function() {
        qtimeit.bench(parallelTests, function() {
        qtimeit.bench(parallelTests, function() {


            console.log("AR: Done.");
        }) }) }) }) }) }) }) }) }) })
    }
}
