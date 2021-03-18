/*
 * the default rest() returns a fully capable rest app
 */

var files = {
    rest: require('./rest'),
    router: require('./router'),
    mw: require('./mw'),
}
module.exports = function rest(options) {
    var opts = {}, keys = Object.keys(options || {});
    for (var i = 0; i < keys.length; i++) opts[keys[i]] = options[keys[i]];
    opts.router = opts.router || files.router();
    return files.rest(opts);
}
module.exports.createHandler = files.rest.createHandler;
module.exports.createServer = files.rest.createServer;

module.exports.rest = files.rest;
module.exports.router = files.router;
module.exports.mw = files.mw;

module.exports.Rest = files.rest.Rest;
module.exports.NanoRouter = files.rest.NanoRouter;
module.exports.Router = files.router;
