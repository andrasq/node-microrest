'use strict';

var Router = require('./router');
var mw = require('./mw');
var rest = require('./rest');

module.exports = {
    setUp: function(done) {
        this.router = new Router({
            readBody: rest.readBody,
            runMwSteps: mw.runMwSteps,
            runMwErrorSteps: mw.runMwErrorSteps,
        });
        this.fn1 = function fn1(req, res, next) { next() };
        this.fn2 = function fn2(req, res, next) { next() };
        this.fne = function fne(err, req, res, next) { next() };
        done();
    },

    'getRoute': {
        'should return direct-mapped route': function(t) {
            this.router.setRoute('/test/path', this.fn1);
            t.deepEqual(this.router.getRoute('/test/path'), [this.fn1]);
            t.done();
        },

        'should return regex route': function(t) {
            this.router.setRoute('/:name1/:name2/other', this.fn2);
            var route = this.router.getRoute('/test/path/other');
            t.contains(route, { mw: [this.fn2], params: { name1: 'test', name2: 'path' } });
            t.done();
        },

        'should return null if route not mapped': function(t) {
            t.equal(this.router.getRoute(), null);
            t.equal(this.router.getRoute('/other/path'), null);
            t.done();
        },
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

        'edge cases': {
            'should require path': function(t) {
                var router = this.router;
                t.throws(function(){ router.setRoute(noop) }, /path.* required/);
                t.done();
            },

            'should accept any route path': function(t) {
                this.router.setRoute('anywhere', noop);
                t.deepEqual(this.router.getRoute('anywhere'), [noop]);
                t.done();
            },

            'should reject multiple mw steps': function(t) {
                try { this.router.setRoute('/path', 'GET', this.fn1, this.fn2); t.fail() }
                catch (e) { t.contains(e.message, 'takes a single'); }
                try { this.router.setRoute('/path', this.fn1, this.fn2); t.fail() }
                catch (e) { t.contains(e.message, 'takes a single'); }
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
            t.equal(route[0], this.fn1);
            var route = this.router.getRoute('/test/two', 'GET');
            t.equal(route[0], this.fn2);
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

    'runRoute': {
        setUp: function(done) {
            var calls = this.calls = [];
            this.steps = {
                pre1: function(req, res, next) { calls.push('pre1'); next() },
                pre2: function(req, res, next) { calls.push('pre2'); next() },
                use1: function(req, res, next) { calls.push('use1'); next() },
                use2: function(req, res, next) { calls.push('use2'); next() },
                path1: function(req, res, next) { calls.push('path1'); next() },
                path2: function(req, res, next) { calls.push('path2'); next() },
                err1: function(err, req, res, next) { calls.push('err1'); next(err) },
                err2: function(err, req, res, next) { calls.push('err2'); next(err) },
                post1: function(req, res, next) { calls.push('post1'); next() },
                post2: function(req, res, next) { calls.push('post2'); next() },
            };
            this.installRoutes = function() {
                this.router.setRoute('pre', this.steps.pre1);
                this.router.setRoute('pre', this.steps.pre2);
                this.router.setRoute('use', this.steps.use1);
                this.router.setRoute('use', this.steps.use2);
                this.router.setRoute('/test/path', [this.steps.path1, this.steps.path2]);
                this.router.setRoute('err', this.steps.err1);
                this.router.setRoute('err', this.steps.err2);
                this.router.setRoute('post', this.steps.post1);
                this.router.setRoute('post', this.steps.post2);
            }
            this.req = { url: '/test/path', method: 'GET', once: noop, on: noop, body: '' };
            done();
        },

        'should skip err steps if no error': function(t) {
            var calls = this.calls;
            this.installRoutes();
            this.router.runRoute({}, this.req, {}, function(err) {
                t.ok(!err);
                t.deepEqual(calls, ['pre1', 'pre2', 'use1', 'use2', 'path1', 'path2', 'post1', 'post2']);
                t.done();
            })
        },

        'should stop mw on false': function(t) {
            var calls = this.calls;
            this.steps.use1 = function(req, res, next) { calls.push('use1'); next(false) };
            this.installRoutes();
            this.router.runRoute({}, this.req, {}, function(err) {
                t.ok(!err);
                t.deepEqual(calls, ['pre1', 'pre2', 'use1', 'post1', 'post2']);
                t.done();
            })
        },

        'should return error for unmapped path': function(t) {
            this.router.runRoute({}, this.req, {}, function(err) {
                t.ok(err);
                t.equal(err.statusCode, 404);
                t.equal(err.message, '404 Not Found');
                t.done();
            })
        },

        'should omit missing mw steps': function(t) {
            var calls = this.calls;
            this.router.setRoute('/test/path', [this.steps.path1, this.steps.path2]);
            this.router.runRoute({}, this.req, {}, function(err) {
                t.deepEqual(calls, ['path1', 'path2']);
                t.done();
            })
        },

        'should run use steps that existed when path was routed': function(t) {
            var calls = this.calls;
            this.router.setRoute('use', this.steps.use1);
            this.router.setRoute('/test/path', this.steps.path1);
            this.router.setRoute('use', this.steps.use2);
            this.router.runRoute({}, this.req, {}, function(err) {
                t.deepEqual(calls, ['use1', 'path1']);
                t.done();
            })
        },


        'returned mw errors': {

            'should return error from pre step': function(t) {
                var calls = this.calls;
                this.steps.pre1 = function(req, res, next) { calls.push('pre1'); next('mock pre error') };
                this.installRoutes();
                this.router.runRoute({}, this.req, {}, function(err) {
                    t.equal(err, 'mock pre error');
                    t.deepEqual(calls, ['pre1', 'err1', 'err2', 'post1', 'post2']);
                    t.done();
                })
            },

            'should return error from use step': function(t) {
                var calls = this.calls;
                this.steps.use1 = function(req, res, next) { calls.push('use1'); next('mock use error') };
                this.installRoutes();
                this.router.runRoute({}, this.req, {}, function(err) {
                    t.equal(err, 'mock use error');
                    t.deepEqual(calls, ['pre1', 'pre2', 'use1', 'err1', 'err2', 'post1', 'post2']);
                    t.done();
                })
            },

            'should return error from route mw': function(t) {
                var calls = this.calls;
                this.steps.path1 = function(req, res, next) { calls.push('path1'); next('mock route error') };
                this.installRoutes();
                this.router.runRoute({}, this.req, {}, function(err) {
                    t.equal(err, 'mock route error');
                    t.deepEqual(calls, ['pre1', 'pre2', 'use1', 'use2', 'path1', 'err1', 'err2', 'post1', 'post2']);
                    t.done();
                })
            },

            'should return error from post step': function(t) {
                var calls = this.calls;
                this.steps.post1 = function(req, res, next) { calls.push('post1'); next('mock post error') };
                this.installRoutes();
                this.router.runRoute({}, this.req, {}, function(err) {
                    t.equal(err, 'mock post error');
                    t.deepEqual(calls, ['pre1', 'pre2', 'use1', 'use2', 'path1', 'path2', 'post1']);
                    t.done();
                })
            },

            'should report error from err step': function(t) {
                var calls = this.calls;
                this.steps.use1 = function(req, res, next) { calls.push('use1'); next('mock use error') };
                this.steps.err1 = function(err, req, res, next) { calls.push('err1'); next('mock err error 1') };
                this.steps.err2 = function(err, req, res, next) { calls.push('err2'); next('mock err error 2') };
                this.installRoutes();
                var spy = t.spy(process.stderr, 'write');
                this.router.runRoute({}, this.req, {}, function(err) {
                    spy.restore();
                    t.deepEqual(calls, ['pre1', 'pre2', 'use1', 'err1', 'err2', 'post1', 'post2']);
                    t.contains(spy.args[0][0], 'mock err error 1');
                    t.contains(spy.args[1][0], 'mock err error 2');
                    t.done();
                })
            },
        },

        'mw exceptions': {

            'should return error from pre step': function(t) {
                var calls = this.calls;
                this.steps.pre1 = function(req, res, next) { calls.push('pre1'); throw ('mock pre error') };
                this.installRoutes();
                this.router.runRoute({}, this.req, {}, function(err) {
                    t.equal(err, 'mock pre error');
                    t.deepEqual(calls, ['pre1', 'err1', 'err2', 'post1', 'post2']);
                    t.done();
                })
            },

            'should return error from use step': function(t) {
                var calls = this.calls;
                this.steps.use1 = function(req, res, next) { calls.push('use1'); throw ('mock use error') };
                this.installRoutes();
                this.router.runRoute({}, this.req, {}, function(err) {
                    t.equal(err, 'mock use error');
                    t.deepEqual(calls, ['pre1', 'pre2', 'use1', 'err1', 'err2', 'post1', 'post2']);
                    t.done();
                })
            },

            'should return error from route mw': function(t) {
                var calls = this.calls;
                this.steps.path1 = function(req, res, next) { calls.push('path1'); throw ('mock route error') };
                this.installRoutes();
                this.router.runRoute({}, this.req, {}, function(err) {
                    t.equal(err, 'mock route error');
                    t.deepEqual(calls, ['pre1', 'pre2', 'use1', 'use2', 'path1', 'err1', 'err2', 'post1', 'post2']);
                    t.done();
                })
            },

            'should return error from post step': function(t) {
                var calls = this.calls;
                this.steps.post1 = function(req, res, next) { calls.push('post1'); throw ('mock post error') };
                this.installRoutes();
                this.router.runRoute({}, this.req, {}, function(err) {
                    t.equal(err, 'mock post error');
                    t.deepEqual(calls, ['pre1', 'pre2', 'use1', 'use2', 'path1', 'path2', 'post1']);
                    t.done();
                })
            },

            'should report error from err step': function(t) {
                var calls = this.calls;
                this.steps.use1 = function(req, res, next) { calls.push('use1'); next('mock use error') };
                this.steps.err1 = function(err, req, res, next) { calls.push('err1'); throw ('mock err error 1') };
                this.steps.err2 = function(err, req, res, next) { calls.push('err2'); throw ('mock err error 2') };
                this.installRoutes();
                var spy = t.spy(process.stderr, 'write');
                this.router.runRoute({}, this.req, {}, function(err) {
                    spy.restore();
                    t.deepEqual(calls, ['pre1', 'pre2', 'use1', 'err1', 'err2', 'post1', 'post2']);
                    t.contains(spy.args[0][0], 'mock err error 1');
                    t.contains(spy.args[1][0], 'mock err error 2');
                    t.done();
                })
            },
        },

        'should catch exception in mw callback': function(t) {
            this.installRoutes();
            this.router.runRoute({}, this.req, {}, function(err) {
                throw 'error in callback';
            })
            setTimeout(function() {
                t.done();
            }, 2);
        },
    },
}

function noop(){}
