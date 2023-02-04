// npm install microreq qtimeit qibl restify@4 express qrpc connect restiq fastify
// wrk -d4s -t2 -c8 'http://localhost:1337/echo?a=1&b=2&c=3


var util = require('util');
var cluster = require('cluster');
var child_process = require('child_process');
var http = require('http');
var microreq = require('microreq');
var qtimeit = require('qtimeit');
var qibl = require('qibl');

var rest = require('./rest');
var mw = require('./mw');
var Router = require('./router');

// TODO: hapi loopback[2,4] nestjs

var basePort = 1337;
var frameworks = {
    // running restify alongside the others cuts 10-15% off their results
    //restify: { pkg: require('restify'), ver: require('restify/package').version, port: 1337 },
// NOTE: node-v10 crashes with ECONNRESET on 2nd-3rd 100-parallel test run all others are enabled along with express
// Omitting connect or rest_mw or restiq+rest_mw fixes. Omitting the wrk tests fixes.  Adding a 500ms pause between runs fixes.
// (also restiq scores much higher if is first to run, 85k vs 78k/s)
    express: { pkg: require('express'), ver: require('express/package').version, port: 1338 },

    // run qrpc early, because qrpc, restiq and microrest are the packages of interest
    qrpc:    { pkg: require('qrpc'), ver: require('qrpc/package').version, port: 1341 },

    restiq:  { pkg: require('restiq'), ver: require('restiq/package').version, port: 1345 },
// NOTE: rest_mw does not respond (0 calls / sec) without restiq run beforehand
    rest_mw: { pkg: require('./'), ver: require('./package').version, port: 1342 },
    rest_ha: { pkg: require('./'), ver: require('./package').version, port: 1347 },
    rest:    { pkg: require('./'), ver: require('./package').version, port: 1339 },

    //http_buf: { pkg: require('http'), ver: process.version, port: 1344 },
    http:     { pkg: require('http'), ver: process.version, port: 1340 },
    //http_raw: { pkg: require('http'), ver: process.version, port: 1343 },
    fastify: { pkg: tryRequire('fastify'), ver: require('express/package').version, port: 1348 },
    connect: { pkg: require('connect'), ver: require('connect/package').version, port: 1346 },
}
function tryRequire(pkg) { try {return require(pkg) } catch (e) {} }

var path1 = '/test1';
var request1 = new Array(21).join('x');
var response1 = new Array(513).join('z');
var response1 = new Array(201).join('y');

if (cluster.isMaster) {

    var servers = {};

    // master runs the servers, worker runs the benchmarks
    var child = cluster.fork();
    child.on('disconnect', function() {
        console.log("AR: Done.");
        for (var name in servers) {
            try { servers[name].close() } catch (err) {
                console.log("cannot close %s:", name, err.message, Object.keys(servers[name]));
            }
        }
    })

    function noop(){}
    function noopStep(req, res, next){ setImmediate(next) }
    function sendResponse( req, res, next ) {
        //mw.sendResponse(req, res, noop, null, 200, response1, {});
        mw.sendResponse(req, res, noop, null, 200, response1);
        //res.end(response1);
        next();
    }
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
    function handleError( err, req, res, next ) {
        next();
    }

    if (frameworks.restify) {
        // 13.8k/s 259us
        servers.restify = frameworks.restify.pkg.createServer();
        servers.restify.listen(frameworks.restify.port);
        servers.restify.use(readBody);
        servers.restify.get(path1, function(req, res, next) { res.send(200, response1); next(); })      // no res.send in restify 5.x and up
        // 14.5k/s wrk -c100
        //servers.restify.get(path1, function(req, res, next) { res.end(response1); next(); })
        // 45k/s wrk -c8, 48.9k/s -c100
    }

    if (frameworks.express) {
        // 20.3k/s 182us
        servers.express = frameworks.express.pkg();
        // NOTE: disable 'etag' and 'x-powered-by', huge performance hit (esp etag)
        // servers.express.disable('etag');
        // servers.express.disable('x-powered-by');
        var expressServer = servers.express.listen(frameworks.express.port);
        servers.express.close = function() { expressServer.close() }
        servers.express.use(readBody);
        servers.express.get(path1, function(req, res, next) { res.status(200).send(response1); next(); })
        // 22k/s wrk -c8, -c100
        //servers.express.get(path1, function(req, res, next) { res.status(200).send(response1); })
        // 23k/s wrk -c8
        //servers.express.get(path1, function(req, res, next) { res.end(response1); })
        // 40k/s wrk -c8
        //servers.express.get(path1, noopStep, noopStep, noopStep, noopStep, noopStep, noopStep, noopStep, noopStep, noopStep, function(req, res, next) { res.end(response1); next(); })
        // 22k/s wrk .status.send, 44k/s wrk .end
    }

    if (frameworks.fastify && frameworks.fastify.pkg) {
        // R2600X @4.0g: 33k/s
        servers.fastify = frameworks.fastify.pkg();
        servers.fastify.listen(frameworks.fastify.port);
        servers.fastify.use(readBody);
        // NOTE: fastify mw steps are not passed a `next`, but can attach mw steps to a specific route
        servers.fastify.get(path1, function(req, res) { res.statusCode = 200; res.send(response1); });
        // NOTE: res.send is not a function in mw use() steps, only in get/post/del etc
        //servers.fastify.use(path1, function(req, res, next) { res.statusCode = 200; res.end(response1); next(); });
    }

    if (frameworks.restiq) {
        // 13.8k/s 259us
        servers.restiq = frameworks.restiq.pkg.createServer({ restify: true });
        servers.restiq.listen(frameworks.restiq.port);
        servers.restiq.use(readBody);
        //servers.restiq.get(path1, function(req, res, next) { res.send(200, response1); next(); })
        // 36k/s wrk -c8; 45k/s 9.1
        //servers.restiq.get(path1, function(req, res, next) { res.end(response1); next(); })
        servers.restiq.get(path1, sendResponse);
        // 40k/s wrk -c8; 53k/s 9.1 (both res.end and sendResponse)
    }

    if (frameworks.connect) {
        // 44.5k/s 85us
        servers.connect = frameworks.connect.pkg();
        servers.connect.use(readBody);
        servers.connect.use(handleError);
        servers.connect.use(path1, sendResponse);
        var httpServer = http.createServer(servers.connect).listen(frameworks.connect.port);
        servers.connect.close = function () { httpServer.close() }
    }

    if (frameworks.rest_mw) {
        // 65k/s 58.2us
        // R2600X @4.0g: 55k/s
        var router = new Router();
        var app = servers.rest_mw = rest({ port: frameworks.rest_mw.port, router: router });
        // app.use('before', function(req, res, next) { req.setEncoding('utf8'); next() });
        app.use(readBody);
        app.get('/test1', sendResponse);
        //app.get('/test1', noopStep, noopStep, noopStep, noopStep, noopStep, noopStep, noopStep, noopStep, noopStep, sendResponse);
        app.listen({ port: frameworks.rest_mw.port });
    }

    if (frameworks.rest_ha) {
        // 49.3k/s, 76.8us
        // 46.6k/s routed, 82.7us
        // 46.5k/s using NanoRouter (45.3k/s w sendResponse)
        servers.rest_ha = frameworks.rest_ha.pkg({ router: new rest.Rest.NanoRouter() });
        //servers.rest_ha.get(path1, function(req, res, next) { res.end(response1); next() });                                    // 46.5k/s
        servers.rest_ha.get(path1, sendResponse);
        servers.rest_ha.listen(frameworks.rest_ha.port);
    }

    if (frameworks.rest) {
        // 50.0k 77.1us
        servers.rest = frameworks.rest.pkg.createServer({ port: frameworks.rest.port });
        function noop(){}
        servers.rest._rest.processRequest = function(req, res) {
            if (req.url === path1 && req.method === 'GET') {
                //return mw.sendResponse(req, res, noop, null, 200, response1);
                //res.end(response1);
                sendResponse(req, res, noop);
            }
            else servers.rest._rest._tryWriteResponse(res, 404, {}, req.method + ' ' + req.url + ': path not routed');
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
                    //res.end(response1);
                    sendResponse(req, res, noop);
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
                    //res.end(response1);
                    sendResponse(req, res, noop);
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

    setTimeout(setUpTests, 400);

    function setUpTests() {
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
            var ncalls = callCount, ndone = 0, mute = false;
            for (var i=0; i<ncalls; i++) makeCall(onBack);
            function onBack(err, res, body) {
                // FIXME: mute is false on every callback, prints a gazillion lines if ECONNREFUSED
                if (err) { if (false && !mute) console.log("AR: call err", mute, err); mute = true }
                else doVerifyResponse(err, arguments[responseIndex]);
                if (++ndone === ncalls) {
                    setImmediate(callback);
                }
            }
        }

        function doVerifyResponse(err, rawBody) {
            // if (err) { console.log("AR: call err", err); process.exit(); }
            if (err) return;
            if (verifyResponse && String(rawBody) != response1 && JSON.parse(rawBody) != response1) {
                console.log("AR: wrong response:", String(rawBody), response1);
                throw new Error("wrong response")
            }
        }
    }

    function runSuite() {
        console.log("AR: runSuite: req = %sB, res = %sB", request1.length, response1.length);

        var cmdline = 'sleep .5 ; wrk -d2s -t2 -c50 http://localhost:%d/test1 | grep ^Requests/sec';
        //var cmdline = 'sleep .5 ; ab -k -c100 -t1 http://localhost:%d/test1 2>&1 | grep ^Requests';

        qibl.runSteps([
            function(next) {
//return next();
                qibl.forEachCb(Object.keys(frameworks), function(done, name) {
                    if (name === 'qrpc') return done();
                    if (!frameworks[name].pkg) return done();
                    var cmd = util.format(cmdline, frameworks[name].port);
                    console.log("\n# %s: %s", name, cmd);
                    var output = "";
                    var runTest = function(doneTest) {
                        child_process.exec(cmd, function(err, stdout, stderr) {
                            output += stdout + stderr;
                            doneTest(err);
                        })
                    }
                    qibl.repeatFor(2, function(next) {
                        output = '';
                        runTest(function(err) {
                            console.log(output.trim());
                            next(err);
                        })
                    }, done);
                }, next);
            },

            function(next) { setTimeout(next, 500) },
            function(next) {
                console.log("\nAR: bursts of %d parallel calls\n", parallelCallCount);
                qtimeit.bench.timeGoal = .4;
                qtimeit.bench.visualize = true;
                qtimeit.bench.showRunDetails = false;
                qtimeit.bench.showTestInfo = true;
                qtimeit.bench.opsPerTest = 100;         // 100 http calls per test
                next();
            },
            // pause between runs to avoid the express ECONNRESET
            function(next) { setTimeout(qtimeit.bench, 50, parallelTests, next) },
            function(next) { setTimeout(qtimeit.bench, 50, parallelTests, next) },
            function(next) { setTimeout(qtimeit.bench, 50, parallelTests, next) },

            function(next) { setTimeout(next, 500) },
            function(next) {
                console.log("\nAR: sequential calls:\n");
                next();
            },
            function(next) {
                qtimeit.bench.opsPerTest = 1;           // 1 http call in per test
                next();
            },
            function(next) { setTimeout(qtimeit.bench, 50, serialTests, next) },
            function(next) { setTimeout(qtimeit.bench, 50, serialTests, next) },
            function(next) {
                next();
            },
        function(err) {
            // disconnect child process to let parent know all done
            process.disconnect();
        });

/**
        if (1) {
            console.log("");
            for (var name in frameworks) {
                if (!frameworks[name].pkg) continue;
                var cmd = util.format(cmdline, frameworks[name].port);
                console.log("# %s: %s", name, cmd);
                if (name !== 'qrpc') console.log(String(child_process.execSync(cmd)) + String(child_process.execSync(cmd)));
            }
        }

        setTimeout(function() {

            qtimeit.bench.timeGoal = .4;
            qtimeit.bench.visualize = true;
            qtimeit.bench.showRunDetails = false;
            qtimeit.bench.showTestInfo = true;
            qtimeit.bench.opsPerTest = 100;     // 100 http calls per test

            console.log("\nAR: bursts of %d parallel calls\n", parallelCallCount);
            if (1)
            qtimeit.bench(parallelTests, function() {
            qtimeit.bench(parallelTests, function() {
            qtimeit.bench(parallelTests, function() {

            console.log("\nAR: sequential calls:\n");
            qtimeit.bench.opsPerTest = 1;       // 1 http call in per test
            if (0)
            qtimeit.bench(serialTests, function() {

            console.log("AR: Done.");
            })
            else console.log("AR: Done.");

            }) }) })
        }, 500);
**/
    }
}
