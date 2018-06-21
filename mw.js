/**
 * minimal middleware helpers
 *
 * Copyright (C) 2018 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

var util = require('util');
var http = require('http');

var mw = module.exports = {
    warn: warn,
    HttpError: HttpError,

    repeatUntil: repeatUntil,
    runMwSteps: runMwSteps,
    runMwErrorSteps: runMwErrorSteps,
    runMwStepsContext: runMwStepsContext,
    runMwErrorStepsContext: runMwErrorStepsContext,

    parseQuery: parseQuery,
    buildReadBody: buildReadBody,
    buildParseQuery: buildParseQuery,
    buildParseBody: buildParseBody,
    mwReadBody: buildReadBody(),
    mwParseQuery: buildParseQuery(),
    mwParseBody: buildParseBody(),
    sendResponse: sendResponse,
    writeResponse: writeResponse,
}

// node-v0.10 nextTick did not accept function args yet
var nodeVersion = process.version.slice(1, process.version.indexOf('.'));
var nextTick = nodeVersion >= 4 ? process.nextTick : setImmediate;

function HttpError( statusCode, debugMessage, details ) {
    var err = new Error((statusCode || 500) + ' ' + (http.STATUS_CODES[statusCode] || 'Internal Error'));
    err.statusCode = statusCode || 500;
    err.debug = debugMessage;
    err.details = details;
    return err;
}

// print a warning to stderr
function warn( ) {
    var argv = new Array();
    for (var i=0; i<arguments.length; i++) argv.push(arguments[i]);
    console.warn("%s -- microrest: %s", new Date().toISOString(), util.format.apply(util, argv));
}

// repeatUntil adapted from aflow:
// node-v8: 74m/s tracking callCount (81m/s tracking, but 40) (loop of 100m)
// but only 73m/s breaking up stack with a bound function and 22m/s with setImmediate
function repeatUntil( loop, arg, testStop, callback ) {
    var depth = 0, callCount = 0, returnCount = 0;
    if (!callback) { callback = testStop; testStop = _testRepeatUntilDone }

    callCount++; _tryCall(loop, _return, arg);

    function _return(err, stop) {
        if (++returnCount > callCount) {
            // probably too late to process an error response, but at least warn
            mw.warn('callback already called' + (err && ': ' + err || ''));
            return _tryCallback(callback, new Error('callback already called' + (err && ': ' + err || '')), arg);
        }
        else if (testStop(err, stop)) { return _tryCallback(callback, err, arg); }
        else if (depth++ < 20) { callCount++; _tryCall(loop, _return, arg); }
        else { depth = 0; callCount++; nextTick(function(){ _tryCall(loop, _return, arg) }); }
    }
}
function _testRepeatUntilDone(err, done) { return err || done; }
function _tryCall(func, cb, arg) { try { func(cb, arg) } catch (err) { cb(err) } }
function _tryCallback(cb, err, arg) { try { cb(err, arg) } catch (err2) { mw.warn('mw callback threw', err2); throw err2 } }

// run the middleware stack until one returns next(err) or next(false)
//function _callbackWithoutArg(err, ctx) { ctx.callback(err) }
function _callbackWithArg(err, ctx) { ctx.callback(err, ctx.arg) }
function runMwSteps( steps, arg, req, res, callback ) {
    var context = { req: req, res: res, callback: callback, ix: 0, steps: null, arg: arg };
    runMwStepsContext(steps, context, _callbackWithArg);
}
function runMwErrorSteps( steps, arg, err, req, res, callback ) {
    var context = { err: err, req: req, res: res, callback: callback, ix: 0, steps: null, arg: arg, next: null };
    runMwErrorStepsContext(steps, context, err, _callbackWithArg);
}
function runMwStepsContext( steps, ctx, callback ) {
    ctx.ix = 0; ctx.steps = steps;
    mw.repeatUntil(_runOneMwStep, ctx, _testMwStepsDone, callback);
    function _runOneMwStep(next, ctx) { (ctx.ix < ctx.steps.length) ? ctx.steps[ctx.ix++](ctx.req, ctx.res, next) : next(null, 'done') }
    function _testMwStepsDone(err, done) { return err || done || err === false; }
}
function runMwErrorStepsContext( steps, ctx, err, callback ) {
    ctx.ix = 0; ctx.steps = steps; ctx.err = err; ctx.err2 = null;
    mw.repeatUntil(_tryEachErrorHandler, ctx, _testRepeatUntilDone, callback);
    // pass err to each error handler until one of them succeeds
    // A handler can decline the error (return it back) or can itself error out (return different error)
    function _tryEachErrorHandler(next, ctx) {
        if (ctx.ix >= ctx.steps.length) return next(ctx.err2 || ctx.err, 'done'); else { ctx.next = next; _tryStepContext(ctx, _tryNext); }
    }
    // TODO: double-check how an error mw error should be handled.  We suppress it and set err2, but maybe we should abort
    // TODO: gather all err2 into an array, not just the first one
    function _tryStepContext(ctx, cb) { try { ctx.steps[ctx.ix++](ctx.err, ctx.req, ctx.res, cb) } catch (e) { cb(e) } }
    function _tryNext(declined) { if (declined && declined !== ctx.err) { if (!ctx.err2) ctx.err2 = declined; _reportErrErr(declined); }
        declined ? ctx.next() : ctx.next(null, 'done') }
    function _reportErrErr(err2) { mw.warn('error mw error:', err2) }
}

// simple query string parser, 35% faster than node-v10
// handles a&b and a=1&b=2 and a=1&a=2 and &&&, ignores &=&=2&, does not decode a[0] or a[b]
// Parses &&& sort of like node-v0.10, parses a&b&c like php.
function parseQuery( str ) {
    var urldecode = function(s) { if (!/[%+]/.test(s)) return s; try { return decodeURIComponent(s) } catch (e) { return s } };
    var eq, base = 0, bound;

    var hash = {};
    while (base < str.length) {
        bound = str.indexOf('&', base);
        if (bound < 0) bound = str.length;
        var eq = str.indexOf('=', base);
        if (eq >= 0 && eq < bound) {
            name = urldecode(str.slice(base, eq));
            value = urldecode(str.slice(eq+1, bound));
        }
        else {
            name = urldecode(str.slice(base, bound));
            value = 1;
        }
        if (!(name in hash)) hash[name] = value;
        else if (typeof hash[name] === 'object') hash[name].push(value);
        else hash[name] = new Array(hash[name], value);
        base = bound + 1;
    }
    return hash;
}

function buildReadBody( options ) {
    options = options || {};
    var bodySizeLimit = options.bodySizeLimit || Infinity;
    return function mwReadBody( req, res, next ) {
        if (req.body !== undefined) return next();
        var body = '', chunks = null, bodySize = 0;

        req.on('data', function(chunk) {
            if ((bodySize += chunk.length) >= bodySizeLimit) return;
            if (typeof chunk === 'string') body ? body += chunk : (body = chunk);
            else (chunks) ? chunks.push(chunk) : (chunks = new Array(chunk));
        })
        req.on('error', function(err) {
            next(err);
        })
        req.on('end', function() {
            if (bodySize > bodySizeLimit) return next((new mw.HttpError(400, 'max body size exceeded')), 1);
            body = body || (chunks ? (chunks.length > 1 ? Buffer.concat(chunks) : chunks[0]) : '');
            if (body.length === 0) body = (req._readableState && req._readableState.encoding) ? '' : new Buffer('');
            req.body = body;
            next(null, body);
        })
    }
}

function buildParseQuery( options ) {
    options = options || {};
    return function mwParseQuery( req, res, next ) {
        var query = mw.parseQuery(req.query);
        req.params = req.params || {};
        for (var k in query) req.params[k] = query[k];
        next();
    }
}

function buildParseBody( options ) {
    options = options || {};
    var bodyField = options.bodyField || 'body';
    return function mwParseBody( req, res, next ) {
        var query = req[bodyField] ? mw.parseQuery(String(req[bodyField])) : {};
        req.params = req.params || {};
        for (var k in query) req.params[k] = query[k];
        next();
    }
}

function sendResponse( req, res, next, err, statusCode, body, headers ) {
    try { return mw.writeResponse(res, err || statusCode, body, headers) }
    catch (err2) { return next(err2) }
}

function writeResponse( res, statusCode, body, headers ) {
    if (typeof statusCode === 'object' && statusCode) {
        var err = statusCode;
        statusCode = err.statusCode || 500;
        body = { error: '' + (err.code || statusCode), message: '' + (err.message || 'Internal Error'), debug: '' + (err.debug || '') };
        if (err.details) body.details = '' + (err.details);
        body = JSON.stringify(body);
        headers = undefined;
    }
    else if (typeof body !== 'string' && !Buffer.isBuffer(body)) {
        var json = tryJsonEncode(body);
        if (! (json instanceof Error)) body = json;
        else return mw.writeResponse(res, new mw.HttpError(statusCode = 500, 'unable to json encode response: ' + json.message + ', containing ' + Object.keys(body)));
    }
    var err2 = tryWriteResponse(res, statusCode, headers, body);
    if (err2) { mw.warn('cannot send response:', err2); throw(err2) }

    function tryJsonEncode( body ) {
        try { return JSON.stringify(body) } catch (err) { return err } }
    function tryWriteResponse( res, scode, hdr, body ) {
        try { res.statusCode = scode || 200; for (var k in hdr) res.setHeader(k, hdr[k]); res.end(body) } catch (err) { return err } }
}
