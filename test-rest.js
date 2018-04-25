/**
 *
 */

'use strict';

var http = require('http');
var https = require('https');
var net = require('net');
var events = require('events');

var rest = require('./');
var Rest = rest.Rest;
var HttpError = rest.HttpError;

module.exports = {
    'module': {
        'should export expected class functions': function(t) {
            t.equal(typeof rest, 'function');
            t.equal(rest, rest.createHandler);
            t.equal(typeof rest.Rest, 'function');
            t.equal(typeof rest.HttpError, 'function');
            t.equal(typeof rest.createServer, 'function');
            t.equal(typeof rest.createHandler, 'function');
            t.done();
        },
    },

    'Rest': {
        setUp: function(done) {
            this.rest = new Rest();
            done();
        },

        'should expose expected properties': function(t) {
            var rest = new Rest();
            t.equal(rest.NotRoutedHttpCode, 404);
            t.equal(typeof rest.onRequest, 'function');
            t.done();
        },

        'should expose optional properties': function(t) {
            var options = {
                NotRoutedHttpCode: 405,
                encoding: 'base64',
                bodySizeLimit: 123456,
                mw: {},
                router: {},
                processRequest: function(){},
                onError: function(){},
            };
            var rest = new Rest(options);
            for (var k in options) t.strictEqual(rest[k], options[k]);
            t.done();
        },

        'without a router': {
            'addRoute should throw': function(t) {
                t.strictEqual(this.rest.lookupRoute('/path', 'method'), null);
                this.rest.removeRoute('/path', 'method');
                try { this.rest.addRoute('/path', 'method', noop); }
                catch (err) {
                    /not supported/.test(err.message);
                    t.done();
                }
            },
        },

        'with router': {
            setUp: function(done) {
                this.rest.router = new NonRouter();
                done();
            },

            'should delegate router methods addRoute, lookupRoute, removeRoute': function(t) {
                var spy = t.spyOnce(this.rest.router, 'addRoute');
                this.rest.addRoute('use', [noop]);
                t.deepEqual(spy.args[0], ['use', '_ANY_', [noop]]);

                var spy = t.spyOnce(this.rest.router, 'lookupRoute');
                this.rest.lookupRoute('/path', 'method');
                t.deepEqual(spy.args[0], ['/path', 'method']);

                var spy = t.spyOnce(this.rest.router, 'removeRoute');
                this.rest.removeRoute('/path', 'method');
                t.deepEqual(spy.args[0], ['/path', 'method']);

                t.done();
            },

            'should add use step': function(t) {
                var spy = t.stubOnce(this.rest.router, 'addRoute');
                this.rest.addRoute('use', noop);
                t.ok(spy.called);
                t.deepEqual(spy.args[0], ['use', '_ANY_', [noop]]);
                t.done();
            },

            'use step must be a function': function(t) {
                var rest = this.rest;
                t.throws(function(){ rest.addRoute('use', 1) }, /not a function/);
                t.done();
            },

            'should add use route': function(t) {
                var spy;

                spy = t.stubOnce(this.rest.router, 'addRoute');
                this.rest.addRoute('/some/path', noop);
                t.deepEqual(spy.args[0], ['/some/path', '_ANY_', [noop]]);

                spy = t.stubOnce(this.rest.router, 'addRoute');
                this.rest.addRoute('/some/path', noop, noop);
                t.deepEqual(spy.args[0], ['/some/path', '_ANY_', [noop, noop]]);

                spy = t.stubOnce(this.rest.router, 'addRoute');
                this.rest.addRoute('/some/path', [noop, noop]);
                t.deepEqual(spy.args[0], ['/some/path', '_ANY_', [noop, noop]]);

                t.done();
            },

            'should add route step': function(t) {
                var spy = t.spyOnce(this.rest.router, 'addRoute');
                this.rest.addRoute('/path', 'GET', noop);
                require('assert').deepEqual(spy.args[0], ['/path', 'GET', [noop]]);
                t.done();
            },

            'should add route step array': function(t) {
                var spy;

                spy = t.stubOnce(this.rest.router, 'addRoute');
                this.rest.addRoute('/path', 'GET', noop);
                t.deepEqual(spy.args[0], ['/path', 'GET', [noop]]);

                spy = t.stubOnce(this.rest.router, 'addRoute');
                this.rest.addRoute('/path', 'GET', noop, noop, noop);
                t.deepEqual(spy.args[0], ['/path', 'GET', [noop, noop, noop]]);

                spy = t.stubOnce(this.rest.router, 'addRoute');
                this.rest.addRoute('/path', 'GET', [noop, noop]);
                t.deepEqual(spy.args[0], ['/path', 'GET', [noop, noop]]);

                t.done();
            },

            'route steps must be functions': function(t) {
                var rest = this.rest;
                t.throws(function(){ rest.addRoute('/path', 'GET', 1) }, /step .* not a function/);
                t.throws(function(){ rest.addRoute('/path', 'GET', [noop, 1, noop]) }, /step .* not a function/);
                t.done();
            },
        },

        'onRequest': {
            'should catch setEncoding error': function(t) {
                var req = mockReq();
                t.stub(req, 'setEncoding').throws('mock setEncoding error');
                var spy = t.spy(this.rest, 'onError');
                this.rest.onRequest(req, mockRes(), noop);
                t.ok(spy.called);
                t.equal(spy.args[0][0], 'mock setEncoding error');
                t.done();
            },

            'should catch readBody error': function(t) {
                var spy = t.spy(this.rest, 'onError');
                t.stub(this.rest, 'readBody').throws('mock readBody error');
                this.rest.onRequest(mockReq(), mockRes(), noop);
                t.ok(spy.called);
                t.equal(spy.args[0][0], 'mock readBody error');
                t.done();
            },

            'should return readBody error': function(t) {
                var spy = t.spy(this.rest, 'onError');
                t.stub(this.rest, 'readBody').yieldsAsync('mock readBody error');
                this.rest.onRequest(mockReq(), mockRes(), noop);
                setTimeout(function() {
                    t.ok(spy.called);
                    t.equal(spy.args[0][0], 'mock readBody error');
                    t.done();
                }, 3);
            },

            'should catch onError error': function(t) {
                var req = mockReq();
                t.stub(req, 'setEncoding').throws('mock setEncoding error');
                t.stub(this.rest, 'onError').throws('mock onError error');
                var spy = t.stub(process.stderr, 'write');
                this.rest.onRequest(req, mockRes(), noop);
                spy.restore();
                t.ok(spy.called);
                t.contains(spy.args[0][0], 'onError error: mock onError error');
                t.done();
            },

            'without router': {
                'should invoke processRequest': function(t) {
                    t.stub(this.rest, 'readBody').yieldsAsync(null, 'mock body');
                    var spy = t.stub(this.rest, 'processRequest').yields();
                    var req, res;
                    this.rest.onRequest(req = mockReq(), res = mockRes(), noop);
                    setTimeout(function() {
                        t.ok(spy.called);
                        t.equal(spy.args[0][0], req);
                        t.equal(spy.args[0][1], res);
                        t.equal(typeof spy.args[0][2], 'function');
                        t.equal(spy.args[0][3], 'mock body');
                        t.done();
                    }, 3);
                },

                'should error out if no processRequest': function(t) {
                    t.stub(this.rest, 'readBody').yieldsAsync(null, 'mock body');
                    var spy = t.spy(this.rest, 'onError');
                    this.rest.onRequest(mockReq(), mockRes(), noop);
                    setTimeout(function() {
                        t.ok(spy.called);
                        t.ok(spy.args[0][0].debug, 'no router or processRequest');
                        t.done();
                    }, 3);
                },
            },

            'with router': {
                setUp: function(done) {
                    this.rest.router = new NonRouter();
                    done();
                },

                'should invoke router.runRoute': function(t) {
                    this.rest.router = new NonRouter();
                    var spy = t.stub(this.rest.router, 'runRoute').yields(null);
                    this.rest.onRequest(mockReq(), mockRes());
                    t.ok(spy.called);
                    t.done();
                },

                'should use configured encoding': function(t) {
                    var rest = new Rest({ encoding: 'my-enc' });
                    var req = mockReq();
                    var spy = t.spy(req, 'setEncoding');
                    rest.onRequest(req, mockRes());
                    t.ok(spy.called);
                    t.equal(spy.args[0][0], 'my-enc');
                    t.done();
                },

                'should catch runRoute errors': function(t) {
                    t.stub(this.rest.router, 'runRoute').throws(new Error('runRoute error'));
                    var spy = t.spy(this.rest, 'sendResponse');
                    var spy2 = t.spy(this.rest, 'onError');
                    this.rest.onRequest(mockReq(), mockRes());
                    t.ok(spy.called);
                    t.ok(spy.args[0][3] instanceof Error);
                    t.ok(spy.args[0][3].debug == 'runRoute error');
                    t.ok(spy2.called);
                    t.done();
                },

                'should return runRoute errors': function(t) {
                    t.stub(this.rest.router, 'runRoute').yieldsAsync(new Error('mock runRoute error 2'));
                    var spy = t.spy(this.rest, 'onError');
                    this.rest.onRequest(mockReq(), mockRes());
                    setTimeout(function() {
                        t.ok(spy.called);
                        t.equal(spy.args[0][0].message, 'mock runRoute error 2');
                        t.done();
                    }, 3);
                },
            },
        },

        'onError': {
            'should log sendResponse errors': function(t) {
                var rest = new Rest();
                var res = mockRes();
                t.stubOnce(res, 'end').throws(new Error('mock end() error'));
                var spy = t.stubOnce(process.stderr, 'write');
                rest.onError(new Error('mock error'), mockReq(), res, noop);
                t.ok(spy.called);
                t.contains(spy.args[0][0], 'unable to send error');
                t.contains(spy.args[0][0], 'mock end() error');
                t.done();
            },
        },
    },

    'createHandler': {
        'should return a function with expected properties': function(t) {
            var handler = rest.createHandler();
            t.equal(typeof handler, 'function');
            t.equal(handler.length, 3);
            t.equal(typeof handler.use, 'function');
            var httpMethods = [ 'options', 'get', 'head', 'post', 'put', 'delete', 'trace', 'connect', 'patch' ];
            httpMethods.forEach(function(method){ t.equal(typeof handler[method], 'function') });
            t.done();
        },

        'handler should be rest.onRequest': function(t) {
            var handler = rest.createHandler();
            t.equal(handler, handler.rest.onRequest);
            t.done();
        },

        'handler.use should add use or err mw step': function(t) {
            var handler = rest.createHandler({ router: { addRoute: noop } });

            var mw, spy = t.spyOnce(handler.rest, 'addRoute');
            handler.use(mw = function(req, res, next) { });
            t.ok(spy.called);
            t.deepEqual(spy.args[0], ['use', mw]);

            var mw, spy = t.spyOnce(handler.rest, 'addRoute');
            handler.use(mw = function(err, req, res, next) { });
            t.ok(spy.called);
            t.deepEqual(spy.args[0], ['err', mw]);

            t.done();
        },

        'http methods should invoke addRoute': function(t) {
            var handler = rest.createHandler({ router: new NonRouter() });
            var httpMethods = [ 'options', 'get', 'head', 'post', 'put', 'delete', 'trace', 'connect', 'patch' ];
            for (var i=0; i<httpMethods.length; i++) {
                var method = httpMethods[i];
                var spy = t.stubOnce(handler.rest, 'addRoute');
                handler[method]('/path', noop);
                t.ok(spy.called);
            }
            t.done();
        },
    },

    'createServer': {
        'should return an http server, with optional options and/or callback': function(t) {
            var server;

            server = rest.createServer();
            t.ok(server instanceof http.Server);

            server = rest.createServer({});
            t.ok(server instanceof http.Server);

            server = rest.createServer(function onListening(err){});
            t.ok(server instanceof http.Server);
                
            server = rest.createServer({}, function onListening(err){});
            t.ok(server instanceof http.Server);

            try { server.close() } catch (e) { }
            t.done();
        },

        'should also return an https server': function(t) {
            var server;

            server = rest.createServer({ protocol: 'https:', key: testKey(), cert: testCert() });
            t.ok(server instanceof https.Server);

            try { server.close() } catch (e) { }
            t.done();
        },

        'should listen on the given port': function(t) {
            var server = rest.createServer({ port: 1337 }, function(err, info) {
                server.close();
                t.ifError(err);
                t.equal(info.pid, process.pid);
                t.equal(info.port, 1337);
                t.ok(server instanceof http.Server);
                t.done();
            })
        },

        'should not listen without a port': function(t) {
            var server = rest.createServer({});
            var spy = t.spyOnce(server, 'listen');
            setTimeout(function() {
                t.ok(!spy.called);
                t.done();
            }, 5);
        },

        'with anyPort': {
            'should listen on some port': function(t) {
                var server = rest.createServer({ anyPort: true }, function(err, info) {
                    server.close();
                    t.ifError(err);
                    t.ok(info.port > 0);
                    t.done();
                })
            },

            'should fall back to any port': function(t) {
                var netServer = net.createServer();
                netServer.listen(1337, function() {
                    var server = rest.createServer({ port: 1337, anyPort: true }, function(err, info) {
                        server.close();
                        netServer.close(function() {
                            t.ok(info.port > 0);
                            t.done();
                        })
                    })
                })
            },

            'should fall back to any port without a callback': function(t) {
                var netServer = net.createServer();
                netServer.listen(1337, function() {
                    var server = rest.createServer({ port: 1337, anyPort: true });
                    server.on('listening', function() {
                        var port = server.address().port;
                        server.close();
                        netServer.close(function() {
                            t.ok(port > 0);
                            t.done();
                        })
                    })
                    server.listen(1337);
                })
            },
        },

        'with tryNextPort': {
            'should try next port': function(t) {
                var netServer = net.createServer();
                netServer.listen(1337, function() {
                    var server = rest.createServer({ port: 1337, tryNextPort: true }, function(err, info) {
                        server.close();
                        netServer.close(function() {
                            t.ok(info.port > 1337);
                            t.done();
                        })
                    })
                })
            },
        },

        'should listen without a callback': function(t) {
            var server = rest.createServer({ port: 1337 });
            server.on('listening', function() {
                server.close();
                t.done();
            })
        },

        'edge cases': {
            'should return listen error to callback': function(t) {
                var server = rest.createServer({ port: 1337 }, function(err, info) {
                    t.equal(err, 'mock listen error');
                    t.done();
                })
                t.stubOnce(server, 'listen', function(){ server.emit('error', 'mock listen error') });
            },

            'should annotate server with listen error without callback': function(t) {
                var httpServer = new events.EventEmitter();
                httpServer.listen = function(){ httpServer.emit('error', new Error('mock listen error')) };
                t.stubOnce(http, 'createServer').returns(httpServer);

                var server = rest.createServer({ port: 1337 });
                setImmediate(function() {
                    t.ok(server._error);
                    t.equal(server._error.message, 'mock listen error');
                    t.done();
                })
            }
        },
    },

    'helpers': {
        'HttpError': {
            'should encode statusCode, message, debug': function(t) {
                var err = new rest.HttpError(404, 'my error message');
                t.equal(err.statusCode, 404);
                t.equal(err.message, '404 Not Found');
                t.equal(err.debug, 'my error message');

                // without params
                var err = new rest.HttpError();
                t.equal(err.statusCode, 500);
                t.equal(err.message, '500 Internal Error');

                // with just a status code
                var err = new rest.HttpError(401);
                t.equal(err.statusCode, 401);
                t.equal(err.message, '401 Unauthorized');

                // with a custom status code
                var err = new rest.HttpError(999);
                t.equal(err.statusCode, 999);
                t.equal(err.message, '999 Internal Error');

                t.done();
            },
        },

        'readBody': {
            setUp: function(done) {
                this.rest = new Rest();
                this.req = mockReq();
                // mock internal fingerprint req.setEncoding('utf8');
                this.req._readableState = { encoding: 'utf8' };
                this.req.socket = { end: noop };
                done();
            },

            'should call _doReadBody': function(t) {
                if (!this.rest._doReadBody) t.skip();
                var spy = t.spy(this.rest, '_doReadBody');
                this.rest.readBody(this.req, {}, function(err, body) {
                    t.ok(spy.called);
                    t.done();
                })
                this.req.emit('end');
            },

            'should gather string chunks': function(t) {
                var req = this.req;
                this.rest.readBody(req, {}, function(err, body) {
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
                this.rest.readBody(req, {}, function(err, body) {
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
                this.rest.readBody(req, {}, function(err, body) {
                    t.equal(body, buff);
                    t.strictEqual(req.body, body);
                    t.done();
                })
                req.emit('data', buff);
                req.emit('end');
            },

            'should gather empty string body': function(t) {
                var req = this.req;
                this.rest.encoding = 'utf8';
                this.rest.readBody(req, {}, function(err, body) {
                    t.equal(body, '');
                    t.strictEqual(req.body, body);
                    t.done();
                })
                req.emit('end');
            },

            'should gather empty buffer body': function(t) {
                var req = this.req;
                req._readableState.encoding = null;
                this.rest.readBody(req, {}, function(err, body) {
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
                    var spy = t.spy(this.rest, '_doReadBody');
                    this.rest.readBody(this.req, {}, function(err, body) {
                        t.ok(!spy.called);
                        t.equal(body, undefined);
                        t.equal(req.body, 'abc');
                        t.done();
                    })
                    this.req.emit('xyz');
                    this.req.emit('end');
                },

                'should return error if bodySizeLimit is exceeded': function(t) {
                    this.rest.bodySizeLimit = 2;
                    this.rest.readBody(this.req, {}, function(err) {
                        t.ok(err);
                        t.contains(err.debug, 'size exceeded');
                        t.done();
                    })
                    this.req.emit('data', 'chunk1');
                    this.req.emit('end');
                },

                'should return http error': function(t) {
                    var req = this.req;
                    this.rest.readBody(req, {}, function(err) {
                        t.ok(err);
                        t.equal(err, 'mock http error');
                        t.done();
                    })
                    setTimeout(function() { req.emit('error', 'mock http error'); }, 2);
                },
            },
        },

        'sendResponse': {
            setUp: function(done) {
                this.rest = new Rest();
                this.res = mockRes();
                done();
            },

            'should write status code, headers and body': function(t) {
                var spyEnd = t.spyOnce(this.res, 'end');
                this.rest.sendResponse(mockReq(), this.res, noop, null, null, 'mock body', { 'my-header-1': 1 });
                t.equal(this.res.statusCode, 200);
                t.contains(this.res._headers, {'my-header-1': 1});
                t.deepEqual(spyEnd.args[0], ['mock body']);

                var spyEnd = t.spyOnce(this.res, 'end');
                this.rest.sendResponse(mockReq(), this.res, noop, null, null, new Buffer('mock body'), { 'my-header-1': 1, 'my-header-2': 2 });
                t.equal(this.res.statusCode, 200);
                t.contains(this.res._headers, {'my-header-1': 1, 'my-header-2': 2});
                t.deepEqual(spyEnd.args[0], [new Buffer('mock body')]);

                var spyEnd = t.spyOnce(this.res, 'end');
                this.rest.sendResponse(mockReq(), this.res, noop, null, 201, { mock: 1, body: 2 });
                t.equal(this.res.statusCode, 201);
                t.deepEqual(spyEnd.args[0], ['{"mock":1,"body":2}']);

                t.done();
            },

            'should write erorr': function(t) {
                var spyEnd = t.spyOnce(this.res, 'end');
                this.rest.sendResponse(mockReq(), this.res, noop, new Error(''));
                t.equal(this.res.statusCode, 500);
                t.deepEqual(JSON.parse(spyEnd.args[0]), { error: 500, message: 'Internal Error', debug: '' });

                var spyEnd = t.spyOnce(this.res, 'end');
                var err = new Error('my mock error'); err.code = 'EMOCKE';
                this.rest.sendResponse(mockReq(), this.res, noop, err);
                t.equal(this.res.statusCode, 500);
                t.deepEqual(JSON.parse(spyEnd.args[0]), { error: 'EMOCKE', message: 'my mock error', debug: '' });

                var spyEnd = t.spyOnce(this.res, 'end');
                this.rest.sendResponse(mockReq(), this.res, noop, new this.rest.HttpError(404, 'my page not found', 'check again'));
                t.equal(this.res.statusCode, 404);
                t.deepEqual(JSON.parse(spyEnd.args[0]), { error: 404, message: '404 Not Found', debug: 'my page not found', details: 'check again' });

                t.done();
            },

            'errors': {
                'should catch json encode errors': function(t) {
                    var spyEnd = t.stubOnce(this.res, 'end');
                    var body = { x: 1, body: body, y: 2, z: 'three' };
                    body.body = body;
                    this.rest.sendResponse(mockReq(), this.res, noop, null, 200, body);
                    t.contains(spyEnd.args[0][0], 'unable to json encode response');
                    t.contains(spyEnd.args[0][0], ' containing x,body,y,z');
                    t.contains(spyEnd.args[0][0], ' circular ');

                    t.done();
                },

                'should catch and return res.setHeader errors': function(t) {
                    t.stubOnce(this.res, 'setHeader').throws('mock res.setHeader error');
                    var self = this;
                    self.rest.sendResponse(mockReq(), self.res, callback, null, 200, 'mock body', {'hdr1': 1});
                    function callback(err) {
                        t.ok(err);
                        t.equal(err, 'mock res.setHeader error')
                        t.done();
                    }
                },

                'should catch and return res.end errors': function(t) {
                    t.stubOnce(this.res, 'end').throws('mock res.end error');
                    var self = this;
                    self.rest.sendResponse(mockReq(), self.res, callback, null, 200, 'mock body');
                    function callback(err) {
                        t.ok(err);
                        t.equal(err, 'mock res.end error')
                        t.done();
                    }
                },
            },
        },
    },
}

function noop(){};

function mockReq() {
    var req = new events.EventEmitter();
    req.setEncoding = noop;
    req.end = noop;
    req.read = noop;
    return req;
}

function mockRes() {
    return {
        _headers: {},
        setHeader: function(k, v) { this._headers[k] = v },
        write: noop,
        end: noop,
    }
}

function NonRouter( ) {
    this.addRoute = function(path, method, mw) { new Error('router does not support mw') };
    this.removeRoute = function(path, method) { return null };
    this.lookupRoute = function(path, method) { return null };
    this.runRoute = function(rest, req, res, next) {
        rest.readBody(req, res, function(err) {
            if (!err) try { rest.processRequest(req, res, next, req.body) } catch (e) { err = e }
            if (err) rest.sendResponse(req, res, new rest.HttpError(500, err.message));
        })
    };
}

// openssl req -x509 -sha256 -nodes -newkey rsa:2048 -days 365 -keyout localhost.key -out localhost.cert
function testKey( ) {
    return [
"-----BEGIN PRIVATE KEY-----",
"MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDflnO1vQ4cCAut",
"Q5MAe36AvTgKKPpsmjgiSuW3oO+2phpUqswSAZeje4bp2z3tPVtvO26Hr17IM5E8",
"obqoMXTSyL9VlS79vkqrswD2yImDFTDQlRA2Iub4TM7yghQAiruRJfWrGikBqwIB",
"b3GYBUzd4kthYtTq1J8LjrmwFA6cP6px+LAuK+78DFMutcTUR9kKgovDej71HzO1",
"PZoG5Eegy0VfBdoTo4855HIOqEMsu+9BsZcdQ5M1AxNZMHSGQP7BuipULz0JxYdu",
"wSoFvOj37ir2q2TbThzTUqZ3JtiuP2+vV/orol2kGfRf5bwbcHPM4c4YfwsryLhZ",
"wKzl8lklAgMBAAECggEAOkKk8gVKSOmbyVEjW+vSAc/Ma3FUF7pzyBPGGfw4mlpb",
"4BYFSOfbUIEenY9AarIjQi+1VGvRAc/WF3t4/NyuOUKQAMf3z6ynHmhtZuDIXDzI",
"VIGTENg1YRv6jNxyQ9XinCbNBgGyD7o0spUMf3VaGzMdO0oaevpeWw+cuRHw4KuF",
"YGlJKUYEXzAaxe6no2zxXWvx6Hd0OTY9cvji2ako1/wwoFl4SUcz3BvX2tJ/z0BZ",
"bS3K1NGGYzhJbKQXC6A1dvON53FhXdnMQGkHKnxHvyA7Q6/nxnapNmUG7YUFNhIs",
"72c3HpTAJ6R/oByK/TMUg80a3CN5j8c7zNH8aLG+wQKBgQD+JASZU0McFwfuuKHP",
"PC4pq2Cjc/4rtJRl3SgrQjeiO+Uh9q6xelpT/dywDgRgH8eMIm5Hgtrx/hCHCRmZ",
"bNWd7gCjm8jPkk6COQSReDQBo4/eyZAvVyVFuAIbcJbERC6D+ukr5/l7RBB/F4eG",
"gwDbsb+UqtCnVdUYyQVJTj5gsQKBgQDhOTYKbyrCW0X+SFWQ6fUBYalJGcgg+Uxj",
"D4AJKqR7wx3OMOrmTDXcbV6w0/JqNmbz4a1L76v3RDB3SBs854LHF7z9xzyiwYSC",
"uc1zujskaVdKe8LYeh/Ct9x6f1hv/hSnQzgYk82Z26/xfQN7l4kRahEMwHiXkM01",
"OAyEN7a8tQKBgFVQ4B5c3k2iya3xW5jHejPQ7ZtRyEUB1UOxD9gd3bFf7BcPyiuY",
"iJRjx99uhTeD06iOsnjdTAUrJn8+pdJkv/3JtXs3RB2y3xpGa+st8D+Qmi7PedD6",
"r2+NS1/M10BCJ191LyvnL1CbU/Jmgr+8YOBf9pHBGlTisqwkZ9rpInWxAoGBAJT3",
"NUIzgxGoMyRcDZRa2j1+rex2zALbQWXn86ScesyNImKlwkhusdVI1a+ZkCYmM3Qt",
"mWS3coOKq4/JtpJTAhHTJqKoK/fujUm1wSlBTSrpLd5K+3YZWHZ/C6pOHl18rYZw",
"FGNVJ1ETmEzehfYyJWvKPtqzV0/Qa5o+pzCwdQJdAoGAKm+Agboa3lnG9Tpu/tSB",
"2QlKQZe4q4s0ee1f6l1aMV3xp06YfIarU97fajoOE6fAEKUNP3OQroX78WMaqjn4",
"mcXuA81yS/qUPoxvUYzJkfKVFvOiAHD3qhsvXAukW8a1/IIgBa9LmOraw9+liwJi",
"5KWQrylNd4k+6vd894vqhvY=",
"-----END PRIVATE KEY-----",
].join('\n');

}

// openssl req -x509 -sha256 -nodes -newkey rsa:2048 -days 365 -keyout localhost.key -out localhost.cert
function testCert( ) {
return [
"-----BEGIN CERTIFICATE-----",
"MIIDTTCCAjWgAwIBAgIJAJus4stIQDJqMA0GCSqGSIb3DQEBCwUAMD0xCzAJBgNV",
"BAYTAnVzMQswCQYDVQQIDAJtYTEPMA0GA1UEBwwGQm9zdG9uMRAwDgYDVQQKDAdh",
"bmRyYXNxMB4XDTE4MDQyMjE4NDEyMloXDTE5MDQyMjE4NDEyMlowPTELMAkGA1UE",
"BhMCdXMxCzAJBgNVBAgMAm1hMQ8wDQYDVQQHDAZCb3N0b24xEDAOBgNVBAoMB2Fu",
"ZHJhc3EwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDflnO1vQ4cCAut",
"Q5MAe36AvTgKKPpsmjgiSuW3oO+2phpUqswSAZeje4bp2z3tPVtvO26Hr17IM5E8",
"obqoMXTSyL9VlS79vkqrswD2yImDFTDQlRA2Iub4TM7yghQAiruRJfWrGikBqwIB",
"b3GYBUzd4kthYtTq1J8LjrmwFA6cP6px+LAuK+78DFMutcTUR9kKgovDej71HzO1",
"PZoG5Eegy0VfBdoTo4855HIOqEMsu+9BsZcdQ5M1AxNZMHSGQP7BuipULz0JxYdu",
"wSoFvOj37ir2q2TbThzTUqZ3JtiuP2+vV/orol2kGfRf5bwbcHPM4c4YfwsryLhZ",
"wKzl8lklAgMBAAGjUDBOMB0GA1UdDgQWBBTfDglciZVZlxLgcksL4hwvMaF7UzAf",
"BgNVHSMEGDAWgBTfDglciZVZlxLgcksL4hwvMaF7UzAMBgNVHRMEBTADAQH/MA0G",
"CSqGSIb3DQEBCwUAA4IBAQBc5gwKp0RorlW/l7FensiTB0Y8MP0EPxw0T5rJ9P3Y",
"pZ6KWDn/c9k7eR+9Wu29O19fm2JBgFOs0j/Axp9rKn9mWK7cHtqQnsbvF+EDWP7J",
"v/fVlCaQj9i1r6PEK7X97FDFX+2omtKARJS0YEREkP2yVJLuXptJ0SrvGaYuTDL5",
"gyk2JqgsFxtXBle7NKEwWoXNWV0RzRPhf7SwxU/GcXGHFTMJRaLcFQd4X/7COmc9",
"scMoygJ/jbdgdg3O3NWz+L1SxF7oXb2Q6oKfQgp/sqVAy2uVrgP2C7i93TnU66m3",
"ovbLiHfAQVqcPkZBSLO1OXSqrF+NuYE8NfCAr2mHNdCm",
"-----END CERTIFICATE-----",
].join('\n');
}
