// npm install microrest express restify qrpc qtimeit
// wrk -d4s -t2 -c8 'http://localhost:1337/echo?a=1&b=2&c=3


var cluster = require('cluster');
var http = require('http');
var microreq = require('microreq');
var qtimeit = require('qtimeit');

var frameworks = {
    restify: { pkg: require('restify'), ver: require('restify/package').version, port: 1337 },
    express: { pkg: require('express'), ver: require('express/package').version, port: 1338 },
    rest: { pkg: require('./'), ver: require('./package').version, port: 1339 },
    http: { pkg: require('http'), ver: process.version, port: 1340 },
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
        // 1337: 8.2k/s, 508us stddev 97.6us
        servers.restify = frameworks.restify.pkg.createServer();
        servers.restify.listen(frameworks.restify.port);
        servers.restify.get(path1, function(req, res, next) { res.send(200, response1); next(); })
    }

    if (frameworks.express) {
        // 1338: 12.3k/s, 315us stddev 57.7us
        servers.express = frameworks.express.pkg();
        servers.express.listen(frameworks.express.port);
        servers.express.get(path1, function(req, res, next) { res.status(200).send(response1); next(); })
        // 12.3k/s 344us stddev 59.1us
        //servers.express.get(path1, function(req, res, next) { res.status(200).send(response1); })
        // 13.3k/s
        //servers.express.get(path1, function(req, res, next) { res.end(response1); })
        // 23.6k/s
    }

    if (frameworks.rest) {
        // 1339: 31k/s, 131us stddev 19.9us
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

    if (frameworks.http) {
        // 1340: 35.1k/s, 117us stddev 16.2us not reading req body
        // 1340: 29.6k/s, 139us stddev 23.5us yes reading req body
        servers.http = frameworks.http.pkg.createServer();
        servers.http.listen(frameworks.http.port);
        servers.http.on('request', function(req, res) {
            if (req.url === path1 && req.method === 'GET') {
                req.setEncoding('utf8');
                var body = '';
                req.on('data', function(chunk) { body += chunk });
                req.on('end', function() {
                    res.end(response1);
                })
            }
            else { res.writeHead(404); res.end(); }
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
                    callback();
                }
            }
        }
    }

    function runSuite() {
console.log("AR: runSuite");
        qtimeit.bench.timeGoal = .2;
        qtimeit.bench.visualize = true;
        //qtimeit.bench.showRunDetails = false;

        console.log("AR: bursts of %d calls", parallelCallCount);
        if (1)
        qtimeit.bench(parallelTests, function() {
        qtimeit.bench(parallelTests, function() {
        qtimeit.bench(parallelTests, function() {


            console.log("AR: Done.");
        }) }) })
    }
}
