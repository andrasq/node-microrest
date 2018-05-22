/**
 * simple little router for mapped and regex routes
 *
 * 2018-04-15 - AR.
 */

'use strict';

module.exports = Router;

var mw = require('./mw');

function Router( options ) {
    options = options || {};
    this.NotRoutedHttpCode = 404;
    this.steps = {
        pre: new Array(),
        use: new Array(),
        post: new Array(),
        err: new Array(),
// TODO: run post as a finally step, after error handling
// TODO: support only 'use', path, 'err', and 'finally' steps
// TODO: handle uncaughtException too
    };
    this.maproutes = {};                // direct lookup routes
    this.rexroutes = new Array();       // regex matched routes
    this.rexmap = {};                   // matched routes, by path
    this.readBody = options.readBody || mw.readBody;
    this.runMwSteps = options.runMwSteps || mw.runMwSteps;
    this.runMwErrorSteps = options.runMwErrorSteps || mw.runMwErrorSteps;
}

Router.prototype.setRoute = function setRoute( path, method, mwSteps, sentinel ) {
    if (typeof path !== 'string') throw new Error('path is required');
    if (typeof method !== 'string') { sentinel = mwSteps; mwSteps = method; method = '_ANY_'; }
    if (mwSteps && sentinel) throw new Error('setRoute takes a single mw step or an array');
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
        rex.methods[method] = [].concat(this.steps.use, mwSteps);
        this.rexroutes.unshift(rex);
    }
    else {
        if (!this.maproutes[path]) this.maproutes[path] = {};
        this.maproutes[path][method] = this.steps.use.concat(mwSteps);
    }
}

Router.prototype.deleteRoute = function deleteRoute( path, method ) {
    if (this.maproutes[path]) delete this.maproutes[path][method];
    if (this.rexmap[path]) delete this.rexmap[path].methods[method];
}

Router.prototype.getRoute = function getRoute( path, method, route ) {
    var mw;

    if (!path) return null;                             // path is required
    if (this.steps[path]) return this.steps[path];
    if (this.maproutes[path] && (mw = this.maproutes[path][method] || this.maproutes[path]['_ANY_'])) return mw;

    // TODO: maybe match on path prefix, not the whole path (to let mw handle url param extraction)

    mw = this.maproutes[path] && (this.maproutes[path][method] || this.maproutes[path]['_ANY_']);
    if (mw) return mw;                                  // direct-mapped routes

    for (var i=0; i<this.rexroutes.length; i++) {
        var rex = this.rexroutes[i];
        var match = rex.regex.exec(path);
        if (match && (mw = (rex.methods[method] || rex.methods['_ANY_']))) {
            //return { mw: mw, match: match, names: rex.names }
            var route = { mw: mw, params: {} };
            for (var name in rex.names) route.params[name] = match[rex.names[name]];
            //route.path = rex.path;
            return route;                               // regex-mapped routes
        }
    }

    return null;
}

// apply the steps defined for the route to the http request
function _reportCbError(err) { mw.warn('microroute: runRoute cb threw:', err) }
function _tryCb(cb, err, ret) { try { cb(err, ret) } catch (e) { _reportCbError(e) } }
Router.prototype.runRoute = function runRoute( rest, req, res, callback ) {
    var self = this;
    var route;

    var mwSteps = [
        // pre steps are always run, before call is routed
        function runPreRouteSetup(req, res, next) {
            if (!self.steps.pre.length) return next();
            self.runMwSteps(self.steps.pre, req, res, next);
        },
        function doRoute(req, res, next) {
            route = req._route || self.getRoute(req.url, req.method);
            route = self.getRoute(req.url, req.method);
            if (!route) return next(mw.HttpError(self.NotRoutedHttpCode, req.method + ' ' + req.url + ': path not routed'));
            if (route.params) { req.params = req.params || {}; for (var k in route.params) req.params[k] = route.params[k]; }
            // TODO: do not provide the body, make some use() step read it
            (req.body !== undefined) ? next() : mw.mwReadBody(req, res, function(err, body) { next(err) });
        },
        // the call middleware stack includes the relevant 'use' and route steps
        // use 'use' steps to parse the query string and body params
        function runMw(req, res, next) {
            self.runMwSteps(route.mw || route, req, res, next);
        },
    ];

    self.runMwSteps(mwSteps, req, res, function(err1) {
        // post steps are always run, after middleware stack (even if error or call was not routed)
        if (!err1 && !self.steps.post.length) return _tryCb(callback);
        self.runMwSteps(self.steps.post, req, res, function(err2) {
            // TODO: if (req.body === undefined) req.resume();
            if (!err1 && !err2) return _tryCb(callback);

            // TODO: maybe emit errors, so can handle even nested errors

            // error handlers are run if any mw step returned error
            self.runMwErrorSteps(self.steps.err, err1 || err2, req, res, function(err3) {
                if (err3 === err1) console.error('microrest-router: unhandled mw error', err3);
                if (err3 === err2) console.error('microrest-router: unhandled post mw error', err3);
                if (err1 && err2) console.error('microrest-router: double-fault: unhandled error from post mw', err2);
                if (err3 !== err1 && err3 !== err2) console.error('microrest-router: double-fault: unhandled error in mw error handler', err3);
                if (callback) _tryCb(callback, err1 || err2 || err3 || null);

                // TODO: uncaughtException handling -- same as errors?
            })
        })
    })
}

Router.prototype.makeCapturingRegex = function makeCapturingRegex( rex, path ) {
    var patt = this._buildCapturingRegex(path);
    rex.regex = patt.patt;
    for (var i=0; i<patt.names.length; i++) rex.names[patt.names[i]] = i + 1;
}

// borrowed from restiq: (pass in routeName = path)
// build a regex to match the routeName and extract any /:param parameters
Router.prototype._buildCapturingRegex = function _buildCapturingRegex( routeName ) {
    var match, names = new Array();
    var pattern = "^";
    while ((match = routeName.match(/\/:[^/]*/))) {
        if (match.index > 0) pattern += this._regexEscape(routeName.slice(0, match.index));
        pattern += '\\/([^/]*)';
        names.push(match[0].slice(2));
        routeName = routeName.slice(match.index + match[0].length);
    }
    pattern += this._regexEscape(routeName);
    // the route matches if the query string ends here or continues only past / or ?
    pattern += "([/?].*)?$";
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
    // / and is not special in a regex, it matches a literal /.
    // : and = are not special outside of [] ranges or (?) conditionals.
    // ) has to be escaped always, else results in "invalid regex"
    return str.replace(/([.[(*+?{|\\^$=)])/g, '\\$1');
}
