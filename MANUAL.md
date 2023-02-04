microrest
=========
[![Build Status](https://api.travis-ci.org/andrasq/node-microrest.svg?branch=master)](https://travis-ci.org/andrasq/node-microrest?branch=master)
[![Coverage Status](https://coveralls.io/repos/github/andrasq/node-microrest/badge.svg?branch=master)](https://coveralls.io/github/andrasq/node-microrest?branch=master)

Extremely small, extremely fast embeddable REST framework for when size and speed matter.

    const rest = require('microrest');
    const app = rest();
    app.get('/hello/:name', function(req, res, next) {
        res.end('Hello, ' + req.params.name);
        next();
    })
    app.listen(1234);

- [rest](#restjs) - the rest framework and built-in tiny router
- [router](#routerjs) - a full middleware stack router
- [mw](#mwjs) - middleware helper functions


rest( options )
====

The package exports a routed app builder `rest()` with methods `app.use`, `app.listen`,
`app.close`, and routing functions `app.get`, `app.post` etc.  See rest.js below for the
detailed descriptions, here are the differences.

Each call to `app.use([path], mw)` appends a mw processing step for the path by calling
setRoute(path, mw).  Path may be an http route and start with '/', or one of the special
route processing steps `'pre'`, `'use'`, `'post'` or `'err'`.  See router.js below for
details.

`app.get(path, mw)` and the other http methods define the middleware step(s) implementing
the named http route.  The route is registered with `router.setRoute(path, 'GET', mw)`.
`mw` may be a single middleware function `mw(req, res, next)` or an array of such.
`app.setRoute(path, method, mw)` is a programmable way to define http methods; e.g.
`app.get(path, mw)` is the same as `app.setRoute(path, 'GET', mw)`.

The rest calls are run by the middleware in the order:  `pre, use, [mw], post`.  The `pre`
steps are run before the request is read, decoded or routed.  The `use` steps are run to
read and decode the request after the request is routed.  The route-specific middleware
steps `[mw]` are run to handle the call, and are followed by the `post` steps.  Errors
thrown in any of the pre-, use- or mw-steps run the `err` steps then the `post` steps.
Errors thrown in the post steps are reported to the `onError` app option or logged to
the console.

        +-------+    +-------------+    +------------+    +----------------+
        | pre:  |----| use: route, |----| user       |----| post: logging, |
        | setup |    |      decode |    | middleware |  --|       cleanup  |
        +-------+    +-------------+    +------------+  | +----------------+
              |                  |        |             |
              |                  |        |  +-------+  |
              |                  |        ---| err:  |---
              |                  ------------|       |
              -------------------------------|       |
                                             +-------+

The options to `rest()` are the same as described under `new rest.Rest()` below,
except that if the options do not include a router, a rest.Router will be used
(instead of the Rest default NanoRouter).

    const rest = require('microrest');
    const app = rest();

    const mw = rest.mw;
    app.use('use', mw.mwParseQuery);
    app.use('use', mw.mwReadBody);
    app.get('/hello/:arg1/:arg2', (req, res, next) => {
        // request body available in req.body
        // query params and arg1, arg2 available in req.params
        res.end();
        next();
    })
    app.listen(1337);


rest.js
=======

The rest.js file exports an app builder just like `rest()` but the default router if
none are specified in the options is NanoRouter.


### microrest.rest( [options] )

Create an http request handler app.  The options are passed to `new Rest()`, described
below.  For a fully routed app with path parameters and multiple mw steps per route, pass in
a router (see router.js below).  Returns the app, which is just the decorated request
handler function.

The handler function is called on every http request.  It reads the request body,
and invokes the configured `processRequest` function that sends the response.

The app has properties
- `app.rest` - the Rest instance the app uses

The app has methods
- `app.use(func)` - mw routing method.  Calling app.use switches to running in routed mode,
  `processRequest` will not be called.  A four-argument function is used as the error handler,
   else as the pre-middleware step.  The router used if not provided is the built-in `rest.NanoRouter`.
- `app.get`, `app.post`, `app.put`, `app.del`, etc - mw routing methods
- `app.setRoute(path, method, mwStep)` - exposes the rest router setRoute() endpoint.
   See `NanoRouter` and `router.js` below
- `app.onError(err, req, res, next)` - function called if the route handler encounters an error
   not handled by the `'err'` step.
- `app.listen([portOrOptions], [callback])` - invoke rest.createServer with this app as the request
   listener.  Port can be numeric, or can be createServer options.
- `app.close([callback])` - stop listening for more requests

The options are described under `new rest.Rest()` below.

    const rest = require('microrest').rest;
    const app = rest();
    app.get('/url/path', (req, res, next) => {
        // handle calls to /url/path
    })
    app.post('/path2', (req, res, next) => {
        // handle calls to /path2
        // req.body contains the request body
    })
    const server = app.listen(1337, onListen(err, serverInfo) => {
        // http server is listening on port 1337
    })

### microrest.rest( processRequest(req, res, next) [,onError(err, req, res, next)] )

Alternate way of calling `rest()`, equivalent to passing processRequest and onError in the
options object.

    const microrest = require('microrest');
    const app = microrest.rest((req, res, next) => {
        // req.body contains the request body
        res.end();
    })
    const server = app.listen(1337, (err, serverInfo) => {
        // app is listening on port serverInfo.port
    })

### rest.createServer( [options] [,callback(err, info)] )

Create a microrest request handler app and start an http server listening and
processing requests with the app.  Both http and https servers can be created.
Unlike http.createServer, microrest.createServer can listen on (hunt for) alternate ports.

The function returns the http server, and the callback (if provided) is passed
the server listen error and an object with the `pid` and `port` of the server.
If no callback is provided, server errors are attached to `server._error`.

The returned server has added properties
- _rest - the microrest app that is serving
- _error - any listen error emitted when no callback was provided

Options:
- `rest` - microrest instance to handle requests
- `protocol` - 'http:' or 'https:', default http
- `port` - port to listen on
- `tryNextPort` - if desired port is busy, try the next one up
- the options are also passed to https.createServer

### rest.createHandler( [options] )

Same as `rest()`.

Create a small REST request handler with support for a `use` step and direct-mapped
(default) or routed (using `options.router`) url handlers.  Returns a function
`handler(req, res, [next])` that can be used as the on('request') handler to
httpServer.createServer, or `handler.listen` will go ahead and create the http server.
The handler function can also be used as an app with methods `use`, `get/post/put/del` etc,
`listen` and `close`.

### new rest.Rest( [options] )

Rest builds request handler apps.

Rest instance implementation class, called by createHandler() and createServer().
The returned object has a bound method `onRequest` for use as an `on('request')`
listener in an http server.

Options:
- `router` - the router to use.  Default is to use `processRequest`.
- `processRequest(req, res, next)` - user function to process requests.
  No default.  It is an error for neither a router nor processRequest be given.
  It is invoked with a noop callback and a separate copy of the body.
- `onError(err, req, res, next)` - user function to handle errors.  By default
  errors result in an http 500 error response.  Invoked on readBody or processRequest
  error, or as the last resort error handler from routed path execution.

A `new Rest` object has properties that may be set:
- `router` - options.router
- `processRequest` - options.processRequest
- `onError` - options.onError


NanoRouter
----------

The `Rest` app uses by default a tiny built-in router of type `rest.NanoRouter`.
NanoRouter supports a single `use` step, a single error handler `err` step, one
middleware function step for each mapped route, and a `post` step that is run like a
try/catch "finally" after all the other steps and/or the error handler have run.
Redefining a step overwrites the previous.

NanoRouter ignores the request method and matches the request path either in its
entirety, or to the longest `/`-separated mapped prefix.  The mapped prefix '/my/path'
would match '/my/path/name' and '/my/path/othername', but not '/my' nor
'/my/otherpath'.  NanoRouter does not support pathname parameters (ie,
`/path/:param1/:param2`).

A router used by `Rest` needs to support the api
- `setRoute(path, [method,] mw)` - map the route to the mw.  `mw` must be a single
  function(req, res, next).  The path must start with a leading `/` slash, or be
  one of `'use'` for a use step, `'post'` for a post step, or `'err'` for an error handler.
- `runRoute(rest, req, res, next)` - apply the defined route to the request, including
  `use`, `post` and `err` steps, if any.  Any error returned to the callback will be passed
  to `onError`.


router.js
=========

    const Router = require('microrest').Router;
    const router = new Router();

`router` is a full-featured middleware engine:  it routes and runs middleware steps,
with hooks to customize routing and error handling.

### new Router( [options] )

Options:
- readBody - function to gather the request and set `req.body`.  Default is `mw.mwReadBody`.
  This function is invoked if `req.body` is not set after the `use` steps run.

### router.setRoute( path, method, steps )

Define a middleware step (or a sequence of steps) for the url or category `path`.  Steps are
run in category order (pre-use-route-finally), and in each category in the order defined.

`path` is the category name or the req.url to match.  It can be a plain url `/path/name`, a
url with embedded path parameters to extract `/path/:var1/:var2/name`, or one of the special
categories:

- pre - pre-routing step.  The `pre` steps are always run, before the call is routed.
- use - post-routing, pre-mw step.  Use steps are run as part of the call middleware.
- (url handling mw steps run after use and before finally)
- err - "catch" step, error handling function.  Calling `next` with a non-falsy error skips the
  rest of the pre-, use- and call-middleware and runs the error handlers instead.
  Error handlers take `(err1, req, res, next)` and call `next(err)` with a falsy `err`
  if they dealt with the error condition, call `next(err1)` to try the next error
  handler instead, or call `next(err2)` if they themselves encountered an error.
  Err steps are run if and only if any preceding step throws or returns an error.
- post - "finally" step, run after the mw and/or error handlers have run.  The `post`
  steps are always run as the last steps.  Post errors are passed to `rest.onError`.

Path parameters are separated by `/` path component delimiters.  Path parameter names
start after the leading ':' and extend until the first '/' encountered or the end of
the path pattern to match.  The special path parameter `:*{varname}` matches multiple
path components, and can be used to match the tail of the path.  If `{varname}` is
empty the request tail will be stored into `req.params['*']`.

`method` is the http method to match eg 'GET', 'PUT', 'POST' etc, or can be
the special string '_ANY_' that will match any http method.

`steps` is a `(req, res, next)` middleware function, or an array of such functions;
`err` steps are `(err, req, res, next)` or an array of such.

### router.deleteRoute( path, method )

Clear all steps associated with the route.

### router.getRoute( path, method )

Look up the middleware steps defined for the request.  The call can return an array of
middleware functions (for direct-mapped routes), an object with property `mw` that
contains the array of middleware functions (for regex-mapped routes), or `null` if the
call does not have a matching route.

### router.runRoute( rest, req, res, callback )

Process a request by running the associated route, or returning a 404 error if the call
does not match any of the defined routes.

The middleware is run in the order
- pre - pre-routing steps.  Unless the `pre` steps set `req._route`, the route is
  looked up after the `pre` and before the `use` steps.
- use - all `use` steps that existed when this call was defined
- mw - the middleware steps for this call
- err - error handling steps for when any preceding mw step fails
- post - finally steps that are run unconditionally


mw.js
=====

`mw` provides middleware helper functions.

    const mw = require('microrest').mw;

### mw.warn( )

Uses `console.warn` to print a notice to the console, but tags the message with a
timestamp and "microrest:".

### mw.HttpError( statusCode, debugMessage, details )

Construct a `new Error` with additional properties `statusCode`, `debug` and
`details`.  The error `.message` is looked up from the status code, eg `404 Not Found`
or `456 Http Error`.  If `statusCode` is an object, all its own properties will be
transferred onto the error.  `statusCode` will be set in any case, either to the
passed-in number else to its `.statusCode` object property else to `500`.

### mw.sendResponse( req, res, next, err, statusCode, body [,headers] )

Send a response back to the caller.  If `err` is an object it will send an error
response, else will set the specified headers, if any, and send the response body.
If the body is a `string` or `Buffer`, it will be sent as-is; all else will be
json-encoded first.

`sendResponse` handles headers efficiently and is a fast, low overhead function.

### mw.writeResponse( res, errOrStatusCode [,body [,headers]] )

Implementation entry point for mw.sendResponse, ends the request with the given status code,
response body, and optional response headers.  Body may be a string or Buffer, else
anything other than `undefined` will be converted to a string with JSON.stringify.

If statusCode is an object will end the request with a JSON error response generated from
the object `statusCode`, `code`, `message`, `debug` and `details` properties.

### mw.buildParseQuery( [options] )

Construct a function that will parse the query string contained in `req.url` and place
name-value pairs into `req.params`.  Both names and values are url-decoded.  Also sets
`req.path` to the called route, and set `req.query` to the query string portion of the url.
It works similarly to `querystring` but for common use cases is 20-40% faster.
Returns a middleware step `parseQuery(req, res, next)`.

Examples:

    "a=1&b=two" => { a: '1', b: 'two' }   // values gathered as strings
    "a&b"       => { a: 1, b: 1 }         // missing values set to Number(1)
    "a&a=&a=2"  => { a: [ 1, '', '2' ] }  // repeated values gathered into an array


    // req.url == '/v1/rest/call?x=1&y=two#offset'
    mw.buildParseQuery(req, res, function() {
        // req.params == { x: '1', y: 'two' }
        // req.path == "/v1/rest/call"
        // req.query == "x=1&y=two"
    })

### mw.buildReadBody( [options] )

Construct a function that will wait for the request body to arrive and set `req.body`.
Returns a middleware step `readBody(req, res, next, context)` that will call
`next(err, context, body)` with the body it places into `req.body`.  If `req.body` is
already set, it will return immediately.

Binary chunks arriving in Buffers will be gathered into a Buffer, text chunks arriving as
strings will be gathered into a string.  The body reader is very efficient for small requests
and handles utf8 plaintext fast.  When binary input is not expected, it may be worth setting
`req.setEncoding('utf8')`.

Options:
- bodySizeLimit - cap on the request size.  If the request body exceeds this many bytes,
  `next` will be called with a 400 "max body size exceeded" HttpError.

### mw.buildDecodeBody( [options] )

Construct a function that decodes `req.body`.  The decoded version is placed back into `req.body`.
Decode errors throw an Error to be caught by the middleware error handler.

Options:
- decoder - decode function to call on non-empty body.  Default is `JSON.parse`.
- startingWith - valid start characters of decodable payloads.  Do not decode if the first
    character of the body is not among them.  All characters must be explicitly listed.
    Default is the empty string `''` to decode all non-empty bodies.
- ignoreError - do not throw on decode error, leave req.body as found.

<!-- -->
    app.use(mw.buildReadBody());
    app.use(mw.buildDecodeBody({ decoder: JSON.parse, startingWith: "{[" });

### mw.parseQuery( str )

The underlying query string parser, available to parse querystring request bodies.
See buildParseQuery.


Change Log
==========

[See the readme](https://github.com/andrasq/node-microrest/blob/master/README.md#change-log)
