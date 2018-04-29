'use strict';

var mw = require('./mw');

module.exports = {

    'repeatUntil': {
        'should run 1 times': function(t) {
            var retvals = ['done'];
            var spy = t.spy({}, 'fn', function(cb){ cb(null, retvals.shift()) });
            mw.repeatUntil(spy, function(err) {
                t.equal(spy.callCount, 1);
                t.done();
            })
        },

        'should run 5 times': function(t) {
            var retvals = [0, 0, 0, 0, 1];
            var spy = t.spy({}, 'fn', function(cb){ cb(null, retvals.shift()) });
            mw.repeatUntil(spy, function(err) {
                t.equal(spy.callCount, 5);
                t.done();
            })
        },

        'should run 2 times stopped by test': function(t) {
            var retvals = [0, 1];
            var spy = t.spy({}, 'fn', function(){ return retvals.shift() });
            mw.repeatUntil(function(cb){ cb() }, spy, function(err) {
                t.equal(spy.callCount, 2);
                t.done();
            })
        },

        'should return error on second callback': function(t) {
            var fn = function(cb){ setImmediate(cb, null, true); setImmediate(cb, 2, true) };
            var spy = t.spy({}, 'fn', function(err) {
                if (spy.callCount === 1) {
                    t.ifError(err);
                    t.deepEqual(spy.args[0], [ null ]);
                }
                if (spy.callCount === 2) {
                    t.ok(err);
                    t.contains(err.message, 'callback already called');
                    t.done();
                }
            });
            t.expect(4);
            mw.repeatUntil(fn, spy)
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
}

function noop() {}
