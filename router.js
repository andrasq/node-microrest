/**
 * simple little router for mapped and regex routes
 *
 * 2018-04-15 - AR.
 */

'use strict';

module.exports = Router;
module.exports.NanoRouter = NanoRouter;

var mw = require('./mw');


function NanoRouter( ) {
    this.use = new Array();
    this.routes = {};
}
NanoRouter.prototype.setRoute = function setRoute( path, mw ) {
    if (typeof path === 'function') this.use.push(path);
    else {
        var mwSteps = this.routes[path] = this.use.concat(mw);
        for (var i=this.use.length; i<mwSteps.length; i++) {
            if (typeof mwSteps[i] !== 'function') throw new Error('middleware step must be a function');
        }
    }
}
NanoRouter.prototype.getRoute = function getRoute( path, method ) {
    var mwSteps = this.routes[path];
    while (!mwSteps && path.length > 1) mwSteps = this.routes[path = path.slice(path, path.lastIndexOf('/')) || '/'];
    return mwSteps;
}
NanoRouter.prototype.deleteRoute = function deleteRoute( path, method ) {
    delete this.routes[path];
}
NanoRouter.prototype.runRoute = function runRoute( rest, req, res, next ) {
    var mwSteps = this.getRoute(req.url);
    if (!mwSteps) return next(new Error('Cannot ' + (req.method || 'GET') + ' ' + req.url + ', path not routed'));
    mw.runMwSteps(mwSteps, req, res, function(err) {
        if (err) return next(err);
        next();
    })
}

function Router( ) {
    this.steps = {
        pre: new Array(),
        use: new Array(),
        post: new Array(),
        err: new Array(),
// TODO: handle uncaughtException too
    };
    this.maproutes = {};                // direct lookup routes
    this.rexroutes = new Array();       // regex matched routes
    this.rexmap = {};                   // matched routes, by path
}

Router.prototype.setRoute = function setRoute( path, method, mwSteps, sentinel ) {
    if (typeof method !== 'string' || sentinel) {
        if (mwSteps) throw new Error('expected exactly one mw step or array');
        mwSteps = method;
        method = '_ANY_';
    }
    if (!Array.isArray(mwSteps)) mwSteps = [mwSteps];
    for (var i=0; i<mwSteps.length; i++) {
        if (typeof mwSteps[i] !== 'function') throw new Error('mw step [' + i + '] not a function');
    }

    if (path[0] === '/') {
        if (path.indexOf('/:') < 0) {
            this.maproutes[path] = this.maproutes[path] || {};
            this.maproutes[path][method] = this.steps.use.concat(mwSteps);
        } else {
            var rex = this.rexmap[path] = this.rexmap[path] || { path: path, regex: null, names: {}, methods: {} };
            if (!rex.regex) this.makeCapturingRegex(rex, path);
            rex.methods[method] = this.steps.use.concat(mwSteps);
            // new route overrides previous
            this.rexroutes.unshift(rex);
        }
    }
    else if (this.steps[path]) {
        this.steps[path] = this.steps[path].concat(mwSteps);
    }
    else throw new Error(path + ': invalid mw mount path');
}

Router.prototype.deleteRoute = function deleteRoute( path, method ) {
    if (this.maproutes[path]) delete this.maproutes[path][method];
    if (this.rexmap[path]) delete this.rexmap[path].methods[method];
}

Router.prototype.getRoute = function getRoute( path, method, route ) {
    var mw;

    if (!path) return null;                             // path is required
    if (path[0] !== '/') return this.steps[path];       // pre-, post-, use- and err-middleware

    // TODO: maybe match on path prefix, not the whole path (to let mw handle url param extraction)

    mw = this.maproutes[path] && (this.maproutes[path][method] || this.maproutes[path]['_ANY_']);
    if (mw) return { mw: mw };                          // direct-mapped routes

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
Router.prototype.runRoute = function runRoute( rest, req, res, callback ) {
    var self = this;
    var route;

    var mwSteps = [
        // pre steps are always run, before call is routed
        function runPreRouteSetup(req, res, next) {
            if (!self.steps.pre.length) return next();
            mw.runMwSteps(self.steps.pre, req, res, next);
        },
        function doRoute(req, res, next) {
            route = self.getRoute(req.url, req.method);
            if (!route) return next(rest.HttpError(rest.NotRoutedHttpCode, req.method + ' ' + req.url + ': path not routed'));
            if (route.params) { req.params = req.params || {}; for (var k in route.params) req.params[k] = route.params[k]; }
            next();
        },
        function readBodyBeforeMw(req, res, next) {
            // TODO: readBody should live in mw, but also needed by rest.js
            (req.body !== undefined) ? next() : rest.readBody(req, res, function(err, body) { next(err) });
            // TODO: do not read body by default, let mw handle it
        },
        // the call middleware stack includes the relevant 'use' and route steps
        // use 'use' steps to parse the query string and body params
        function runMw(req, res, next) {
            mw.runMwSteps(route.mw || route, req, res, next);
        },
    ];

    mw.runMwSteps(mwSteps, req, res, function(err1) {
        // post steps are always run, after middleware stack (even if error or call was not routed)
        if (!err1 && !self.steps.post.length) return callback();
        mw.runMwSteps(self.steps.post, req, res, function(err2) {
            // TODO: if (req.body === undefined) req.resume();
            if (!err1 && !err2) return callback();

            // TODO: maybe emit errors, so can handle even nested errors

            // error handlers are run if any mw step returned error
            mw.runMwErrorSteps(self.steps.err, err1 || err2, req, res, function(err3) {
                if (err3 === err1) console.error('microrest-router: unhandled mw error', err3);
                if (err3 === err2) console.error('microrest-router: unhandled post mw error', err3);
                if (err1 && err2) console.error('microrest-router: double-fault: unhandled error from post mw', err2);
                if (err3 !== err1 && err3 !== err2) console.error('microrest-router: double-fault: unhandled error in mw error handler', err3);
                if (callback) return callback(err1 || err2 || err3 || null);

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
