/**
 * minimal tiny rest server
 *
 * Copyright (C) 2018 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * 2018-04-12 - AR.
 */

'use strict';

var http = require('http');
var https = require('https');

module.exports = createHandler;
module.exports.Rest = Rest;
module.exports.HttpError = HttpError;
module.exports.createServer = createServer;
module.exports.createHandler = createHandler;

function createServer( options, callback ) {
    options = options || {};
    if (!callback && typeof options === 'function') { callback = options; options = {} };

    var rest = new Rest();
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

function createHandler( options ) {
    var rest = new Rest(options);
    var handler = rest.onRequest;
    handler.rest = rest;

    handler.use = function use(mw) { mw.length === 3 ? rest.addRoute('use', mw) : rest.addRoute('err', mw) };
    var httpMethods = [ 'options', 'get', 'head', 'post', 'put', 'delete', 'trace', 'connect', 'patch' ]
    httpMethods.forEach(function(name) {
        var fn = function( path, mw ) { return rest.addRoute(path, name.toUpperCase(), sliceMwArgs(new Array(), arguments, 1)) };
        handler[name] = Object.defineProperty(fn, 'name', { writable: true });
        fn.name = name;
    })
    handler.del = Rest.prototype.delete;

    return handler;
}

// ----------------------------------------------------------------

function HttpError( statusCode, debugMessage, details ) {
    var err = new Error((statusCode || 500) + ' ' + (http.STATUS_CODES[statusCode] || 'Internal Error'));
    err.statusCode = statusCode || 500;
    err.debug = debugMessage;
    err.details = details;
    return err;
}

function sliceMwArgs( dest, args, offset ) {
    for (var i = offset; i < args.length; i++) dest.push(args[i]);
    return (dest.length === 1 && Array.isArray(dest[0])) ? dest[0] : dest;
}

// ----------------------------------------------------------------

function Rest( options ) {
    options = options || {};
    var self = this;

    this.NotRoutedHttpCode = options.NotRoutedHttpCode || 404;
    this.HttpError = HttpError;

    this.encoding = options.encoding !== undefined ? options.encoding : 'utf8';
    this.bodySizeLimit = options.bodySizeLimit || Infinity;

    this.mw = options.mw || {};
    this.router = options.router;

    this.processRequest = options.processRequest;
    this.onError = options.onError || function onError( err, req, res, next ) {
        self.sendResponse(req, res, callback, new self.HttpError(500, err.message));
        function callback(err2) {
            if (err2) console.error('%s -- microrest: unable to send error response %s', new Date().toISOString(), err2.message);
            next(err2);
        }
    };

    // onRequest is a function bound to self that can be used as an http server 'request' listener
    this.onRequest = function(req, res) { return self._onRequest(req, res); }
}


Rest.prototype.lookupRoute = function lookupRoute( path, method ) {
    return this.router && this.router.lookupRoute(path, method) || null;
}
Rest.prototype.removeRoute = function removeRoute( path, method ) {
    return this.router && this.router.removeRoute(path, method) || null;
}
Rest.prototype.addRoute = function addRoute( path, method, mw /* VARARGS */ ) {
    mw = sliceMwArgs(new Array(), arguments, typeof method === 'string' ? 2 : 1);
    method = typeof method === 'string' ? method : '_ANY_';
    for (var i=0; i<mw.length; i++) if (typeof mw[i] !== 'function') throw new Error('middleware step [' + i + '] is not a function');
    if (!this.router) throw new this.HttpError('mw routing not supported');
    (path[0] === '/') ? this.router.addRoute(path, method, mw) : this.router.addRoute(path, '_ANY_', mw);
    return this;
}

Rest.prototype._onRequest = function _onRequest( req, res ) {
    var self = this;

    (function(){ try { tryOnRequest(self, req, res) } catch (e) { returnError(e) } })();

    function tryOnRequest( self, req, res ) {
        req.setEncoding(self.encoding);
        if (self.router) return self.router.runRoute(self, req, res, returnError);
        self.readBody(req, res, function(err, body) {
            if (err || !self.processRequest) return returnError(err || new self.HttpError(500, 'no router or processRequest configured'));
            try { self.processRequest(req, res, returnError, body); } catch (e) { returnError(e) }
        })
    }
    function returnError(err) {
        try { if (err) self.onError(err, req, res, function(e3){ }) }
        catch (e2) { console.error('%s -- microrest: onError error:', new Date().toISOString(), e2) }
    }
}

Rest.prototype.readBody = function readBody( req, res, next ) {
    if (req.body !== undefined) return next();
    var state = { req: req, res: res, next: next, rest: this, bodySize: 0, body: '', chunks: new Array() };
    this._doReadBody(state);
}
Rest.prototype._doReadBody = function _doReadBody( state ) {
    state.req.on('data', onData);
    state.req.on('error', onError);
    state.req.on('end', onEnd);
    onData(state.req.read());

    function onData(chunk) {
        // TODO: fast-path discard the rest of the input without reading it all
        if (chunk && (state.bodySize += chunk.length) > state.rest.bodySizeLimit) ; else
        if (chunk) (typeof chunk === 'string' ? state.body += chunk : state.chunks.push(chunk))
    }
    function onError(err) {
        state.next(err);
    }
    function onEnd() {
        if (state.bodySize > state.rest.bodySizeLimit) return state.next((new state.rest.HttpError(400, 'max body size exceeded')), 1);
        var body = state.body || (state.chunks.length > 1 ? Buffer.concat(state.chunks) : state.chunks[0] || new Buffer(''))
        if (body.length === 0 && state.req._readableState && state.req._readableState.encoding) body = '';
        state.req.body = body;
        state.next(null, body);
    }
}

Rest.prototype.sendResponse = function sendResponse( req, res, next, err, statusCode, body, headers ) {
    if (err) {
        statusCode = statusCode || err.statusCode || 500;
        body = { error: '' + (err.code || statusCode), message: '' + (err.message || 'Internal Error'), debug: '' + (err.debug || '') };
        if (err.details) body.details = '' + (err.details);
        body = JSON.stringify(body);
        headers = undefined;
    } else if (typeof body !== 'string' && !Buffer.isBuffer(body)) {
        var json = tryJsonEncode(body);
        if (! (json instanceof Error)) body = json;
        else return this.sendResponse(req, res, next, new this.HttpError(statusCode = 500, 'unable to json encode response: ' + json.message + ', containing ' + Object.keys(body)));
    }
    var err2 = tryWriteResponse(res, statusCode, headers, body);
    next(err2);

    function tryJsonEncode( body ) {
        try { return JSON.stringify(body) } catch (err) { return err } }
    function tryWriteResponse( res, scode, hdr, body ) {
        try { res.statusCode = scode || 200; for (var k in hdr) res.setHeader(k, hdr[k]); res.end(body) } catch (err) { return err } }
}

Rest.prototype = toStruct(Rest.prototype);

function toStruct( x ) {
    return toStruct.prototype = x;
}
