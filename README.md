microrest
=========

Extremely small, extremely fast embeddable REST web framework.
Perfect for adding a web API to an existing app.

    const rest = require('microrest');

    const app = rest();
    app.get('/hello', (req, res, next) => {
        res.end('hello back');
        next();
    })
    const server = app.listen(1337, (err, serverInfo) => {
        console.log('app listening on port %d', serverInfo.port);
    })


Documentation
-------------

Detailed documenation is in the [manual](MANUAL.md)


Benchmark
---------

Requests served per second in batches of 100 concurrent calls a 20 byte request, 200
byte response, calls made by nodejs using a keepAlive Agent with default maxSockets:

    qtimeit=0.21.0 node=8.11.1 v8=6.2.414.50 platform=linux kernel=4.9.0-0.bpo.4-amd64 up_threshold=false
    arch=ia32 mhz=4383 cpuCount=4 cpu="Intel(R) Core(TM) i7-6700K CPU @ 4.00GHz"
    restify     12,362 ops/sec   1000 >>>>>
    express     16,672 ops/sec   1349 >>>>>>>
    rest_ha     29,533 ops/sec   2389 >>>>>>>>>>>>
    rest        30,286 ops/sec   2450 >>>>>>>>>>>>
    http        30,452 ops/sec   2463 >>>>>>>>>>>>

And, just for fun, a fast non-REST remote procedure call library (single socket):

    qrpc       135,219 ops/sec  11122 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

With the test load generated externally to nodejs by `wrk` (wrk is more efficient than `ab`):

    # wrk -d2s -t2 -c8 http://localhost:1337/test1
    restify     13812.18        --------------
    express     19860.86        --------------------
    rest_ha     50590.20        ---------------------------------------------------
    rest        54484.84        ------------------------------------------------------
    http        57875.58        ----------------------------------------------------------

    express     21864.40        ----------------------
    rest_ha     52888.54        -----------------------------------------------------
    rest        57471.93        ---------------------------------------------------------
    http        58139.12        ----------------------------------------------------------

Testing
-------

To keep the size small, the npm package does not in include the tests.  To run the
tests or benchmarks, check out the repo from https://github.com/andrasq/node-microrest.


Related Work
------------

- [`connect`](https://npmjs.com/package/connect) - basic express-compatible middleware web framework
- [`express`](https://npmjs.com/package/express) - middleware web framework
- [`microreq`](https://npmjs.com/package/microreq) - tiny web request convenience wrapper
- [`qrpc`](https://npmjs.com/package/qrpc) - very fast remote procedure calls
- [`restify`](https://npmjs.com/package/express) - middleware web framework
- [`restiq`](https://npmjs.com/package/restiq) - middleware web framework
