microrest
=========

Extremely small, extremely fast embeddable REST web framework.
Perfect for adding a web API to an existing app.

WORK IN PROGRESS

    const rest = require('microrest');
    const app = rest();
    require('http').createServer(app).listen(8086);

    app.processRequest = function(res, res) {
        // process request specified by req.method and req.path
    }


Api
---

### rest( [options] )

Create a request handler app function that can work as a (simple) app.

The app function is called on every http request.  It reads the request body,
and invokes the configured `processRequest` function that sends the response.

The app has properties
- rest - the Rest instance the app uses
- use - mw routing method, if options.router is given
- get, post, put, del, etc - mw routing methods, if options.router is given

The options are passed to `new Rest()`, described below.

    const rest = require('microrest');
    const app = rest();
    require('http').createServer(app).listen(8086);

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

This is the function that implements `rest()`.

### Rest( [options] )

Rest instance implementation class, called by createHandler() and createServer().

Options:
- NotRoutedHttpCode (default 404)
- encoding (default 'utf8', use `null` to not decode and return raw bytes)
- bodySizeLimit (default unlimited)
- router (default none)
- processRequest (default none) - user function to process requests
- onError - user-defined middleware step to handle errors

Properties:
- `encoding` - how to convert the request body, or `null` to return raw bytes.
            Same as `options.encoding`.
- `router` - the provided router, if any.

Helper methods:
- `HttpError(statusCode, debugMessage, details)` -
- `readBody(req, res, next)` - function to read the request body from the `req` object.
   Calls `next(err, body)`.  Body is also set on req as `req.body`.
- `processRequest(req, res, body)` - function to handle the request.
   Prototype `(req, res, next, path, method, microtest)`.
- `onError(err, req, res, next)` -
- `sendResponse(req, res, next, err, statusCode, body, headers)` -


Todo
----

- maybe a way of addressing 'uncaughtException'?
- make createServer create an app, and attach it to server._app


Related Work
------------

- [`connect`](https://npmjs.com/package/connect) - basic express-compatible middleware web framework
- [`express`](https://npmjs.com/package/express) - middleware web framework
- [`microreq`](https://npmjs.com/package/microreq) - tiny web request convenience wrapper
- [`restify`](https://npmjs.com/package/express) - middleware web framework
- [`restiq`](https://npmjs.com/package/restiq) - middleware web framework
