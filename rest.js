/**
 * minimal tiny rest server
 * https://github.com/andrasq/node-microrest
 *
 * Copyright (C) 2018 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * 2018-04-12 - AR.
 */

'use strict';

var http = require('http');
var https = require('https');
var events = require('events');

module.exports = createHandler;
module.exports.Rest = Rest;
module.exports.createServer = createServer;
module.exports.createHandler = createHandler;
module.exports.reportError = _reportError;

/*
 * create a microrest app with methods `use` and `get/post/put/del` etc.
 */
function createHandler( options ) {
    if (typeof options === 'function') options = { processRequest: options, onError: arguments[1] };
    else options = options || {};
    var rest = options.rest || new Rest(options);
    var handler = rest.onRequest;
    handler.rest = rest;

    var httpMethods = [ 'options', 'get', 'head', 'post', 'put', 'delete', 'trace', 'connect', 'patch' ]
    function useRouter() { return rest.router ? rest.router : rest.router = new Rest.NanoRouter() }
    handler.use = function use(mw) { typeof mw === 'string' ? useRouter().setRoute(arguments[0], arguments[1]) : useRouter().setRoute(mw.length === 4 ? 'err' : 'use', mw); }
    httpMethods.forEach(function(method) {
        var fn = function( path, mw ) { useRouter().setRoute(path, method.toUpperCase(), sliceMwArgs(new Array(), arguments, 1)) };
        handler[method] = Object.defineProperty(fn, 'name', { value: method });
    })
    handler.del = handler.delete;

    handler.listen = function(options, callback) {
        if (typeof options === 'function') { callback = options; options = 0; }
        options = (options > 0 || options === 0) ? { port: +options } : options ? options : { port: 0 };
        options.rest = handler.rest;
        return module.exports.createServer(options, callback)
    };

    return handler;

    function sliceMwArgs( dest, args, offset ) {
        for (var i = offset; i < args.length; i++) dest.push(args[i]);
        return (dest.length === 1 && Array.isArray(dest[0])) ? dest[0] : dest;
    }
}

/*
 * launch an http server listening for requests, handled by a microrest handler
 */
function createServer( options, callback ) {
    options = options || {};
    if (!callback && typeof options === 'function') { callback = options; options = {} };

    var rest = options.rest || new Rest();
    var server = (options.protocol === 'https:')
        ? https.createServer(options, rest.onRequest)
        : http.createServer(rest.onRequest);
    server._rest = rest;
    server._error = null;

    var port = options.port || 0;
    server.once('listening', onListening);
    server.once('error', onError);
    if (options.port !== undefined || options.anyPort) {
        // return before listen() called, so can mock it
        process.nextTick(function(){ server.listen(port) });
    }
    return server;

    function onListening() {
        server.removeListener('error', onError);
        var addr = server.address && server.address();
        if (callback) callback(null, { pid: process.pid, port: port || addr && addr.port });
    }
    function onError(err) {
        if (err.code === 'EADDRINUSE' && port && (options.tryNextPort || options.anyPort)) {
            server.once('error', onError);
            // trying port 0 after 1337 reuses the 1337, so try ports in order
            port += 1;
            setImmediate(function() { server.listen(port) });
        }
        else if (callback) callback(err);
        else server._error = err;
    }
}

// ----------------------------------------------------------------

/*
 * the microrest implementation class
 */
function Rest( options ) {
    options = options || {};
    var self = this;

    this.router = options.router;
    this.emitter = options.emitter;

    this.processRequest = options.processRequest;
    this.onError = options.onError || function onError( err, req, res, next ) {
        // _reportError(err, 'unhandled error', self.emitter);
        var err2 = Rest._sendErrorResponse(res, { code: err.statusCode || 500, message: 'Internal Error', debug: err.debug || err.message });
        if (err2) console.error('%s -- microrest: unable to send error response %s', new Date().toISOString(), err2.message);
        next(err2);
    };
    ['processRequest', 'onError'].forEach(function(name) {
        if (self[name] && typeof self[name] !== 'function') throw new Error(name + ' must be a function') });

    // onRequest is a function bound to self that can be used as an http server 'request' listener
    this.onRequest = function(req, res, next) { setImmediate(_invokeOnRequest, req, res, next) }
    function _invokeOnRequest(req, res, next) { self._onRequest(req, res, next) }
}

/*
 * built-in minimal direct-mapped route matcher for microrest apps,
 * for when no external router is provided.
 */
Rest.NanoRouter = function NanoRouter( ) {
    this.routes = { use: null, err: null, post: null, readBody: Rest.readBody };
    this.matchPrefix = true;
}
Rest.NanoRouter.prototype.setRoute = function setRoute( path, method, mwStep ) {
    if (!mwStep) { mwStep = method; method = '_ANY_' }
    if (Array.isArray(mwStep)) { if (mwStep.length !== 1) throw new Error('multiple mw steps not supported'); mwStep = mwStep[0]; }
    if (typeof path === 'function') path.length === 4 ? this.routes.err = path : this.routes.use = path;
    else if (typeof mwStep !== 'function') throw new Error('mw step must be a function');
    this.routes[path] = mwStep;
}
Rest.NanoRouter.prototype.getRoute = function getRoute( path, method ) {
    var mark = path.indexOf('?');
    if (mark >= 0) path = path.slice(0, mark);
    var mwSteps = this.routes[path];
    while (!mwSteps && this.matchPrefix && path.length > 1) mwSteps = this.routes[path = path.slice(path, path.lastIndexOf('/')) || '/'];
    return mwSteps;
}
Rest.NanoRouter.prototype.deleteRoute = function deleteRoute( path, method ) {
    delete this.routes[path];
}
Rest.NanoRouter.prototype.runRoute = function runRoute( rest, req, res, next ) {
    var self = this, err3, err4, err5;
    _tryStep(self.routes.use, req, res, function(err1) {
        if (err1) return runError(err1);
        _tryStep(self.routes.readBody, req, res, function(err2) {
            if (err2) return runError(err2);
            self.routes[req.url]
                ? _tryStep(self.routes[req.url], req, res, runError)
                : runFinally(Rest._sendErrorResponse(res, { code: 404, message: 'Cannot ' + (req.method || 'GET') + ' ' + req.url + ', path not routed' }))
    }) })
    function runError(err) { ((err3 = err) && self.routes.err) ? _tryErrStep(self.routes.err, err3, req, res, runFinally) : runFinally(err3) }
    function runFinally(err) { if (err4 = err) _reportError(err, 'unhandled mw error'); _tryStep(self.routes.post, req, res, runReturn) }
    function runReturn(err) { if ((err5 = err) && err5 !== err3 && err5 !== err4) _reportError(err, 'post mw unhandled error'); _tryCb(next, err4 || err5) }
}
function _tryStep( fn, req, res, next ) { if (!fn) return next(); try { fn(req, res, next) } catch (e) { next(e) } }
function _tryErrStep( fn, err, req, res, next ) {
    try { fn(err, req, res, next) } catch (err2) { _reportError(err2, 'error mw threw'); next(err) } }
function _tryCb( cb, err ) { try { cb(err) } catch (e) { _reportError(e, 'mw callback threw'); return e } }
function _reportError(err, cause, emitter) { if (!err) return; emitter ? emitter.emit('error', err) : console.error('%s -- microrest: %s:', new Date().toISOString(), cause, err); }
function noop() {};


/*
 * microrest function to handle an http 'request' event
 */
Rest.prototype._onRequest = function _onRequest( req, res, next ) {
    var self = this;
    try { (self.router)
        ? self.router.runRoute(self, req, res, _doReturn)
        : Rest.readBody(req, res, function(err, body) {
            if (err || !self.processRequest) _doReturn(err || new Error('no router or processRequest configured'));
            else try { self.processRequest(req, res, _doReturn, body); } catch (e) { _doReturn(e) };
        })
    } catch (e) { _doReturn(e) }
    function _doReturn(err) {
        if (!err) return next ? _tryCb(next) : null;
        try { self.onError(err, req, res, function(e2) { _reportError(e2, 'onError returned error', self.emitter); _tryCb(next || noop, e2 ? err : null) }) }
        catch (e3) { _reportError(e3, 'onError threw', self.emitter); _tryCb(next || noop, err) }
    }
}

/*
 * middleware helper function to gather the request body
 * Microrest calls the request handlers with the body already read.
 */
Rest.readBody = function readBody( req, res, next ) {
    if (req.body !== undefined) return next();
    var body = '', chunks = null, bodySize = 0;

    req.on('data', function(chunk) {
        if (typeof chunk === 'string') body ? body += chunk : (body = chunk);
        else (chunks) ? chunks.push(chunk) : (chunks = new Array(chunk));
    })
    req.on('error', function(err) {
        next(err);
    })
    req.on('end', function() {
        body = body || (chunks ? (chunks.length > 1 ? Buffer.concat(chunks) : chunks[0]) : '');
        if (body.length === 0) body = (req._readableState && req._readableState.encoding) ? '' : new Buffer('');
        req.body = body;
        next(null, body);
    })
}

Rest._sendErrorResponse = function _sendErrorResponse( res, err ) {
    res.statusCode = err.code || 500;
    try { res.end(JSON.stringify(err)) } catch (err2) { return err2 }
}

Rest.prototype = toStruct(Rest.prototype);

function toStruct( x ) {
    return toStruct.prototype = x;
}
