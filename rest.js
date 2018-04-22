/**
 * minimal tiny rest server
 *
 * 2018-04-12 - AR.
 */

'use strict';

var http = require('http');
var https = require('https');

module.exports = createServer;
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
    server._microRest = rest;

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
        if (callback) callback(null, { pid: process.pid, port: port || addr && addr.port || 0 });
    }
    function onError(err) {
        if (err.code === 'EADDRINUSE' && port && (options.tryNextPort || options.anyPort)) {
            server.once('error', onError);
            port = options.tryNextPort ? port + 1 : 0;
            server.listen(port);
        }
        else if (callback) callback(err);
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

function HttpError( statusCode, debugMessage ) {
    var err = new Error((statusCode || 500) + ' ' + (http.STATUS_CODES[statusCode] || 'Internal Error'));
    err.statusCode = statusCode || 500;
    err.debug = debugMessage;
    return err;
}

function sliceMwArgs( dest, args, offset ) {
    for (var i = offset; i < args.length; i++) dest.push(args[i]);
    return (dest.length === 1 && Array.isArray(dest[0])) ? dest[0] : dest;
}

function NonRouter( ) {
    this.addRoute = function(path, method, mw) { new Error('router does not support mw') };
    this.removeRoute = function(path, method) { return null };
    this.lookupRoute = function(path, method) { return null };
    this.runRoute = function(rest, req, res, next) {
        rest.readBody(req, res, function(err) {
            if (!err) try { rest.processRequest(rest, req, res, next) } catch (e) { err = e }
            if (err) rest.sendResponse(req, res, new rest.HttpError(500, err.message));
        })
    };
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
    this.router = options.router || new NonRouter();
    if (!this.router) this.removeRoute = function() {};
    if (!this.router) this.addRoute = function() { throw new Error('mw routing not supported') };
    if (!this.router) this.lookupRoute = function() { return null };

    this.processRequest = options.processRequest;
    this.onError = options.onError || function onError(err, req, res, next) {
        self.sendResponse(req, res, new self.HttpError(500, err.message));
    };

    // onRequest is a function bound to self that can be used as an http server 'request' listener
    this.onRequest = function(req, res, next) {
        req.setEncoding(self.encoding);
        try {
            if (self.router) return self.router.runRoute(self, req, res, next);
            self.readBody(req, res, function(err, body) {
                if (err) throw err;
                if (!self.processRequest) throw new self.HttpError(500, 'no router or processRequest configured');
                self.processRequest(req, res, body);
            })
        } catch (e) { self.sendResponse(req, res, new self.HttpError(500, e.message)) }
    }
}

Rest.prototype.lookupRoute = function lookupRoute( path, method ) {
    return this.router.lookupRoute(path, method);
}
Rest.prototype.removeRoute = function removeRoute( path, method ) {
    return this.router.remoteRoute(path, method);
}
Rest.prototype.addRoute = function addRoute( path, method, mw /* VARARGS */ ) {
    mw = sliceMwArgs(new Array(), arguments, typeof method === 'string' ? 2 : 1);
    method = typeof method === 'string' ? method : '_ANY_';
    for (var i=0; i<mw.length; i++) if (typeof mw[i] !== 'function') throw new Error('middleware step [' + i + '] is not a function');
    (path[0] === '/') ? this.router.addRoute(path, method, mw) : this.router.addRoute(path, '_ANY_', mw);
}

Rest.prototype.readBody = function readBody( req, res, next ) {
    if (req.body !== undefined) return next();
    var bodySizeLimit = this.bodySizeLimit;

    var bodySize = 0, body = '', chunks = new Array();
    function gatherChunk(chunk) {
        if (chunk && (bodySize += chunk.length <= bodySizeLimit)) (typeof chunk === 'string') ? body += chunk : chunks.push(chunk);
// TODO: maybe req.socket.end() to not transfer the rest of the data?
    }

    req.on('data', gatherChunk)
    req.on('error', function(err) { next(err); })
    req.on('end', function() {
        if (bodySize > bodySizeLimit) return next(new this.HttpError(400, 'max body size exceeded'));
        var body = body || (chunks.length > 1 ? Buffer.concat(chunks) : chunks[0] || new Buffer(''))
        if (body.length === 0 && req._readableState && req._readableState.encoding) body = '';
        req.body = body;
        next(null, body);
    })
    gatherChunk(req.read())
}

Rest.prototype.sendResponse = function sendResponse( req, res, err, statusCode, body, headers ) {
    if (!err && typeof body !== 'string' && !Buffer.isBuffer(body)) {
        try { body = JSON.serialize(body) }
        catch (e) { err = new this.HttpError(500, 'unable to json encode response: ' + e.message) }
    }
    if (err) {
        statusCode = statusCode || err.statusCode || 500;
        body = JSON.stringify({ error: '' + (err.code || statusCode), message: '' + (err.message || 'Internal Error'), debug: '' + (err.debug || '-') });
        headers = undefined;
    }
    try { res.writeHead(statusCode, headers); res.end(body) }
    catch (e) { console.error('%s -- microrest: unable to send response %s', new Date().toISOString(), (err || e).message); }
}

Rest.prototype = toStruct(Rest.prototype);

function toStruct( x ) {
    toStruct.prototype = x;
    return toStruct.prototype;
}

function noop( ) { }
function noopMw( req, res, next ) { next() }
