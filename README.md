microrest
=========

Extremely small, extremely fast embeddable REST web framework.
Perfect for adding a web API to an existing app.

WORK IN PROGRESS

    const rest = require('microrest');

    const app = rest();
    app.get('/hello', (req, res, next) => { console.log("Hello!"); next() });

    require('http').createServer(app).listen(8086);


Benchmark
---------

Rate to serve 100 calls with a 20 byte request, 200 byte response:

    qtimeit=0.21.0 node=8.11.1 v8=6.2.414.50 platform=linux kernel=4.9.0-0.bpo.4-amd64 up_threshold=false
    arch=ia32 mhz=4384 cpuCount=4 cpu="Intel(R) Core(TM) i7-6700K CPU @ 4.00GHz"
    name         speed           rate
    restify     12,157 ops/sec   1000 >>>>>
    express     16,661 ops/sec   1370 >>>>>>>
    rest_ha     29,608 ops/sec   2435 >>>>>>>>>>>>
    rest        30,355 ops/sec   2497 >>>>>>>>>>>>
    http        30,360 ops/sec   2497 >>>>>>>>>>>>

And, just for fun, a fast non-REST remote procedure call library:

    qrpc       135,219 ops/sec  11122 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>


Api
---

### require('microrest')

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
- encoding - how to convert the request body, or `null` to return raw bytes.
  Default 'utf8'; use `null` to not decode but return raw bytes.
- router - the router to use.  Default is to use `processRequest`.
- processRequest(req, res, next) - user function to process requests.
  No default.  It is an error for neither a router nor processRequest be given.
- onError(err) - user-defined middleware step to handle errors

A `new Rest` object has properties that may be set:
- encoding - options.encoding
- router - options.router
- processRequest - options.processRequest
- onError - options.onError

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


Related Work
------------

- [`connect`](https://npmjs.com/package/connect) - basic express-compatible middleware web framework
- [`express`](https://npmjs.com/package/express) - middleware web framework
- [`microreq`](https://npmjs.com/package/microreq) - tiny web request convenience wrapper
- [`qrpc`](https://npmjs.com/package/qrpc) - very fast remote procedure calls
- [`restify`](https://npmjs.com/package/express) - middleware web framework
- [`restiq`](https://npmjs.com/package/restiq) - middleware web framework
