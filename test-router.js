'use strict';

var Router = require('./router');

module.exports = {
    setUp: function(done) {
        this.router = new Router();
        this.fn1 = function(req, res, next) { next() };
        this.fn2 = function(req, res, next) { next() };
        this.fne = function(err, req, res, next) { next() };
        done();
    },

    'setRoute': {
        'should route a use step': function(t) {
            this.router.setRoute('use', this.fn1);
            this.router.setRoute('use', 'GET', this.fn2);
            this.router.setRoute('err', [this.fne]);
            t.deepEqual(this.router.getRoute('use'), [this.fn1, this.fn2]);
            t.deepEqual(this.router.getRoute('err'), [this.fne]);
            t.deepEqual(this.router.getRoute('pre'), []);
            t.deepEqual(this.router.getRoute('post'), []);
            t.deepEqual(this.router.getRoute('nonesuch'), null);
            t.done();
        },

        'should return universal routing info': function(t) {
            this.router.setRoute('use', [this.fn1]);
            this.router.setRoute('use', [this.fn2]);
            this.router.setRoute('err', [this.fne]);
            t.contains(this.router.getRoute(), { pre: [], post: [], err: [this.fne] });
            this.router.setRoute('/test/path', [this.fn1]);
            t.deepEqual(this.router.getRoute('/test/path').mw, [this.fn1, this.fn2, this.fn1]);
            t.done();
        },

        'edge cases': {
            'should reject invalid mount path': function(t) {
                try { this.router.setRoute('badwhere', [this.fn1]). t.fail() }
                catch (e) { t.contains(e.message, 'invalid mw mount path'); }
                t.done();
            },

            'should reject multiple mw steps': function(t) {
                try { this.router.setRoute('/path', 'GET', this.fn1, this.fn2); t.fail() }
                catch (e) { t.contains(e.message, 'expected exactly one'); }
                try { this.router.setRoute('/path', this.fn1, this.fn2); t.fail() }
                catch (e) { t.contains(e.message, 'expected exactly one'); }
                t.done();
            },

            'should reject non-function mw': function(t) {
                try { this.router.setRoute('/path', 'GET', [123]); t.fail() }
                catch (e) { t.contains(e.message, 'not a function'); }
                try { this.router.setRoute('/path', [123]); t.fail() }
                catch (e) { t.contains(e.message, 'not a function'); }
                try { this.router.setRoute('/path', 'GET', [this.fn1, 123, this.fn2]); t.fail() }
                catch (e) { t.contains(e.message, 'not a function'); }
                try { this.router.setRoute('/path', [this.fn1, 123, this.fn2]); t.fail() }
                catch (e) { t.contains(e.message, 'not a function'); }
                t.done();
            },

            'should map different methods onto same regex path': function(t) {
                this.router.setRoute('/obj/:foo/:bar', 'GET', [this.fn1]);
                this.router.setRoute('/obj/:foo/:bar', 'PUT', [this.fn2]);
                t.deepEqual(this.router.getRoute('/obj/a/b', 'GET').mw, [this.fn1]);
                t.deepEqual(this.router.getRoute('/obj/a/b', 'GET').params, { foo: 'a', bar: 'b' });
                t.deepEqual(this.router.getRoute('/obj/c/d', 'PUT').mw, [this.fn2]);
                t.deepEqual(this.router.getRoute('/obj/c/d', 'PUT').params, { foo: 'c', bar: 'd' });

                t.deepEqual(this.router.getRoute('/obj/a/', 'POST'), null);
                this.router.setRoute('/obj/:foo/:bar', [this.fn1]);
                t.deepEqual(this.router.getRoute('/obj/x/y', 'POST').mw, [this.fn1]);
                t.deepEqual(this.router.getRoute('/obj/x/y', 'POST').params, { foo: 'x', bar: 'y' });
                t.deepEqual(this.router.getRoute('/obj/x/y', 'HEAD').mw, [this.fn1]);

                t.done();
            },
        },
    },

    'deleteRoute': {
        'should delete matching mapped route': function(t) {
            this.router.setRoute('/test/path', 'GET', [this.fn1]);
            t.ok(this.router.getRoute('/test/path', 'GET'));

            this.router.deleteRoute('/test/path', 'POST');
            t.ok(this.router.getRoute('/test/path', 'GET'));

            this.router.deleteRoute('/test/path', 'GET');
            t.ok(!this.router.getRoute('/test/path', 'GET'));
            t.done();
        },

        'should delete matching regex route': function(t) {
            this.router.setRoute('/:test/path', 'GET', [this.fn1]);
            t.ok(this.router.getRoute('/test/path', 'GET'));

            this.router.deleteRoute('/:test/path', 'POST');
            t.ok(this.router.getRoute('/test/path', 'GET'));

            this.router.deleteRoute('/:test/path', 'GET');
            t.ok(!this.router.getRoute('/test/path', 'GET'));
            t.done();
        },

        'should tolearate missing route': function(t) {
            this.router.deleteRoute('/test/path', 'GET');
            t.done();
        },
    },

    'direct mapped routes': {

        'should route a GET request': function(t) {
            this.router.setRoute('/test/one', 'GET', [this.fn1]);
            this.router.setRoute('/test/two', 'GET', [this.fn2]);
            var route = this.router.getRoute('/test/one', 'GET');
            t.equal(route.mw[0], this.fn1);
            var route = this.router.getRoute('/test/two', 'GET');
            t.equal(route.mw[0], this.fn2);
            var route = this.router.getRoute('/test/three', 'GET');
            t.equal(route, null);
            t.done();
        }
    },

    'regex routes': {
        before: function(done) {
            this.asciiChars = '';
            for (var i = 0; i <= 127; i++) this.asciiChars += String.fromCharCode(i);
            done();
        },

        'should map a regex route': function(t) {
            this.router.setRoute('use', [this.fn1]);
            this.router.setRoute('/:name1/:name2', [this.fn1, this.fn2]);
            var route = this.router.getRoute('/test/one');
            t.deepEqual(route.mw, [this.fn1, this.fn1, this.fn2]);
            t.deepEqual(route.params, { name1: 'test', name2: 'one' });
            t.done();
        },

        '_regexEscape should escape metachars': function(t) {
            var escaped = this.router._regexEscape(this.asciiChars);
            var regex = new RegExp(escaped);
            // with the metachars escaped the string should match itself
            t.ok(regex.exec(this.asciiChars));
            t.done();
        },

        '_buildCapturingRegex should call regexEscape to escape fixed parts of routeName': function(t) {
            var spy = t.spy(this.router, '_regexEscape');
            var pattern = '/foo/:ab*c/bar/:de?f/zed';
            var template = this.router._buildCapturingRegex(pattern);
            spy.restore();
            t.equal(spy.callCount, 3);
            t.equal(spy.args[0][0], '/foo');
            t.equal(spy.args[1][0], '/bar');
            t.equal(spy.args[2][0], '/zed');
            t.done();
        },

        '_buildCapturingRegex should escape metachars': function(t) {
            var template = this.router._buildCapturingRegex(this.asciiChars);
            t.ok(template.patt.exec(this.asciiChars));
            t.done();
        },

        '_buildCapturingRegex should allow metachars in param names': function(t) {
            var pattern = '/:ab*c/:de?f';
            var template = this.router._buildCapturingRegex(pattern);
            var match = template.patt.exec(pattern);
            t.ok(match);
            t.equal(match[1], ':ab*c');
            t.equal(match[2], ':de?f');
            t.done();
        },

    },
}

function noop(){}
