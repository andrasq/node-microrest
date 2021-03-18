/**
 * simple little router for mapped and regex routes
 *
 * Copyright (C) 2018-2021 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * 2018-04-15 - AR.
 */

'use strict';

module.exports = Router;

var mw = require('./mw');

function Router( options ) {
    if (!(this instanceof Router)) return new Router(options);
    options = options || {};
    this.NotRoutedHttpCode = 404;
    this.steps = {
        pre: new Array(),
        use: new Array(),
        err: new Array(),
        post: new Array(),
// TODO: support only 'use', path, 'err', and 'finally' steps
// TODO: handle uncaughtException too
    };
    this.maproutes = {};                // direct lookup routes
    this.rexroutes = new Array();       // regex matched routes
    this.rexmap = {};                   // matched routes, by path
    this.HttpError = mw.HttpError;
    var readBody = options.readBody;
    this.readBody = readBody ? function _readBody(req, res, next, ctx) { readBody(req, res, function(err) { next(err, ctx) }) } : mw.mwReadBody;
    this.runMwSteps = options.runMwSteps || mw.runMwSteps;
    this.runMwStepsContext = options.runMwStepsContext || mw.runMwStepsContext;
    this.runMwErrorSteps = options.runMwErrorSteps || mw.runMwErrorSteps;
    this.runMwErrorStepsContext = options.runMwErrorStepsContext || mw.runMwErrorStepsContext;
}

Router.prototype.setRoute = function setRoute( path, method, mwSteps, sentinel ) {
    if (typeof path !== 'string') throw new Error('path is required');
    if (typeof method !== 'string') { sentinel = mwSteps; mwSteps = method; method = '_ANY_'; }
    if (mwSteps && sentinel !== undefined) throw new Error('setRoute takes a single mw step or an array');
    if (!Array.isArray(mwSteps)) mwSteps = [mwSteps];
    for (var i=0; i<mwSteps.length; i++) {
        if (typeof mwSteps[i] !== 'function') throw new Error('mw step [' + i + '] not a function');
    }

    if (this.steps[path]) {
        this.steps[path] = this.steps[path].concat(mwSteps);
    }
    else if (path[0] === '/' && path.indexOf('/:') >= 0) {
        var rex = this.rexmap[path] = this.rexmap[path] || { path: path, regex: null, names: {}, methods: {} };
        if (!rex.regex) this.makeCapturingRegex(rex, path);
        rex.methods[method.toUpperCase()] = [].concat(this.steps.use, mwSteps);
        this.rexroutes.unshift(rex);
    }
    else {
        if (!this.maproutes[path]) this.maproutes[path] = {};
        this.maproutes[path][method.toUpperCase()] = this.steps.use.concat(mwSteps);
    }
}

Router.prototype.deleteRoute = function deleteRoute( path, method ) {
    if (this.steps[path]) this.steps[path] = new Array();
    if (this.maproutes[path]) delete this.maproutes[path][method];
    if (this.rexmap[path]) delete this.rexmap[path].methods[method];
}

Router.prototype.getRoute = function getRoute( path, method, route ) {
    var mw, mark;

    if (!path) return null;                             // path is required
    if ((mark = path.indexOf('?')) >= 0) path = path.slice(0, mark);
    if (this.steps[path]) return this.steps[path];      // use-, pre-, err- and post- steps
    mw = this.maproutes[path] && (this.maproutes[path][method] || this.maproutes[path]['_ANY_']);
    if (mw) return mw;                                  // direct-mapped routes

    for (var i=0; i<this.rexroutes.length; i++) {       // regex-mapped routes
        var rex = this.rexroutes[i];
        var match = rex.regex.exec(path);
        if (match && (mw = (rex.methods[method] || rex.methods['_ANY_']))) {
            var route = { mw: mw, params: {}, path: rex.path };
            for (var name in rex.names) route.params[name] = match[rex.names[name]];
// TODO: return longest match, not first match.  Eg, /this/is/a vs /this/is/a/long (can find min(tail.length))
            return route;
        }
    }

    return null;
}

// apply the steps defined for the route to the http request
function _reportCbError(err) { mw.warn('Route: runRoute cb threw:', err) }
function _tryCb(cb, err, ret) { try { cb(err, ret) } catch (e) { _reportCbError(e) } }
Router.prototype.runRoute = function runRoute( rest, req, res, callback ) {
    var context = { self: this, rest: rest, req: req, res: res, callback: callback, ix: 0, steps: null };
    runMwChain(context);

    function runMwChain(ctx) {
        // pre steps are always run, before call is routed
        ctx.self.runMwStepsContext(ctx.self.steps.pre, ctx, runDoRouteStep);
    }
    function runDoRouteStep(err, ctx) {
        if (err) return runErrorRoute(err, ctx);
        // route if not already routed
        if (!ctx.req._route) {
            ctx.req._route = ctx.self.getRoute(ctx.req.url, ctx.req.method);
            if (!ctx.req._route) return ctx.callback(ctx.self.HttpError(ctx.self.NotRoutedHttpCode, ctx.req.method + ' ' + ctx.req.url + ': path not routed'));
            if (ctx.req._route.params) { ctx.req.params = ctx.req.params || {}; for (var k in ctx.req._route.params) ctx.req.params[k] = ctx.req._route.params[k]; }
        }
        // read body if not already read
        // TODO: do not auto-read, make a some mw step read
        // TODO: change readBody to return the context
        (ctx.req.body !== undefined) ? runMwRoute(null, ctx) : ctx.self.readBody(ctx.req, ctx.res, runMwRoute, ctx);
    }
    function runMwRoute(err, ctx) {
        // TODO: FIXME: always run the 'use' steps, do not combine with routed path
        // the call middleware stack includes the relevant 'use' and route steps
        err ? runErrorRoute(err, ctx) : ctx.self.runMwStepsContext(req._route.mw || req._route, ctx, runErrorRoute);
    }
    function runErrorRoute(err1, ctx) {
        ctx.req.resume();
        if (!err1 && !ctx.self.steps.post.length) return _tryCb(ctx.callback);
        ctx.err1 = err1;
        ctx.self.runMwErrorStepsContext(err1 ? ctx.self.steps.err : [], ctx, err1, runPostSteps);
    }
    // post steps are always run, after mw stack and error handler
    function runPostSteps(err2, ctx) {
        ctx.err2 = err2 = ctx.err2 || err2;
        if (err2 && err2 !== ctx.err1 && ctx.rest && typeof ctx.rest.reportError === 'function') ctx.rest.reportError(err2, 'error-mw error');
        ctx.self.runMwStepsContext(ctx.self.steps.post, ctx, runReturnStep);
    }
    function runReturnStep(err3, ctx) {
        if (err3 && ctx.err1 && ctx.rest && typeof ctx.rest.reportError === 'function') ctx.rest.reportError(err3, 'post-mw error');
        _tryCb(ctx.callback, ctx.err1 || err3 || null);
    }
}

Router.prototype.makeCapturingRegex = function makeCapturingRegex( rex, path ) {
    var patt = this._buildCapturingRegex(path);
    rex.regex = patt.patt;
    for (var i=0; i<patt.names.length; i++) rex.names[patt.names[i]] = i + 1;
}

// adapted from restiq: (pass in routeName = path)
// build a regex to match the routeName and extract any /:param parameters
Router.prototype._buildCapturingRegex = function _buildCapturingRegex( routeName ) {
    var match, names = new Array();
    var pattern = "^";
    while ((match = routeName.match(/\/:[^/]*/))) {
        if (match.index > 0) pattern += this._regexEscape(routeName.slice(0, match.index));
        var name = match[0].slice(2), matchTail = (name[0] === '*');
        names.push(matchTail && name.length > 1 ? name.slice(1) : name);
        if (matchTail) pattern += "(/[^?#]*)?";         // '/:*' matches rest of path
        else pattern += '\\/([^/]*)';                   // '/:name' matches one path component
        routeName = routeName.slice(match.index + match[0].length);
    }
    pattern += this._regexEscape(routeName);
    // the route matches if the url ends here (no /*-tail) or continues only past ? or #
    pattern += "([?#]|$)";
    return {patt: new RegExp(pattern), names: names};
}

// borrowed from restiq:
// backslash-escape the chars that have special meaning in regex strings
Router.prototype._regexEscape = function _regexEscape( str ) {
    // For PCRE or POSIX, the regex metacharacters are:
    //   . [ (          - terms
    //   * + ? {        - repetition specifiers
    //   |              - alternation
    //   \              - escape char
    //   ^ $            - anchors
    //   )              - close paren (else invalid node regex)
    // Matching close chars ] } are not special without the open char.
    // / is not special in a regex, it matches a literal /.
    // : and = are not special outside of [] ranges or (?) conditionals.
    // ) has to be escaped always, else results in "invalid regex"
    return str.replace(/([.[(*+?{|\\^$=)])/g, '\\$1');
}
