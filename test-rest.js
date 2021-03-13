/*
 * Copyright (C) 2018-2021 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var http = require('http');
var https = require('https');
var net = require('net');
var events = require('events');

var rest = require('./');
var Rest = rest.Rest;

module.exports = {
    'module': {
        'should export expected class functions': function(t) {
            t.equal(typeof rest, 'function');
            t.equal(rest, rest.createHandler);
            t.equal(typeof rest.Rest, 'function');
            t.equal(typeof rest.createServer, 'function');
            t.equal(typeof rest.createHandler, 'function');
            t.equal(typeof rest.reportError, 'function');
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
            t.equal(typeof rest.onRequest, 'function');
            // TODO: t.equal(typeof rest.handler, rest.onRequest);
            t.done();
        },

        'should expose optional properties': function(t) {
            var options = {
                router: {},
                processRequest: function(){},
                onError: function(){},
            };
            var rest = new Rest(options);
            for (var k in options) t.strictEqual(rest[k], options[k]);
            t.done();
        },

        'should check that processRequest and onError are functions': function(t) {
            // NOTE: assert.throws does not catch an error thrown inside a constructor, but try/catch does
            // t.throws(function(){ new Rest({ processRequest: 1 }) }, /must be  a function/);
            // t.throws(function(){ new Rest({ onError: 1 }) }, /must be  a function/);
            try { new Rest({ processRequest: 1 }); t.fail() } catch (e) { }
            try { new Rest({ onError: 1 }); t.fail() } catch (e) { }
            t.done();
        },

        'onRequest': {
            'should catch readBody error': function(t) {
                var spy = t.spy(this.rest, 'onError');
                t.stubOnce(Rest, 'readBody').throws('mock readBody error');
                this.rest.onRequest(mockReq(), mockRes(), noop);
                setImmediate(function() {
                    t.ok(spy.called);
                    t.equal(spy.args[0][0], 'mock readBody error');
                    t.done();
                })
            },

            'should return readBody error': function(t) {
                var spy = t.spy(this.rest, 'onError');
                t.stubOnce(Rest, 'readBody').yieldsAsync('mock readBody error');
                this.rest.onRequest(mockReq(), mockRes(), noop);
                setTimeout(function() {
                    t.ok(spy.called);
                    t.equal(spy.args[0][0], 'mock readBody error');
                    t.done();
                }, 10);
            },

            'should catch onError error': function(t) {
                var req = mockReq();
                t.stubOnce(Rest, 'readBody').throws('mock readBody error');
                t.stub(this.rest, 'onError').throws('mock onError error');
                var spy = t.stub(process.stderr, 'write');
                this.rest.onRequest(req, mockRes());
                setImmediate(function() {
                    spy.restore();
                    t.ok(spy.called);
                    t.contains(spy.args[0][0], 'mock onError error');
                    t.done();
                })
            },

            'without router': {
                'should invoke processRequest': function(t) {
                    t.stubOnce(Rest, 'readBody').yieldsAsync(null, 'mock body');
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
                    }, 5);
                },

                'should error out if no processRequest': function(t) {
                    t.stubOnce(Rest, 'readBody').yieldsAsync(null, 'mock body');
                    var spy = t.spy(this.rest, 'onError');
                    this.rest.onRequest(mockReq(), mockRes(), noop);
                    setTimeout(function() {
                        t.ok(spy.called);
                        t.contains(spy.args[0][0].message, 'no router or processRequest');
                        t.done();
                    }, 5);
                },

                'should pass processRequest exception to onError': function(t) {
                    var spy = t.spy(this.rest, 'onError');
                    t.stub(this.rest, 'processRequest').throws(new Error('mock processRequest error'));
                    t.stubOnce(Rest, 'readBody').yields(null, '');
                    var spy = t.spy(this.rest, 'onError');
                    this.rest.onRequest(mockReq(), mockRes(), function(err) {
                        t.ok(spy.called);
                        t.contains(spy.args[0][0].message, 'mock processRequest error');
                        t.done();
                    })
                },

                'should pass processRequest error to onError': function(t) {
                    var spy = t.spy(this.rest, 'onError');
                    t.stub(this.rest, 'processRequest').yields(new Error('mock processRequest error'));
                    t.stubOnce(Rest, 'readBody').yields(null, '');
                    var spy = t.spy(this.rest, 'onError');
                    this.rest.onRequest(mockReq(), mockRes(), function(err) {
                        t.ok(spy.called);
                        t.contains(spy.args[0][0].message, 'mock processRequest error');
                        t.done();
                    })
                },

                'should catch onError exception and return original error': function(t) {
                    t.stub(this.rest, 'processRequest').throws('invoke onError');
                    t.stub(this.rest, 'onError').throws('mock onError error X');
                    t.stubOnce(Rest, 'readBody').yields(null, '');
                    var spy = t.spyOnce(process.stderr, 'write');
                    this.rest.onRequest(mockReq(), mockRes(), function(err) {
                        t.ok(err);
                        t.equal(err, 'invoke onError');
                    })
                    setTimeout(function() {
                        t.ok(spy.called);
                        t.contains(spy.args[0][0], 'mock onError error X');
                        t.done();
                    }, 2);
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
                    setImmediate(function() {
                        t.ok(spy.called);
                        t.done();
                    })
                },

                'should catch runRoute errors': function(t) {
                    t.stub(this.rest.router, 'runRoute').throws(new Error('mock runRoute error'));
                    var spy = t.spy(Rest, '_sendErrorResponse');
                    var spy2 = t.spy(this.rest, 'onError');
                    var res = mockRes();
                    var spy3 = t.spy(res, 'end');
                    this.rest.onRequest(mockReq(), res);
                    setImmediate(function() {
                        t.ok(spy.called);
                        t.contains(spy.args[0][1], { debug: 'mock runRoute error' });
                        t.ok(spy2.called);
                        t.contains(spy3.args[0][0], '"debug":"mock runRoute error"');
                        t.done();
                    })
                },

                'should return runRoute errors': function(t) {
                    t.stub(this.rest.router, 'runRoute').yieldsAsync(new Error('mock runRoute error 2'));
                    var spy = t.spy(this.rest, 'onError');
                    this.rest.onRequest(mockReq(), mockRes());
                    setTimeout(function() {
                        t.ok(spy.called);
                        t.equal(spy.args[0][0].message, 'mock runRoute error 2');
                        t.done();
                    }, 10);
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

            'should return an unhandled error to its callback': function(t) {
                var rest = new Rest();
                t.stubOnce(Rest, 'readBody').yields(null, '');
                rest.processRequest = function(req, res, next) { next('mock processRequest error') };
                rest.onError = function(err, req, res, next) { next(err) };
                rest._onRequest(mockReq({ url: '/path1' }), {}, function(err) {
                    t.equal(err, 'mock processRequest error');
                    t.done();
                })
            },
        },
    },

    'createHandler': {
        'should return a function with expected properties': function(t) {
            var handler = rest.createHandler();
            t.equal(typeof handler, 'function');
            t.equal(handler.length, 3);
            t.equal(typeof handler.use, 'function');
            var httpMethods = [ 'options', 'get', 'head', 'post', 'put', 'delete', 'trace', 'connect', 'patch', 'del' ];
            httpMethods.forEach(function(method){ t.equal(typeof handler[method], 'function') });
            // node-v0.10 did not have a function.name property
            if (process.version >= 'v1.') httpMethods.forEach(function(method){ if (method !== 'del') t.equal(handler[method].name, method) });
            t.done();
        },

        'should accept onRequest and onError instead of options': function(t) {
            var handler = rest.createHandler(proc, err);
            t.equal(handler.rest.processRequest, proc);
            t.equal(handler.rest.onError, err);

            handler = rest.createHandler(proc);
            t.equal(handler.rest.processRequest, proc);
            t.equal(typeof handler.rest.onError, 'function');

            t.done();

            function proc(q, s, n) { n() }
            function err(e, q, s, n) { n() }
        },

        'handler should be rest.onRequest': function(t) {
            var handler = rest.createHandler();
            t.equal(handler, handler.rest.onRequest);
            t.done();
        },

        'handler.use should add use or err mw step': function(t) {
            var handler = rest.createHandler({ router: { setRoute: noop } });

            var mw, spy = t.spyOnce(handler.rest.router, 'setRoute');
            handler.use(mw = function(req, res, next) { });
            t.ok(spy.called);
            t.deepEqual(spy.args[0], ['use', mw]);

            var mw, spy = t.spyOnce(handler.rest.router, 'setRoute');
            handler.use(mw = function(err, req, res, next) { });
            t.ok(spy.called);
            t.deepEqual(spy.args[0], ['err', mw]);

            t.done();
        },

        'handler should work as request handler': function(t) {
            var handler = rest({ processRequest: processRequest });
            var server = http.createServer(handler).listen(1337);
            t.expect(1);
            function processRequest(req, res) {
                res.end();
                t.ok(true);
            }
            var req = http.request("http://localhost:1337/test", function(res) {
console.log("AR: got", res.statusCode, res.body);
res.on('data', function(chunk) { console.log("AR: chunk", String(chunk)) });
                server.close();
                t.done();
            })
            req.end();
        },

        'http methods should invoke setRoute': function(t) {
            var handler = rest.createHandler({ router: new NonRouter() });
            var httpMethods = [ 'options', 'get', 'head', 'post', 'put', 'delete', 'trace', 'connect', 'patch' ];
            for (var i=0; i<httpMethods.length; i++) {
                var method = httpMethods[i];
                var spy = t.stubOnce(handler.rest.router, 'setRoute');
                handler[method]('/path', noop);
                t.ok(spy.called);
            }
            t.done();
        },

        'use should create a NanoRouter': function(t) {
            var handler = rest.createHandler();
            t.ok(!handler.rest.router);
            handler.use(noop);
            t.ok(handler.rest.router instanceof Rest.NanoRouter);
            t.done();
        },

        'get, post should create a NanoRouter': function(t) {
            var handler = rest.createHandler();
            handler.get('/path1', noop);
            var router1 = handler.rest.router;
            handler.post('/path2', noop);
            var router2 = handler.rest.router;
            t.equal(router1, router2);
            t.ok(router1 instanceof Rest.NanoRouter);
            t.done();
        },

        'get, post etc should set an array of routes': function(t) {
            // all get,post,put etc methods are handled with identical code
            var handler = rest.createHandler({ router: {} });
            var spy = t.stub(handler.rest.router, 'setRoute').configure('saveLimit', 10);
            handler.get('/path', noop);
            handler.get('/path', [noop]);
            handler.get('/path', noop, noop);
            handler.get('/path', [noop, noop]);
            handler.get('/path', [noop, noop], noop);
            t.deepEqual(spy.args[0][2], [noop]);
            t.deepEqual(spy.args[1][2], [noop]);
            t.deepEqual(spy.args[2][2], [noop, noop]);
            t.deepEqual(spy.args[3][2], [noop, noop]);
            t.deepEqual(spy.args[4][2], [[noop, noop], noop]);
            t.done();
        },

        'use should accept a step name': function(t) {
            var handler = rest.createHandler();
            handler.use('err', noop);
            handler.use('other', noop);
            t.deepEqual(handler.rest.router.routes.other, noop);
            t.done();
        },

        'listen should call createServer without options or callback': function(t) {
            var handler = rest.createHandler();
            var spy = t.stubOnce(rest, 'createServer');
            handler.listen();
            t.ok(spy.called);
            t.contains(spy.args[0][0], { port: 0 });
            t.equals(spy.args[0][1], undefined);
            t.done();
        },

        'listen should call createServer with just callback': function(t) {
            var handler = rest.createHandler();
            var spy = t.stubOnce(rest, 'createServer').yields(null);
            handler.listen(noop);
            t.contains(spy.args[0][0], { port: 0, rest: handler.rest });
            t.equal(spy.args[0][1], noop);
            t.done();
        },

        'listen should accept options': function(t) {
            var handler = rest.createHandler();
            var spy = t.stubOnce(rest, 'createServer').yields(null);
            handler.listen({ tag: 12345 }, noop);
            t.contains(spy.args[0][0], { tag: 12345, rest: handler.rest });
            t.equal(spy.args[0][1], noop);
            t.done();
        },

        'listen should accept a port': function(t) {
            var handler = rest.createHandler();
            var spy = t.stubOnce(rest, 'createServer').yields(null);
            handler.listen(1234, noop);
            t.contains(spy.args[0][0], { port: 1234, rest: handler.rest });
            t.done();
        },

        'handler should be an event emitter': function(t) {
            // no longer an event emitter
            t.skip();

            var handler = rest.createHandler();
            handler.on('finishTest', noop);
            handler.on('finishTest', onFinish);
            t.deepEqual(handler.listeners('finishTest'), [noop, onFinish]);

            handler.removeListener('finishTest', noop);
            t.deepEqual(handler.listeners('finishTest'), [onFinish]);

            handler.once('finishTest', noop);
            t.equal(handler.listeners('finishTest').length, 2);

            handler.emit('finishTest', 1235);
            function onFinish(a) {
                t.equal(a, 1235);
                t.done();
            }
        },

        'close should call http server.close to stop listening': function(t) {
            var handler = rest.createHandler();
            t.equal(typeof handler.close, 'function');
            handler.listen(1337, function(err, info) {
                var spy = t.spyOnce(info.server, 'close');
                handler.close(function(err) {
                    t.ok(spy.called);
                    t.done();
                })
            })
        },

        'reportError should emit error if called with an emitter': function(t) {
            var emitter = { emit: t.stub() };
            rest.reportError({message: 'mock error'}, 'testing reportError', emitter);
            t.ok(emitter.emit.called);
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

            server = rest.createServer({ protocol: 'https:', key: mockKey(), cert: mockCert() });
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
                    setTimeout(function() {
                        var port = server.address().port;
                        server.close();
                        netServer.close(function() {
                            t.ok(port > 0);
                            t.done();
                        })
                    }, 5);
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
        'readBody': {
            setUp: function(done) {
                this.rest = new Rest();
                this.req = mockReq();
                // mock internal fingerprint req.setEncoding('utf8');
                this.req._readableState = { encoding: 'utf8' };
                this.req.socket = { end: noop };
                done();
            },

            'should gather string chunks': function(t) {
                var req = this.req;
                Rest.readBody(req, {}, function(err, body) {
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
                Rest.readBody(req, {}, function(err, body) {
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
                Rest.readBody(req, {}, function(err, body) {
                    t.equal(body, buff);
                    t.strictEqual(req.body, body);
                    t.done();
                })
                req.emit('data', buff);
                req.emit('end');
            },

            'should gather empty string body': function(t) {
                var req = this.req;
                // this.rest.encoding = 'utf8';
                Rest.readBody(req, {}, function(err, body) {
                    t.equal(body, '');
                    t.strictEqual(req.body, body);
                    t.done();
                })
                req.emit('end');
            },

            'should gather empty buffer body': function(t) {
                var req = this.req;
                req._readableState.encoding = null;
                Rest.readBody(req, {}, function(err, body) {
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
                    Rest.readBody(this.req, {}, function(err, body) {
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
                    Rest.readBody(req, {}, function(err) {
                        t.ok(err);
                        t.equal(err, 'mock http error');
                        t.done();
                    })
                    setTimeout(function() { req.emit('error', 'mock http error'); }, 2);
                },
            },
        },

        '_sendErrorResponse': {
            setUp: function(done) {
                this.rest = new Rest();
                this.res = mockRes();
                done();
            },

            'should set statusCode and and write string body': function(t) {
                var spy = t.spy(this.res, 'end');
                Rest._sendErrorResponse(this.res, { code: 123, message: "response" });
                t.equal(this.res.statusCode, 123);
                t.ok(spy.called);
                t.equal(spy.args[0][0], '{"code":123,"message":"response"}');
                t.done();
            },

            'should default to statusCode 500': function(t) {
                Rest._sendErrorResponse(this.res, {});
                t.equal(this.res.statusCode, 500);
                t.done();
            },

            'should json encode object body': function(t) {
                var spy = t.spy(this.res, 'end');
                var err = Rest._sendErrorResponse(this.res, { json: true });
                t.equal(this.res.statusCode, 500);
                t.deepEqual(this.res._headers, {});
                t.ok(spy.called);
                t.equal(spy.args[0][0], '{"json":true}');
                t.done();
            },
        },
    },

    'NanoRouter': {
        'setRoute should accept function': function(t) {
            var router = new Rest.NanoRouter();
            router.setRoute(noop);
            router.setRoute('/path1', noop);
            t.done();
        },

        'setRoute should accept path and function': function(t) {
            var router = new Rest.NanoRouter();
            router.setRoute('/path1', noop);
            t.deepEqual(router.getRoute('/path1'), noop);
            t.done();
        },

        'setRoute should accept path and array of 1 function': function(t) {
            var router = new Rest.NanoRouter();
            router.setRoute('/path1', [noop]);
            t.deepEqual(router.getRoute('/path1'), noop);
            t.done();
        },

        'setRoute should accept path, method and function': function(t) {
            var router = new Rest.NanoRouter();
            router.setRoute('/path1', 'FOO', noop);
            t.deepEqual(router.getRoute('/path1', 'FOO'), noop);
            t.done();
        },

        'getRoute should return the mw steps or null': function(t) {
            var router = new Rest.NanoRouter();
            router.setRoute('/path2', noop);
            t.equal(router.getRoute('/path0'), null);
            t.deepEqual(router.getRoute('/path2?a=1'), noop);
            t.done();
        },

        'getRoute should match a routed prefix': function(t) {
            var router = new Rest.NanoRouter();
            router.setRoute('/', noop);
            router.setRoute('/path', noop2);
            router.setRoute('/path/name', noop3);
            t.deepEqual(router.getRoute('/path/name'), noop3);
            t.deepEqual(router.getRoute('/path/othername'), noop2);
            t.deepEqual(router.getRoute('/otherpath'), noop);
            t.equal(router.getRoute('withoutslash'), null);
            t.done();
        },

        'deleteRoute should remove route': function(t) {
            var router = new Rest.NanoRouter();
            router.setRoute('/path1', noop);
            router.deleteRoute('/path1');
            t.equal(router.getRoute('path1'), null);
            t.done();
        },

        'setRoute should reject non-function mw': function(t) {
            var router = new Rest.NanoRouter();
            t.throws(function(){ router.setRoute(123) }, /must be a function/);
            t.throws(function(){ router.setRoute('/path', 123) }, /must be a function/);
            t.throws(function(){ router.setRoute('/path', [123]) }, /must be a function/);
            t.throws(function(){ router.setRoute('/path', {}) }, /must be a function/);
            t.done();
        },

        'setRoute should reject array of 2 functions': function(t) {
            var router = new Rest.NanoRouter();
            t.throws(function(){ router.setRoute('/path', [noop, noop]) }, /not supported/);
            t.done();
        },

        'setRoute should set use and err steps': function(t) {
            var router = new Rest.NanoRouter();
            var fn1 = function(req, res, next) {};
            router.setRoute(fn1);
            t.equal(router.routes.use, fn1);
            var fn2 = function(err, req, res, next) {};
            router.setRoute(fn2);
            t.equal(router.routes.err, fn2);
            t.done();
        },

        'runRoute should run use and mw steps': function(t) {
            var router = new Rest.NanoRouter();
            t.stub(router.routes, 'readBody').yields(null, '');
            var calls = [];
            router.setRoute(function(req, res, next) { calls.push('use1'); next() });
            router.setRoute(function(req, res, next) { calls.push('use2'); next() });
            router.setRoute('/test/path', function(req, res, next) { calls.push('path1'); next() });
            var restObj = { readBody: function(req, res, next) { req.body = "mock body"; next() }, emit: noop };
            var req = mockReq({ url: '/test/path', method: 'GET' });
            var res = {};
            router.runRoute(restObj, req, res, function(err) {
                t.ok(!err)
                t.deepEqual(calls, ['use2', 'path1']);
                t.done();
            });
            req.emit('end');
        },

        'runRoute should return error on unrouted path': function(t) {
// FIXME: not! not if could handle the error (ie, return 404 status to the caller)
            var router = new Rest.NanoRouter();
            t.stub(router.routes, 'readBody').yields(null, '');
            router.setRoute('err', function(err, req, res, next) { next(err) });
            var res = mockRes();
            router.runRoute(mockRest(), { url: '/test/url' }, res, function(err) {
                t.equal(res.statusCode, 404);
                t.done();
            })
        },

        'runRoute should return mw error': function(t) {
            var router = new Rest.NanoRouter();
            t.stub(router.routes, 'readBody').yields(null, '');
            var called = false;
            router.setRoute('/path1', function(req, res, next) { next('mock 2 mw error') });
            router.runRoute(mockRest(), { url: '/path1' }, {}, function(err) {
                t.ok(err);
                t.equal(err, 'mock 2 mw error');
                t.ok(!called);
                t.done();
            })
        },

        'runRoute should not return error if error was handled by mw': function(t) {
            var router = new Rest.NanoRouter();
            t.stub(router.routes, 'readBody').yields('mock mw error', '');
            router.setRoute('err', function(err, req, res, next) { next() });
            router.runRoute(mockRest(), { url: '/test/url' }, mockRes(), function(err) {
                t.ok(!err);
                t.done();
            })
        },

        'runRoute should catch and return mw exception': function(t) {
            var router = new Rest.NanoRouter();
            t.stub(router.routes, 'readBody').yields(null, '');
            router.setRoute('/path1', function(req, res, next) { throw 'mock 3 mw error' });
            router.runRoute(mockRest(), { url: '/path1' }, {}, function(err) {
                t.ok(err);
                t.equal(err, 'mock 3 mw error');
                t.done();
            })
        },

        'runRoute should return use error': function(t) {
            var router = new Rest.NanoRouter();
            t.stub(router.routes, 'readBody').yields(null, '');
            router.setRoute('use', function(req, res, next) { next('mock use error') });
            router.setRoute('/path1', noopStep);
            router.runRoute(mockRest(), { url: '/path1' }, {}, function(err) {
                t.equal(err, 'mock use error');
                t.done();
            })
        },

        'runRoute should return readBody error': function(t) {
            var router = new Rest.NanoRouter();
            t.stub(router.routes, 'readBody').yields('mock readBody error');
            router.setRoute('/path1', function(req, res, next) { next('mock use error') });
            router.runRoute(mockRest(), { url: '/path1' }, {}, function(err) {
                t.equal(err, 'mock readBody error');
                t.done();
            })
        },

        'runRoute should catch err mw exception': function(t) {
            var router = new Rest.NanoRouter();
            t.stub(router.routes, 'readBody').yields('mock readBody error');
            router.setRoute('/path1', function(req, res, next) { next('mock use error') });
            router.setRoute('err', function(err, req, res, next) { throw 'mock err mw error' });
            router.runRoute(mockRest(), { url: '/path1' }, {}, function(err) {
                t.ok(err);
                t.done();
            })
        },

        'runRoute should return finally error': function(t) {
            var router = new Rest.NanoRouter();
            t.stub(router.routes, 'readBody').yields(null, '');
            router.setRoute('/path1', noopStep);
            router.setRoute('post', function(req, res, next) { next('mock finally error') });
            router.runRoute(mockRest(), { url: '/path1' }, {}, function(err) {
                t.equal(err, 'mock finally error');
                t.done();
            })
        },

        'runRoute should catch finally mw exception': function(t) {
            var router = new Rest.NanoRouter();
            t.stub(router.routes, 'readBody').yields('mock readBody error');
            router.setRoute('/path1', function(req, res, next) { next('mock use error') });
            router.setRoute('post', function(err, req, res, next) { throw 'mock post mw error' });
            router.runRoute(mockRest(), { url: '/path1' }, {}, function(err) {
                t.ok(err);
                t.done();
            })
        },

        'runRoute should catch exception thrown by its callback': function(t) {
            var router = new Rest.NanoRouter();
            t.stub(router.routes, 'readBody').yields('mock readBody error');
            router.setRoute('/path1', noopStep);
            var spy = t.spy(process.stderr, 'write');
            router.runRoute(mockRest(), { url: '/path1' }, {}, function(err) {
                throw 'mock cb error';
            })
            setTimeout(function() {
                spy.restore();
                t.ok(spy.called);
                t.contains(spy.args[0][0], 'unhandled mw error');
                t.contains(spy.args[1][0], 'mw callback threw');
                t.done();
            }, 5);
        },

        'runRoute should return the unhandled error to its callback': function(t) {
            var router = new Rest.NanoRouter();
            t.stub(router.routes, 'readBody').yields(null, '');
            router.setRoute('/path1', noopStep);
            router.setRoute('post', function(req, res, next) { next('mock finally error') });
            router.runRoute(mockRest(), { url: '/path1' }, {}, function(err) {
                t.equal(err, 'mock finally error');
                t.done();
            })
        },
    },

    'end-to-end': {
        'unrouted path should return 404 Not Found': function(t) {
            t.skip();

            // launch server,
            // hit unrouted path
            // json = JSON.parse(body)
            // t.equal(json.code, 404);
            // t.equal(json.message, 'Not Found');
            // t.equal(json.debug, 'POST /test/url: path not routed');
        },
    },
}

function noopStep(req, res, next) { next() }
function noop(){};
function noop2(){};
function noop3(){};

function mockReq( opts ) {
    opts = opts || {};
    var req = new events.EventEmitter();
    req.setEncoding = noop;
    req.end = noop;
    req.read = noop;
    for (var k in opts) req[k] = opts[k];
    return req;
}

function mockRest( ) {
    var ee = new events.EventEmitter();
    ee.emitter = ee;
    ee.readBody = function(req, res, next) { req.body = "mock body"; next() };
    return ee;
}

function mockRes() {
    return {
        _headers: {},
        setHeader: function(k, v) { this._headers[k] = v },
        write: noop,
        end: noop,
    }
}

function MicroRouter( ) {
    this.routes = {};
    this.setRoute = function setRoute(path, method, mw) { this.routes[path] = mw[0] };
    this.getRoute = function getRoute(path, method) { return this.routes[path] || null };
    this.deleteRoute = function deleteRoute(path, method) { delete this.routes[path] };
    var self = this;
    this.runRoute = function runRoute(rest, req, res, next) {
        rest.readBody(req, res, function(err) {
            if (err) return next(err);
            if (self.routes[req.url]) return self.routes[req.url](req, res, next);
            // FIXME: returns as a 404 embedded inside a 500 error
            next(new Error(req.method + ' ' + req.url + ': path not routed'));
        })
    }
}

function NonRouter( ) {
    this.setRoute = function(path, method, mw) { new Error('router does not support mw') };
    this.deleteRoute = function(path, method) { return null };
    this.getRoute = function(path, method) { return null };
    this.runRoute = function(rest, req, res, next) {
        rest.readBody(req, res, function(err) {
            if (!err) try { rest.processRequest(req, res, next, req.body) } catch (e) { err = e }
            if (err) rest._sendErrorResponse(res, {code: 500, message: 'Internal Error', debug: err.message });
        })
    };
}

// openssl req -x509 -sha256 -nodes -newkey rsa:2048 -days 365 -keyout localhost.key -out localhost.cert
function mockKey( ) {
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
function mockCert( ) {
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
