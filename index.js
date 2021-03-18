/*
 * the default rest() returns a fully capable rest app
 */

'use strict';

var files = {
    rest: require('./rest'),
    router: require('./router'),
    mw: require('./mw'),
}
module.exports = function rest(options) {
    if (typeof options === 'function') return files.rest(options);
    var opts = assignTo({ router: files.router() }, options);
    return files.rest(opts);
}
module.exports.createHandler = files.rest.createHandler;
module.exports.createServer = files.rest.createServer;

module.exports.rest = files.rest;
module.exports.router = files.router;
module.exports.mw = files.mw;

module.exports.Rest = files.rest.Rest;
module.exports.NanoRouter = files.rest.Rest.NanoRouter;
module.exports.Router = files.router;
module.exports.HttpError = files.rest.Rest.HttpError;

function assignTo(dst, src) {
    var keys = Object.keys(src || {});
    for (var i = 0; i < keys.length; i++) dst[keys[i]] = src[keys[i]];
    return dst;
}
