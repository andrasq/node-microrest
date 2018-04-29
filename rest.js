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
    options = options || {};
    var rest = options.rest || new Rest(options);
    var handler = rest.onRequest;
    handler.rest = rest;

    // TODO: allow use('/path') with (mw), (mw1, mw2), ([mw])
    handler.use = function use(mw) { mw.length === 3 ? rest.setRoute('use', mw) : rest.setRoute('err', mw) };
    var httpMethods = [ 'options', 'get', 'head', 'post', 'put', 'delete', 'trace', 'connect', 'patch' ]
    httpMethods.forEach(function(method) {
        var fn = function( path, mw ) { return rest.setRoute(path, method.toUpperCase(), sliceMwArgs(new Array(), arguments, 1)) };
        handler[method] = Object.defineProperty(fn, 'name', { writable: true });
        fn.name = method;
    })
    handler.del = handler.delete;

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
        var err2 = self._tryWriteResponse(res, 500, {}, { code: 500, message: 'Internal Error', debug: err.message });
        if (err2) console.error('%s -- microrest: unable to send error response %s', new Date().toISOString(), err2.message);
        next(err2);
    };

    // onRequest is a function bound to self that can be used as an http server 'request' listener
    this.onRequest = function(req, res, next) { self._onRequest(req, res, next); }
}


Rest.prototype.getRoute = function getRoute( path, method ) {
    return this.router && this.router.getRoute(path, method) || null;
}
Rest.prototype.deleteRoute = function deleteRoute( path, method ) {
    return this.router && this.router.deleteRoute(path, method) || null;
}
Rest.prototype.setRoute = function setRoute( path, method, mw /* VARARGS */ ) {
    mw = sliceMwArgs(new Array(), arguments, typeof method === 'string' ? 2 : 1);
    method = typeof method === 'string' ? method : '_ANY_';
    for (var i=0; i<mw.length; i++) if (typeof mw[i] !== 'function') throw new Error('middleware step [' + i + '] is not a function');
    if (!this.router) throw new this.HttpError('mw routing not supported');
    (path[0] === '/') ? this.router.setRoute(path, method, mw) : this.router.setRoute(path, '_ANY_', mw);
    return this;
}

Rest.prototype._onRequest = function _onRequest( req, res, next ) {
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
        try { if (err) self.onError(err, req, res, function(e3){ }); if (next) next() }
        catch (e2) { next ? next(err || e2) : console.error('%s -- microrest: onError error:', new Date().toISOString(), e2) }
    }
}

Rest.prototype.readBody = function readBody( req, res, next ) {
    if (req.body !== undefined) return next();
    var rest = this, body = '', chunks = null, bodySize = 0;

    req.on('data', function(chunk) {
        if ((bodySize += chunk.length) >= rest.bodySizeLimit) return;
        if (typeof chunk === 'string') body ? body += chunk : (body = chunk);
        else (chunks) ? chunks.push(chunk) : (chunks = new Array(chunk));
    })
    req.on('error', function(err) {
        next(err);
    })
    req.on('end', function() {
        if (bodySize > rest.bodySizeLimit) return next((new rest.HttpError(400, 'max body size exceeded')), 1);
        body = body || (chunks ? (chunks.length > 1 ? Buffer.concat(chunks) : chunks[0]) : '');
        if (body.length === 0) body = (req._readableState && req._readableState.encoding) ? '' : new Buffer('');
        req.body = body;
        next(null, body);
    })
}

Rest.prototype._tryWriteResponse = function _writeResponse( res, scode, hdr, body ) {
    try {
        res.statusCode = scode || 200;
        for (var k in hdr) res.setHeader(k, hdr[k]);
        res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    } catch (err) { return err }
}

Rest.prototype = toStruct(Rest.prototype);

function toStruct( x ) {
    return toStruct.prototype = x;
}
