/**
 * minimal middleware helpers
 */

var util = require('util');
var http = require('http');

module.exports = {
    HttpError: HttpError,
    repeatUntil: repeatUntil,
    runMwSteps: runMwSteps,
    runMwErrorSteps: runMwErrorSteps,
    parseQuery: parseQuery,
    sendResponse: sendResponse,
}


function HttpError( statusCode, debugMessage, details ) {
    var err = new Error((statusCode || 500) + ' ' + (http.STATUS_CODES[statusCode] || 'Internal Error'));
    err.statusCode = statusCode || 500;
    err.debug = debugMessage;
    err.details = details;
    return err;
}

function repeatUntil( fn, test, callback ) {
    var depth = 0;
    var callCount = 0, returnCount = 0;
    if (!callback) { callback = test; test = false }

    _repeat();

    function _repeat() {
        callCount++;
        try { fn(_next) } catch(err) { _next(err) }
    }

    function _next(err, done) {
        if (++returnCount > callCount) {
            // probably too late to return an error response, but at least warn
            console.error('%s -- microrest: mw callback already called', new Date().toISOString());
            return tryCb(callback, new Error('microrest: mw callback already called'));
        }
        //if (test(err, done)) return tryCb(callback, err);
        if (test ? test(err, done) : (err || done)) return tryCb(callback, err);
        if (depth++ < 10) _repeat(); else { depth = 0; process.nextTick(_repeat) }
    }

    function tryCb( cb, err ) {
        try { cb(err) }
        catch (e) { console.error('%s -- microrest: error thrown in mw callback:', new Date().toISOString(), e) }
    }
}

// run the middleware stack until one returns next(err) or next(false)
function runMwSteps( steps, req, res, callback ) {
    var ix = 0;
    //repeatUntil(runEachStep, test, callback);
    repeatUntil(runEachStep, test, function(err) {
//console.log("AR: back", err, callback);
callback(err);
    })
    function runEachStep(next) {
        if (ix >= steps.length) return next(null, 'done');
        steps[ix++](req, res, next);
    }
    function test(err, done) { return (err || err === false || done || req._timeout) }
// TODO: test for req._timeout to stop mw if a timeout use() step
}

// pass err to each error handler until one of them does not return error
function runMwErrorSteps( steps, err, req, res, callback ) {
    var ix = 0;
    repeatUntil(tryEachHandler, callback);
    function tryEachHandler(next) {
        if (ix >= steps.length) return next(err, 'done');
        steps[ix++](err, req, res, function(declined) {
            if (declined && declined !== err) console.error('%s -- microrest: error mw error:', new Date().toISOString(), declined);
            declined ? next() : next(null, 'done');
        });
    }
}

// simple query string parser
// handles a&b and a=1&b=2 and a=1&a=2, ignores &&& and &=&=2&, does not decode a[0] or a[b]
function parseQuery( str ) {
    var urldecode = function(s) { try { return decodeURIComponent(s) } catch (e) { return s } };
    var parts = str.split('&');

    var hash = {};
    for (var i=0; i<parts.length; i++) {
        var eq = parts[i].indexOf('=');
        var name = (eq < 0) ? urldecode(parts[i]) : urldecode(parts[i].slice(0, eq));
        var value = (eq < 0) ? 1 : urldecode(parts[i].slice(eq + 1));
        if (!name) continue;
        if (hash[name] !== undefined) {
            if (!Array.isArray(hash[name])) hash[name] = new Array(hash[name]);
            hash[name].push(value);
        }
        else hash[name] = value;
    }
    return hash;
}

function sendResponse( req, res, next, err, statusCode, body, headers ) {
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
