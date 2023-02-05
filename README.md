microrest
=========
[![Build Status](https://app.travis-ci.com/andrasq/node-microrest.svg?branch=master)](https://app.travis-ci.com/andrasq/node-microrest?branch=master)
[![Coverage Status](https://coveralls.io/repos/github/andrasq/node-microrest/badge.svg?branch=master)](https://coveralls.io/github/andrasq/node-microrest?branch=master)

Extremely small, extremely fast REST framework for when size and speed matter.
Also perfect for embedding a web API into an existing app.

To use as a fully routed app with middleware steps and route params (rest_mw):

    const rest = require('microrest');
    const mw = rest.mw;

    const app = rest();
    app.use('pre', mw.mwParseQuery);
    app.use('pre', mw.mwReadBody);
    app.get('/hello/:arg1/:arg2', (req, res, next) => {
        // request body available in req.body
        // query params and arg1, arg2 available in req.params
        res.end();
        next();
    })
    app.listen(1337);

To use as a light app with direct-mapped routes (rest_ha):

    const rest = require('microrest');
    const app = rest({ router: null });
    app.get('/hello', (req, res, next) => {
        res.end('hi back');
        next();
    })
    app.listen(1337);

To use as a bare-bones request handler without routed calls (rest):

    const rest = require('microrest');
    const app = rest((req, res, next) => {
        // request body is in the req.body Buffer
        // the query string and path are in req.url
        res.end();
        next();
    }
    app.listen(1337);

To embed, copy `rest.js` (and possibly also mw.js and router.js) into your own library, and
use as an internal component.  The last two examples above do not use on any functions from
router.js or mw.js.


Documentation
-------------

Detailed documenation is in the [manual](https://github.com/andrasq/node-microrest/blob/master/MANUAL.md)


Benchmark
---------

Requests served per second in batches of 100 concurrent calls of a 20 byte request, 200
byte response, calls made by nodejs using a keepAlive Agent with default maxSockets:

    qtimeit=0.21.0 node=8.11.1 v8=6.2.414.50 platform=linux kernel=4.9.0-0.bpo.4-amd64 up_threshold=false
    arch=ia32 mhz=4383 cpuCount=4 cpu="Intel(R) Core(TM) i7-6700K CPU @ 4.00GHz"
    name        speed           rate
    restify    12,194 ops/sec   1000 >>>>>
    express    16,344 ops/sec   1340 >>>>>>>
    rest_ha    34,505 ops/sec   2830 >>>>>>>>>>>>>>
    rest       34,794 ops/sec   2853 >>>>>>>>>>>>>>
    http       28,980 ops/sec   2377 >>>>>>>>>>>>

With the test load generated externally to nodejs by [`wrk`](https://github.com/wg/wrk.git):

    # wrk -d2s -t2 -c50 http://localhost:1337/test1
    restify:    14957.77        xxxxxxx
    express:    23179.38        xxxxxxxxxxxx
    rest_mw:    80719.16        xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    rest_ha:    83304.33        xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    rest:       89870.42        xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    http:       57735.86        xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

And, just for fun, a fast non-REST call-multiplexed remote procedure call library, over a single socket:

    qrpc      131,703 ops/sec  10800 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>


Testing
-------

To keep the size small, the npm package does not in include the tests.  To run the
tests or benchmarks, check out the repo from https://github.com/andrasq/node-microrest.


Change Log
----------

- 0.9.3 - run routes with a series of static functions
- 0.9.2 - expose `app.setRoute()` along with app.get, app.post etc, change `mwReadBody` function signature to
          not appear to be a 4-argument error handler middleware step, fix benchmark typo
- 0.9.1 - pretty-print error responses, handle path-not-routed errors with the configured mw
- 0.9.0 - have parseQuery also set `req.path` and `req.query`
- 0.8.3 - speed access to req.params et al, req.destroy() if bodySizeLimit exceeded
- 0.8.2 - fix HttpError message text, mw.buildDecodeBody
- 0.8.1 - transfer statusCode properties onto HttpError
- 0.8.0 - export all functionality by default via `index.js`, fix mw.sendResponse to call next()
- 0.7.2 - fix NanoRouter 'post' step
- 0.7.1 - fix to work on node-v0.7, avoid Buffer deprecation warning
- 0.7.0 - `app.close()` method
- 0.6.4 - remove mw dependency on setImmediate
- 0.6.3 - tune parseQuery
- 0.6.2 - fix router path lookups if have query params
- 0.6.1 - let createHandler also accept onRequest and onError handlers directly, not just via options
- 0.6.0 - Breaking: remove the broken `encoding` handling, make the app decode.  Now returns Buffers.
          Fix null response handling (`null` is an object not an empty string, JSON serialize it)
- 0.5.2 - make `null` and `undefined` return empty response bodies
- 0.5.0 - full routing with microrest/router, full documentation, `/:*tail` matching
- 0.4.1 - mw helper builders
- 0.3.6 - faster repeatUntil, node-v0.10 support
- 0.3.0 - faster runRoute
- 0.2.0 - initial `app.onRequest` version


Related Work
------------

- [`connect`](https://npmjs.com/package/connect) - basic middleware web framework
- [`express`](https://npmjs.com/package/express) - middleware web framework
- [`microreq`](https://npmjs.com/package/microreq) - tiny web request convenience wrapper
- [`microrest`](https://npmjs.com/package/microrest) - tiny very fast web framework (this one)
- [`qrpc`](https://npmjs.com/package/qrpc) - very fast remote procedure calls
- [`restify`](https://npmjs.com/package/express) - middleware web framework
- [`restiq`](https://npmjs.com/package/restiq) - fast middleware web framework
