microrest
=========
[![Build Status](https://api.travis-ci.org/andrasq/node-microrest.svg?branch=master)](https://travis-ci.org/andrasq/node-microrest?branch=master)
[![Coverage Status](https://codecov.io/github/andrasq/node-microrest/coverage.svg?branch=master)](https://codecov.io/github/andrasq/node-microrest?branch=master)

Extremely small, extremely fast embeddable REST web framework.
Perfect for adding a web API to an existing app.

To use as a bare-bones request handler:

    const rest = require('microrest');
    const handler = rest();
    handler.processRequest = function(req, res, next) {
        // read the request and send a response
        next();
    }
    http.listen(1337, handler);

To use as a light-weight app:

    const rest = require('microrest');
    const app = rest();
    app.get('/hello', (req, res, next) => {
        // request body available in req.body
        res.end('hello back, you said' + req.body);
        next();
    })
    const server = app.listen(1337, (err, serverInfo) => {
        // app is listening on port `serverInfo.port`
    })


Documentation
-------------

Detailed documenation is in the [manual](https://github.com/andrasq/node-microrest/blob/master/MANUAL.md)


Benchmark
---------

Requests served per second in batches of 100 concurrent calls a 20 byte request, 200
byte response, calls made by nodejs using a keepAlive Agent with default maxSockets:

    qtimeit=0.21.0 node=8.11.1 v8=6.2.414.50 platform=linux kernel=4.9.0-0.bpo.4-amd64 up_threshold=false
    arch=ia32 mhz=4383 cpuCount=4 cpu="Intel(R) Core(TM) i7-6700K CPU @ 4.00GHz"
    name        speed           rate
    restify    12,194 ops/sec   1000 >>>>>
    express    16,344 ops/sec   1340 >>>>>>>
    rest_ha    34,505 ops/sec   2830 >>>>>>>>>>>>>>
    rest       34,794 ops/sec   2853 >>>>>>>>>>>>>>
    http       28,980 ops/sec   2377 >>>>>>>>>>>>

And, just for fun, a fast non-REST remote procedure call library (single socket):

    qrpc      131,703 ops/sec  10800 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

With the test load generated externally to nodejs by [`wrk`](https://github.com/wg/wrk.git):

    # wrk -d2s -t2 -c50 http://localhost:1337/test1
    restify:    14957.77        xxxxxxx
    express:    23179.38        xxxxxxxxxxxx
    rest_mw:    80719.16        xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    rest_ha:    83304.33        xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    rest:       89870.42        xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    http:       57735.86        xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

Testing
-------

To keep the size small, the npm package does not in include the tests.  To run the
tests or benchmarks, check out the repo from https://github.com/andrasq/node-microrest.


Related Work
------------

- [`connect`](https://npmjs.com/package/connect) - basic middleware web framework
- [`express`](https://npmjs.com/package/express) - middleware web framework
- [`microreq`](https://npmjs.com/package/microreq) - tiny web request convenience wrapper
- [`microrest`](https://npmjs.com/package/microrest) - tiny fast web framework (this one)
- [`qrpc`](https://npmjs.com/package/qrpc) - very fast remote procedure calls
- [`restify`](https://npmjs.com/package/express) - middleware web framework
- [`restiq`](https://npmjs.com/package/restiq) - middleware web framework
