/**
 * minimal tiny rest server
 */

var util = require('util');
var http = require('http');

module.exports = {
    createServer: createServer,

    onRequest: onRequest,
    readRequest: readRequest,
    sendResponse: sendResponse,
    processRequest: processRequest,

    HttpError: HttpError,
    MicroREST: MicroREST,
    BasicRouter: BasicRouter,
}

function HttpError( statusCode, debugMessage ) {
    Error.call(this, http.STATUS_CODES[statusCode]);
    this.statusCode = statusCode;
    this.debugMessage = debugMessage;
}
util.inherits(HttpError, Error);

function createServer( http, options, handler, callback ) {
    var server = http.createServer(options, onRequest);
}

function MicroREST( options ) {
    this.NotRoutedHttpCode = 404;
    this._router = options.router || new BasicRouter();
    this._onRequest = null;
}

MicroREST.prototype.addStep = function addStep( where, fn ) {
    if (typeof fn !== 'function') throw new Error('');
    (where[0] === '/') ? this._router.addRoute(where, '*', fn) : this._router.addStep(where, fn);
    return this;
}

MicroREST.prototype.addRoute = function addRoute( path, method, mw ) {
    if (arguments.length >= 4) throw new Error('addRoute is not varargs, pass an array');
    var mwSteps = Array.isArray(mw) ? mw : [ mw ];
    for (var i=0; i<mwSteps.length; i++) {
        if (typeof mwSteps[i] !== 'function') throw new Error('middleware step [' + i + '] is not a function');
    }
    this._router.addRoute(path, method, mwSteps);
    return this;
}

MicroREST.prototype = toStruct(MicroREST.prototype);

// ----------------------------------------------------------------

function BasicRouter( options ) {
    this._steps = {
        pre: new Array(),       // steps run before route is mapped
        use: new Array(),       // steps run for all mapped routes
        post: new Array(),      // steps run after all other mw steps
        err: new Array(),       // steps run to handle mw errors
    };
    this.routes = {};           // map of [path][method] of routes
    this.regexRoutes = new Array();
}

BasicRouter.prototype.addStep = function addStep( where, fn ) {
    if (!this._steps[where]) throw new Error(where + ': unknown mw step');
    if (typeof mw !== 'function') throw new Error('mw step not a function');
    if (where === 'err' && fn.length !== 4) throw new Error('mw err steps take 4 args');
    this._steps[where].push(mw);
}

BasicRouter.prototype.addRoute = function addRoute( path, method, mw ) {
    this.routes[path] = this.routes[path] || {};
    if (path.indexOf('/:') < 0) this.routes[path][method] = this.routes[path][method] || mw;
    else throw new Error('path parameters not supported (yet) in router');
    // TODO: handle regexp routes too
    // mapping = makeCapturingRegex(method + '.' + path);  // map has fields { regex, names, mw }
    // mapping.mw = mw;
    // this.regexRoutes.push(mapping);
}

BasicRouter.prototype.lookupRoute = function lookupRoute( path, method ) {
    var route = {
        pre: this._steps.pre,
        mw: this.routes[path] && (this.routes[path][method] || this.routes[path]['*']),
        post: this._steps.post,
        err: this._steps.err,
        params: {},
    };

    var methodPath = method + '.' + path;
    var starPath = '*.' + path;
    if (!route.mw) for (var i=0; i<this.regexRoutes.length; i++) {
        var rr = this.regexRoutes[i];
        var match = rr.regex.exec(methodPath) || rr.regex.exec(starPath);
        if (!match) continue;

        route.mw = rr.mw;
        for (var i=0; i<rr.names.length; i++) if (names[i]) route.params[rr.names[i]] = match[i];
        break;
    }

    return route.mw ? route : null;
}

function traverse2d( map, fn ) {
    for (var d1 in map) for (var d2 in map[d1]) fn(d1, d2);
}

BasicRouter.prototype = toStruct(BasicRouter.prototype);

// ----------------------------------------------------------------

function readRequest( req, next ) {
    // TODO: decode query params
    // TODO: decode body params
    var chunks = new Array();
    req.on('data', function(chunk) { chunks.push(chunk) })
    req.on('error', function(err) { next(err) })
    req.on('end', function() {
        var body = (!chunks.length || typeof chunks[0] === 'string')
            ? (chunks.length > 1 ? chunks.join('') : chunks[0] || '')
            : (chunks.length > 1 ? Buffer.concat(chunks) : chunks[0] || new Buffer(''))
            // TODO: if res.setEncoding but no chunks, how to know what to return?
        next(null, body);
    })
}

function sendResponse( err, res, statusCode, body, headers ) {
    if (!err && typeof body !== 'string' && !Buffer.isBuffer(body)) {
        try { body = JSON.serialize(body) }
        catch (e) { err = new HttpError(500, 'unable to json encode response: ' + e.message) }
    }
    if (err) {
        statusCode = err.statusCode || 500;
        body = JSON.serialize({ error: '' + (err.code || statusCode), message: '' + (err.message || 'Internal Error'), debug: '' + (err.debugMessage || '') });
        headers = undefined;
    }
    try { res.writeHead(statusCode, headers); res.end(body) }
    catch (e) { console.error('%s -- microrest: res write error: %s', e.message) }
}

function repeatUntil( fn, callback ) {
    var depth = 0;
    var callCount = 0, returnCount = 0;
    function repeat() {
        callCount++;
        try { fn(nextCall) } catch(err) { nextCall(err) }
    }
    function nextCall(err, done) {
        if (returnCount++ > callCount) {
            // probably too late to return an error response, but at least warn
            console.error('%s -- microrest: mw callback already called', new Date().toISOString());
            return;
        }
        // stop mw stack on next(false)
        // return on nextTick to not feed callback errors back into the try/catch above
        if (err || err === false || done) return process.nextTick(callback, err);
        if (depth++ < 10) repeat(); else { depth = 0; process.nextTick(repeat) }
    }
    repeat();
}

// run the middleware stack until one returns next(err) or next(false)
function runMw( steps, req, res, callback ) {
    var ix = 0;
    repeatUntil(runEachStep, callback);
    function runEachStep(next) {
        if (ix >= steps.length) return next(null, 'done');
        steps[ix++](req, res, next);
    }
}

// pass err to each error handler until one of them does not return error
function runErrorMw( steps, err, req, res, callback ) {
    var ix = 0;
    repeatUntil(tryEachHandler, callback);
    function tryEachHandler(next) {
        if (ix >= steps.length) return next(err, 'done');
        steps[ix++](err, req, res, function(declined) { declined ? next() : next(null, 'done') });
    }
}

function onRequest( req, res, router ) {
    try {
        processRequest(req.url, req.method, req, res, router);
    } catch (err) {
        sendResponse(new HttpError(500, e.message), res);
    }
}

function processRequest( path, method, req, res, router ) {
    var route = router.lookupRoute();
    var preSteps = route.pre;
    var postSteps = route.post;
    var errSteps = route.err;
    notRoutedCode = 404;

    // TODO: there ought to be a way of massaging all this into a runMw stack...

    // pre steps are always run, before call is routed
    req.once('end', function() { state.reqEnd = true });
    runMw(preSteps, runReadRequest);

    function runReadRequest(err) {
        if (err) return runPostSteps(err);
        state.reqEnd ? runMwSteps(null, '') : readRequest(req, runMwSteps);
    }

    // the call middleware stack includes the relevant 'use' and route steps
    function runMwSteps(err, body) {
        if (err) return runPostSteps(err);
        var mwRoute = router.lookupRoute(method, path, req);
        if (!mwRoute) return runPostSteps(new HttpError(notRoutedCode, util.format('%s %s is not routed', method, path)));
        // TODO: for (var k in mwRoute.params) req.params[k] = mwRoute.param[k];
        runMw(mwRoute.mw || [], runPostSteps);
    }

    // post steps are always run, after middleware stack (even if error or call was not routed)
    function runPostSteps(err1) {
        runMw(postSteps, function(err2) {
            if (err1 || err2) runErrorSteps(err1 || err2);
            if (err2) console.error('%s -- microrest: post mw error:', err);
            
            // do not end the response, poorly written middleware could have callbacks pending
            // TODO: time out open responses
            // TODO: should post mw errors be handled with the user-installed handlers?
        })
    }

    function runErrorSteps(err) {
        if (err) runErrorMw(errSteps, err, req, res, function(err) {
            if (err && !res.headersSent) sendResponse(new HttpError(500, err.message), res);
            else if (err) console.error('%s -- microrest: unhandled mw error', err);
        })
    }
}

function toStruct( x ) {
    toStruct.prototype = x;
    return toStruct.prototype;
}


// /** quicktest:

timeit = require('qtimeit');

timeit(100, function(cb) {
    var x = 0;
    repeatUntil(function(next) { next(null, ++x >= 1e4) }, cb)
    // setImmediate: ...
    // nextTick: 23m/s len 10, 27m/s len 20, 30m/s len 40
}, function() {
    console.log("AR: Done.")
});

/**/
