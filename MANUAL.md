microrest
=========

Extremely small, extremely fast embeddable REST web framework.


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
- `app.rest` - the Rest instance the app uses

The app has methods
- `app.use(func)` - mw routing method.  Calling app.use switches to running in routed mode,
  `processRequest` will not be called.  A four-argument function is used as the error handler,
  else as the pre-middleware step.
- `app.get`, `app.post`, `app.put`, `app.del`, etc - mw routing methods
- `app.onError(err, req, res, next)` - function called if the route handler encounters an error
- `app.listen([portOrOptions], [callback])` - invoke rest.createServer with this app as the request
listener.  Port can be numeric, or can be createServer options.


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
- `rest` - microrest instance to handle requests
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

The `Rest` app uses by default a tiny built-in router of type `rest.NanoRouter`.
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
