/**
 * Copyright (C) 2018 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var events = require('events');
var mw = require('./mw');

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
            buildReadBody:1, buildParseQuery:1, buildParseBody:1,
            mwReadBody:1, mwParseQuery:1, mwParseBody:1, writeResponse:1,
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
            var fn = function(cb){ setImmediate(cb, null, true); setImmediate(cb, 2, true) };
            var spy = t.spy({}, 'fn', function(err) {
                if (spy.callCount === 1) {
                    t.ifError(err);
                    t.strictEqual(spy.args[0][0], null);
                }
                if (spy.callCount === 2) {
                    t.ok(err);
                    t.contains(err.message, 'callback already called');
                    t.done();
                }
            });
            t.expect(4);
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
            console.time('repeatUntil 10m');
            var n = 0;
            function iterator(cb, arg) { cb(null, n++ >= 10000000) }
            mw.repeatUntil(iterator, null, function(err) {
                console.timeEnd('repeatUntil 10m', n);
                t.done();
            })
        },
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
            mw.sendResponse(this.req, this.res, noop, null, null, new Buffer('mock body'), { 'my-header-1': 1, 'my-header-2': 2 });
            t.equal(this.res.statusCode, 200);
            t.contains(this.res._headers, {'my-header-1': 1, 'my-header-2': 2});
            t.deepEqual(spyEnd.args[0], [new Buffer('mock body')]);

            var spyEnd = t.spyOnce(this.res, 'end');
            mw.sendResponse(this.req, this.res, noop, null, 201, { mock: 1, body: 2 });
            t.equal(this.res.statusCode, 201);
            t.deepEqual(spyEnd.args[0], ['{"mock":1,"body":2}']);

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
            ];

            for (var i=0; i<tests.length; i++) {
                t.contains(mw.parseQuery(tests[i][0]), tests[i][1], 'tests[' + i + ']');
            }

            t.done();
        },

        'mwParseQuery should parse req.query': function(t) {
            var req = { query: 'a=1&b=t%77o&' };
            mw.mwParseQuery(req, {}, function(err) {
                t.deepEqual(req.params, { a: 1, b: 'two' });
                t.done();
            })
        },

        'mwParseBody should parse req.body': function(t) {
            var req = { body: 'a=1&b=t%77o&' };
            mw.mwParseBody(req, {}, function(err) {
                t.deepEqual(req.params, { a: 1, b: 'two' });
                t.done();
            })
        },

        'mwParseBody should return empty object if no body': function(t) {
            var req = { body: 'a=1&b=2'};
            var parseBody = mw.buildParseBody({ bodyField: 'nonesuch' });
            parseBody(req, {}, function(err) {
                t.deepEqual(req.params, {});
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

        'should gather string chunks': function(t) {
            var req = this.req;
            mw.mwReadBody(req, {}, function(err, body) {
                t.equal(body, 'chunk1chunk2');
                t.equal(req.body, body);
                t.done();
            })
            req.emit('data', 'chunk1');
            req.emit('data', 'chunk2');
            req.emit('end');
        },

        'should gather buffers': function(t) {
            var req = this.req;
            mw.mwReadBody(req, {}, function(err, body) {
                t.ok(Buffer.isBuffer(body));
                t.equal(body.toString(), 'chunk1chunk2');
                t.equal(req.body, body);
                t.done();
            })
            req.emit('data', new Buffer('chunk1'));
            req.emit('data', new Buffer('chunk2'));
            req.emit('end');
        },

        'should gather single buffer': function(t) {
            var req = this.req;
            var buff = new Buffer('chunk1');
            mw.mwReadBody(req, {}, function(err, body) {
                t.equal(body, buff);
                t.strictEqual(req.body, body);
                t.done();
            })
            req.emit('data', buff);
            req.emit('end');
        },

        'should gather empty string body': function(t) {
            var req = this.req;
            mw.mwReadBody(req, {}, function(err, body) {
                t.equal(body, '');
                t.strictEqual(req.body, body);
                t.done();
            })
            req.emit('end');
        },

        'should gather empty buffer body': function(t) {
            var req = this.req;
            req._readableState.encoding = null;
            mw.mwReadBody(req, {}, function(err, body) {
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
                mw.mwReadBody(this.req, {}, function(err, body) {
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
        },
    },
}

function mockReq( opts ) {
    opts = opts || {};
    var req = new events.EventEmitter();
    req.setEncoding = noop;
    req.end = noop;
    req.read = noop;
    for (var k in opts) req[k] = opts[k];
    return req;
}

function noop() {}
