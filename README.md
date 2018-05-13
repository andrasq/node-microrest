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
    app.listen(1337, (err, serverInfo) => {
        console.log('app listening on port %d', serverInfo.port);
    })


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
    restify     13407.58        -------------
    express     19270.78        -------------------
    rest_ha     45397.93        ---------------------------------------------
    rest        50357.36        --------------------------------------------------
    http        50028.63        --------------------------------------------------


Testing
-------

To keep the size small, the npm package does not in include the tests.  To run the
tests or benchmarks, check out the repo from https://github.com/andrasq/node-microrest.


Api
---

### rest = require('microrest')

Return a request handler builder.

### rest( [options] )

Create a request handler app function that can work as a (simple) app.
The options are passed to `new Rest()`, described below.

The app function is called on every http request.  It reads the request body,
and invokes the configured `processRequest` function that sends the response.

The app has properties
- app.rest - the Rest instance the app uses

The app has methods
- app.use(func) - mw routing method.  Calling app.use switches to running in routed mode,
  `processRequest` will not be called.  A four-argument function is used as the error handler,
  else as the pre-middleware step.
- app.get, app.post, app.put, app.del, etc - mw routing methods
- onError(err, req, res, next) - function called if the route handler encounters an error
- listen([portOrOptions], [callback]) - invoke rest.createServer with this app as the
  request listener.  Port can be numeric, or can be createServer options.

    const rest = require('microrest');
    const app = rest();
    const server = app.listen(1337, function(err, serverInfo) {
        // app is listening
    });

### rest.createServer( [options] [,callback] )

Create a microrest request handler app and start an http server listening and
processing requests with the app.  Both http and https servers can be created.
Unlike http createServer, microrest.createServer can listen on hunt for alternate ports.

The function returns the http server, and the callback (if provided) is passed
the server listen error or an object with the `pid` and `port` of the server.
If no callback is provided, server errors are attached to `server._error`.

The returned server has added properties
- _rest - the microrest app that is serving
- _error - any listen error emitted when no callback was provided

Options:
- `protocol` - 'http:' or 'https:', default http
- `port` - port to listen on
- `tryNextPort` - if desired port is busy, try the next one up
- the options are also passed to https.createServer

### rest.createHandler( [options] )

This is the same function as `rest()`.
Returns a function `handler(req, res, [next])`.

### new rest.Rest( [options] )

Rest instance implementation class, called by createHandler() and createServer().
The returned object has a bound method `onRequest` for use as an `on('request')`
listener in an http server.

Options:
- `encoding` - how to convert the request body, or `null` to return raw bytes.
  Default 'utf8'; use `null` to not decode but return raw bytes.
- `router` - the router to use.  Default is to use `processRequest`.
- `processRequest(req, res, next)` - user function to process requests.
  No default.  It is an error for neither a router nor processRequest be given.
- `onError(err, req, res, next)` - user-defined middleware step to handle errors

A `new Rest` object has properties that may be set:
- `encoding` - options.encoding
- `router` - options.router
- `processRequest` - options.processRequest
- `onError` - options.onError

Helper methods:
- `HttpError(statusCode, debugMessage, details)` - http error builder, returns instanceof Error.
- `readBody(req, res, next)` - function to read the request body from the `req` object.
   Calls `next(err, body)`.  Body is also set on req as `req.body`.
- `processRequest(req, res, next, body)` - function to handle the request if
   no router was provided.  Set to either the user-provided function or a built-in.
   It is invoked with a noop callback and a separate copy of the body.
- `onError(err, req, res, next)` - invoked on readBody or processRequest error, or
   as the last resort error handler from routed path execution.
- `sendResponse(req, res, next, err, statusCode, body, headers)` -


Router
------

`Rest` uses by default a tiny built-in router accessible as `rest.NanoRouter`.
NanoRouter supports a single `use` step, a single error handler `err` step, one
middleware function step for each mapped route, and a `post` step that is run like a
try/catch "finally" after all the other steps and/or the error handler have run.
Redefinig a step overwrites the previous.

NanoRouter ignores the request method and matches the request path either in its
entirety, or to the longest `/`-separated mapped prefix.  The mapped prefix '/my/path'
would match '/my/path/name' and '/my/path/othername', but not '/my' nor
'/my/otherpath'.  NanoRouter does not support pathname parameters (ie,
`/path/:param1/:param2`).

A router used by `Rest` needs to support the api
- `setRoute(path, [method,] mw)` - map the route to the mw.  `mw` can be a function(req, res, next)
  or an array of mw functions.  The path may or may not start with a leading `/` slash:
  use steps are path 'use', error handlers are path 'err'.
- `runRoute(rest, req, res, next)` - apply the defined route to the request, including
  `use` and `err` steps, if any.  Any error returned to the callback will be passed to
  `onError`.

Related Work
------------

- [`connect`](https://npmjs.com/package/connect) - basic express-compatible middleware web framework
- [`express`](https://npmjs.com/package/express) - middleware web framework
- [`microreq`](https://npmjs.com/package/microreq) - tiny web request convenience wrapper
- [`qrpc`](https://npmjs.com/package/qrpc) - very fast remote procedure calls
- [`restify`](https://npmjs.com/package/express) - middleware web framework
- [`restiq`](https://npmjs.com/package/restiq) - middleware web framework
