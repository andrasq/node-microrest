var rest = require('./');

module.exports = {
    'package exports index': function(t) {
        var pkg = require('./package.json');
        t.equal(pkg.main, 'index.js');
        t.done();
    },

    'exports the expected functions': function(t) {
        var index = rest;
        t.ok(typeof index, 'function');
        t.ok(typeof index.rest, 'function');
        t.equal(index.router, require('./router'));
        t.equal(index.mw, require('./mw'));
        t.done();
    },

    'exports the expected classes': function(t) {
        var index = rest;
        t.equal(typeof index.Rest, 'function');
        t.equal(index.Rest, require('./rest').Rest);
        t.equal(index.NanoRouter, index.rest.NanoRouter);
        t.equal(index.Router, require('./router'));
        t.done();
    },

    're-exports rest functions': function(t) {
        var index = rest;
        t.equal(index.createHandler, index.rest.createHandler);
        t.equal(index.createServer, index.rest.createServer);
        t.done();
    },

    'rest creates a rest handler': function(t) {
        var app = rest();
        t.ok(app.rest instanceof rest.Rest);
        t.done();
    },

    'rest uses the provided router': function(t) {
        var router = rest.router();
        var app = rest({ router: router });
        t.equal(app.rest.router, router);
        t.done();
    },

    'rest creates a Router by default': function(t) {
        var app = rest();
        t.ok(app.rest.router instanceof rest.Router);
        t.done();
    },
}
