/**
 * Copyright (C) 2018-2021 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var events = require('events');
var mw = require('./mw');

var setImmediate = eval('global.setImmediate || function(fn, a, b, c) { process.nextTick(function() { fn(a, b, c) }) }');
var fromBuf = eval('parseInt(process.versions.node) >= 10 ? Buffer.from : Buffer');

module.exports = {

    'should export expected mw runner functions': function(t) {
        var expect = {
            repeatUntil:1, runMwSteps:1, runMwErrorSteps:1,
            runMwStepsContext:1, runMwErrorStepsContext:1,
        };
        for (var method in expect) t.equal(typeof mw[method], 'function');
        t.done();
    },

    'should export expected mw helpers': function(t) {
        var expect = {
            buildReadBody:1, buildParseQuery:1,
            mwReadBody:1, mwParseQuery:1, writeResponse:1,
        };
        for (var method in expect) t.equal(typeof mw[method], 'function');
        t.done();
    },

    'HttpError': {
        'should encode statusCode, message, debug': function(t) {
            var err = new mw.HttpError(404, 'my error message');
            t.equal(err.statusCode, 404);
            t.equal(err.message, '404 Not Found');
            t.equal(err.debug, 'my error message');

            // without params
            var err = new mw.HttpError();
            t.equal(err.statusCode, 500);
            t.equal(err.message, '500 Internal Error');

            // with just a status code
            var err = new mw.HttpError(401);
            t.equal(err.statusCode, 401);
            t.equal(err.message, '401 Unauthorized');

            // with a custom status code
            var err = new mw.HttpError(999);
            t.equal(err.statusCode, 999);
            t.equal(err.message, '999 Internal Error');

            // with an object statusCode
            var err = new mw.HttpError({ code: 'MOCK', statusCode: 789 }, 'my message', 'mock error');
            t.equal(err.code, 'MOCK');
            t.equal(err.statusCode, 789);
            t.equal(err.debug, 'my message');
            t.equal(err.details, 'mock error');
            t.equal(err.message, '789 Internal Error');

            // with an empty object statusCode
            var err = new mw.HttpError({}, 'my error message');
            t.equal(err.code, undefined);
            t.equal(err.statusCode, 500);

            t.done();
        },
    },

    'repeatUntil': {
        'should run 1 times': function(t) {
            var retvals = ['done'];
            var spy = t.spy({}, 'fn', function(cb){ cb(null, retvals.shift()) });
            mw.repeatUntil(spy, null, function(err) {
                t.equal(spy.callCount, 1);
                t.done();
            })
        },

        'should run 5 times': function(t) {
            var retvals = [0, 0, 0, 0, 1];
            var spy = t.spy({}, 'fn', function(cb){ cb(null, retvals.shift()) });
            mw.repeatUntil(spy, null, function(err) {
                t.equal(spy.callCount, 5);
                t.done();
            })
        },

        'should run 2 times stopped by test': function(t) {
            var retvals = [0, 1];
            var spy = t.spy({}, 'fn', function(){ return retvals.shift() });
            mw.repeatUntil(function(cb){ cb() }, null, spy, function(err) {
                t.equal(spy.callCount, 2);
                t.done();
            })
        },

        'should pass arg to callback': function(t) {
            var retvals = [0, 1];
            var arg = {};
            var spy = t.spy({}, 'fn', function(){ return retvals.shift() });
            mw.repeatUntil(function(cb){ cb() }, arg, spy, function(err, ret) {
                t.equal(ret, arg);
                t.done();
            })
        },

        'should return error on second callback': function(t) {
            var fn = function(cb){ setImmediate(cb, null, true); setImmediate(cb, 2, true); setTimeout(cb, 2); };
            var spy = t.spy({}, 'fn', function(err) {
                if (spy.callCount === 1) {
                    t.ifError(err);
                    t.strictEqual(spy.args[0][0], null);
                }
                if (spy.callCount === 2) {
                    t.ok(err);
                    t.contains(err.message, 'callback already called');
                }
                if (spy.callCount === 3) {
                    t.ok(err);
                    t.contains(err.message, 'callback already called');
                    t.done();
                }
            });
            t.expect(6);
            mw.repeatUntil(fn, null, spy)
        },

        'should catch error thrown in callback': function(t) {
            var ncalls = 0;
            t.expect(2);
            mw.repeatUntil(function(cb) { cb(null, true) }, null, function(){ return true }, function(err) {
                if (ncalls++ == 0) {
                    t.ok(!err);
                    throw 'mock callback error';
                }
                t.ok(err);
                t.done();
            })
        },

        'should be fast': function(t) {
            var mark = process.hrtime();
            var startTime = process.hrtime();
            var n = 0, limit = 1e6;
            function iterator(cb, arg) { cb(null, n++ >= limit) }
            mw.repeatUntil(iterator, null, function(err) {
                var endTime = process.hrtime();
                var elapsed = (endTime[0] - startTime[0]) * 1000 + (endTime[1] - startTime[1]) / 1e6;
                var overhead = (startTime[0] - mark[0]) * 1000 + (startTime[1] - mark[1]) / 1e6;
                console.log("repeatUntil: %d in %d - %d ms, %d/ms", limit, elapsed, overhead, limit / (elapsed - overhead));
                t.done();
            })
        },

        'should work with node-v0.10': function(t) {
            var savedVersion = process.version;
            Object.defineProperty(process, 'version', { value: 'v0.10.48' });
            t.unrequire('./mw');
            var mw = require('./mw');
            var ncalls = 0;
            mw.repeatUntil(function(cb, arg) { cb() }, 19991, function(err, done) { return ++ncalls >= 40 }, function(err, arg) {
                Object.defineProperty(process, 'version', { value: savedVersion });
                t.unrequire('./mw');
                t.equal(arg, 19991);
                t.done();
            })
        },
    },

    'runMwSteps': {
        'should call repeatUntil': function(t) {
            var spy = t.spyOnce(mw, 'repeatUntil');
            var req = {}, res = {};
            mw.runMwSteps([ function(q,s,n) { n() } ], 1234, req, res, function(err, arg) {
                t.ifError(err);
                t.equal(arg, 1234);
                t.ok(spy.called);
                t.contains(spy.args[0][1], { req: req, res: res, arg: 1234 });
                t.done();
            })
        },

        'should call all steps': function(t) {
            var calls = [];
            var steps = [ function(q,s,n) { calls.push(1); n() }, function(q,s,n) { calls.push(2); n() } ];
            mw.runMwSteps(steps, 12345, {}, {}, function(err, arg) {
                t.equal(arg, 12345);
                t.deepEqual(calls, [1, 2]);
                t.done();
            })
        }
    },

    'runMwErrorSteps': {
        'should call repeatUntil': function(t) {
            var spy = t.spy(mw, 'repeatUntil');
            var err = {}, req = {}, res = {};
            mw.runMwErrorSteps([ function(e,q,s,n) { n(e) } ], 4321, err, req, res, function(err2, arg) {
                t.equal(err2, err);
                t.equal(arg, 4321);
                t.ok(spy.called);
                t.contains(spy.args[0][1], { err: err, req: req, res: res, arg: 4321 });
                t.done();
            })
        },

        'should try each error handler and return declined error': function(t) {
            var calls = [];
            var steps = [ function(e,q,s,n) { calls.push(1); n(e) }, function(e,q,s,n) { calls.push(2); n(e) } ];
            var err = {};
            mw.runMwErrorSteps(steps, 12345, err, {}, {}, function(err2, arg) {
                t.equal(err2, err);
                t.equal(arg, 12345);
                t.deepEqual(calls, [1, 2]);
                t.done();
            })
        },

        'should try error handlers until one handles the error and return null': function(t) {
            var calls = [];
            var steps = [
                function(e,q,s,n) { calls.push(1); n(e) }, function(e,q,s,n) { calls.push(2); n() }, function(e,q,s,n) { calls.push(3); n() }
            ];
            var err = {};
            mw.runMwErrorSteps(steps, 12345, err, {}, {}, function(err2, arg) {
                t.equal(err2, null);
                t.equal(arg, 12345);
                t.deepEqual(calls, [1, 2]);
                t.done();
            })
        }
    },

    'sendResponse': {
        setUp: function(done) {
            this.req = {};
            this.res = {
                _headers: {},
                setHeader: function(k, v) { this._headers[k] = v },
                write: noop,
                end: noop,
            }
            done();
        },

        'should write status code, headers and body': function(t) {
            var spyEnd = t.spyOnce(this.res, 'end');
            mw.sendResponse(this.req, this.res, noop, null, null, 'mock body', { 'my-header-1': 1 });
            t.equal(this.res.statusCode, 200);
            t.contains(this.res._headers, {'my-header-1': 1});
            t.deepEqual(spyEnd.args[0], ['mock body']);

            var spyEnd = t.spyOnce(this.res, 'end');
            mw.sendResponse(this.req, this.res, noop, null, null, fromBuf('mock body'), { 'my-header-1': 1, 'my-header-2': 2 });
            t.equal(this.res.statusCode, 200);
            t.contains(this.res._headers, {'my-header-1': 1, 'my-header-2': 2});
            t.deepEqual(spyEnd.args[0], [fromBuf('mock body')]);

            var spyEnd = t.spyOnce(this.res, 'end');
            mw.sendResponse(this.req, this.res, noop, null, 201, { mock: 1, body: 2 });
            t.equal(this.res.statusCode, 201);
            t.deepEqual(spyEnd.args[0], ['{"mock":1,"body":2}']);

            var spyEnd = t.spyOnce(this.res, 'end');
            mw.sendResponse(this.req, this.res, noop, null, 202, null);
            t.equal(this.res.statusCode, 202);
            // treat `null` as an object, and json encode it
            t.deepEqual(spyEnd.args[0], ['null']);

            var spyEnd = t.spyOnce(this.res, 'end');
            mw.sendResponse(this.req, this.res, noop, null, 202);
            t.equal(this.res.statusCode, 202);
            t.deepEqual(spyEnd.args[0], []);

            var spyEnd = t.spyOnce(this.res, 'end');
            mw.sendResponse(this.req, this.res, noop, null, 203, false);
            t.equal(this.res.statusCode, 203);
            t.deepEqual(spyEnd.args[0], ['false']);

            var spyEnd = t.spyOnce(this.res, 'end');
            mw.sendResponse(this.req, this.res, noop, null, 204, 0);
            t.equal(this.res.statusCode, 204);
            t.deepEqual(spyEnd.args[0], [0]);

            t.done();
        },

        'should write erorr': function(t) {
            var spyEnd = t.spyOnce(this.res, 'end');
            mw.sendResponse(this.req, this.res, noop, new Error(''));
            t.equal(this.res.statusCode, 500);
            t.deepEqual(JSON.parse(spyEnd.args[0]), { error: 500, message: 'Internal Error', debug: '' });

            var spyEnd = t.spyOnce(this.res, 'end');
            var err = new Error('my mock error'); err.code = 'EMOCKE';
            mw.sendResponse(this.req, this.res, noop, err);
            t.equal(this.res.statusCode, 500);
            t.deepEqual(JSON.parse(spyEnd.args[0]), { error: 'EMOCKE', message: 'my mock error', debug: '' });

            var spyEnd = t.spyOnce(this.res, 'end');
            mw.sendResponse(this.req, this.res, noop, new mw.HttpError(404, 'my page not found', 'check again'));
            t.equal(this.res.statusCode, 404);
            t.deepEqual(JSON.parse(spyEnd.args[0]), { error: 404, message: '404 Not Found', debug: 'my page not found', details: 'check again' });

            t.done();
        },

        'errors': {
            'should catch json encode errors': function(t) {
                var spyEnd = t.stubOnce(this.res, 'end');
                var body = { x: 1, body: body, y: 2, z: 'three' };
                body.body = body;
                mw.sendResponse(this.req, this.res, noop, null, 200, body);
                t.contains(spyEnd.args[0][0], 'unable to json encode response');
                t.contains(spyEnd.args[0][0], ' containing x,body,y,z');
                t.contains(spyEnd.args[0][0], ' circular ');

                t.done();
            },

            'should catch and return res.setHeader errors': function(t) {
                t.stubOnce(this.res, 'setHeader').throws('mock res.setHeader error');
                var self = this;
                mw.sendResponse(this.req, this.res, callback, null, 200, 'mock body', {'hdr1': 1});
                function callback(err) {
                    t.ok(err);
                    t.equal(err, 'mock res.setHeader error')
                    t.done();
                }
            },

            'should catch and return res.end errors': function(t) {
                t.stubOnce(this.res, 'end').throws('mock res.end error');
                var self = this;
                mw.sendResponse(this.req, this.res, callback, null, 200, 'mock body');
                function callback(err) {
                    t.ok(err);
                    t.equal(err, 'mock res.end error')
                    t.done();
                }
            },
        },
    },

    'parseQuery': {
        'should parse query strings': function(t) {
            var tests = [
                [ "", {} ],
                [ "abc", { abc: 1 } ],
                [ "a=1&b=2", { a: 1, b: 2 } ],
                [ "&&a=1&&&b=2&&", { a: 1, b: 2 } ],
                [ "a&b&c=&d", { a: 1, b: 1, c: '', d: 1 } ],
                [ "a=1&a=2&a=3&a", { a: [1, 2, 3, 1] } ],

                [ "a%20b=1&b=%20", { 'a b': 1, b: ' ' } ],
                [ "a%20b=%20&b=%ff", { 'a b': ' ', b: '%ff' } ],
                [ "a%20b=%20&b=%7e", { 'a b': ' ', b: '~' } ],

                [ "a[b]=2&b[0]", { 'a[b]': 2, 'b[0]': 1 } ],
                [ "=&=&&==", { } ],
                [ "a===&===", { a: '==' } ],
                [ "&&&", { '': [1, 1, 1] } ],
                [ "&=&=&=", { '': [1, '', '', ''] } ],

                [ "a+b=1&c=++", { 'a b': 1, c: '  ' } ],
            ];

            for (var i=0; i<tests.length; i++) {
                t.contains(mw.parseQuery(tests[i][0]), tests[i][1], 'tests[' + i + ']');
            }

            t.done();
        },

        'mwParseQuery should parse url querystring query': function(t) {
            var req = { url: '/path?a=1&b=t%77o&' };
            mw.mwParseQuery(req, {}, function(err) {
                t.deepEqual(req.params, { a: 1, b: 'two' });
                t.done();
            })
        },

        'mwParseQuery should not parse #hash': function(t) {
            var req = { url: '/path?a=1&b=t%77o&#hash=tag' };
            mw.mwParseQuery(req, {}, function(err) {
                t.deepEqual(req.params, { a: 1, b: 'two' });
                t.done();
            })
        },

        'mwParseQuery should allow missing query': function(t) {
            var req = { url: '/path#hash=tag' };
            mw.mwParseQuery(req, {}, function(err) {
                t.deepEqual(req.params, { });
                t.done();
            })
        },

        'should set req.path and req.query': function(t) {
            var req = { url: '/v1/rest/call?x=1&y=two#offset' };
            mw.buildParseQuery()(req, {}, function(err) {
                t.ifError(err);
                t.deepEqual(req.params, { x: 1, y: 'two' });
                t.equal(req.path, '/v1/rest/call');
                t.equal(req.query, 'x=1&y=two');
                t.done();
            })
        },
    },

    'buildReadBody': {
        'should build readBody with custom bodySizeLimit': function(t) {
            var fn = mw.buildReadBody({ bodySizeLimit: 1 });
            var req = mockReq();
            fn(req, {}, function(err) {
                t.ok(err);
                t.contains(err.debug, 'max body size');
                t.done();
            })
            req.emit('data', 'test');
            req.emit('end');
        },
    },

    'readBody': {
        setUp: function(done) {
            this.req = mockReq();
            // mock internal fingerprint of req.setEncoding('utf8');
            this.req._readableState = { encoding: 'utf8' };
            this.req.socket = { end: noop };
            done();
        },

        'should gather 1 string chunk': function(t) {
            var req = this.req;
            mw.mwReadBody(req, {}, function(err, ctx, body) {
                t.equal(body, 'chunk1');
                t.equal(req.body, body);
                t.done();
            })
            req.emit('data', 'chunk1');
            req.emit('end');
        },

        'should gather 2 string chunks': function(t) {
            var req = this.req;
            mw.mwReadBody(req, {}, function(err, ctx, body) {
                t.equal(body, 'chunk1chunk2');
                t.equal(req.body, body);
                t.done();
            })
            req.emit('data', 'chunk1');
            req.emit('data', 'chunk2');
            req.emit('end');
        },

        'should gather 3 string chunks': function(t) {
            var req = this.req;
            mw.mwReadBody(req, {}, function(err, ctx, body) {
                t.equal(body, 'chunk1chunk2chunk3');
                t.equal(req.body, body);
                t.done();
            })
            req.emit('data', 'chunk1');
            req.emit('data', 'chunk2');
            req.emit('data', 'chunk3');
            req.emit('end');
        },

        'should gather 1 buffer chunk': function(t) {
            var req = this.req;
            mw.mwReadBody(req, {}, function(err, ctx, body) {
                t.ok(Buffer.isBuffer(body));
                t.equal(body.toString(), 'chunk1');
                t.equal(req.body, body);
                t.done();
            })
            req.emit('data', fromBuf('chunk1'));
            req.emit('end');
        },

        'should gather 2 buffer chunks': function(t) {
            var req = this.req;
            mw.mwReadBody(req, {}, function(err, ctx, body) {
                t.ok(Buffer.isBuffer(body));
                t.equal(body.toString(), 'chunk1chunk2');
                t.equal(req.body, body);
                t.done();
            })
            req.emit('data', fromBuf('chunk1'));
            req.emit('data', fromBuf('chunk2'));
            req.emit('end');
        },

        'should gather 3 buffer chunks': function(t) {
            var req = this.req;
            mw.mwReadBody(req, {}, function(err, ctx, body) {
                t.ok(Buffer.isBuffer(body));
                t.equal(body.toString(), 'chunk1chunk2chunk3');
                t.equal(req.body, body);
                t.done();
            })
            req.emit('data', fromBuf('chunk1'));
            req.emit('data', fromBuf('chunk2'));
            req.emit('data', fromBuf('chunk3'));
            req.emit('end');
        },

        'should gather single buffer': function(t) {
            var req = this.req;
            var buff = fromBuf('chunk1');
            mw.mwReadBody(req, {}, function(err, ctx, body) {
                t.equal(body, buff);
                t.strictEqual(req.body, body);
                t.done();
            })
            req.emit('data', buff);
            req.emit('end');
        },

        'should gather empty string body': function(t) {
            var req = this.req;
            mw.mwReadBody(req, {}, function(err, ctx, body) {
                t.equal(body, '');
                t.strictEqual(req.body, body);
                t.done();
            })
            req.emit('end');
        },

        'should gather empty buffer body': function(t) {
            var req = this.req;
            req._readableState.encoding = null;
            mw.mwReadBody(req, {}, function(err, ctx, body) {
                t.ok(Buffer.isBuffer(body));
                t.equal(body.toString(), '');
                t.strictEqual(req.body, body);
                t.done();
            })
            req.emit('end');
        },

        'edge cases': {
            'should do nothing if req.body already set': function(t) {
                var req = this.req;
                this.req.body = "abc";
                var spy = t.spy(req, 'on');
                mw.mwReadBody(this.req, {}, function(err, ctx, body) {
                    t.ok(!spy.called);
                    t.equal(body, undefined);
                    t.equal(req.body, 'abc');
                    t.done();
                })
                this.req.emit('xyz');
                this.req.emit('end');
            },

            'should return http error': function(t) {
                var req = this.req;
                mw.mwReadBody(req, {}, function(err) {
                    t.ok(err);
                    t.equal(err, 'mock http error');
                    t.done();
                })
                setTimeout(function() { req.emit('error', 'mock http error'); }, 2);
            },

            'should not return twice': function(t) {
                var req = this.req;
                var ncalls = 0;
                mw.mwReadBody(req, {}, function(err) {
                    ncalls += 1;
                    t.equal(ncalls, 1);
                    setTimeout(t.done, 5);
                })
                req.emit('error', new Error('mock error 1'));
                req.emit('end');
                req.emit('error', new Error('mock error 2'));
                req.emit('end');
            },
        },
    },

    'buildDecodeBody': {
        'returns a function that parses json req.body': function(t) {
            var fn = mw.buildDecodeBody();
            t.equal(typeof fn, 'function');
            var req = { body: '{"x":1,"y":"two"}' };
            fn(req, {}, noop);
            t.deepEqual(req.body, { x: 1, y: 'two' });
            t.done();
        },
    },

    'decodeBody': {
        'decodes valid json': function(t) {
            var tests = [
                ['null', null],
                ['123', 123],
                ['"123"', '123'],
                ['{}', {}],
                ['{"a":123,"b":"two"}', { a: 123, b: 'two' }],
                ['[1,2,"3"]', [1, 2, '3']],
            ];
            var fn = mw.buildDecodeBody();

            for (var i=0; i<tests.length; i++) {
                var req = { body: tests[i][0] };
                fn(req, {}, noop);
                t.deepStrictEqual(req.body, tests[i][1]);
            }
            t.done();
        },

        'throws on invalid json': function(t) {
            var fn = mw.buildDecodeBody();
            var req = { body: '{"a":' };
            t.throws(function() { fn(req, {}, noop) }, /input/);
            t.done();
        },

        'does not throw if ignoreErrors': function(t) {
            var fn = mw.buildDecodeBody({ ignoreErrors: true });
            var req = { body: '{"a": invalid json' };
            fn(req, {}, noop);
            t.strictEqual(req.body, '{"a": invalid json');
            t.done();
        },

        'ignores empty body': function(t) {
            var tests = [ null, undefined, '', fromBuf('') ];
            var fn = mw.buildDecodeBody();

            var req = {};
            for (var i=0; i<tests.length; i++) {
                req.body = tests[i];
                fn(req, {}, noop);
                t.strictEqual(req.body, tests[i]);
            }
            t.done();
        },

        'uses specified decoder': function(t) {
            var req = { body: 'x' };
            var fn = mw.buildDecodeBody({ decoder: function() { return 'decoded' } });
            fn(req, {}, noop);
            t.equal(req.body, 'decoded');
            t.done();
        },

        'does not decode unset body': function(t) {
            var req = {};
            var fn = mw.buildDecodeBody({ decoder: function() { return 'decoded' } });
            t.ok(!('body' in req));
            t.done();
        },

        'decodes only payload starting with the specified characters': function(t) {
            var req = {};
            var fn = mw.buildDecodeBody({ startingWith: '["' });

            req.body = '[1,2,3]';
            fn(req, {}, noop);
            t.deepEqual(req.body, [1, 2, 3]);

            req.body = fromBuf('[1,2,3]');
            fn(req, {}, noop);
            t.deepEqual(req.body, [1, 2, 3]);

            req.body = '"string"';
            fn(req, {}, noop);
            t.strictEqual(req.body, 'string');

            req.body = '{}';
            fn(req, {}, noop);
            t.strictEqual(req.body, '{}');

            t.done();
        },
    }
}

function mockReq( opts ) {
    opts = opts || {};
    var req = new events.EventEmitter();
    req.setEncoding = noop;
    req.end = noop;
    req.read = noop;
    req.destroy = function(err) { req.emit('error', err) };
    for (var k in opts) req[k] = opts[k];
    return req;
}

function noop() {}
