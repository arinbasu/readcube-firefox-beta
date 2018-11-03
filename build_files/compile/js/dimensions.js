webpackJsonp([5],[
/* 0 */,
/* 1 */,
/* 2 */,
/* 3 */,
/* 4 */,
/* 5 */,
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

var q = __webpack_require__(8);
var urlHelper = __webpack_require__(13);
var sprintf = __webpack_require__(5).sprintf;
var C = __webpack_require__(0);

var version = chrome.runtime.getManifest().version;
var EXTENSION_HEADERS = [
  ['Sync-Version',  C.HEADER_SYNC_VERSION],
  ['X-Readcube-Sync-Token', sprintf(C.HEADER_VALUE_SYNC_TOKEN, version)],
  ['X-Readcube-Sync-Client', sprintf(C.HEADER_VALUE_SYNC_CLIENT, "chrome", version)]
];

var getAbsoluteUrl = (function() {
  var a;

  return function(url) {
    if(!a) a = document.createElement('a');
    a.href = url;

    return a.href;
  };
})();

function xhr(url, method, payload, dontParseResponse, acceptHeader) {
  var deferred = q.defer();
  var request = new XMLHttpRequest();

  // on firefox relative URLs give:
  //    SyntaxError: An invalid or illegal string was specified
  if (false) {
    url = getAbsoluteUrl(url);
  }
  request.open(method, url, true);

  request.onload = function() {
    if (request.status >= 200 && request.status < 400) {
      deferred.resolve({
        data: dontParseResponse
          ? request.responseText
          : JSON.parse(request.responseText),
        status: request.status,
        url: request.responseURL
      });
    } else {
      deferred.reject({
        status: request.status
      });
    }
  };

  request.onerror = function() {
    deferred.reject('Error in xhr.' + method);
  };

  if (urlHelper.isReadcubeUrl(url)) {
    EXTENSION_HEADERS.forEach(function(pair) {
      request.setRequestHeader(pair[0], pair[1]);
    });
  }

  if (acceptHeader) {
    request.setRequestHeader('Accept', acceptHeader);
  }

  if (payload) {
    request.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
    request.send(JSON.stringify(payload));
  } else {
    request.send();
  }

  return deferred.promise;
}

module.exports = {
  get: function(url, dontParseResponse, acceptHeader) {
    return xhr(url, 'GET', null, dontParseResponse, acceptHeader);
  },

  patch: function(url, payload) {
    return xhr(url, 'PATCH', payload);
  },

  delete: function(url) {
    return xhr(url, 'DELETE');
  },

  post: function(url, payload) {
    return xhr(url, 'POST', payload);
  }
};


/***/ }),
/* 7 */,
/* 8 */
/***/ (function(module, exports, __webpack_require__) {

/* WEBPACK VAR INJECTION */(function(process, setImmediate) {// vim:ts=4:sts=4:sw=4:
/*!
 *
 * Copyright 2009-2012 Kris Kowal under the terms of the MIT
 * license found at http://github.com/kriskowal/q/raw/master/LICENSE
 *
 * With parts by Tyler Close
 * Copyright 2007-2009 Tyler Close under the terms of the MIT X license found
 * at http://www.opensource.org/licenses/mit-license.html
 * Forked at ref_send.js version: 2009-05-11
 *
 * With parts by Mark Miller
 * Copyright (C) 2011 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

(function (definition) {
    "use strict";

    // This file will function properly as a <script> tag, or a module
    // using CommonJS and NodeJS or RequireJS module formats.  In
    // Common/Node/RequireJS, the module exports the Q API and when
    // executed as a simple <script>, it creates a Q global instead.

    // Montage Require
    if (typeof bootstrap === "function") {
        bootstrap("promise", definition);

    // CommonJS
    } else if (true) {
        module.exports = definition();

    // RequireJS
    } else if (typeof define === "function" && define.amd) {
        define(definition);

    // SES (Secure EcmaScript)
    } else if (typeof ses !== "undefined") {
        if (!ses.ok()) {
            return;
        } else {
            ses.makeQ = definition;
        }

    // <script>
    } else if (typeof window !== "undefined" || typeof self !== "undefined") {
        // Prefer window over self for add-on scripts. Use self for
        // non-windowed contexts.
        var global = typeof window !== "undefined" ? window : self;

        // Get the `window` object, save the previous Q global
        // and initialize Q as a global.
        var previousQ = global.Q;
        global.Q = definition();

        // Add a noConflict function so Q can be removed from the
        // global namespace.
        global.Q.noConflict = function () {
            global.Q = previousQ;
            return this;
        };

    } else {
        throw new Error("This environment was not anticipated by Q. Please file a bug.");
    }

})(function () {
"use strict";

var hasStacks = false;
try {
    throw new Error();
} catch (e) {
    hasStacks = !!e.stack;
}

// All code after this point will be filtered from stack traces reported
// by Q.
var qStartingLine = captureLine();
var qFileName;

// shims

// used for fallback in "allResolved"
var noop = function () {};

// Use the fastest possible means to execute a task in a future turn
// of the event loop.
var nextTick =(function () {
    // linked list of tasks (single, with head node)
    var head = {task: void 0, next: null};
    var tail = head;
    var flushing = false;
    var requestTick = void 0;
    var isNodeJS = false;
    // queue for late tasks, used by unhandled rejection tracking
    var laterQueue = [];

    function flush() {
        /* jshint loopfunc: true */
        var task, domain;

        while (head.next) {
            head = head.next;
            task = head.task;
            head.task = void 0;
            domain = head.domain;

            if (domain) {
                head.domain = void 0;
                domain.enter();
            }
            runSingle(task, domain);

        }
        while (laterQueue.length) {
            task = laterQueue.pop();
            runSingle(task);
        }
        flushing = false;
    }
    // runs a single function in the async queue
    function runSingle(task, domain) {
        try {
            task();

        } catch (e) {
            if (isNodeJS) {
                // In node, uncaught exceptions are considered fatal errors.
                // Re-throw them synchronously to interrupt flushing!

                // Ensure continuation if the uncaught exception is suppressed
                // listening "uncaughtException" events (as domains does).
                // Continue in next event to avoid tick recursion.
                if (domain) {
                    domain.exit();
                }
                setTimeout(flush, 0);
                if (domain) {
                    domain.enter();
                }

                throw e;

            } else {
                // In browsers, uncaught exceptions are not fatal.
                // Re-throw them asynchronously to avoid slow-downs.
                setTimeout(function () {
                    throw e;
                }, 0);
            }
        }

        if (domain) {
            domain.exit();
        }
    }

    nextTick = function (task) {
        tail = tail.next = {
            task: task,
            domain: isNodeJS && process.domain,
            next: null
        };

        if (!flushing) {
            flushing = true;
            requestTick();
        }
    };

    if (typeof process === "object" &&
        process.toString() === "[object process]" && process.nextTick) {
        // Ensure Q is in a real Node environment, with a `process.nextTick`.
        // To see through fake Node environments:
        // * Mocha test runner - exposes a `process` global without a `nextTick`
        // * Browserify - exposes a `process.nexTick` function that uses
        //   `setTimeout`. In this case `setImmediate` is preferred because
        //    it is faster. Browserify's `process.toString()` yields
        //   "[object Object]", while in a real Node environment
        //   `process.nextTick()` yields "[object process]".
        isNodeJS = true;

        requestTick = function () {
            process.nextTick(flush);
        };

    } else if (typeof setImmediate === "function") {
        // In IE10, Node.js 0.9+, or https://github.com/NobleJS/setImmediate
        if (typeof window !== "undefined") {
            requestTick = setImmediate.bind(window, flush);
        } else {
            requestTick = function () {
                setImmediate(flush);
            };
        }

    } else if (typeof MessageChannel !== "undefined") {
        // modern browsers
        // http://www.nonblocking.io/2011/06/windownexttick.html
        var channel = new MessageChannel();
        // At least Safari Version 6.0.5 (8536.30.1) intermittently cannot create
        // working message ports the first time a page loads.
        channel.port1.onmessage = function () {
            requestTick = requestPortTick;
            channel.port1.onmessage = flush;
            flush();
        };
        var requestPortTick = function () {
            // Opera requires us to provide a message payload, regardless of
            // whether we use it.
            channel.port2.postMessage(0);
        };
        requestTick = function () {
            setTimeout(flush, 0);
            requestPortTick();
        };

    } else {
        // old browsers
        requestTick = function () {
            setTimeout(flush, 0);
        };
    }
    // runs a task after all other tasks have been run
    // this is useful for unhandled rejection tracking that needs to happen
    // after all `then`d tasks have been run.
    nextTick.runAfter = function (task) {
        laterQueue.push(task);
        if (!flushing) {
            flushing = true;
            requestTick();
        }
    };
    return nextTick;
})();

// Attempt to make generics safe in the face of downstream
// modifications.
// There is no situation where this is necessary.
// If you need a security guarantee, these primordials need to be
// deeply frozen anyway, and if you don’t need a security guarantee,
// this is just plain paranoid.
// However, this **might** have the nice side-effect of reducing the size of
// the minified code by reducing x.call() to merely x()
// See Mark Miller’s explanation of what this does.
// http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
var call = Function.call;
function uncurryThis(f) {
    return function () {
        return call.apply(f, arguments);
    };
}
// This is equivalent, but slower:
// uncurryThis = Function_bind.bind(Function_bind.call);
// http://jsperf.com/uncurrythis

var array_slice = uncurryThis(Array.prototype.slice);

var array_reduce = uncurryThis(
    Array.prototype.reduce || function (callback, basis) {
        var index = 0,
            length = this.length;
        // concerning the initial value, if one is not provided
        if (arguments.length === 1) {
            // seek to the first value in the array, accounting
            // for the possibility that is is a sparse array
            do {
                if (index in this) {
                    basis = this[index++];
                    break;
                }
                if (++index >= length) {
                    throw new TypeError();
                }
            } while (1);
        }
        // reduce
        for (; index < length; index++) {
            // account for the possibility that the array is sparse
            if (index in this) {
                basis = callback(basis, this[index], index);
            }
        }
        return basis;
    }
);

var array_indexOf = uncurryThis(
    Array.prototype.indexOf || function (value) {
        // not a very good shim, but good enough for our one use of it
        for (var i = 0; i < this.length; i++) {
            if (this[i] === value) {
                return i;
            }
        }
        return -1;
    }
);

var array_map = uncurryThis(
    Array.prototype.map || function (callback, thisp) {
        var self = this;
        var collect = [];
        array_reduce(self, function (undefined, value, index) {
            collect.push(callback.call(thisp, value, index, self));
        }, void 0);
        return collect;
    }
);

var object_create = Object.create || function (prototype) {
    function Type() { }
    Type.prototype = prototype;
    return new Type();
};

var object_hasOwnProperty = uncurryThis(Object.prototype.hasOwnProperty);

var object_keys = Object.keys || function (object) {
    var keys = [];
    for (var key in object) {
        if (object_hasOwnProperty(object, key)) {
            keys.push(key);
        }
    }
    return keys;
};

var object_toString = uncurryThis(Object.prototype.toString);

function isObject(value) {
    return value === Object(value);
}

// generator related shims

// FIXME: Remove this function once ES6 generators are in SpiderMonkey.
function isStopIteration(exception) {
    return (
        object_toString(exception) === "[object StopIteration]" ||
        exception instanceof QReturnValue
    );
}

// FIXME: Remove this helper and Q.return once ES6 generators are in
// SpiderMonkey.
var QReturnValue;
if (typeof ReturnValue !== "undefined") {
    QReturnValue = ReturnValue;
} else {
    QReturnValue = function (value) {
        this.value = value;
    };
}

// long stack traces

var STACK_JUMP_SEPARATOR = "From previous event:";

function makeStackTraceLong(error, promise) {
    // If possible, transform the error stack trace by removing Node and Q
    // cruft, then concatenating with the stack trace of `promise`. See #57.
    if (hasStacks &&
        promise.stack &&
        typeof error === "object" &&
        error !== null &&
        error.stack &&
        error.stack.indexOf(STACK_JUMP_SEPARATOR) === -1
    ) {
        var stacks = [];
        for (var p = promise; !!p; p = p.source) {
            if (p.stack) {
                stacks.unshift(p.stack);
            }
        }
        stacks.unshift(error.stack);

        var concatedStacks = stacks.join("\n" + STACK_JUMP_SEPARATOR + "\n");
        error.stack = filterStackString(concatedStacks);
    }
}

function filterStackString(stackString) {
    var lines = stackString.split("\n");
    var desiredLines = [];
    for (var i = 0; i < lines.length; ++i) {
        var line = lines[i];

        if (!isInternalFrame(line) && !isNodeFrame(line) && line) {
            desiredLines.push(line);
        }
    }
    return desiredLines.join("\n");
}

function isNodeFrame(stackLine) {
    return stackLine.indexOf("(module.js:") !== -1 ||
           stackLine.indexOf("(node.js:") !== -1;
}

function getFileNameAndLineNumber(stackLine) {
    // Named functions: "at functionName (filename:lineNumber:columnNumber)"
    // In IE10 function name can have spaces ("Anonymous function") O_o
    var attempt1 = /at .+ \((.+):(\d+):(?:\d+)\)$/.exec(stackLine);
    if (attempt1) {
        return [attempt1[1], Number(attempt1[2])];
    }

    // Anonymous functions: "at filename:lineNumber:columnNumber"
    var attempt2 = /at ([^ ]+):(\d+):(?:\d+)$/.exec(stackLine);
    if (attempt2) {
        return [attempt2[1], Number(attempt2[2])];
    }

    // Firefox style: "function@filename:lineNumber or @filename:lineNumber"
    var attempt3 = /.*@(.+):(\d+)$/.exec(stackLine);
    if (attempt3) {
        return [attempt3[1], Number(attempt3[2])];
    }
}

function isInternalFrame(stackLine) {
    var fileNameAndLineNumber = getFileNameAndLineNumber(stackLine);

    if (!fileNameAndLineNumber) {
        return false;
    }

    var fileName = fileNameAndLineNumber[0];
    var lineNumber = fileNameAndLineNumber[1];

    return fileName === qFileName &&
        lineNumber >= qStartingLine &&
        lineNumber <= qEndingLine;
}

// discover own file name and line number range for filtering stack
// traces
function captureLine() {
    if (!hasStacks) {
        return;
    }

    try {
        throw new Error();
    } catch (e) {
        var lines = e.stack.split("\n");
        var firstLine = lines[0].indexOf("@") > 0 ? lines[1] : lines[2];
        var fileNameAndLineNumber = getFileNameAndLineNumber(firstLine);
        if (!fileNameAndLineNumber) {
            return;
        }

        qFileName = fileNameAndLineNumber[0];
        return fileNameAndLineNumber[1];
    }
}

function deprecate(callback, name, alternative) {
    return function () {
        if (typeof console !== "undefined" &&
            typeof console.warn === "function") {
            console.warn(name + " is deprecated, use " + alternative +
                         " instead.", new Error("").stack);
        }
        return callback.apply(callback, arguments);
    };
}

// end of shims
// beginning of real work

/**
 * Constructs a promise for an immediate reference, passes promises through, or
 * coerces promises from different systems.
 * @param value immediate reference or promise
 */
function Q(value) {
    // If the object is already a Promise, return it directly.  This enables
    // the resolve function to both be used to created references from objects,
    // but to tolerably coerce non-promises to promises.
    if (value instanceof Promise) {
        return value;
    }

    // assimilate thenables
    if (isPromiseAlike(value)) {
        return coerce(value);
    } else {
        return fulfill(value);
    }
}
Q.resolve = Q;

/**
 * Performs a task in a future turn of the event loop.
 * @param {Function} task
 */
Q.nextTick = nextTick;

/**
 * Controls whether or not long stack traces will be on
 */
Q.longStackSupport = false;

// enable long stacks if Q_DEBUG is set
if (typeof process === "object" && process && process.env && process.env.Q_DEBUG) {
    Q.longStackSupport = true;
}

/**
 * Constructs a {promise, resolve, reject} object.
 *
 * `resolve` is a callback to invoke with a more resolved value for the
 * promise. To fulfill the promise, invoke `resolve` with any value that is
 * not a thenable. To reject the promise, invoke `resolve` with a rejected
 * thenable, or invoke `reject` with the reason directly. To resolve the
 * promise to another thenable, thus putting it in the same state, invoke
 * `resolve` with that other thenable.
 */
Q.defer = defer;
function defer() {
    // if "messages" is an "Array", that indicates that the promise has not yet
    // been resolved.  If it is "undefined", it has been resolved.  Each
    // element of the messages array is itself an array of complete arguments to
    // forward to the resolved promise.  We coerce the resolution value to a
    // promise using the `resolve` function because it handles both fully
    // non-thenable values and other thenables gracefully.
    var messages = [], progressListeners = [], resolvedPromise;

    var deferred = object_create(defer.prototype);
    var promise = object_create(Promise.prototype);

    promise.promiseDispatch = function (resolve, op, operands) {
        var args = array_slice(arguments);
        if (messages) {
            messages.push(args);
            if (op === "when" && operands[1]) { // progress operand
                progressListeners.push(operands[1]);
            }
        } else {
            Q.nextTick(function () {
                resolvedPromise.promiseDispatch.apply(resolvedPromise, args);
            });
        }
    };

    // XXX deprecated
    promise.valueOf = function () {
        if (messages) {
            return promise;
        }
        var nearerValue = nearer(resolvedPromise);
        if (isPromise(nearerValue)) {
            resolvedPromise = nearerValue; // shorten chain
        }
        return nearerValue;
    };

    promise.inspect = function () {
        if (!resolvedPromise) {
            return { state: "pending" };
        }
        return resolvedPromise.inspect();
    };

    if (Q.longStackSupport && hasStacks) {
        try {
            throw new Error();
        } catch (e) {
            // NOTE: don't try to use `Error.captureStackTrace` or transfer the
            // accessor around; that causes memory leaks as per GH-111. Just
            // reify the stack trace as a string ASAP.
            //
            // At the same time, cut off the first line; it's always just
            // "[object Promise]\n", as per the `toString`.
            promise.stack = e.stack.substring(e.stack.indexOf("\n") + 1);
        }
    }

    // NOTE: we do the checks for `resolvedPromise` in each method, instead of
    // consolidating them into `become`, since otherwise we'd create new
    // promises with the lines `become(whatever(value))`. See e.g. GH-252.

    function become(newPromise) {
        resolvedPromise = newPromise;
        promise.source = newPromise;

        array_reduce(messages, function (undefined, message) {
            Q.nextTick(function () {
                newPromise.promiseDispatch.apply(newPromise, message);
            });
        }, void 0);

        messages = void 0;
        progressListeners = void 0;
    }

    deferred.promise = promise;
    deferred.resolve = function (value) {
        if (resolvedPromise) {
            return;
        }

        become(Q(value));
    };

    deferred.fulfill = function (value) {
        if (resolvedPromise) {
            return;
        }

        become(fulfill(value));
    };
    deferred.reject = function (reason) {
        if (resolvedPromise) {
            return;
        }

        become(reject(reason));
    };
    deferred.notify = function (progress) {
        if (resolvedPromise) {
            return;
        }

        array_reduce(progressListeners, function (undefined, progressListener) {
            Q.nextTick(function () {
                progressListener(progress);
            });
        }, void 0);
    };

    return deferred;
}

/**
 * Creates a Node-style callback that will resolve or reject the deferred
 * promise.
 * @returns a nodeback
 */
defer.prototype.makeNodeResolver = function () {
    var self = this;
    return function (error, value) {
        if (error) {
            self.reject(error);
        } else if (arguments.length > 2) {
            self.resolve(array_slice(arguments, 1));
        } else {
            self.resolve(value);
        }
    };
};

/**
 * @param resolver {Function} a function that returns nothing and accepts
 * the resolve, reject, and notify functions for a deferred.
 * @returns a promise that may be resolved with the given resolve and reject
 * functions, or rejected by a thrown exception in resolver
 */
Q.Promise = promise; // ES6
Q.promise = promise;
function promise(resolver) {
    if (typeof resolver !== "function") {
        throw new TypeError("resolver must be a function.");
    }
    var deferred = defer();
    try {
        resolver(deferred.resolve, deferred.reject, deferred.notify);
    } catch (reason) {
        deferred.reject(reason);
    }
    return deferred.promise;
}

promise.race = race; // ES6
promise.all = all; // ES6
promise.reject = reject; // ES6
promise.resolve = Q; // ES6

// XXX experimental.  This method is a way to denote that a local value is
// serializable and should be immediately dispatched to a remote upon request,
// instead of passing a reference.
Q.passByCopy = function (object) {
    //freeze(object);
    //passByCopies.set(object, true);
    return object;
};

Promise.prototype.passByCopy = function () {
    //freeze(object);
    //passByCopies.set(object, true);
    return this;
};

/**
 * If two promises eventually fulfill to the same value, promises that value,
 * but otherwise rejects.
 * @param x {Any*}
 * @param y {Any*}
 * @returns {Any*} a promise for x and y if they are the same, but a rejection
 * otherwise.
 *
 */
Q.join = function (x, y) {
    return Q(x).join(y);
};

Promise.prototype.join = function (that) {
    return Q([this, that]).spread(function (x, y) {
        if (x === y) {
            // TODO: "===" should be Object.is or equiv
            return x;
        } else {
            throw new Error("Can't join: not the same: " + x + " " + y);
        }
    });
};

/**
 * Returns a promise for the first of an array of promises to become settled.
 * @param answers {Array[Any*]} promises to race
 * @returns {Any*} the first promise to be settled
 */
Q.race = race;
function race(answerPs) {
    return promise(function (resolve, reject) {
        // Switch to this once we can assume at least ES5
        // answerPs.forEach(function (answerP) {
        //     Q(answerP).then(resolve, reject);
        // });
        // Use this in the meantime
        for (var i = 0, len = answerPs.length; i < len; i++) {
            Q(answerPs[i]).then(resolve, reject);
        }
    });
}

Promise.prototype.race = function () {
    return this.then(Q.race);
};

/**
 * Constructs a Promise with a promise descriptor object and optional fallback
 * function.  The descriptor contains methods like when(rejected), get(name),
 * set(name, value), post(name, args), and delete(name), which all
 * return either a value, a promise for a value, or a rejection.  The fallback
 * accepts the operation name, a resolver, and any further arguments that would
 * have been forwarded to the appropriate method above had a method been
 * provided with the proper name.  The API makes no guarantees about the nature
 * of the returned object, apart from that it is usable whereever promises are
 * bought and sold.
 */
Q.makePromise = Promise;
function Promise(descriptor, fallback, inspect) {
    if (fallback === void 0) {
        fallback = function (op) {
            return reject(new Error(
                "Promise does not support operation: " + op
            ));
        };
    }
    if (inspect === void 0) {
        inspect = function () {
            return {state: "unknown"};
        };
    }

    var promise = object_create(Promise.prototype);

    promise.promiseDispatch = function (resolve, op, args) {
        var result;
        try {
            if (descriptor[op]) {
                result = descriptor[op].apply(promise, args);
            } else {
                result = fallback.call(promise, op, args);
            }
        } catch (exception) {
            result = reject(exception);
        }
        if (resolve) {
            resolve(result);
        }
    };

    promise.inspect = inspect;

    // XXX deprecated `valueOf` and `exception` support
    if (inspect) {
        var inspected = inspect();
        if (inspected.state === "rejected") {
            promise.exception = inspected.reason;
        }

        promise.valueOf = function () {
            var inspected = inspect();
            if (inspected.state === "pending" ||
                inspected.state === "rejected") {
                return promise;
            }
            return inspected.value;
        };
    }

    return promise;
}

Promise.prototype.toString = function () {
    return "[object Promise]";
};

Promise.prototype.then = function (fulfilled, rejected, progressed) {
    var self = this;
    var deferred = defer();
    var done = false;   // ensure the untrusted promise makes at most a
                        // single call to one of the callbacks

    function _fulfilled(value) {
        try {
            return typeof fulfilled === "function" ? fulfilled(value) : value;
        } catch (exception) {
            return reject(exception);
        }
    }

    function _rejected(exception) {
        if (typeof rejected === "function") {
            makeStackTraceLong(exception, self);
            try {
                return rejected(exception);
            } catch (newException) {
                return reject(newException);
            }
        }
        return reject(exception);
    }

    function _progressed(value) {
        return typeof progressed === "function" ? progressed(value) : value;
    }

    Q.nextTick(function () {
        self.promiseDispatch(function (value) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_fulfilled(value));
        }, "when", [function (exception) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_rejected(exception));
        }]);
    });

    // Progress propagator need to be attached in the current tick.
    self.promiseDispatch(void 0, "when", [void 0, function (value) {
        var newValue;
        var threw = false;
        try {
            newValue = _progressed(value);
        } catch (e) {
            threw = true;
            if (Q.onerror) {
                Q.onerror(e);
            } else {
                throw e;
            }
        }

        if (!threw) {
            deferred.notify(newValue);
        }
    }]);

    return deferred.promise;
};

Q.tap = function (promise, callback) {
    return Q(promise).tap(callback);
};

/**
 * Works almost like "finally", but not called for rejections.
 * Original resolution value is passed through callback unaffected.
 * Callback may return a promise that will be awaited for.
 * @param {Function} callback
 * @returns {Q.Promise}
 * @example
 * doSomething()
 *   .then(...)
 *   .tap(console.log)
 *   .then(...);
 */
Promise.prototype.tap = function (callback) {
    callback = Q(callback);

    return this.then(function (value) {
        return callback.fcall(value).thenResolve(value);
    });
};

/**
 * Registers an observer on a promise.
 *
 * Guarantees:
 *
 * 1. that fulfilled and rejected will be called only once.
 * 2. that either the fulfilled callback or the rejected callback will be
 *    called, but not both.
 * 3. that fulfilled and rejected will not be called in this turn.
 *
 * @param value      promise or immediate reference to observe
 * @param fulfilled  function to be called with the fulfilled value
 * @param rejected   function to be called with the rejection exception
 * @param progressed function to be called on any progress notifications
 * @return promise for the return value from the invoked callback
 */
Q.when = when;
function when(value, fulfilled, rejected, progressed) {
    return Q(value).then(fulfilled, rejected, progressed);
}

Promise.prototype.thenResolve = function (value) {
    return this.then(function () { return value; });
};

Q.thenResolve = function (promise, value) {
    return Q(promise).thenResolve(value);
};

Promise.prototype.thenReject = function (reason) {
    return this.then(function () { throw reason; });
};

Q.thenReject = function (promise, reason) {
    return Q(promise).thenReject(reason);
};

/**
 * If an object is not a promise, it is as "near" as possible.
 * If a promise is rejected, it is as "near" as possible too.
 * If it’s a fulfilled promise, the fulfillment value is nearer.
 * If it’s a deferred promise and the deferred has been resolved, the
 * resolution is "nearer".
 * @param object
 * @returns most resolved (nearest) form of the object
 */

// XXX should we re-do this?
Q.nearer = nearer;
function nearer(value) {
    if (isPromise(value)) {
        var inspected = value.inspect();
        if (inspected.state === "fulfilled") {
            return inspected.value;
        }
    }
    return value;
}

/**
 * @returns whether the given object is a promise.
 * Otherwise it is a fulfilled value.
 */
Q.isPromise = isPromise;
function isPromise(object) {
    return object instanceof Promise;
}

Q.isPromiseAlike = isPromiseAlike;
function isPromiseAlike(object) {
    return isObject(object) && typeof object.then === "function";
}

/**
 * @returns whether the given object is a pending promise, meaning not
 * fulfilled or rejected.
 */
Q.isPending = isPending;
function isPending(object) {
    return isPromise(object) && object.inspect().state === "pending";
}

Promise.prototype.isPending = function () {
    return this.inspect().state === "pending";
};

/**
 * @returns whether the given object is a value or fulfilled
 * promise.
 */
Q.isFulfilled = isFulfilled;
function isFulfilled(object) {
    return !isPromise(object) || object.inspect().state === "fulfilled";
}

Promise.prototype.isFulfilled = function () {
    return this.inspect().state === "fulfilled";
};

/**
 * @returns whether the given object is a rejected promise.
 */
Q.isRejected = isRejected;
function isRejected(object) {
    return isPromise(object) && object.inspect().state === "rejected";
}

Promise.prototype.isRejected = function () {
    return this.inspect().state === "rejected";
};

//// BEGIN UNHANDLED REJECTION TRACKING

// This promise library consumes exceptions thrown in handlers so they can be
// handled by a subsequent promise.  The exceptions get added to this array when
// they are created, and removed when they are handled.  Note that in ES6 or
// shimmed environments, this would naturally be a `Set`.
var unhandledReasons = [];
var unhandledRejections = [];
var reportedUnhandledRejections = [];
var trackUnhandledRejections = true;

function resetUnhandledRejections() {
    unhandledReasons.length = 0;
    unhandledRejections.length = 0;

    if (!trackUnhandledRejections) {
        trackUnhandledRejections = true;
    }
}

function trackRejection(promise, reason) {
    if (!trackUnhandledRejections) {
        return;
    }
    if (typeof process === "object" && typeof process.emit === "function") {
        Q.nextTick.runAfter(function () {
            if (array_indexOf(unhandledRejections, promise) !== -1) {
                process.emit("unhandledRejection", reason, promise);
                reportedUnhandledRejections.push(promise);
            }
        });
    }

    unhandledRejections.push(promise);
    if (reason && typeof reason.stack !== "undefined") {
        unhandledReasons.push(reason.stack);
    } else {
        unhandledReasons.push("(no stack) " + reason);
    }
}

function untrackRejection(promise) {
    if (!trackUnhandledRejections) {
        return;
    }

    var at = array_indexOf(unhandledRejections, promise);
    if (at !== -1) {
        if (typeof process === "object" && typeof process.emit === "function") {
            Q.nextTick.runAfter(function () {
                var atReport = array_indexOf(reportedUnhandledRejections, promise);
                if (atReport !== -1) {
                    process.emit("rejectionHandled", unhandledReasons[at], promise);
                    reportedUnhandledRejections.splice(atReport, 1);
                }
            });
        }
        unhandledRejections.splice(at, 1);
        unhandledReasons.splice(at, 1);
    }
}

Q.resetUnhandledRejections = resetUnhandledRejections;

Q.getUnhandledReasons = function () {
    // Make a copy so that consumers can't interfere with our internal state.
    return unhandledReasons.slice();
};

Q.stopUnhandledRejectionTracking = function () {
    resetUnhandledRejections();
    trackUnhandledRejections = false;
};

resetUnhandledRejections();

//// END UNHANDLED REJECTION TRACKING

/**
 * Constructs a rejected promise.
 * @param reason value describing the failure
 */
Q.reject = reject;
function reject(reason) {
    var rejection = Promise({
        "when": function (rejected) {
            // note that the error has been handled
            if (rejected) {
                untrackRejection(this);
            }
            return rejected ? rejected(reason) : this;
        }
    }, function fallback() {
        return this;
    }, function inspect() {
        return { state: "rejected", reason: reason };
    });

    // Note that the reason has not been handled.
    trackRejection(rejection, reason);

    return rejection;
}

/**
 * Constructs a fulfilled promise for an immediate reference.
 * @param value immediate reference
 */
Q.fulfill = fulfill;
function fulfill(value) {
    return Promise({
        "when": function () {
            return value;
        },
        "get": function (name) {
            return value[name];
        },
        "set": function (name, rhs) {
            value[name] = rhs;
        },
        "delete": function (name) {
            delete value[name];
        },
        "post": function (name, args) {
            // Mark Miller proposes that post with no name should apply a
            // promised function.
            if (name === null || name === void 0) {
                return value.apply(void 0, args);
            } else {
                return value[name].apply(value, args);
            }
        },
        "apply": function (thisp, args) {
            return value.apply(thisp, args);
        },
        "keys": function () {
            return object_keys(value);
        }
    }, void 0, function inspect() {
        return { state: "fulfilled", value: value };
    });
}

/**
 * Converts thenables to Q promises.
 * @param promise thenable promise
 * @returns a Q promise
 */
function coerce(promise) {
    var deferred = defer();
    Q.nextTick(function () {
        try {
            promise.then(deferred.resolve, deferred.reject, deferred.notify);
        } catch (exception) {
            deferred.reject(exception);
        }
    });
    return deferred.promise;
}

/**
 * Annotates an object such that it will never be
 * transferred away from this process over any promise
 * communication channel.
 * @param object
 * @returns promise a wrapping of that object that
 * additionally responds to the "isDef" message
 * without a rejection.
 */
Q.master = master;
function master(object) {
    return Promise({
        "isDef": function () {}
    }, function fallback(op, args) {
        return dispatch(object, op, args);
    }, function () {
        return Q(object).inspect();
    });
}

/**
 * Spreads the values of a promised array of arguments into the
 * fulfillment callback.
 * @param fulfilled callback that receives variadic arguments from the
 * promised array
 * @param rejected callback that receives the exception if the promise
 * is rejected.
 * @returns a promise for the return value or thrown exception of
 * either callback.
 */
Q.spread = spread;
function spread(value, fulfilled, rejected) {
    return Q(value).spread(fulfilled, rejected);
}

Promise.prototype.spread = function (fulfilled, rejected) {
    return this.all().then(function (array) {
        return fulfilled.apply(void 0, array);
    }, rejected);
};

/**
 * The async function is a decorator for generator functions, turning
 * them into asynchronous generators.  Although generators are only part
 * of the newest ECMAScript 6 drafts, this code does not cause syntax
 * errors in older engines.  This code should continue to work and will
 * in fact improve over time as the language improves.
 *
 * ES6 generators are currently part of V8 version 3.19 with the
 * --harmony-generators runtime flag enabled.  SpiderMonkey has had them
 * for longer, but under an older Python-inspired form.  This function
 * works on both kinds of generators.
 *
 * Decorates a generator function such that:
 *  - it may yield promises
 *  - execution will continue when that promise is fulfilled
 *  - the value of the yield expression will be the fulfilled value
 *  - it returns a promise for the return value (when the generator
 *    stops iterating)
 *  - the decorated function returns a promise for the return value
 *    of the generator or the first rejected promise among those
 *    yielded.
 *  - if an error is thrown in the generator, it propagates through
 *    every following yield until it is caught, or until it escapes
 *    the generator function altogether, and is translated into a
 *    rejection for the promise returned by the decorated generator.
 */
Q.async = async;
function async(makeGenerator) {
    return function () {
        // when verb is "send", arg is a value
        // when verb is "throw", arg is an exception
        function continuer(verb, arg) {
            var result;

            // Until V8 3.19 / Chromium 29 is released, SpiderMonkey is the only
            // engine that has a deployed base of browsers that support generators.
            // However, SM's generators use the Python-inspired semantics of
            // outdated ES6 drafts.  We would like to support ES6, but we'd also
            // like to make it possible to use generators in deployed browsers, so
            // we also support Python-style generators.  At some point we can remove
            // this block.

            if (typeof StopIteration === "undefined") {
                // ES6 Generators
                try {
                    result = generator[verb](arg);
                } catch (exception) {
                    return reject(exception);
                }
                if (result.done) {
                    return Q(result.value);
                } else {
                    return when(result.value, callback, errback);
                }
            } else {
                // SpiderMonkey Generators
                // FIXME: Remove this case when SM does ES6 generators.
                try {
                    result = generator[verb](arg);
                } catch (exception) {
                    if (isStopIteration(exception)) {
                        return Q(exception.value);
                    } else {
                        return reject(exception);
                    }
                }
                return when(result, callback, errback);
            }
        }
        var generator = makeGenerator.apply(this, arguments);
        var callback = continuer.bind(continuer, "next");
        var errback = continuer.bind(continuer, "throw");
        return callback();
    };
}

/**
 * The spawn function is a small wrapper around async that immediately
 * calls the generator and also ends the promise chain, so that any
 * unhandled errors are thrown instead of forwarded to the error
 * handler. This is useful because it's extremely common to run
 * generators at the top-level to work with libraries.
 */
Q.spawn = spawn;
function spawn(makeGenerator) {
    Q.done(Q.async(makeGenerator)());
}

// FIXME: Remove this interface once ES6 generators are in SpiderMonkey.
/**
 * Throws a ReturnValue exception to stop an asynchronous generator.
 *
 * This interface is a stop-gap measure to support generator return
 * values in older Firefox/SpiderMonkey.  In browsers that support ES6
 * generators like Chromium 29, just use "return" in your generator
 * functions.
 *
 * @param value the return value for the surrounding generator
 * @throws ReturnValue exception with the value.
 * @example
 * // ES6 style
 * Q.async(function* () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      return foo + bar;
 * })
 * // Older SpiderMonkey style
 * Q.async(function () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      Q.return(foo + bar);
 * })
 */
Q["return"] = _return;
function _return(value) {
    throw new QReturnValue(value);
}

/**
 * The promised function decorator ensures that any promise arguments
 * are settled and passed as values (`this` is also settled and passed
 * as a value).  It will also ensure that the result of a function is
 * always a promise.
 *
 * @example
 * var add = Q.promised(function (a, b) {
 *     return a + b;
 * });
 * add(Q(a), Q(B));
 *
 * @param {function} callback The function to decorate
 * @returns {function} a function that has been decorated.
 */
Q.promised = promised;
function promised(callback) {
    return function () {
        return spread([this, all(arguments)], function (self, args) {
            return callback.apply(self, args);
        });
    };
}

/**
 * sends a message to a value in a future turn
 * @param object* the recipient
 * @param op the name of the message operation, e.g., "when",
 * @param args further arguments to be forwarded to the operation
 * @returns result {Promise} a promise for the result of the operation
 */
Q.dispatch = dispatch;
function dispatch(object, op, args) {
    return Q(object).dispatch(op, args);
}

Promise.prototype.dispatch = function (op, args) {
    var self = this;
    var deferred = defer();
    Q.nextTick(function () {
        self.promiseDispatch(deferred.resolve, op, args);
    });
    return deferred.promise;
};

/**
 * Gets the value of a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to get
 * @return promise for the property value
 */
Q.get = function (object, key) {
    return Q(object).dispatch("get", [key]);
};

Promise.prototype.get = function (key) {
    return this.dispatch("get", [key]);
};

/**
 * Sets the value of a property in a future turn.
 * @param object    promise or immediate reference for object object
 * @param name      name of property to set
 * @param value     new value of property
 * @return promise for the return value
 */
Q.set = function (object, key, value) {
    return Q(object).dispatch("set", [key, value]);
};

Promise.prototype.set = function (key, value) {
    return this.dispatch("set", [key, value]);
};

/**
 * Deletes a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to delete
 * @return promise for the return value
 */
Q.del = // XXX legacy
Q["delete"] = function (object, key) {
    return Q(object).dispatch("delete", [key]);
};

Promise.prototype.del = // XXX legacy
Promise.prototype["delete"] = function (key) {
    return this.dispatch("delete", [key]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param value     a value to post, typically an array of
 *                  invocation arguments for promises that
 *                  are ultimately backed with `resolve` values,
 *                  as opposed to those backed with URLs
 *                  wherein the posted value can be any
 *                  JSON serializable object.
 * @return promise for the return value
 */
// bound locally because it is used by other methods
Q.mapply = // XXX As proposed by "Redsandro"
Q.post = function (object, name, args) {
    return Q(object).dispatch("post", [name, args]);
};

Promise.prototype.mapply = // XXX As proposed by "Redsandro"
Promise.prototype.post = function (name, args) {
    return this.dispatch("post", [name, args]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param ...args   array of invocation arguments
 * @return promise for the return value
 */
Q.send = // XXX Mark Miller's proposed parlance
Q.mcall = // XXX As proposed by "Redsandro"
Q.invoke = function (object, name /*...args*/) {
    return Q(object).dispatch("post", [name, array_slice(arguments, 2)]);
};

Promise.prototype.send = // XXX Mark Miller's proposed parlance
Promise.prototype.mcall = // XXX As proposed by "Redsandro"
Promise.prototype.invoke = function (name /*...args*/) {
    return this.dispatch("post", [name, array_slice(arguments, 1)]);
};

/**
 * Applies the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param args      array of application arguments
 */
Q.fapply = function (object, args) {
    return Q(object).dispatch("apply", [void 0, args]);
};

Promise.prototype.fapply = function (args) {
    return this.dispatch("apply", [void 0, args]);
};

/**
 * Calls the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q["try"] =
Q.fcall = function (object /* ...args*/) {
    return Q(object).dispatch("apply", [void 0, array_slice(arguments, 1)]);
};

Promise.prototype.fcall = function (/*...args*/) {
    return this.dispatch("apply", [void 0, array_slice(arguments)]);
};

/**
 * Binds the promised function, transforming return values into a fulfilled
 * promise and thrown errors into a rejected one.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q.fbind = function (object /*...args*/) {
    var promise = Q(object);
    var args = array_slice(arguments, 1);
    return function fbound() {
        return promise.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
        ]);
    };
};
Promise.prototype.fbind = function (/*...args*/) {
    var promise = this;
    var args = array_slice(arguments);
    return function fbound() {
        return promise.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
        ]);
    };
};

/**
 * Requests the names of the owned properties of a promised
 * object in a future turn.
 * @param object    promise or immediate reference for target object
 * @return promise for the keys of the eventually settled object
 */
Q.keys = function (object) {
    return Q(object).dispatch("keys", []);
};

Promise.prototype.keys = function () {
    return this.dispatch("keys", []);
};

/**
 * Turns an array of promises into a promise for an array.  If any of
 * the promises gets rejected, the whole array is rejected immediately.
 * @param {Array*} an array (or promise for an array) of values (or
 * promises for values)
 * @returns a promise for an array of the corresponding values
 */
// By Mark Miller
// http://wiki.ecmascript.org/doku.php?id=strawman:concurrency&rev=1308776521#allfulfilled
Q.all = all;
function all(promises) {
    return when(promises, function (promises) {
        var pendingCount = 0;
        var deferred = defer();
        array_reduce(promises, function (undefined, promise, index) {
            var snapshot;
            if (
                isPromise(promise) &&
                (snapshot = promise.inspect()).state === "fulfilled"
            ) {
                promises[index] = snapshot.value;
            } else {
                ++pendingCount;
                when(
                    promise,
                    function (value) {
                        promises[index] = value;
                        if (--pendingCount === 0) {
                            deferred.resolve(promises);
                        }
                    },
                    deferred.reject,
                    function (progress) {
                        deferred.notify({ index: index, value: progress });
                    }
                );
            }
        }, void 0);
        if (pendingCount === 0) {
            deferred.resolve(promises);
        }
        return deferred.promise;
    });
}

Promise.prototype.all = function () {
    return all(this);
};

/**
 * Returns the first resolved promise of an array. Prior rejected promises are
 * ignored.  Rejects only if all promises are rejected.
 * @param {Array*} an array containing values or promises for values
 * @returns a promise fulfilled with the value of the first resolved promise,
 * or a rejected promise if all promises are rejected.
 */
Q.any = any;

function any(promises) {
    if (promises.length === 0) {
        return Q.resolve();
    }

    var deferred = Q.defer();
    var pendingCount = 0;
    array_reduce(promises, function (prev, current, index) {
        var promise = promises[index];

        pendingCount++;

        when(promise, onFulfilled, onRejected, onProgress);
        function onFulfilled(result) {
            deferred.resolve(result);
        }
        function onRejected() {
            pendingCount--;
            if (pendingCount === 0) {
                deferred.reject(new Error(
                    "Can't get fulfillment value from any promise, all " +
                    "promises were rejected."
                ));
            }
        }
        function onProgress(progress) {
            deferred.notify({
                index: index,
                value: progress
            });
        }
    }, undefined);

    return deferred.promise;
}

Promise.prototype.any = function () {
    return any(this);
};

/**
 * Waits for all promises to be settled, either fulfilled or
 * rejected.  This is distinct from `all` since that would stop
 * waiting at the first rejection.  The promise returned by
 * `allResolved` will never be rejected.
 * @param promises a promise for an array (or an array) of promises
 * (or values)
 * @return a promise for an array of promises
 */
Q.allResolved = deprecate(allResolved, "allResolved", "allSettled");
function allResolved(promises) {
    return when(promises, function (promises) {
        promises = array_map(promises, Q);
        return when(all(array_map(promises, function (promise) {
            return when(promise, noop, noop);
        })), function () {
            return promises;
        });
    });
}

Promise.prototype.allResolved = function () {
    return allResolved(this);
};

/**
 * @see Promise#allSettled
 */
Q.allSettled = allSettled;
function allSettled(promises) {
    return Q(promises).allSettled();
}

/**
 * Turns an array of promises into a promise for an array of their states (as
 * returned by `inspect`) when they have all settled.
 * @param {Array[Any*]} values an array (or promise for an array) of values (or
 * promises for values)
 * @returns {Array[State]} an array of states for the respective values.
 */
Promise.prototype.allSettled = function () {
    return this.then(function (promises) {
        return all(array_map(promises, function (promise) {
            promise = Q(promise);
            function regardless() {
                return promise.inspect();
            }
            return promise.then(regardless, regardless);
        }));
    });
};

/**
 * Captures the failure of a promise, giving an oportunity to recover
 * with a callback.  If the given promise is fulfilled, the returned
 * promise is fulfilled.
 * @param {Any*} promise for something
 * @param {Function} callback to fulfill the returned promise if the
 * given promise is rejected
 * @returns a promise for the return value of the callback
 */
Q.fail = // XXX legacy
Q["catch"] = function (object, rejected) {
    return Q(object).then(void 0, rejected);
};

Promise.prototype.fail = // XXX legacy
Promise.prototype["catch"] = function (rejected) {
    return this.then(void 0, rejected);
};

/**
 * Attaches a listener that can respond to progress notifications from a
 * promise's originating deferred. This listener receives the exact arguments
 * passed to ``deferred.notify``.
 * @param {Any*} promise for something
 * @param {Function} callback to receive any progress notifications
 * @returns the given promise, unchanged
 */
Q.progress = progress;
function progress(object, progressed) {
    return Q(object).then(void 0, void 0, progressed);
}

Promise.prototype.progress = function (progressed) {
    return this.then(void 0, void 0, progressed);
};

/**
 * Provides an opportunity to observe the settling of a promise,
 * regardless of whether the promise is fulfilled or rejected.  Forwards
 * the resolution to the returned promise when the callback is done.
 * The callback can return a promise to defer completion.
 * @param {Any*} promise
 * @param {Function} callback to observe the resolution of the given
 * promise, takes no arguments.
 * @returns a promise for the resolution of the given promise when
 * ``fin`` is done.
 */
Q.fin = // XXX legacy
Q["finally"] = function (object, callback) {
    return Q(object)["finally"](callback);
};

Promise.prototype.fin = // XXX legacy
Promise.prototype["finally"] = function (callback) {
    callback = Q(callback);
    return this.then(function (value) {
        return callback.fcall().then(function () {
            return value;
        });
    }, function (reason) {
        // TODO attempt to recycle the rejection with "this".
        return callback.fcall().then(function () {
            throw reason;
        });
    });
};

/**
 * Terminates a chain of promises, forcing rejections to be
 * thrown as exceptions.
 * @param {Any*} promise at the end of a chain of promises
 * @returns nothing
 */
Q.done = function (object, fulfilled, rejected, progress) {
    return Q(object).done(fulfilled, rejected, progress);
};

Promise.prototype.done = function (fulfilled, rejected, progress) {
    var onUnhandledError = function (error) {
        // forward to a future turn so that ``when``
        // does not catch it and turn it into a rejection.
        Q.nextTick(function () {
            makeStackTraceLong(error, promise);
            if (Q.onerror) {
                Q.onerror(error);
            } else {
                throw error;
            }
        });
    };

    // Avoid unnecessary `nextTick`ing via an unnecessary `when`.
    var promise = fulfilled || rejected || progress ?
        this.then(fulfilled, rejected, progress) :
        this;

    if (typeof process === "object" && process && process.domain) {
        onUnhandledError = process.domain.bind(onUnhandledError);
    }

    promise.then(void 0, onUnhandledError);
};

/**
 * Causes a promise to be rejected if it does not get fulfilled before
 * some milliseconds time out.
 * @param {Any*} promise
 * @param {Number} milliseconds timeout
 * @param {Any*} custom error message or Error object (optional)
 * @returns a promise for the resolution of the given promise if it is
 * fulfilled before the timeout, otherwise rejected.
 */
Q.timeout = function (object, ms, error) {
    return Q(object).timeout(ms, error);
};

Promise.prototype.timeout = function (ms, error) {
    var deferred = defer();
    var timeoutId = setTimeout(function () {
        if (!error || "string" === typeof error) {
            error = new Error(error || "Timed out after " + ms + " ms");
            error.code = "ETIMEDOUT";
        }
        deferred.reject(error);
    }, ms);

    this.then(function (value) {
        clearTimeout(timeoutId);
        deferred.resolve(value);
    }, function (exception) {
        clearTimeout(timeoutId);
        deferred.reject(exception);
    }, deferred.notify);

    return deferred.promise;
};

/**
 * Returns a promise for the given value (or promised value), some
 * milliseconds after it resolved. Passes rejections immediately.
 * @param {Any*} promise
 * @param {Number} milliseconds
 * @returns a promise for the resolution of the given promise after milliseconds
 * time has elapsed since the resolution of the given promise.
 * If the given promise rejects, that is passed immediately.
 */
Q.delay = function (object, timeout) {
    if (timeout === void 0) {
        timeout = object;
        object = void 0;
    }
    return Q(object).delay(timeout);
};

Promise.prototype.delay = function (timeout) {
    return this.then(function (value) {
        var deferred = defer();
        setTimeout(function () {
            deferred.resolve(value);
        }, timeout);
        return deferred.promise;
    });
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided as an array, and returns a promise.
 *
 *      Q.nfapply(FS.readFile, [__filename])
 *      .then(function (content) {
 *      })
 *
 */
Q.nfapply = function (callback, args) {
    return Q(callback).nfapply(args);
};

Promise.prototype.nfapply = function (args) {
    var deferred = defer();
    var nodeArgs = array_slice(args);
    nodeArgs.push(deferred.makeNodeResolver());
    this.fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided individually, and returns a promise.
 * @example
 * Q.nfcall(FS.readFile, __filename)
 * .then(function (content) {
 * })
 *
 */
Q.nfcall = function (callback /*...args*/) {
    var args = array_slice(arguments, 1);
    return Q(callback).nfapply(args);
};

Promise.prototype.nfcall = function (/*...args*/) {
    var nodeArgs = array_slice(arguments);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Wraps a NodeJS continuation passing function and returns an equivalent
 * version that returns a promise.
 * @example
 * Q.nfbind(FS.readFile, __filename)("utf-8")
 * .then(console.log)
 * .done()
 */
Q.nfbind =
Q.denodeify = function (callback /*...args*/) {
    var baseArgs = array_slice(arguments, 1);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        Q(callback).fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
};

Promise.prototype.nfbind =
Promise.prototype.denodeify = function (/*...args*/) {
    var args = array_slice(arguments);
    args.unshift(this);
    return Q.denodeify.apply(void 0, args);
};

Q.nbind = function (callback, thisp /*...args*/) {
    var baseArgs = array_slice(arguments, 2);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        function bound() {
            return callback.apply(thisp, arguments);
        }
        Q(bound).fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
};

Promise.prototype.nbind = function (/*thisp, ...args*/) {
    var args = array_slice(arguments, 0);
    args.unshift(this);
    return Q.nbind.apply(void 0, args);
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback with a given array of arguments, plus a provided callback.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param {Array} args arguments to pass to the method; the callback
 * will be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nmapply = // XXX As proposed by "Redsandro"
Q.npost = function (object, name, args) {
    return Q(object).npost(name, args);
};

Promise.prototype.nmapply = // XXX As proposed by "Redsandro"
Promise.prototype.npost = function (name, args) {
    var nodeArgs = array_slice(args || []);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback, forwarding the given variadic arguments, plus a provided
 * callback argument.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param ...args arguments to pass to the method; the callback will
 * be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nsend = // XXX Based on Mark Miller's proposed "send"
Q.nmcall = // XXX Based on "Redsandro's" proposal
Q.ninvoke = function (object, name /*...args*/) {
    var nodeArgs = array_slice(arguments, 2);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    Q(object).dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

Promise.prototype.nsend = // XXX Based on Mark Miller's proposed "send"
Promise.prototype.nmcall = // XXX Based on "Redsandro's" proposal
Promise.prototype.ninvoke = function (name /*...args*/) {
    var nodeArgs = array_slice(arguments, 1);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

/**
 * If a function would like to support both Node continuation-passing-style and
 * promise-returning-style, it can end its internal promise chain with
 * `nodeify(nodeback)`, forwarding the optional nodeback argument.  If the user
 * elects to use a nodeback, the result will be sent there.  If they do not
 * pass a nodeback, they will receive the result promise.
 * @param object a result (or a promise for a result)
 * @param {Function} nodeback a Node.js-style callback
 * @returns either the promise or nothing
 */
Q.nodeify = nodeify;
function nodeify(object, nodeback) {
    return Q(object).nodeify(nodeback);
}

Promise.prototype.nodeify = function (nodeback) {
    if (nodeback) {
        this.then(function (value) {
            Q.nextTick(function () {
                nodeback(null, value);
            });
        }, function (error) {
            Q.nextTick(function () {
                nodeback(error);
            });
        });
    } else {
        return this;
    }
};

Q.noConflict = function() {
    throw new Error("Q.noConflict only works when Q is used as a global");
};

// All code before this point will be filtered from stack traces.
var qEndingLine = captureLine();

return Q;

});

/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(14), __webpack_require__(20).setImmediate))

/***/ }),
/* 9 */,
/* 10 */
/***/ (function(module, exports, __webpack_require__) {

var inherit = __webpack_require__(3),
  _ = __webpack_require__(1),
  $ = __webpack_require__(4),
  sprintf = __webpack_require__(5).sprintf,
  angular = __webpack_require__(2),
  C = __webpack_require__(0),
  abstract = __webpack_require__(68);

module.exports = inherit(abstract, {

  /**
   * Insert angular directive into existing DOM
   */
  insertAngularDirectives: function () {
    if (this.getArticleHolders().length == 0) {
      //If no holder was found, do not insert the Angular
      return false;
    }
    var body = $('body');
    body.attr({
      'ng-controller': 'List as list'
    });
    body.append(__webpack_require__(30));
    this.insertButtons();
    return true;
  },

  bootstrapAngular: function() {
    angular.bootstrap($('body').get(0), ['App'], {
      strictDi: true
    });
  },

  /**
   * Get the Identifiers and Metadata for existing rows
   * @return {*|Array}
   */
  get: function () {
    return _.map(this.getArticleHolders(), function (row) {
      var elementRow = $(row);
      return _.extend(this.getIdentifiers(elementRow), {
        metadata: this.getMetadata(elementRow)
      });
    }.bind(this));
  },

  /**
   * Get the Identifiers array only. Useful for parse result verification
   *  @return {*|Array}
   */
  getPlain: function() {
    return _.map(this.getArticleHolders(), function (row) {
      return this.getIdentifiers($(row));
    }.bind(this));
  },

  /**
   * An abstract method to get the Identifiers from a result row
   * @param row
   * @return {{doi: null, pmid: null, gsid: null}}
   */
  getIdentifiers: function (row) {
    return {
      doi: null,
      pmid: null,
      gsid: null
    }
  },

  /**
   * Get the metadata from a row
   * @param row
   */
  getMetadata: function (row) {
    return {
      title: null,
      journal: null,
      year: null,
      authors: []
    }
  },

  /**
   * A list of jQuery elements when each article is described
   */
  getArticleHolders: function() {
    return [];
  },

  /**
   * If the current page is single ref (true) or multiple refs (false)
   * @return {boolean}
   */
  isAbstractPage: function () {
    return true;
  },

  /**
   * Get the element where the custom Readcube button will be injected
   * @param articleHolder A jQuery element where the article is presented
   */
  getButtonHolder: function (articleHolder) {
    return articleHolder;
  },

  /**
   * Insert the Readcube buttons
   */
  insertButtons: function () {
    var buttonText = __webpack_require__(56);
    _.each(this.getArticleHolders(), function(articleHolder, index) {
      var text = sprintf(buttonText, index);
      this.getButtonHolder($(articleHolder)).append(text);
    }.bind(this));
  },

  getAngularInjector: function(callback, injector) {
    if (!injector) {
      injector = ['$q', '$http'];
    }
    injector.push(callback);
    return angular.injector(['ng']).invoke(injector);
  },

  /**
   * Sometimes the DOI can be parsed not right after the DOM load, but based on other events
   */
  getExecutePromise: function() {
    return this.getAngularInjector(function($q) {
      return $q.resolve('The angular app can be inserted');
    }, ['$q']);
  },

  /**
   * Parse doi parameter from text of the specified element
   * @param element
   */
  getDoiFromElement: function(element) {
    if (!element || element.length == 0) {
      return null;
    }
    return _.get(element.text().match(C.REGEXP_DOI), '[0]', null);
  }
});


/***/ }),
/* 11 */
/***/ (function(module, exports) {

// Generated by CoffeeScript 1.10.0
module.exports = {
  100: 'Continue',
  101: 'Switching Protocols',
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  203: 'Non-Authoritative Information',
  204: 'No Content',
  205: 'Reset Content',
  206: 'Partial Content',
  300: 'Multiple Choices',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  305: 'Use Proxy',
  307: 'Temporary Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Time-out',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  412: 'Precondition Failed',
  413: 'Request Entity Too Large',
  414: 'Request-URI Too Large',
  415: 'Unsupported Media Type',
  416: 'Requested Range not Satisfiable',
  417: 'Expectation Failed',
  422: 'Unprocessable Entity',
  423: 'Locked',
  424: 'Failed Dependency',
  429: 'Too Many Requests',
  451: 'Unavailable For Legal Reasons',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Time-out',
  505: 'HTTP Version not Supported',
  507: 'Insufficient Storage',
  CONTINUE: 100,
  SWITCHING_PROTOCOLS: 101,
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NON_AUTHORITATIVE_INFORMATION: 203,
  NO_CONTENT: 204,
  RESET_CONTENT: 205,
  PARTIAL_CONTENT: 206,
  MULTIPLE_CHOICES: 300,
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  SEE_OTHER: 303,
  NOT_MODIFIED: 304,
  USE_PROXY: 305,
  TEMPORARY_REDIRECT: 307,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  PROXY_AUTHENTICATION_REQUIRED: 407,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  LENGTH_REQUIRED: 411,
  PRECONDITION_FAILED: 412,
  REQUEST_ENTITY_TOO_LARGE: 413,
  REQUEST_URI_TOO_LONG: 414,
  UNSUPPORTED_MEDIA_TYPE: 415,
  REQUESTED_RANGE_NOT_SATISFIABLE: 416,
  EXPECTATION_FAILED: 417,
  UNPROCESSABLE_ENTITY: 422,
  LOCKED: 423,
  FAILED_DEPENDENCY: 424,
  TOO_MANY_REQUESTS: 429,
  UNAVAILABLE_FOR_LEGAL_REASONS: 451,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  HTTP_VERSION_NOT_SUPPORTED: 505,
  INSUFFICIENT_STORAGE: 507
};


/***/ }),
/* 12 */
/***/ (function(module, exports, __webpack_require__) {

var _ = __webpack_require__(1),
  C = __webpack_require__(0),
  authorParser = __webpack_require__(77);

module.exports = {
  splitAuthorString: function(str) {
    return _.chain(str.split(/,\s|\sand\s/))
      .map(function (author) {
        return _.trim(author);
      })
      .filter(function(author) {
        return author;
      })
      .value();
  },
  getAuthorsArray: function(authorsString) {
    return _.chain(authorsString)
      .thru(function(authors) {
        return !authors || authors.length == 0 ? [] : authors.split(',');
      })
      .map(function (author) {
        return _.trim(author);
      })
      .value();
  },
  refmanToMetadata: function(refmanString) {
    var metadata = refmanString
      .split('\r\n')
      .filter(function(x) { return x; })
      .reduce(function(acc, x) {
        var data = x.split('  - ');
        acc.push(data);
        return acc;
      }, []);

    var parseAuthor = _.flow([authorParser.default, authorParser.fullnameForAuthor]);
    var authors = metadata.reduce(function(acc, pair) {
      if (pair[0] == 'A1') {
        acc.push(parseAuthor(pair[1]));
      }
      return acc;
    }, []);

    function getSingle(key) {
      var foundPair = _.find(metadata, function(pair) { return pair[0] == key; });
      return foundPair ? foundPair[1] : '';
    }

    var year = _.get(getSingle('Y1').match(C.REGEXP_YEAR), '0', '');

    return {
      title: getSingle('T1'),
      journal: getSingle('JO'),
      year: year,
      authors: authors,
      volume: getSingle('VL')
    };
  }
};


/***/ }),
/* 13 */
/***/ (function(module, exports, __webpack_require__) {

var _ = __webpack_require__(1),
  url = __webpack_require__(9),
  C = __webpack_require__(0);

var urlHelper = {

  /**
   * Get the pdf file name from an url
   *
   * @param {string} urlString
   * @return {string}
   */
  getPdfFilenameFromUrl: function (urlString) {
    if (typeof urlString !== 'string' || urlString.length === 0) {
      return '';
    }
    return _.chain(url.parse(urlString))
      .get('pathname', '')
      .thru(function(pathname) {
        return pathname.split('/');
      })
      .last()
      .thru(function(last) {
        var decodedComponent = decodeURIComponent(last).toLowerCase();
        return _.endsWith(decodedComponent, '.pdf') ? decodedComponent : '';
      })
      .value();
  },

  isReadcubeUrl: function(url) {
    return url.indexOf(C.DOMAIN_READCUBE) !== -1;
  },

  isUrlAbsolute: function(url) {
    return (url.indexOf('://') > 0 || url.indexOf('//') === 0);
  },

  /**
   * Check if the url has the corresponding protocols
   *
   * @param {string} urlString
   * @param {string[]} protocols
   * @return {boolean}
   */
  isProtocol: function (urlString, protocols) {
    if (typeof urlString !== 'string' || urlString.length == 0) {
      return false;
    }
    return _.chain(url.parse(urlString))
      .get('protocol', '')
      .thru(function(protocol) {
        return protocols.indexOf(protocol) !== -1;
      })
      .value();
  },

  getHostnameFromUrl: function(urlString) {
    if (typeof urlString !== 'string' || urlString.length === 0) {
      return '';
    }
    return url.parse(urlString).hostname;
  },

  getUrlWithoutQuery: function(urlString) {
    if (typeof urlString !== 'string' || urlString.length === 0) {
      return '';
    }
    return url.format(_.extend(url.parse(urlString), {
      hash: null,
      query: null,
      search: null
    }));
  },

  publisherWebsiteRegExps: _.reduce(C, function(acc, value, key) {
    return key.indexOf('URL_REGEXP_PUBLISHER') > -1 ? acc.concat(value) : acc;
  }, []),

  isPublisherWebsite: function(urlString) {
    if (typeof urlString !== 'string' || urlString.length === 0) {
      return false;
    }
    var cleanUrl = urlHelper.getUrlWithoutQuery(urlString);
    return urlHelper.publisherWebsiteRegExps.some(function(pattern) {
      if (typeof pattern === 'string') {
        return pattern.indexOf(cleanUrl) !== -1;
      } else {
        return pattern.test(cleanUrl);
      }
    });
  },

  isRsc: function(urlString) {
    if (typeof urlString !== 'string' || urlString.length === 0) {
      return false;
    }
    var cleanUrl = urlHelper.getUrlWithoutQuery(urlString);
    return C.URL_REGEXP_PUBLISHER_RSC.test(cleanUrl);
  },

  isGoogleScholar: function(urlString) {
    if (typeof urlString !== 'string' || urlString.length === 0) {
      return false;
    }
    var cleanUrl = urlHelper.getUrlWithoutQuery(urlString);
    return C.URL_REGEXP_SOURCE_GOOGLE_SCHOLAR.test(cleanUrl);
  },

  isPubmed: function(urlString) {
    if (typeof urlString !== 'string' || urlString.length === 0) {
      return false;
    }
    var cleanUrl = urlHelper.getUrlWithoutQuery(urlString);
    return C.URL_REGEXP_SOURCE_PUBMED.test(cleanUrl);
  },

  isReadcubeWebLibrary: function(urlString) {
    if (typeof urlString !== 'string' || urlString.length === 0) {
      return false;
    }
    var cleanUrl = urlHelper.getUrlWithoutQuery(urlString);
    return C.URL_REGEXP_WEB_LIBRARY_URL.test(cleanUrl);
  },

  isDimensions: function(urlString) {
    if (typeof urlString !== 'string' || urlString.length === 0) {
      return false;
    }
    var cleanUrl = urlHelper.getUrlWithoutQuery(urlString);
    return C.URL_REGEXP_DIMENSIONS.test(cleanUrl);
  },

};

module.exports = urlHelper;


/***/ }),
/* 14 */
/***/ (function(module, exports) {

// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };


/***/ }),
/* 15 */
/***/ (function(module, exports, __webpack_require__) {

/**
 * Define the article fields and methods
 *
 * @type {*|exports|module.exports}
 */

var inherit = __webpack_require__(3),
  _ = __webpack_require__(1),
  C = __webpack_require__(0),
  url = __webpack_require__(9);

module.exports = inherit({
  /**
   * Constructor
   *
   * @param initialParams
   * @private
   */
  __constructor: function (initialParams) {

    /**
     * Article id in Readcube library
     * For example: "eaf278f8-d0cf-425d-91b8-5f8af1eb5d89"
     * @type {String}
     */
    this.id = null;

    /**
     * PMID param
     * @type {String}
     */
    this.pmid = null;

    /**
     * DOI param
     * @type {String}
     */
    this.doi = null;

    /**
     * GSID param
     * @type {String}
     */
    this.gsid = null;

    /**
     * The current status of the article related to library
     * For example: STATUS_IN_LIBRARY, STATUS_IN_LIBRARY_WITH_PDF, etc
     */
    this.inLibraryStatus = C.STATUS_NOT_FOUND;

    /**
     * If the article button should be displayed. Used to hide the button until the response from Readcube server
     * is ready
     * @type {boolean}
     */
    this.isReadyForShowing = false;

    /**
     * Additional data for article. It contains title, journal, year, etc
     * @type {Object}
     */
    this.metadata = {};

    /**
     * The url to pdf file
     * For example: "http://thij.org/doi/pdf/10.14503/THIJ-13-4023"
     * @type {String}
     */
    this.pdfUrl = null;

    /**
     * The url currently used to download the pdf. Displayed in view.
     * For example: "http://thij.org/doi/pdf/10.14503/THIJ-13-4023"
     * @type {String}
     */
    this.usingPdfUrl = null;

    /**
     * The article url. It's returned by Readcube server.
     * For example: "http://onlinelibrary.wiley.com/doi/10.1111/izy.12097/abstract"
     * @type {String}
     */
    this.url = null;

    /**
     * The pdf content SHA256 hash
     * @type {String}
     */
    this.pdfHash = null;

    /**
     * If the article has a pdf file already uploaded to library
     * @type {Boolean}
     */
    this.hasPdf = false;

    /**
     * Article notes
     * @type {String}
     */
    this.note = '';

    /**
     *  The percent of the downloading/uploading PDF file progress
     * @type {Number}
     */
    this.progressPercent = 0;

    /**
     * The progress type: "download" or "upload"
     * @type {String}
     */
    this.progressType = C.PROGRESS_DOWNLOAD;

    if (_.isObject(initialParams)) {
      this.extend(initialParams);
    }
  },

  /**
   * Extend the instance with additional data
   * @param params Object
   * @returns Object
   */
  extend: function (params) {
    _.extend(this, params);
    return this;
  },

  /**
   * Get pmid, doi and gsid object
   */
  getIdentifiers: function () {
    return _.pick(this, ['doi', 'pmid', 'gsid']);
  },

  /**
   * Set correct status for the button
   * @param initialStatus {String} Can be "in_library" or "not_found"
   * @param pdfImportEnabled {Boolean} If it is necessary to import the PDF document
   */
  setInLibraryStatus: function (initialStatus, pdfImportEnabled) {
    if (initialStatus == C.STATUS_IN_LIBRARY) {
      //Item in library. Let's check the PDF availability
      if (pdfImportEnabled) {
        if (this.hasPdf) {
          //Article has pdf file in library
          this.inLibraryStatus = C.STATUS_IN_LIBRARY_WITH_PDF;
        } else {
          //Article without pdf. This status will allow to append the PDF later.
          this.inLibraryStatus = C.STATUS_IN_LIBRARY_WITHOUT_PDF;
        }
      } else {
        //The simple case: no pdf links and article in library
        this.inLibraryStatus = this.hasPdf ? C.STATUS_IN_LIBRARY_WITH_PDF : C.STATUS_IN_LIBRARY;
      }
    } else {
      //Not in library
      this.inLibraryStatus = C.STATUS_NOT_FOUND;
    }
    return this;
  },

  /**
   * If the article is adding metadata or downloading pdf content.
   * Used to prevent duplication clicks
   *
   * @return {Boolean}
   */
  isProcessingStatus: function () {
    return this.inLibraryStatus == C.STATUS_METADATA_ADDING
      || this.inLibraryStatus == C.STATUS_PDF_DOWNLOADING;
  },

  /**
   * When all the requests are done, put finished status depending on the active one
   * @param {Boolean} isProxyAvailable If the ezproxy url is available
   */
  finishProcessingStatus: function (isProxyAvailable) {
    if (this.hasPdf) {
      this.inLibraryStatus = C.STATUS_IN_LIBRARY_WITH_PDF;
    }
    else if (this.inLibraryStatus == C.STATUS_METADATA_ADDING) {
      this.inLibraryStatus = C.STATUS_NOT_FOUND;
    } else if (this.inLibraryStatus == C.STATUS_PDF_DOWNLOADING) {
      if (isProxyAvailable) {
        this.inLibraryStatus = C.STATUS_IN_LIBRARY_WITHOUT_PDF_WARNING_PROXY;
      } else {
        this.inLibraryStatus = C.STATUS_IN_LIBRARY_WITHOUT_PDF_WARNING;
      }
    }
  },

  /**
   * If the item is in library
   *
   * @return {Boolean}
   */
  isInLibrary: function () {
    var inLibrary = false;
    switch (this.inLibraryStatus) {
      case C.STATUS_IN_LIBRARY:
      case C.STATUS_IN_LIBRARY_WITH_PDF:
      case C.STATUS_IN_LIBRARY_WITHOUT_PDF:
      case C.STATUS_IN_LIBRARY_WITHOUT_PDF_WARNING:
      case C.STATUS_IN_LIBRARY_WITHOUT_PDF_WARNING_PROXY:
        inLibrary = true;
        break;
    }
    return inLibrary;
  },

  /**
   * If importing failed with unable to download the pdf
   *
   * @returns {boolean}
   */
  isPdfDownloadFailed: function() {
    var isFailed = false;
    switch (this.inLibraryStatus) {
      case C.STATUS_IN_LIBRARY_WITHOUT_PDF_WARNING:
      case C.STATUS_IN_LIBRARY_WITHOUT_PDF_WARNING_PROXY:
        isFailed = true;
        break;
    }
    return isFailed;
  },

  /**
   * Export article to JSON to be added to Readcube
   * @param {Object} [includeParams] If it is necessary to include additional data
   */
  toJsonForAPI: function (includeParams) {
    var exported = {
      ext_ids: this.getIdentifiers(),
      note: null,
      return_item: true
    };

    // don't send gsids with a null to server
    if (exported.ext_ids.gsid) {
      if (exported.ext_ids.gsid.indexOf('null') > -1) {
        exported.ext_ids.gsid = null;
      }
    }

    if (_.get(includeParams, 'includeMetadata', false)) {
      exported.article = this.metadata;
    }
    if (_.get(includeParams, 'includeNote', false)) {
      //TODO: Check if this can be optimized
      exported.note = this.note;
      exported.user_data = {
        notes: this.note
      };
    }
    return exported;
  },

  toJson: function() {
    var result = {};
    for (var key in this) {
      if (typeof this[key] !== 'function') {
        result[key] = this[key];
      }
    }
    return result;
  },

  /**
   * Get a pdf url for current article
   *
   * @returns {string}
   */
  getPdfUrl: function () {
    if (this.pdfUrl) {
      return this.pdfUrl;
    }
    return null;
  }
});


/***/ }),
/* 16 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var NSRange = (function () {
    function NSRange(location, length) {
        this.location = location;
        this.length = length;
    }
    NSRange.prototype.notFound = function () {
        return this.location == undefined || this.location == null;
    };
    NSRange.prototype.maxRange = function () {
        return this.location + this.length;
    };
    NSRange.prototype.sliceArray = function (array) {
        return array.slice(this.location, this.location + this.length);
    };
    return NSRange;
}());
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = NSRange;


/***/ }),
/* 17 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var nsrange_1 = __webpack_require__(16);
var particle_rules_1 = __webpack_require__(78);
var suffixes = {
    'jr': 'Jr',
    'sr': 'Sr',
    'ii': 'II',
    'iii': 'III',
    'iv': 'IV',
    'v': 'V'
};
function tryGetSuffix(str) {
    var lowered = str.toLowerCase();
    var key = lowered[lowered.length - 1] == '.'
        ? lowered.substring(0, lowered.length - 1)
        : lowered;
    return suffixes[key];
}
exports.tryGetSuffix = tryGetSuffix;
function canonicalString(value) {
    return value.trim().toLowerCase();
}
exports.canonicalString = canonicalString;
// first middle von den Last Jr
function fullnameForAuthor(author) {
    var order = ['firstName', 'middle', 'dropped', 'nondropped', 'lastName', 'suffix'];
    return order.reduce(function (acc, partName) {
        var value = author[partName];
        if (value) {
            return acc ? acc + " " + value : value;
        }
        else {
            return acc;
        }
    }, '');
}
exports.fullnameForAuthor = fullnameForAuthor;
function firstAndMiddleFromTokens(tokens) {
    var first;
    var middle;
    for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
        var name_1 = tokens_1[_i];
        if (!first) {
            first = name_1;
        }
        else if (!middle) {
            middle = name_1;
        }
        else {
            middle = middle + " " + name_1;
        }
    }
    return [first, middle];
}
exports.firstAndMiddleFromTokens = firstAndMiddleFromTokens;
function particlesRangeInTokens(tokens, particlesAtStart) {
    if (particlesAtStart === void 0) { particlesAtStart = false; }
    var tokenCount = tokens.length;
    if (tokenCount == 0) {
        return new nsrange_1.default();
    }
    var particleRange = new nsrange_1.default();
    var i = 0;
    for (var _i = 0, tokens_2 = tokens; _i < tokens_2.length; _i++) {
        var t = tokens_2[_i];
        if (t.length > 2 || t.toUpperCase() != t) {
            t = t.toLowerCase();
        }
        if (particle_rules_1.default[t]) {
            particleRange = new nsrange_1.default(i, 1);
            break;
        }
        if (particlesAtStart) {
            break;
        }
        i++;
    }
    if (tokenCount < 2) {
        return particleRange;
    }
    // optimization: all double particle start with one of the single particles,
    // so if we don't find any single, we won't find any double
    if (particleRange.notFound()) {
        return particleRange;
    }
    if (particleRange.location == undefined) {
        return particleRange;
    }
    var max = tokenCount - 1;
    if (particlesAtStart) {
        max = 1;
    }
    for (i = particleRange.location; i < max; i++) {
        var token1 = tokens[i].toLowerCase();
        var token2 = tokens[i + 1].toLowerCase();
        var twoTokens = [token1, token2];
        var candidate = twoTokens.join(' ');
        if (particle_rules_1.default[candidate]) {
            return new nsrange_1.default(i, 2);
        }
    }
    return particleRange;
}
exports.particlesRangeInTokens = particlesRangeInTokens;
function splitParticleParts(particles) {
    var particleString = particles.join(' ');
    var _a = particle_rules_1.default[particleString.toLowerCase()], dropped = _a[0], nondropped = _a[1];
    var isInitial = canonicalString(particleString).length < 2;
    var notAllCaps = isInitial || particleString.toUpperCase() != particleString;
    var joinedParticles = canonicalString(dropped + " " + nondropped);
    var notAbbreviation = canonicalString(particleString) == joinedParticles;
    if (notAllCaps && notAbbreviation) {
        var tokenStart = 0;
        var tokenIndex = 0;
        var tokenCount = particles.length;
        var getParticle = function (index, start, xs) {
            var rangeLength = index - start + 1;
            var range = new nsrange_1.default(start, rangeLength);
            return range.sliceArray(xs).join(' ');
        };
        var dropFinal = '';
        var lowerDropped = dropped.toLowerCase();
        while ((tokenIndex < tokenCount) && dropFinal.toLowerCase() != lowerDropped) {
            dropFinal = getParticle(tokenIndex, tokenStart, particles);
            tokenIndex++;
        }
        tokenStart = tokenIndex;
        var nondropFinal = '';
        var lowerNondropped = nondropped.toLowerCase();
        while ((tokenIndex < tokenCount) && nondropFinal.toLowerCase() != lowerNondropped) {
            nondropFinal = getParticle(tokenIndex, tokenStart, particles);
            tokenIndex++;
        }
        dropped = dropFinal;
        nondropped = nondropFinal;
    }
    return [dropped, nondropped];
}
exports.splitParticleParts = splitParticleParts;


/***/ }),
/* 18 */,
/* 19 */
/***/ (function(module, exports, __webpack_require__) {

/* WEBPACK VAR INJECTION */(function(global, process) {(function (global, undefined) {
    "use strict";

    if (global.setImmediate) {
        return;
    }

    var nextHandle = 1; // Spec says greater than zero
    var tasksByHandle = {};
    var currentlyRunningATask = false;
    var doc = global.document;
    var registerImmediate;

    function setImmediate(callback) {
      // Callback can either be a function or a string
      if (typeof callback !== "function") {
        callback = new Function("" + callback);
      }
      // Copy function arguments
      var args = new Array(arguments.length - 1);
      for (var i = 0; i < args.length; i++) {
          args[i] = arguments[i + 1];
      }
      // Store and register the task
      var task = { callback: callback, args: args };
      tasksByHandle[nextHandle] = task;
      registerImmediate(nextHandle);
      return nextHandle++;
    }

    function clearImmediate(handle) {
        delete tasksByHandle[handle];
    }

    function run(task) {
        var callback = task.callback;
        var args = task.args;
        switch (args.length) {
        case 0:
            callback();
            break;
        case 1:
            callback(args[0]);
            break;
        case 2:
            callback(args[0], args[1]);
            break;
        case 3:
            callback(args[0], args[1], args[2]);
            break;
        default:
            callback.apply(undefined, args);
            break;
        }
    }

    function runIfPresent(handle) {
        // From the spec: "Wait until any invocations of this algorithm started before this one have completed."
        // So if we're currently running a task, we'll need to delay this invocation.
        if (currentlyRunningATask) {
            // Delay by doing a setTimeout. setImmediate was tried instead, but in Firefox 7 it generated a
            // "too much recursion" error.
            setTimeout(runIfPresent, 0, handle);
        } else {
            var task = tasksByHandle[handle];
            if (task) {
                currentlyRunningATask = true;
                try {
                    run(task);
                } finally {
                    clearImmediate(handle);
                    currentlyRunningATask = false;
                }
            }
        }
    }

    function installNextTickImplementation() {
        registerImmediate = function(handle) {
            process.nextTick(function () { runIfPresent(handle); });
        };
    }

    function canUsePostMessage() {
        // The test against `importScripts` prevents this implementation from being installed inside a web worker,
        // where `global.postMessage` means something completely different and can't be used for this purpose.
        if (global.postMessage && !global.importScripts) {
            var postMessageIsAsynchronous = true;
            var oldOnMessage = global.onmessage;
            global.onmessage = function() {
                postMessageIsAsynchronous = false;
            };
            global.postMessage("", "*");
            global.onmessage = oldOnMessage;
            return postMessageIsAsynchronous;
        }
    }

    function installPostMessageImplementation() {
        // Installs an event handler on `global` for the `message` event: see
        // * https://developer.mozilla.org/en/DOM/window.postMessage
        // * http://www.whatwg.org/specs/web-apps/current-work/multipage/comms.html#crossDocumentMessages

        var messagePrefix = "setImmediate$" + Math.random() + "$";
        var onGlobalMessage = function(event) {
            if (event.source === global &&
                typeof event.data === "string" &&
                event.data.indexOf(messagePrefix) === 0) {
                runIfPresent(+event.data.slice(messagePrefix.length));
            }
        };

        if (global.addEventListener) {
            global.addEventListener("message", onGlobalMessage, false);
        } else {
            global.attachEvent("onmessage", onGlobalMessage);
        }

        registerImmediate = function(handle) {
            global.postMessage(messagePrefix + handle, "*");
        };
    }

    function installMessageChannelImplementation() {
        var channel = new MessageChannel();
        channel.port1.onmessage = function(event) {
            var handle = event.data;
            runIfPresent(handle);
        };

        registerImmediate = function(handle) {
            channel.port2.postMessage(handle);
        };
    }

    function installReadyStateChangeImplementation() {
        var html = doc.documentElement;
        registerImmediate = function(handle) {
            // Create a <script> element; its readystatechange event will be fired asynchronously once it is inserted
            // into the document. Do so, thus queuing up the task. Remember to clean up once it's been called.
            var script = doc.createElement("script");
            script.onreadystatechange = function () {
                runIfPresent(handle);
                script.onreadystatechange = null;
                html.removeChild(script);
                script = null;
            };
            html.appendChild(script);
        };
    }

    function installSetTimeoutImplementation() {
        registerImmediate = function(handle) {
            setTimeout(runIfPresent, 0, handle);
        };
    }

    // If supported, we should attach to the prototype of global, since that is where setTimeout et al. live.
    var attachTo = Object.getPrototypeOf && Object.getPrototypeOf(global);
    attachTo = attachTo && attachTo.setTimeout ? attachTo : global;

    // Don't get fooled by e.g. browserify environments.
    if ({}.toString.call(global.process) === "[object process]") {
        // For Node.js before 0.9
        installNextTickImplementation();

    } else if (canUsePostMessage()) {
        // For non-IE10 modern browsers
        installPostMessageImplementation();

    } else if (global.MessageChannel) {
        // For web workers, where supported
        installMessageChannelImplementation();

    } else if (doc && "onreadystatechange" in doc.createElement("script")) {
        // For IE 6–8
        installReadyStateChangeImplementation();

    } else {
        // For older browsers
        installSetTimeoutImplementation();
    }

    attachTo.setImmediate = setImmediate;
    attachTo.clearImmediate = clearImmediate;
}(typeof self === "undefined" ? typeof global === "undefined" ? this : global : self));

/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(18), __webpack_require__(14)))

/***/ }),
/* 20 */
/***/ (function(module, exports, __webpack_require__) {

var apply = Function.prototype.apply;

// DOM APIs, for completeness

exports.setTimeout = function() {
  return new Timeout(apply.call(setTimeout, window, arguments), clearTimeout);
};
exports.setInterval = function() {
  return new Timeout(apply.call(setInterval, window, arguments), clearInterval);
};
exports.clearTimeout =
exports.clearInterval = function(timeout) {
  if (timeout) {
    timeout.close();
  }
};

function Timeout(id, clearFn) {
  this._id = id;
  this._clearFn = clearFn;
}
Timeout.prototype.unref = Timeout.prototype.ref = function() {};
Timeout.prototype.close = function() {
  this._clearFn.call(window, this._id);
};

// Does not start the time, just sets up the members needed.
exports.enroll = function(item, msecs) {
  clearTimeout(item._idleTimeoutId);
  item._idleTimeout = msecs;
};

exports.unenroll = function(item) {
  clearTimeout(item._idleTimeoutId);
  item._idleTimeout = -1;
};

exports._unrefActive = exports.active = function(item) {
  clearTimeout(item._idleTimeoutId);

  var msecs = item._idleTimeout;
  if (msecs >= 0) {
    item._idleTimeoutId = setTimeout(function onTimeout() {
      if (item._onTimeout)
        item._onTimeout();
    }, msecs);
  }
};

// setimmediate attaches itself to the global object
__webpack_require__(19);
exports.setImmediate = setImmediate;
exports.clearImmediate = clearImmediate;


/***/ }),
/* 21 */
/***/ (function(module, exports, __webpack_require__) {

var angular = __webpack_require__(2),
  C = __webpack_require__(0);

angular.module('App')
  .run(["Mixpanel", function (Mixpanel) {
    var extensionVersion = chrome.runtime.getManifest().version;
    Mixpanel.setProperty(C.MIXPANEL_PROPERTY_BROWSER_EXTENSION_VERSION, extensionVersion);
    var superProperties = {};
    superProperties[C.MIXPANEL_SUPER_PROPERTY_CLIENT] = 'Browser Ext';
    superProperties[C.MIXPANEL_SUPER_PROPERTY_BROWSER_EXTENSION_VERSION] = extensionVersion;
    Mixpanel.setSuperProperty(superProperties);
    Mixpanel.union(C.MIXPANEL_PROPERTY_CLIENTS_USED, 'browser_ext');
  }]);

/***/ }),
/* 22 */
/***/ (function(module, exports, __webpack_require__) {

Mixpanel.$inject = ["$q", "User"];
var angular = __webpack_require__(2),
   mixpanel = __webpack_require__(69),
   C = __webpack_require__(0);

function Mixpanel($q, User) {
  var mixpanelInitialized = false;
  mixpanel.init(C.MIXPANEL_TOKEN, {
    api_host: C.MIXPANEL_API_URL
  });
  var methods = {
    /**
     * Get the mixpanel tracker instance
     * @returns {Promise}
     */
    get: function() {
      if (mixpanelInitialized) {
        return $q.resolve(mixpanel);
      }
      mixpanelInitialized = true;
      return User.evaluateLoggedInUserDetail().then(function(userDetails) {
        if (userDetails.id) {
          mixpanel.identify(userDetails.id);
          return mixpanel;
        }
        return $q.reject('Unable to get user id');
      }).catch(function(error) {
        console.error(error);
        return $q.reject(error);
      });
    },

    getObjectFromParams: function(propertyOrObject, value) {
      var props = {};
      if (typeof propertyOrObject === 'string') {
        props[propertyOrObject] = value;
      } else {
        props = propertyOrObject;
      }
      return props;
    },

    setProperty: function(property, value) {
      return methods.get().then(function(instance) {
        instance.people.set(methods.getObjectFromParams(property, value));
        return true;
      });
    },

    setSuperProperty: function(propertyOrObject, value) {
      return methods.get().then(function(instance) {
        instance.register(methods.getObjectFromParams(propertyOrObject, value));
        return true;
      });
    },

    incrementProperty: function(propertyOrObject, value) {
      return methods.get().then(function(instance) {
        instance.people.increment(methods.getObjectFromParams(propertyOrObject, value));
        return true;
      });
    },

    trackEvent: function(property, value) {
      return methods.get().then(function(instance) {
        instance.track(property, value);
        return true;
      });
    },

    union: function(property, value) {
      return methods.get().then(function(instance) {
        instance.people.union(property, value);
        return true;
      });
    }
  };

  return methods;
}

angular.module('App')
  .factory('Mixpanel', Mixpanel);

/***/ }),
/* 23 */
/***/ (function(module, exports, __webpack_require__) {

Message.$inject = ["$q"];
var angular = __webpack_require__(2);

function Message($q) {
  return {
    /**
     * Send a message to Background script
     * @param method {String} The method name to be executed in background, for example: "Cookie.Get"
     * @param data {Object} The parameters sent to background
     * @returns {IPromise}
     */
    sendToBackground: function(method, data) {
      var deferred = $q.defer();
      chrome.runtime.sendMessage({
        method: method,
        data: data
      }, function(response) {
        deferred.resolve(response);
      });
      return deferred.promise;
    },

    /**
     * Listen for messages from other places of the extension (Popup or Background pages)
     * Used in content scripts of a tab
     * @returns {IPromise}
     */
    listenForMessages: function (callback) {
      function listener(request, sender, sendResponse) {
        callback(request, sendResponse);
        return true;
      }

      chrome.runtime.onMessage.addListener(listener);

      window.onbeforeunload = function() {
        if (chrome.runtime.onMessage.hasListener(listener)) {
          chrome.runtime.onMessage.removeListener(listener);
        }
      };
    },

    /**
     * Send a request to active tab.
     * Used from Popup
     */
    sendToActiveTab: function(data) {
      var deferred = $q.defer();
      chrome.tabs.query({
        active: true,
        currentWindow: true
      }, function(tabs) {
        if (tabs.length == 0) {
          deferred.reject('No active tabs were found');
          return;
        }
        chrome.tabs.sendMessage(tabs[0].id, data, deferred.resolve);
      });
      return deferred.promise;
    }
  }
}

angular.module('App')
  .factory('Message', Message);

/***/ }),
/* 24 */
/***/ (function(module, exports, __webpack_require__) {

User.$inject = ["$http", "Storage", "$q"];
var angular = __webpack_require__(2),
  C = __webpack_require__(0),
  _ = __webpack_require__(1),
  xhr = __webpack_require__(6),
  url = __webpack_require__(9);

function User($http, Storage, $q) {
  var Statuses = {
    INITIAL: 0,
    PROCESSING: 1,
    DONE: 2
  };
  var userDetailsStatus = Statuses.INITIAL;
  var deferredObjectsToResolve = [];

  var methods = {
    getLoggedInUserDetails: function() {
      //Check if the logged in user is on in the storage
      return Storage.get(C.STORAGE_KEY_LOGGED_IN_USER_DETAILS, null).then(function(loggedInUserData) {
        return _.get(loggedInUserData, 'id') ? loggedInUserData : $q.reject('User data not available in the storage');
      });
    },

    /**
     * This method returns the user details from storage,
     * but also refreshes in the background data from server
     *
     * @returns {Promise}
     */
    evaluateLoggedInUserDetail: function () {
      var self = this,
        deferred = $q.defer();
      if (userDetailsStatus === Statuses.INITIAL) {
        userDetailsStatus = Statuses.PROCESSING;
        deferredObjectsToResolve.push(deferred);
        self.queryUserDetails().then(function(userDetails) {
          methods.setLoggedInUserDetails(userDetails);
          userDetailsStatus = Statuses.DONE;
          deferredObjectsToResolve.forEach(function(deferredItem) {
            deferredItem.resolve(userDetails);
          });
        }).catch(function(error) {
          self.clearLoggedInUserDetails();
          userDetailsStatus = Statuses.INITIAL;
          deferredObjectsToResolve.forEach(function(deferredItem) {
            deferredItem.reject(error);
          });
        }).finally(function() {
          deferredObjectsToResolve = [];
        });
      } else if (userDetailsStatus === Statuses.PROCESSING) {
        deferredObjectsToResolve.push(deferred);
      } else {
        return methods.getLoggedInUserDetails();
      }
      return deferred.promise;
    },

    clearProcessingStatus: function() {
      userDetailsStatus = Statuses.INITIAL;
    },

    /**
     * Get the ezproxy login url associated with user's institution
     * @returns {Promise}
     */
    getInstitutionProxy: function () {
      var self = this;
      return self.evaluateLoggedInUserDetail().then(function (userDetails) {
        var proxyUrlSelection = _.get(userDetails, 'proxy_url_selection', null);
        switch (proxyUrlSelection) {
        case C.VALUE_PROXY_URL_SELECTION_NONE:
        case C.VALUE_PROXY_URL_SELECTION_NULL:
          return $q.reject('Proxy url selection is "none" or "null"');
        case C.VALUE_PROXY_URL_SELECTION_MANUAL:
          var proxyUrl = _.get(userDetails, 'proxy_url', null);
          return proxyUrl ? proxyUrl : $q.reject('Proxy url is not available');
        case C.VALUE_PROXY_URL_SELECTION_INSTITUTION:
          var proxyUrlInstitution = _.get(userDetails, 'institution_proxy_url', null);
          return proxyUrlInstitution ? proxyUrlInstitution : $q.reject('Institution proxy url is not available');
        default:
          return $q.reject('Unknown proxy selection option');
        }
      });
    },

    /**
     * Get the sfx url, formatted with doi
     * @param {string} doi
     * @param {string} pmid
     * @returns {Promise}
     */
    getSfxUrlByDoiAndPmid: function (doi, pmid) {
      var self = this;
      return self.evaluateLoggedInUserDetail().then(function (userDetails) {
        var sfxUrl = _.get(userDetails, 'sfx_url', null);
        if (!sfxUrl) {
          return $q.reject('Sfx url is not available');
        }
        /**
         * More details on the sfx url syntax
         * @see http://www.exlibrisgroup.com/category/sfxopenurl01syntax
         */
        var parsedUrl = url.parse(sfxUrl, true);
        if (doi) {
          parsedUrl.query['__DOI__'] = 'doi:' + doi;
        }
        if (pmid) {
          parsedUrl.query['__PMID__'] = 'pmid:' + pmid;
        }
        var sfxUrlWithDoi = url.format(parsedUrl);
        return sfxUrlWithDoi
          .replace('__DOI__', 'id')
          .replace('__PMID__', 'id');
      });
    },

    getSubscriptionStatus: function() {
      var self = this;
      return self.querySubscriptionStatus().then(function (subscriptionDetails) {
        var status;
        if (subscriptionDetails.account === 'free') {
          if (subscriptionDetails.status === 'expired') {
            if (subscriptionDetails.previous_type === 'trial') {
              status = C.SUBSCRIPTION_TRIAL_EXPIRED;
            } else {
              status = C.SUBSCRIPTION_PRO_EXPIRED;
            }
          } else {
            status = C.SUBSCRIPTION_FREE;
          }
        } else {
          status = C.SUBSCRIPTION_PRO;
        }
        return status;
      }).catch(function() {
        //For some reason unable to get user details, for example user is not authorized
        return C.SUBSCRIPTION_FREE;
      });
    },

    /**
     * Save user details to chrome storage
     *
     * @param {Object} userDetails
     * @param {string} userDetails.name
     * @param {string} userDetails.email
     * @param {string} userDetails.id
     * @param {string} userDetails.institution_proxy_url
     * @param {string} userDetails.proxy_url
     * @param {?string} userDetails.proxy_url_selection
     */
    setLoggedInUserDetails: function(userDetails) {
      Storage.set(C.STORAGE_KEY_LOGGED_IN_USER_DETAILS, userDetails);
    },

    /**
     * Clear logged in user details in chrome storage
     */
    clearLoggedInUserDetails: function() {
      Storage.set(C.STORAGE_KEY_LOGGED_IN_USER_DETAILS, null);
      Storage.set(C.STORAGE_KEY_DISPLAYED_GO_PRO_TOOLTIP, false);
    },

    /**
     * Get user details from an API call
     *
     * @return {Promise}
     */
    queryUserDetails: function() {
      return xhr.get(C.URL_USER_DETAILS).then(function(response) {
        var userDetails = _.get(response, 'data', null);
        if (userDetails) {
          return {
            email: userDetails.email,
            name: userDetails.full_name,
            id: userDetails.id,
            institution: userDetails.institution,
            institution_proxy_url: userDetails.institution_proxy_url,
            proxy_url: userDetails.proxy_url,
            proxy_url_selection: userDetails.proxy_url_selection, //Available values: null, none, manual, institution,
            sfx_url: userDetails.sfx_url
          };
        } else {
          return $q.reject('Unable to get user details');
        }
      });
    },

    querySubscriptionStatus: function() {
      return xhr.get(C.URL_SUBSCRIPTION_STATUS).then(function(response) {
        var subscriptionDetails = _.get(response, 'data', null);
        return subscriptionDetails ? subscriptionDetails : $q.reject('Unable to load subscription details');
      });
    },

    logout: function() {
      return xhr.get(C.URL_LOGOUT);
    }
  };
  return methods;
}

angular.module('App')
  .factory('User', User);


/***/ }),
/* 25 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var name_string_parts_1 = __webpack_require__(74);
function buildNameString(parsedAuthor) {
    var nameString = '';
    for (var i = 0; i < name_string_parts_1.default.length; i++) {
        var partName = name_string_parts_1.default[i];
        var part = parsedAuthor[partName];
        if (part) {
            nameString = nameString + "[" + (i + 1) + "] " + part + " ";
        }
    }
    return nameString;
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = buildNameString;


/***/ }),
/* 26 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

function tokenize(str) {
    return str.split(/{(.+)}|\s/).filter(function (x) { return x; });
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = tokenize;


/***/ }),
/* 27 */
/***/ (function(module, exports) {

/**
 * Convert base64 to a ArrayBuffer
 * @param dataURI
 * @return Blob
 */

function toArrayBuffer(dataURI) {
  var byteString = atob(dataURI.split(',')[1]);
  // write the bytes of the string to an ArrayBuffer
  var ab = new ArrayBuffer(byteString.length);
  var ia = new Uint8Array(ab);
  for (var i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return ab;
}

exports.toArrayBuffer = toArrayBuffer;

/**
 * Convert base64 to a ArrayBuffer
 * @param {string} dataURI
 * @return {Blob}
 */

exports.toBlob = function (dataURI) {
  return new Blob([toArrayBuffer(dataURI)]);
};

/***/ }),
/* 28 */
/***/ (function(module, exports, __webpack_require__) {

var storage = chrome.storage.local,
  q = __webpack_require__(8);

module.exports = {
  get: function (key, def) {
    if (typeof def == 'undefined') {
      def = null;
    }
    var deferred = q.defer();
    storage.get(key, function (item) {
      if (typeof key == 'string' && item[key] == null) {
        deferred.resolve(def);
      } else if (typeof key == 'object' && item == null) {
        deferred.resolve(def);
      } else if (typeof key == 'string') {
        deferred.resolve(item[key]);
      } else {
        deferred.resolve(item);
      }
    });
    return deferred.promise;
  },
  set: function (key_or_object, value) {
    var items = {},
      deferred = q.defer();
    if (typeof key_or_object == 'string') {
      items[key_or_object] = value;
    } else if (typeof key_or_object == 'object') {
      items = key_or_object;
    } else {
      return false;
    }
    storage.set(items, deferred.resolve);
    return deferred.promise;
  }
};

/***/ }),
/* 29 */
/***/ (function(module, exports) {

module.exports = "<div class=\"tether-content\">\n  <div class=\"readcube-tooltip {{ viewClass }}\">\n    <div class=\"readcube-tooltip-icons\">\n      <span ng-if=\"viewRetry == 'yes'\" title=\"Retry\" class=\"readcube-icon-close\"\n            ng-click=\"onRetryClick($event)\">&#8634;</span>\n      <span ng-if=\"viewClose == 'yes'\" title=\"Close tooltip\" class=\"readcube-icon-close\"\n            ng-click=\"onCloseTooltipClick($event)\">×</span>\n    </div>\n\n    <div ng-include=\"viewUrl\" ng-if=\"viewUrl\" ng-controller=\"PdfWarning\"></div>\n    <div class=\"readcube-tooltip-title\" ng-if=\"viewText\">{{ viewText }}</div>\n  </div>\n</div>"

/***/ }),
/* 30 */
/***/ (function(module, exports) {

module.exports = "<div list-dropdown id=\"readcube-injected-button-dropdown\" on-add-to-library-click=\"list.onAddToLibraryClick(index)\" is-below-button=\"true\" should-display-add-button=\"true\"></div>\n<div login-iframe when-successfully-logged-in=\"list.onSuccessfullyLoggedIn(userData)\" show=\"list.loginIframe.show\"></div>\n"

/***/ }),
/* 31 */
/***/ (function(module, exports, __webpack_require__) {

var __WEBPACK_AMD_DEFINE_FACTORY__, __WEBPACK_AMD_DEFINE_RESULT__;/*! tether 1.4.0 */

(function(root, factory) {
  if (true) {
    !(__WEBPACK_AMD_DEFINE_FACTORY__ = (factory),
				__WEBPACK_AMD_DEFINE_RESULT__ = (typeof __WEBPACK_AMD_DEFINE_FACTORY__ === 'function' ?
				(__WEBPACK_AMD_DEFINE_FACTORY__.call(exports, __webpack_require__, exports, module)) :
				__WEBPACK_AMD_DEFINE_FACTORY__),
				__WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));
  } else if (typeof exports === 'object') {
    module.exports = factory(require, exports, module);
  } else {
    root.Tether = factory();
  }
}(this, function(require, exports, module) {

'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var TetherBase = undefined;
if (typeof TetherBase === 'undefined') {
  TetherBase = { modules: [] };
}

var zeroElement = null;

// Same as native getBoundingClientRect, except it takes into account parent <frame> offsets
// if the element lies within a nested document (<frame> or <iframe>-like).
function getActualBoundingClientRect(node) {
  var boundingRect = node.getBoundingClientRect();

  // The original object returned by getBoundingClientRect is immutable, so we clone it
  // We can't use extend because the properties are not considered part of the object by hasOwnProperty in IE9
  var rect = {};
  for (var k in boundingRect) {
    rect[k] = boundingRect[k];
  }

  if (node.ownerDocument !== document) {
    var _frameElement = node.ownerDocument.defaultView.frameElement;
    if (_frameElement) {
      var frameRect = getActualBoundingClientRect(_frameElement);
      rect.top += frameRect.top;
      rect.bottom += frameRect.top;
      rect.left += frameRect.left;
      rect.right += frameRect.left;
    }
  }

  return rect;
}

function getScrollParents(el) {
  // In firefox if the el is inside an iframe with display: none; window.getComputedStyle() will return null;
  // https://bugzilla.mozilla.org/show_bug.cgi?id=548397
  var computedStyle = getComputedStyle(el) || {};
  var position = computedStyle.position;
  var parents = [];

  if (position === 'fixed') {
    return [el];
  }

  var parent = el;
  while ((parent = parent.parentNode) && parent && parent.nodeType === 1) {
    var style = undefined;
    try {
      style = getComputedStyle(parent);
    } catch (err) {}

    if (typeof style === 'undefined' || style === null) {
      parents.push(parent);
      return parents;
    }

    var _style = style;
    var overflow = _style.overflow;
    var overflowX = _style.overflowX;
    var overflowY = _style.overflowY;

    if (/(auto|scroll)/.test(overflow + overflowY + overflowX)) {
      if (position !== 'absolute' || ['relative', 'absolute', 'fixed'].indexOf(style.position) >= 0) {
        parents.push(parent);
      }
    }
  }

  parents.push(el.ownerDocument.body);

  // If the node is within a frame, account for the parent window scroll
  if (el.ownerDocument !== document) {
    parents.push(el.ownerDocument.defaultView);
  }

  return parents;
}

var uniqueId = (function () {
  var id = 0;
  return function () {
    return ++id;
  };
})();

var zeroPosCache = {};
var getOrigin = function getOrigin() {
  // getBoundingClientRect is unfortunately too accurate.  It introduces a pixel or two of
  // jitter as the user scrolls that messes with our ability to detect if two positions
  // are equivilant or not.  We place an element at the top left of the page that will
  // get the same jitter, so we can cancel the two out.
  var node = zeroElement;
  if (!node || !document.body.contains(node)) {
    node = document.createElement('div');
    node.setAttribute('data-tether-id', uniqueId());
    extend(node.style, {
      top: 0,
      left: 0,
      position: 'absolute'
    });

    document.body.appendChild(node);

    zeroElement = node;
  }

  var id = node.getAttribute('data-tether-id');
  if (typeof zeroPosCache[id] === 'undefined') {
    zeroPosCache[id] = getActualBoundingClientRect(node);

    // Clear the cache when this position call is done
    defer(function () {
      delete zeroPosCache[id];
    });
  }

  return zeroPosCache[id];
};

function removeUtilElements() {
  if (zeroElement) {
    document.body.removeChild(zeroElement);
  }
  zeroElement = null;
};

function getBounds(el) {
  var doc = undefined;
  if (el === document) {
    doc = document;
    el = document.documentElement;
  } else {
    doc = el.ownerDocument;
  }

  var docEl = doc.documentElement;

  var box = getActualBoundingClientRect(el);

  var origin = getOrigin();

  box.top -= origin.top;
  box.left -= origin.left;

  if (typeof box.width === 'undefined') {
    box.width = document.body.scrollWidth - box.left - box.right;
  }
  if (typeof box.height === 'undefined') {
    box.height = document.body.scrollHeight - box.top - box.bottom;
  }

  box.top = box.top - docEl.clientTop;
  box.left = box.left - docEl.clientLeft;
  box.right = doc.body.clientWidth - box.width - box.left;
  box.bottom = doc.body.clientHeight - box.height - box.top;

  return box;
}

function getOffsetParent(el) {
  return el.offsetParent || document.documentElement;
}

var _scrollBarSize = null;
function getScrollBarSize() {
  if (_scrollBarSize) {
    return _scrollBarSize;
  }
  var inner = document.createElement('div');
  inner.style.width = '100%';
  inner.style.height = '200px';

  var outer = document.createElement('div');
  extend(outer.style, {
    position: 'absolute',
    top: 0,
    left: 0,
    pointerEvents: 'none',
    visibility: 'hidden',
    width: '200px',
    height: '150px',
    overflow: 'hidden'
  });

  outer.appendChild(inner);

  document.body.appendChild(outer);

  var widthContained = inner.offsetWidth;
  outer.style.overflow = 'scroll';
  var widthScroll = inner.offsetWidth;

  if (widthContained === widthScroll) {
    widthScroll = outer.clientWidth;
  }

  document.body.removeChild(outer);

  var width = widthContained - widthScroll;

  _scrollBarSize = { width: width, height: width };
  return _scrollBarSize;
}

function extend() {
  var out = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

  var args = [];

  Array.prototype.push.apply(args, arguments);

  args.slice(1).forEach(function (obj) {
    if (obj) {
      for (var key in obj) {
        if (({}).hasOwnProperty.call(obj, key)) {
          out[key] = obj[key];
        }
      }
    }
  });

  return out;
}

function removeClass(el, name) {
  if (typeof el.classList !== 'undefined') {
    name.split(' ').forEach(function (cls) {
      if (cls.trim()) {
        el.classList.remove(cls);
      }
    });
  } else {
    var regex = new RegExp('(^| )' + name.split(' ').join('|') + '( |$)', 'gi');
    var className = getClassName(el).replace(regex, ' ');
    setClassName(el, className);
  }
}

function addClass(el, name) {
  if (typeof el.classList !== 'undefined') {
    name.split(' ').forEach(function (cls) {
      if (cls.trim()) {
        el.classList.add(cls);
      }
    });
  } else {
    removeClass(el, name);
    var cls = getClassName(el) + (' ' + name);
    setClassName(el, cls);
  }
}

function hasClass(el, name) {
  if (typeof el.classList !== 'undefined') {
    return el.classList.contains(name);
  }
  var className = getClassName(el);
  return new RegExp('(^| )' + name + '( |$)', 'gi').test(className);
}

function getClassName(el) {
  // Can't use just SVGAnimatedString here since nodes within a Frame in IE have
  // completely separately SVGAnimatedString base classes
  if (el.className instanceof el.ownerDocument.defaultView.SVGAnimatedString) {
    return el.className.baseVal;
  }
  return el.className;
}

function setClassName(el, className) {
  el.setAttribute('class', className);
}

function updateClasses(el, add, all) {
  // Of the set of 'all' classes, we need the 'add' classes, and only the
  // 'add' classes to be set.
  all.forEach(function (cls) {
    if (add.indexOf(cls) === -1 && hasClass(el, cls)) {
      removeClass(el, cls);
    }
  });

  add.forEach(function (cls) {
    if (!hasClass(el, cls)) {
      addClass(el, cls);
    }
  });
}

var deferred = [];

var defer = function defer(fn) {
  deferred.push(fn);
};

var flush = function flush() {
  var fn = undefined;
  while (fn = deferred.pop()) {
    fn();
  }
};

var Evented = (function () {
  function Evented() {
    _classCallCheck(this, Evented);
  }

  _createClass(Evented, [{
    key: 'on',
    value: function on(event, handler, ctx) {
      var once = arguments.length <= 3 || arguments[3] === undefined ? false : arguments[3];

      if (typeof this.bindings === 'undefined') {
        this.bindings = {};
      }
      if (typeof this.bindings[event] === 'undefined') {
        this.bindings[event] = [];
      }
      this.bindings[event].push({ handler: handler, ctx: ctx, once: once });
    }
  }, {
    key: 'once',
    value: function once(event, handler, ctx) {
      this.on(event, handler, ctx, true);
    }
  }, {
    key: 'off',
    value: function off(event, handler) {
      if (typeof this.bindings === 'undefined' || typeof this.bindings[event] === 'undefined') {
        return;
      }

      if (typeof handler === 'undefined') {
        delete this.bindings[event];
      } else {
        var i = 0;
        while (i < this.bindings[event].length) {
          if (this.bindings[event][i].handler === handler) {
            this.bindings[event].splice(i, 1);
          } else {
            ++i;
          }
        }
      }
    }
  }, {
    key: 'trigger',
    value: function trigger(event) {
      if (typeof this.bindings !== 'undefined' && this.bindings[event]) {
        var i = 0;

        for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
          args[_key - 1] = arguments[_key];
        }

        while (i < this.bindings[event].length) {
          var _bindings$event$i = this.bindings[event][i];
          var handler = _bindings$event$i.handler;
          var ctx = _bindings$event$i.ctx;
          var once = _bindings$event$i.once;

          var context = ctx;
          if (typeof context === 'undefined') {
            context = this;
          }

          handler.apply(context, args);

          if (once) {
            this.bindings[event].splice(i, 1);
          } else {
            ++i;
          }
        }
      }
    }
  }]);

  return Evented;
})();

TetherBase.Utils = {
  getActualBoundingClientRect: getActualBoundingClientRect,
  getScrollParents: getScrollParents,
  getBounds: getBounds,
  getOffsetParent: getOffsetParent,
  extend: extend,
  addClass: addClass,
  removeClass: removeClass,
  hasClass: hasClass,
  updateClasses: updateClasses,
  defer: defer,
  flush: flush,
  uniqueId: uniqueId,
  Evented: Evented,
  getScrollBarSize: getScrollBarSize,
  removeUtilElements: removeUtilElements
};
/* globals TetherBase, performance */

'use strict';

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x6, _x7, _x8) { var _again = true; _function: while (_again) { var object = _x6, property = _x7, receiver = _x8; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x6 = parent; _x7 = property; _x8 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

if (typeof TetherBase === 'undefined') {
  throw new Error('You must include the utils.js file before tether.js');
}

var _TetherBase$Utils = TetherBase.Utils;
var getScrollParents = _TetherBase$Utils.getScrollParents;
var getBounds = _TetherBase$Utils.getBounds;
var getOffsetParent = _TetherBase$Utils.getOffsetParent;
var extend = _TetherBase$Utils.extend;
var addClass = _TetherBase$Utils.addClass;
var removeClass = _TetherBase$Utils.removeClass;
var updateClasses = _TetherBase$Utils.updateClasses;
var defer = _TetherBase$Utils.defer;
var flush = _TetherBase$Utils.flush;
var getScrollBarSize = _TetherBase$Utils.getScrollBarSize;
var removeUtilElements = _TetherBase$Utils.removeUtilElements;

function within(a, b) {
  var diff = arguments.length <= 2 || arguments[2] === undefined ? 1 : arguments[2];

  return a + diff >= b && b >= a - diff;
}

var transformKey = (function () {
  if (typeof document === 'undefined') {
    return '';
  }
  var el = document.createElement('div');

  var transforms = ['transform', 'WebkitTransform', 'OTransform', 'MozTransform', 'msTransform'];
  for (var i = 0; i < transforms.length; ++i) {
    var key = transforms[i];
    if (el.style[key] !== undefined) {
      return key;
    }
  }
})();

var tethers = [];

var position = function position() {
  tethers.forEach(function (tether) {
    tether.position(false);
  });
  flush();
};

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now !== 'undefined') {
    return performance.now();
  }
  return +new Date();
}

(function () {
  var lastCall = null;
  var lastDuration = null;
  var pendingTimeout = null;

  var tick = function tick() {
    if (typeof lastDuration !== 'undefined' && lastDuration > 16) {
      // We voluntarily throttle ourselves if we can't manage 60fps
      lastDuration = Math.min(lastDuration - 16, 250);

      // Just in case this is the last event, remember to position just once more
      pendingTimeout = setTimeout(tick, 250);
      return;
    }

    if (typeof lastCall !== 'undefined' && now() - lastCall < 10) {
      // Some browsers call events a little too frequently, refuse to run more than is reasonable
      return;
    }

    if (pendingTimeout != null) {
      clearTimeout(pendingTimeout);
      pendingTimeout = null;
    }

    lastCall = now();
    position();
    lastDuration = now() - lastCall;
  };

  if (typeof window !== 'undefined' && typeof window.addEventListener !== 'undefined') {
    ['resize', 'scroll', 'touchmove'].forEach(function (event) {
      window.addEventListener(event, tick);
    });
  }
})();

var MIRROR_LR = {
  center: 'center',
  left: 'right',
  right: 'left'
};

var MIRROR_TB = {
  middle: 'middle',
  top: 'bottom',
  bottom: 'top'
};

var OFFSET_MAP = {
  top: 0,
  left: 0,
  middle: '50%',
  center: '50%',
  bottom: '100%',
  right: '100%'
};

var autoToFixedAttachment = function autoToFixedAttachment(attachment, relativeToAttachment) {
  var left = attachment.left;
  var top = attachment.top;

  if (left === 'auto') {
    left = MIRROR_LR[relativeToAttachment.left];
  }

  if (top === 'auto') {
    top = MIRROR_TB[relativeToAttachment.top];
  }

  return { left: left, top: top };
};

var attachmentToOffset = function attachmentToOffset(attachment) {
  var left = attachment.left;
  var top = attachment.top;

  if (typeof OFFSET_MAP[attachment.left] !== 'undefined') {
    left = OFFSET_MAP[attachment.left];
  }

  if (typeof OFFSET_MAP[attachment.top] !== 'undefined') {
    top = OFFSET_MAP[attachment.top];
  }

  return { left: left, top: top };
};

function addOffset() {
  var out = { top: 0, left: 0 };

  for (var _len = arguments.length, offsets = Array(_len), _key = 0; _key < _len; _key++) {
    offsets[_key] = arguments[_key];
  }

  offsets.forEach(function (_ref) {
    var top = _ref.top;
    var left = _ref.left;

    if (typeof top === 'string') {
      top = parseFloat(top, 10);
    }
    if (typeof left === 'string') {
      left = parseFloat(left, 10);
    }

    out.top += top;
    out.left += left;
  });

  return out;
}

function offsetToPx(offset, size) {
  if (typeof offset.left === 'string' && offset.left.indexOf('%') !== -1) {
    offset.left = parseFloat(offset.left, 10) / 100 * size.width;
  }
  if (typeof offset.top === 'string' && offset.top.indexOf('%') !== -1) {
    offset.top = parseFloat(offset.top, 10) / 100 * size.height;
  }

  return offset;
}

var parseOffset = function parseOffset(value) {
  var _value$split = value.split(' ');

  var _value$split2 = _slicedToArray(_value$split, 2);

  var top = _value$split2[0];
  var left = _value$split2[1];

  return { top: top, left: left };
};
var parseAttachment = parseOffset;

var TetherClass = (function (_Evented) {
  _inherits(TetherClass, _Evented);

  function TetherClass(options) {
    var _this = this;

    _classCallCheck(this, TetherClass);

    _get(Object.getPrototypeOf(TetherClass.prototype), 'constructor', this).call(this);
    this.position = this.position.bind(this);

    tethers.push(this);

    this.history = [];

    this.setOptions(options, false);

    TetherBase.modules.forEach(function (module) {
      if (typeof module.initialize !== 'undefined') {
        module.initialize.call(_this);
      }
    });

    this.position();
  }

  _createClass(TetherClass, [{
    key: 'getClass',
    value: function getClass() {
      var key = arguments.length <= 0 || arguments[0] === undefined ? '' : arguments[0];
      var classes = this.options.classes;

      if (typeof classes !== 'undefined' && classes[key]) {
        return this.options.classes[key];
      } else if (this.options.classPrefix) {
        return this.options.classPrefix + '-' + key;
      } else {
        return key;
      }
    }
  }, {
    key: 'setOptions',
    value: function setOptions(options) {
      var _this2 = this;

      var pos = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];

      var defaults = {
        offset: '0 0',
        targetOffset: '0 0',
        targetAttachment: 'auto auto',
        classPrefix: 'tether'
      };

      this.options = extend(defaults, options);

      var _options = this.options;
      var element = _options.element;
      var target = _options.target;
      var targetModifier = _options.targetModifier;

      this.element = element;
      this.target = target;
      this.targetModifier = targetModifier;

      if (this.target === 'viewport') {
        this.target = document.body;
        this.targetModifier = 'visible';
      } else if (this.target === 'scroll-handle') {
        this.target = document.body;
        this.targetModifier = 'scroll-handle';
      }

      ['element', 'target'].forEach(function (key) {
        if (typeof _this2[key] === 'undefined') {
          throw new Error('Tether Error: Both element and target must be defined');
        }

        if (typeof _this2[key].jquery !== 'undefined') {
          _this2[key] = _this2[key][0];
        } else if (typeof _this2[key] === 'string') {
          _this2[key] = document.querySelector(_this2[key]);
        }
      });

      addClass(this.element, this.getClass('element'));
      if (!(this.options.addTargetClasses === false)) {
        addClass(this.target, this.getClass('target'));
      }

      if (!this.options.attachment) {
        throw new Error('Tether Error: You must provide an attachment');
      }

      this.targetAttachment = parseAttachment(this.options.targetAttachment);
      this.attachment = parseAttachment(this.options.attachment);
      this.offset = parseOffset(this.options.offset);
      this.targetOffset = parseOffset(this.options.targetOffset);

      if (typeof this.scrollParents !== 'undefined') {
        this.disable();
      }

      if (this.targetModifier === 'scroll-handle') {
        this.scrollParents = [this.target];
      } else {
        this.scrollParents = getScrollParents(this.target);
      }

      if (!(this.options.enabled === false)) {
        this.enable(pos);
      }
    }
  }, {
    key: 'getTargetBounds',
    value: function getTargetBounds() {
      if (typeof this.targetModifier !== 'undefined') {
        if (this.targetModifier === 'visible') {
          if (this.target === document.body) {
            return { top: pageYOffset, left: pageXOffset, height: innerHeight, width: innerWidth };
          } else {
            var bounds = getBounds(this.target);

            var out = {
              height: bounds.height,
              width: bounds.width,
              top: bounds.top,
              left: bounds.left
            };

            out.height = Math.min(out.height, bounds.height - (pageYOffset - bounds.top));
            out.height = Math.min(out.height, bounds.height - (bounds.top + bounds.height - (pageYOffset + innerHeight)));
            out.height = Math.min(innerHeight, out.height);
            out.height -= 2;

            out.width = Math.min(out.width, bounds.width - (pageXOffset - bounds.left));
            out.width = Math.min(out.width, bounds.width - (bounds.left + bounds.width - (pageXOffset + innerWidth)));
            out.width = Math.min(innerWidth, out.width);
            out.width -= 2;

            if (out.top < pageYOffset) {
              out.top = pageYOffset;
            }
            if (out.left < pageXOffset) {
              out.left = pageXOffset;
            }

            return out;
          }
        } else if (this.targetModifier === 'scroll-handle') {
          var bounds = undefined;
          var target = this.target;
          if (target === document.body) {
            target = document.documentElement;

            bounds = {
              left: pageXOffset,
              top: pageYOffset,
              height: innerHeight,
              width: innerWidth
            };
          } else {
            bounds = getBounds(target);
          }

          var style = getComputedStyle(target);

          var hasBottomScroll = target.scrollWidth > target.clientWidth || [style.overflow, style.overflowX].indexOf('scroll') >= 0 || this.target !== document.body;

          var scrollBottom = 0;
          if (hasBottomScroll) {
            scrollBottom = 15;
          }

          var height = bounds.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth) - scrollBottom;

          var out = {
            width: 15,
            height: height * 0.975 * (height / target.scrollHeight),
            left: bounds.left + bounds.width - parseFloat(style.borderLeftWidth) - 15
          };

          var fitAdj = 0;
          if (height < 408 && this.target === document.body) {
            fitAdj = -0.00011 * Math.pow(height, 2) - 0.00727 * height + 22.58;
          }

          if (this.target !== document.body) {
            out.height = Math.max(out.height, 24);
          }

          var scrollPercentage = this.target.scrollTop / (target.scrollHeight - height);
          out.top = scrollPercentage * (height - out.height - fitAdj) + bounds.top + parseFloat(style.borderTopWidth);

          if (this.target === document.body) {
            out.height = Math.max(out.height, 24);
          }

          return out;
        }
      } else {
        return getBounds(this.target);
      }
    }
  }, {
    key: 'clearCache',
    value: function clearCache() {
      this._cache = {};
    }
  }, {
    key: 'cache',
    value: function cache(k, getter) {
      // More than one module will often need the same DOM info, so
      // we keep a cache which is cleared on each position call
      if (typeof this._cache === 'undefined') {
        this._cache = {};
      }

      if (typeof this._cache[k] === 'undefined') {
        this._cache[k] = getter.call(this);
      }

      return this._cache[k];
    }
  }, {
    key: 'enable',
    value: function enable() {
      var _this3 = this;

      var pos = arguments.length <= 0 || arguments[0] === undefined ? true : arguments[0];

      if (!(this.options.addTargetClasses === false)) {
        addClass(this.target, this.getClass('enabled'));
      }
      addClass(this.element, this.getClass('enabled'));
      this.enabled = true;

      this.scrollParents.forEach(function (parent) {
        if (parent !== _this3.target.ownerDocument) {
          parent.addEventListener('scroll', _this3.position);
        }
      });

      if (pos) {
        this.position();
      }
    }
  }, {
    key: 'disable',
    value: function disable() {
      var _this4 = this;

      removeClass(this.target, this.getClass('enabled'));
      removeClass(this.element, this.getClass('enabled'));
      this.enabled = false;

      if (typeof this.scrollParents !== 'undefined') {
        this.scrollParents.forEach(function (parent) {
          parent.removeEventListener('scroll', _this4.position);
        });
      }
    }
  }, {
    key: 'destroy',
    value: function destroy() {
      var _this5 = this;

      this.disable();

      tethers.forEach(function (tether, i) {
        if (tether === _this5) {
          tethers.splice(i, 1);
        }
      });

      // Remove any elements we were using for convenience from the DOM
      if (tethers.length === 0) {
        removeUtilElements();
      }
    }
  }, {
    key: 'updateAttachClasses',
    value: function updateAttachClasses(elementAttach, targetAttach) {
      var _this6 = this;

      elementAttach = elementAttach || this.attachment;
      targetAttach = targetAttach || this.targetAttachment;
      var sides = ['left', 'top', 'bottom', 'right', 'middle', 'center'];

      if (typeof this._addAttachClasses !== 'undefined' && this._addAttachClasses.length) {
        // updateAttachClasses can be called more than once in a position call, so
        // we need to clean up after ourselves such that when the last defer gets
        // ran it doesn't add any extra classes from previous calls.
        this._addAttachClasses.splice(0, this._addAttachClasses.length);
      }

      if (typeof this._addAttachClasses === 'undefined') {
        this._addAttachClasses = [];
      }
      var add = this._addAttachClasses;

      if (elementAttach.top) {
        add.push(this.getClass('element-attached') + '-' + elementAttach.top);
      }
      if (elementAttach.left) {
        add.push(this.getClass('element-attached') + '-' + elementAttach.left);
      }
      if (targetAttach.top) {
        add.push(this.getClass('target-attached') + '-' + targetAttach.top);
      }
      if (targetAttach.left) {
        add.push(this.getClass('target-attached') + '-' + targetAttach.left);
      }

      var all = [];
      sides.forEach(function (side) {
        all.push(_this6.getClass('element-attached') + '-' + side);
        all.push(_this6.getClass('target-attached') + '-' + side);
      });

      defer(function () {
        if (!(typeof _this6._addAttachClasses !== 'undefined')) {
          return;
        }

        updateClasses(_this6.element, _this6._addAttachClasses, all);
        if (!(_this6.options.addTargetClasses === false)) {
          updateClasses(_this6.target, _this6._addAttachClasses, all);
        }

        delete _this6._addAttachClasses;
      });
    }
  }, {
    key: 'position',
    value: function position() {
      var _this7 = this;

      var flushChanges = arguments.length <= 0 || arguments[0] === undefined ? true : arguments[0];

      // flushChanges commits the changes immediately, leave true unless you are positioning multiple
      // tethers (in which case call Tether.Utils.flush yourself when you're done)

      if (!this.enabled) {
        return;
      }

      this.clearCache();

      // Turn 'auto' attachments into the appropriate corner or edge
      var targetAttachment = autoToFixedAttachment(this.targetAttachment, this.attachment);

      this.updateAttachClasses(this.attachment, targetAttachment);

      var elementPos = this.cache('element-bounds', function () {
        return getBounds(_this7.element);
      });

      var width = elementPos.width;
      var height = elementPos.height;

      if (width === 0 && height === 0 && typeof this.lastSize !== 'undefined') {
        var _lastSize = this.lastSize;

        // We cache the height and width to make it possible to position elements that are
        // getting hidden.
        width = _lastSize.width;
        height = _lastSize.height;
      } else {
        this.lastSize = { width: width, height: height };
      }

      var targetPos = this.cache('target-bounds', function () {
        return _this7.getTargetBounds();
      });
      var targetSize = targetPos;

      // Get an actual px offset from the attachment
      var offset = offsetToPx(attachmentToOffset(this.attachment), { width: width, height: height });
      var targetOffset = offsetToPx(attachmentToOffset(targetAttachment), targetSize);

      var manualOffset = offsetToPx(this.offset, { width: width, height: height });
      var manualTargetOffset = offsetToPx(this.targetOffset, targetSize);

      // Add the manually provided offset
      offset = addOffset(offset, manualOffset);
      targetOffset = addOffset(targetOffset, manualTargetOffset);

      // It's now our goal to make (element position + offset) == (target position + target offset)
      var left = targetPos.left + targetOffset.left - offset.left;
      var top = targetPos.top + targetOffset.top - offset.top;

      for (var i = 0; i < TetherBase.modules.length; ++i) {
        var _module2 = TetherBase.modules[i];
        var ret = _module2.position.call(this, {
          left: left,
          top: top,
          targetAttachment: targetAttachment,
          targetPos: targetPos,
          elementPos: elementPos,
          offset: offset,
          targetOffset: targetOffset,
          manualOffset: manualOffset,
          manualTargetOffset: manualTargetOffset,
          scrollbarSize: scrollbarSize,
          attachment: this.attachment
        });

        if (ret === false) {
          return false;
        } else if (typeof ret === 'undefined' || typeof ret !== 'object') {
          continue;
        } else {
          top = ret.top;
          left = ret.left;
        }
      }

      // We describe the position three different ways to give the optimizer
      // a chance to decide the best possible way to position the element
      // with the fewest repaints.
      var next = {
        // It's position relative to the page (absolute positioning when
        // the element is a child of the body)
        page: {
          top: top,
          left: left
        },

        // It's position relative to the viewport (fixed positioning)
        viewport: {
          top: top - pageYOffset,
          bottom: pageYOffset - top - height + innerHeight,
          left: left - pageXOffset,
          right: pageXOffset - left - width + innerWidth
        }
      };

      var doc = this.target.ownerDocument;
      var win = doc.defaultView;

      var scrollbarSize = undefined;
      if (win.innerHeight > doc.documentElement.clientHeight) {
        scrollbarSize = this.cache('scrollbar-size', getScrollBarSize);
        next.viewport.bottom -= scrollbarSize.height;
      }

      if (win.innerWidth > doc.documentElement.clientWidth) {
        scrollbarSize = this.cache('scrollbar-size', getScrollBarSize);
        next.viewport.right -= scrollbarSize.width;
      }

      if (['', 'static'].indexOf(doc.body.style.position) === -1 || ['', 'static'].indexOf(doc.body.parentElement.style.position) === -1) {
        // Absolute positioning in the body will be relative to the page, not the 'initial containing block'
        next.page.bottom = doc.body.scrollHeight - top - height;
        next.page.right = doc.body.scrollWidth - left - width;
      }

      if (typeof this.options.optimizations !== 'undefined' && this.options.optimizations.moveElement !== false && !(typeof this.targetModifier !== 'undefined')) {
        (function () {
          var offsetParent = _this7.cache('target-offsetparent', function () {
            return getOffsetParent(_this7.target);
          });
          var offsetPosition = _this7.cache('target-offsetparent-bounds', function () {
            return getBounds(offsetParent);
          });
          var offsetParentStyle = getComputedStyle(offsetParent);
          var offsetParentSize = offsetPosition;

          var offsetBorder = {};
          ['Top', 'Left', 'Bottom', 'Right'].forEach(function (side) {
            offsetBorder[side.toLowerCase()] = parseFloat(offsetParentStyle['border' + side + 'Width']);
          });

          offsetPosition.right = doc.body.scrollWidth - offsetPosition.left - offsetParentSize.width + offsetBorder.right;
          offsetPosition.bottom = doc.body.scrollHeight - offsetPosition.top - offsetParentSize.height + offsetBorder.bottom;

          if (next.page.top >= offsetPosition.top + offsetBorder.top && next.page.bottom >= offsetPosition.bottom) {
            if (next.page.left >= offsetPosition.left + offsetBorder.left && next.page.right >= offsetPosition.right) {
              // We're within the visible part of the target's scroll parent
              var scrollTop = offsetParent.scrollTop;
              var scrollLeft = offsetParent.scrollLeft;

              // It's position relative to the target's offset parent (absolute positioning when
              // the element is moved to be a child of the target's offset parent).
              next.offset = {
                top: next.page.top - offsetPosition.top + scrollTop - offsetBorder.top,
                left: next.page.left - offsetPosition.left + scrollLeft - offsetBorder.left
              };
            }
          }
        })();
      }

      // We could also travel up the DOM and try each containing context, rather than only
      // looking at the body, but we're gonna get diminishing returns.

      this.move(next);

      this.history.unshift(next);

      if (this.history.length > 3) {
        this.history.pop();
      }

      if (flushChanges) {
        flush();
      }

      return true;
    }

    // THE ISSUE
  }, {
    key: 'move',
    value: function move(pos) {
      var _this8 = this;

      if (!(typeof this.element.parentNode !== 'undefined')) {
        return;
      }

      var same = {};

      for (var type in pos) {
        same[type] = {};

        for (var key in pos[type]) {
          var found = false;

          for (var i = 0; i < this.history.length; ++i) {
            var point = this.history[i];
            if (typeof point[type] !== 'undefined' && !within(point[type][key], pos[type][key])) {
              found = true;
              break;
            }
          }

          if (!found) {
            same[type][key] = true;
          }
        }
      }

      var css = { top: '', left: '', right: '', bottom: '' };

      var transcribe = function transcribe(_same, _pos) {
        var hasOptimizations = typeof _this8.options.optimizations !== 'undefined';
        var gpu = hasOptimizations ? _this8.options.optimizations.gpu : null;
        if (gpu !== false) {
          var yPos = undefined,
              xPos = undefined;
          if (_same.top) {
            css.top = 0;
            yPos = _pos.top;
          } else {
            css.bottom = 0;
            yPos = -_pos.bottom;
          }

          if (_same.left) {
            css.left = 0;
            xPos = _pos.left;
          } else {
            css.right = 0;
            xPos = -_pos.right;
          }

          if (window.matchMedia) {
            // HubSpot/tether#207
            var retina = window.matchMedia('only screen and (min-resolution: 1.3dppx)').matches || window.matchMedia('only screen and (-webkit-min-device-pixel-ratio: 1.3)').matches;
            if (!retina) {
              xPos = Math.round(xPos);
              yPos = Math.round(yPos);
            }
          }

          css[transformKey] = 'translateX(' + xPos + 'px) translateY(' + yPos + 'px)';

          if (transformKey !== 'msTransform') {
            // The Z transform will keep this in the GPU (faster, and prevents artifacts),
            // but IE9 doesn't support 3d transforms and will choke.
            css[transformKey] += " translateZ(0)";
          }
        } else {
          if (_same.top) {
            css.top = _pos.top + 'px';
          } else {
            css.bottom = _pos.bottom + 'px';
          }

          if (_same.left) {
            css.left = _pos.left + 'px';
          } else {
            css.right = _pos.right + 'px';
          }
        }
      };

      var moved = false;
      if ((same.page.top || same.page.bottom) && (same.page.left || same.page.right)) {
        css.position = 'absolute';
        transcribe(same.page, pos.page);
      } else if ((same.viewport.top || same.viewport.bottom) && (same.viewport.left || same.viewport.right)) {
        css.position = 'fixed';
        transcribe(same.viewport, pos.viewport);
      } else if (typeof same.offset !== 'undefined' && same.offset.top && same.offset.left) {
        (function () {
          css.position = 'absolute';
          var offsetParent = _this8.cache('target-offsetparent', function () {
            return getOffsetParent(_this8.target);
          });

          if (getOffsetParent(_this8.element) !== offsetParent) {
            defer(function () {
              _this8.element.parentNode.removeChild(_this8.element);
              offsetParent.appendChild(_this8.element);
            });
          }

          transcribe(same.offset, pos.offset);
          moved = true;
        })();
      } else {
        css.position = 'absolute';
        transcribe({ top: true, left: true }, pos.page);
      }

      if (!moved) {
        if (this.options.bodyElement) {
          this.options.bodyElement.appendChild(this.element);
        } else {
          var offsetParentIsBody = true;
          var currentNode = this.element.parentNode;
          while (currentNode && currentNode.nodeType === 1 && currentNode.tagName !== 'BODY') {
            if (getComputedStyle(currentNode).position !== 'static') {
              offsetParentIsBody = false;
              break;
            }

            currentNode = currentNode.parentNode;
          }

          if (!offsetParentIsBody) {
            this.element.parentNode.removeChild(this.element);
            this.element.ownerDocument.body.appendChild(this.element);
          }
        }
      }

      // Any css change will trigger a repaint, so let's avoid one if nothing changed
      var writeCSS = {};
      var write = false;
      for (var key in css) {
        var val = css[key];
        var elVal = this.element.style[key];

        if (elVal !== val) {
          write = true;
          writeCSS[key] = val;
        }
      }

      if (write) {
        defer(function () {
          extend(_this8.element.style, writeCSS);
          _this8.trigger('repositioned');
        });
      }
    }
  }]);

  return TetherClass;
})(Evented);

TetherClass.modules = [];

TetherBase.position = position;

var Tether = extend(TetherClass, TetherBase);
/* globals TetherBase */

'use strict';

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

var _TetherBase$Utils = TetherBase.Utils;
var getBounds = _TetherBase$Utils.getBounds;
var extend = _TetherBase$Utils.extend;
var updateClasses = _TetherBase$Utils.updateClasses;
var defer = _TetherBase$Utils.defer;

var BOUNDS_FORMAT = ['left', 'top', 'right', 'bottom'];

function getBoundingRect(tether, to) {
  if (to === 'scrollParent') {
    to = tether.scrollParents[0];
  } else if (to === 'window') {
    to = [pageXOffset, pageYOffset, innerWidth + pageXOffset, innerHeight + pageYOffset];
  }

  if (to === document) {
    to = to.documentElement;
  }

  if (typeof to.nodeType !== 'undefined') {
    (function () {
      var node = to;
      var size = getBounds(to);
      var pos = size;
      var style = getComputedStyle(to);

      to = [pos.left, pos.top, size.width + pos.left, size.height + pos.top];

      // Account any parent Frames scroll offset
      if (node.ownerDocument !== document) {
        var win = node.ownerDocument.defaultView;
        to[0] += win.pageXOffset;
        to[1] += win.pageYOffset;
        to[2] += win.pageXOffset;
        to[3] += win.pageYOffset;
      }

      BOUNDS_FORMAT.forEach(function (side, i) {
        side = side[0].toUpperCase() + side.substr(1);
        if (side === 'Top' || side === 'Left') {
          to[i] += parseFloat(style['border' + side + 'Width']);
        } else {
          to[i] -= parseFloat(style['border' + side + 'Width']);
        }
      });
    })();
  }

  return to;
}

TetherBase.modules.push({
  position: function position(_ref) {
    var _this = this;

    var top = _ref.top;
    var left = _ref.left;
    var targetAttachment = _ref.targetAttachment;

    if (!this.options.constraints) {
      return true;
    }

    var _cache = this.cache('element-bounds', function () {
      return getBounds(_this.element);
    });

    var height = _cache.height;
    var width = _cache.width;

    if (width === 0 && height === 0 && typeof this.lastSize !== 'undefined') {
      var _lastSize = this.lastSize;

      // Handle the item getting hidden as a result of our positioning without glitching
      // the classes in and out
      width = _lastSize.width;
      height = _lastSize.height;
    }

    var targetSize = this.cache('target-bounds', function () {
      return _this.getTargetBounds();
    });

    var targetHeight = targetSize.height;
    var targetWidth = targetSize.width;

    var allClasses = [this.getClass('pinned'), this.getClass('out-of-bounds')];

    this.options.constraints.forEach(function (constraint) {
      var outOfBoundsClass = constraint.outOfBoundsClass;
      var pinnedClass = constraint.pinnedClass;

      if (outOfBoundsClass) {
        allClasses.push(outOfBoundsClass);
      }
      if (pinnedClass) {
        allClasses.push(pinnedClass);
      }
    });

    allClasses.forEach(function (cls) {
      ['left', 'top', 'right', 'bottom'].forEach(function (side) {
        allClasses.push(cls + '-' + side);
      });
    });

    var addClasses = [];

    var tAttachment = extend({}, targetAttachment);
    var eAttachment = extend({}, this.attachment);

    this.options.constraints.forEach(function (constraint) {
      var to = constraint.to;
      var attachment = constraint.attachment;
      var pin = constraint.pin;

      if (typeof attachment === 'undefined') {
        attachment = '';
      }

      var changeAttachX = undefined,
          changeAttachY = undefined;
      if (attachment.indexOf(' ') >= 0) {
        var _attachment$split = attachment.split(' ');

        var _attachment$split2 = _slicedToArray(_attachment$split, 2);

        changeAttachY = _attachment$split2[0];
        changeAttachX = _attachment$split2[1];
      } else {
        changeAttachX = changeAttachY = attachment;
      }

      var bounds = getBoundingRect(_this, to);

      if (changeAttachY === 'target' || changeAttachY === 'both') {
        if (top < bounds[1] && tAttachment.top === 'top') {
          top += targetHeight;
          tAttachment.top = 'bottom';
        }

        if (top + height > bounds[3] && tAttachment.top === 'bottom') {
          top -= targetHeight;
          tAttachment.top = 'top';
        }
      }

      if (changeAttachY === 'together') {
        if (tAttachment.top === 'top') {
          if (eAttachment.top === 'bottom' && top < bounds[1]) {
            top += targetHeight;
            tAttachment.top = 'bottom';

            top += height;
            eAttachment.top = 'top';
          } else if (eAttachment.top === 'top' && top + height > bounds[3] && top - (height - targetHeight) >= bounds[1]) {
            top -= height - targetHeight;
            tAttachment.top = 'bottom';

            eAttachment.top = 'bottom';
          }
        }

        if (tAttachment.top === 'bottom') {
          if (eAttachment.top === 'top' && top + height > bounds[3]) {
            top -= targetHeight;
            tAttachment.top = 'top';

            top -= height;
            eAttachment.top = 'bottom';
          } else if (eAttachment.top === 'bottom' && top < bounds[1] && top + (height * 2 - targetHeight) <= bounds[3]) {
            top += height - targetHeight;
            tAttachment.top = 'top';

            eAttachment.top = 'top';
          }
        }

        if (tAttachment.top === 'middle') {
          if (top + height > bounds[3] && eAttachment.top === 'top') {
            top -= height;
            eAttachment.top = 'bottom';
          } else if (top < bounds[1] && eAttachment.top === 'bottom') {
            top += height;
            eAttachment.top = 'top';
          }
        }
      }

      if (changeAttachX === 'target' || changeAttachX === 'both') {
        if (left < bounds[0] && tAttachment.left === 'left') {
          left += targetWidth;
          tAttachment.left = 'right';
        }

        if (left + width > bounds[2] && tAttachment.left === 'right') {
          left -= targetWidth;
          tAttachment.left = 'left';
        }
      }

      if (changeAttachX === 'together') {
        if (left < bounds[0] && tAttachment.left === 'left') {
          if (eAttachment.left === 'right') {
            left += targetWidth;
            tAttachment.left = 'right';

            left += width;
            eAttachment.left = 'left';
          } else if (eAttachment.left === 'left') {
            left += targetWidth;
            tAttachment.left = 'right';

            left -= width;
            eAttachment.left = 'right';
          }
        } else if (left + width > bounds[2] && tAttachment.left === 'right') {
          if (eAttachment.left === 'left') {
            left -= targetWidth;
            tAttachment.left = 'left';

            left -= width;
            eAttachment.left = 'right';
          } else if (eAttachment.left === 'right') {
            left -= targetWidth;
            tAttachment.left = 'left';

            left += width;
            eAttachment.left = 'left';
          }
        } else if (tAttachment.left === 'center') {
          if (left + width > bounds[2] && eAttachment.left === 'left') {
            left -= width;
            eAttachment.left = 'right';
          } else if (left < bounds[0] && eAttachment.left === 'right') {
            left += width;
            eAttachment.left = 'left';
          }
        }
      }

      if (changeAttachY === 'element' || changeAttachY === 'both') {
        if (top < bounds[1] && eAttachment.top === 'bottom') {
          top += height;
          eAttachment.top = 'top';
        }

        if (top + height > bounds[3] && eAttachment.top === 'top') {
          top -= height;
          eAttachment.top = 'bottom';
        }
      }

      if (changeAttachX === 'element' || changeAttachX === 'both') {
        if (left < bounds[0]) {
          if (eAttachment.left === 'right') {
            left += width;
            eAttachment.left = 'left';
          } else if (eAttachment.left === 'center') {
            left += width / 2;
            eAttachment.left = 'left';
          }
        }

        if (left + width > bounds[2]) {
          if (eAttachment.left === 'left') {
            left -= width;
            eAttachment.left = 'right';
          } else if (eAttachment.left === 'center') {
            left -= width / 2;
            eAttachment.left = 'right';
          }
        }
      }

      if (typeof pin === 'string') {
        pin = pin.split(',').map(function (p) {
          return p.trim();
        });
      } else if (pin === true) {
        pin = ['top', 'left', 'right', 'bottom'];
      }

      pin = pin || [];

      var pinned = [];
      var oob = [];

      if (top < bounds[1]) {
        if (pin.indexOf('top') >= 0) {
          top = bounds[1];
          pinned.push('top');
        } else {
          oob.push('top');
        }
      }

      if (top + height > bounds[3]) {
        if (pin.indexOf('bottom') >= 0) {
          top = bounds[3] - height;
          pinned.push('bottom');
        } else {
          oob.push('bottom');
        }
      }

      if (left < bounds[0]) {
        if (pin.indexOf('left') >= 0) {
          left = bounds[0];
          pinned.push('left');
        } else {
          oob.push('left');
        }
      }

      if (left + width > bounds[2]) {
        if (pin.indexOf('right') >= 0) {
          left = bounds[2] - width;
          pinned.push('right');
        } else {
          oob.push('right');
        }
      }

      if (pinned.length) {
        (function () {
          var pinnedClass = undefined;
          if (typeof _this.options.pinnedClass !== 'undefined') {
            pinnedClass = _this.options.pinnedClass;
          } else {
            pinnedClass = _this.getClass('pinned');
          }

          addClasses.push(pinnedClass);
          pinned.forEach(function (side) {
            addClasses.push(pinnedClass + '-' + side);
          });
        })();
      }

      if (oob.length) {
        (function () {
          var oobClass = undefined;
          if (typeof _this.options.outOfBoundsClass !== 'undefined') {
            oobClass = _this.options.outOfBoundsClass;
          } else {
            oobClass = _this.getClass('out-of-bounds');
          }

          addClasses.push(oobClass);
          oob.forEach(function (side) {
            addClasses.push(oobClass + '-' + side);
          });
        })();
      }

      if (pinned.indexOf('left') >= 0 || pinned.indexOf('right') >= 0) {
        eAttachment.left = tAttachment.left = false;
      }
      if (pinned.indexOf('top') >= 0 || pinned.indexOf('bottom') >= 0) {
        eAttachment.top = tAttachment.top = false;
      }

      if (tAttachment.top !== targetAttachment.top || tAttachment.left !== targetAttachment.left || eAttachment.top !== _this.attachment.top || eAttachment.left !== _this.attachment.left) {
        _this.updateAttachClasses(eAttachment, tAttachment);
        _this.trigger('update', {
          attachment: eAttachment,
          targetAttachment: tAttachment
        });
      }
    });

    defer(function () {
      if (!(_this.options.addTargetClasses === false)) {
        updateClasses(_this.target, addClasses, allClasses);
      }
      updateClasses(_this.element, addClasses, allClasses);
    });

    return { top: top, left: left };
  }
});
/* globals TetherBase */

'use strict';

var _TetherBase$Utils = TetherBase.Utils;
var getBounds = _TetherBase$Utils.getBounds;
var updateClasses = _TetherBase$Utils.updateClasses;
var defer = _TetherBase$Utils.defer;

TetherBase.modules.push({
  position: function position(_ref) {
    var _this = this;

    var top = _ref.top;
    var left = _ref.left;

    var _cache = this.cache('element-bounds', function () {
      return getBounds(_this.element);
    });

    var height = _cache.height;
    var width = _cache.width;

    var targetPos = this.getTargetBounds();

    var bottom = top + height;
    var right = left + width;

    var abutted = [];
    if (top <= targetPos.bottom && bottom >= targetPos.top) {
      ['left', 'right'].forEach(function (side) {
        var targetPosSide = targetPos[side];
        if (targetPosSide === left || targetPosSide === right) {
          abutted.push(side);
        }
      });
    }

    if (left <= targetPos.right && right >= targetPos.left) {
      ['top', 'bottom'].forEach(function (side) {
        var targetPosSide = targetPos[side];
        if (targetPosSide === top || targetPosSide === bottom) {
          abutted.push(side);
        }
      });
    }

    var allClasses = [];
    var addClasses = [];

    var sides = ['left', 'top', 'right', 'bottom'];
    allClasses.push(this.getClass('abutted'));
    sides.forEach(function (side) {
      allClasses.push(_this.getClass('abutted') + '-' + side);
    });

    if (abutted.length) {
      addClasses.push(this.getClass('abutted'));
    }

    abutted.forEach(function (side) {
      addClasses.push(_this.getClass('abutted') + '-' + side);
    });

    defer(function () {
      if (!(_this.options.addTargetClasses === false)) {
        updateClasses(_this.target, addClasses, allClasses);
      }
      updateClasses(_this.element, addClasses, allClasses);
    });

    return true;
  }
});
/* globals TetherBase */

'use strict';

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

TetherBase.modules.push({
  position: function position(_ref) {
    var top = _ref.top;
    var left = _ref.left;

    if (!this.options.shift) {
      return;
    }

    var shift = this.options.shift;
    if (typeof this.options.shift === 'function') {
      shift = this.options.shift.call(this, { top: top, left: left });
    }

    var shiftTop = undefined,
        shiftLeft = undefined;
    if (typeof shift === 'string') {
      shift = shift.split(' ');
      shift[1] = shift[1] || shift[0];

      var _shift = shift;

      var _shift2 = _slicedToArray(_shift, 2);

      shiftTop = _shift2[0];
      shiftLeft = _shift2[1];

      shiftTop = parseFloat(shiftTop, 10);
      shiftLeft = parseFloat(shiftLeft, 10);
    } else {
      shiftTop = shift.top;
      shiftLeft = shift.left;
    }

    top += shiftTop;
    left += shiftLeft;

    return { top: top, left: left };
  }
});
return Tether;

}));


/***/ }),
/* 32 */
/***/ (function(module, exports, __webpack_require__) {

PdfWarning.$inject = ["$scope", "BrowserTab", "User", "Message", "TooltipApi"];
var angular = __webpack_require__(2),
  _ = __webpack_require__(1),
  C = __webpack_require__(0),
  url = __webpack_require__(9),
  sprintf = __webpack_require__(5).sprintf;

function PdfWarning($scope, BrowserTab, User, Message, TooltipApi) {
  $scope.onOpenLinkClick = onOpenLinkClick;
  $scope.onLoginWithProxyClick = onLoginWithProxyClick;
  $scope.onDownloadPdfClick = onDownloadPdfClick;
  $scope.onOpenDoiClick = onOpenDoiClick;
  $scope.onOpenAccountClick = onOpenAccountClick;
  $scope.onGetTrialClick = onGetTrialClick;
  $scope.getAccountLink = getAccountLink;
  $scope.proxyIsNotAvailable = false;
  $scope.pdfUrlsAvailable = false;
  $scope.searchingPdfUrls = false;
  $scope.institutionName = null;
  $scope.sfxUrl = null;
  $scope.pdfUrls = [];

  User.getInstitutionProxy().catch(function () {
    $scope.proxyIsNotAvailable = true;
  });

  var model = $scope.viewModel;

  if (model && (model.doi || model.pmid)) {
    User.getSfxUrlByDoiAndPmid(model.doi, model.pmid).then(function(sfxUrl) {
      $scope.sfxUrl = sfxUrl;
    });
  }

  User.evaluateLoggedInUserDetail().then(function(userDetails) {
    $scope.institutionName = _.get(userDetails, 'institution', null);
  });

  var listener = $scope.$watch('viewVisibility.visible', function(visible) {
    if (!visible || !$scope.viewModel || !$scope.viewModel.isPdfDownloadFailed()) {
      return;
    }
    $scope.searchingPdfUrls = true;
    //In content script, we should do additional calls to google scholar to receive the pdf urls
    var articleTitle = _.get($scope.viewModel, 'metadata.title');
    if (articleTitle) {
      $scope.pdfUrlsAvailable = true;
      Message.sendToBackground('request.GetPdfUrlsFromGoogleScholar', articleTitle).then(function(pdfUrls) {
        if (Array.isArray(pdfUrls) && pdfUrls.length > 0) {
          $scope.pdfUrls = pdfUrls;
        } else {
          $scope.pdfUrlsAvailable = false;
        }
        $scope.searchingPdfUrls = false;
      });
    }
    listener(); //stop the watcher
  });

  function onOpenLinkClick(urlToPen) {
    var parsedPdfUrl = url.parse(urlToPen, true);
    var index = _.parseInt($scope.viewIndex);

    Message.sendToBackground('tabs.CurrentTabId').then(function(tabId) {
      _.extend(parsedPdfUrl.query, {
        readcubeId: $scope.viewModel.id, // the id to attach to.
        tabId: tabId, // the button to update after uploading
        articleIndex: index || 0 // the index of the button to update
      });
      BrowserTab.openTab(url.format(parsedPdfUrl));
      return true;
    }).catch(function() {
      //Unable to get active tab. Just open anyway.
      BrowserTab.openTab(url.format(parsedPdfUrl));
      return false;
    });
  }

  function onOpenDoiClick(doi) {
    BrowserTab.openTab(sprintf(C.URL_DOI_RESOLVER, doi));
  }

  function onLoginWithProxyClick(pdfUrl, article) {
    User.getInstitutionProxy().then(function (institutionProxyUrl) {
      var parsedPdfUrl = url.parse(pdfUrl, true);
      _.extend(parsedPdfUrl.query, {
        readcubeId: article.id
      });
      BrowserTab.openTab(institutionProxyUrl.replace(C.EZPROXY_URL_REPLACE_KEY, url.format(parsedPdfUrl)));
    });
  }

  function onDownloadPdfClick(pdfUrl) {
    if ($scope.viewModel) {
      TooltipApi.downloadPdf($scope.viewModel, pdfUrl);
    }
  }

  function onOpenAccountClick() {
    BrowserTab.openTab(C.URL_ACCOUNT);
  }

  function onGetTrialClick() {
    BrowserTab.openTab(C.URL_GET_TRIAL);
  }

  function getAccountLink() {
    return C.URL_ACCOUNT;
  }

}

angular.module('App')
  .controller('PdfWarning', PdfWarning);


/***/ }),
/* 33 */
/***/ (function(module, exports, __webpack_require__) {

TetherTooltip.$inject = ["tetherTooltipConfig"];
var angular = __webpack_require__(2),
  Tether = __webpack_require__(31),
  $ = __webpack_require__(4),
  _ = __webpack_require__(1);

function TetherTooltip(tetherTooltipConfig) {
  return {
    restrict: 'E',
    transclude: 'element',
    replace: true,
    scope: {
      viewVisibility: '='
    },
    link: function ($scope, $element, $attrs, $ctrl, $transclude) {

      if (!$scope.viewVisibility) {
        $scope.viewVisibility = {
          visible: false
        }
      }

      var tetherConfig = _.extend(tetherTooltipConfig.getOptions(),
        _.pick($attrs, ['parentSelector', 'attachment', 'targetAttachment', 'targetOffset'])),
        tetherInstance = null,
        tetherElement = null,
        tetherScope = null;
      $transclude(function(transElement, transScope) {
        tetherElement = $(transElement[0]).addClass('readcube-tooltip-container')
          .appendTo($('body'));
        tetherScope = transScope;
        tetherInstance = new Tether({
          element: tetherElement.get(0),
          target: $($element).parents(tetherConfig.parentSelector).get(0),
          attachment: tetherConfig.attachment,
          targetAttachment: tetherConfig.targetAttachment,
          targetOffset: tetherConfig.targetOffset,
          constraints: tetherConfig.constraints
        });
      });

      $scope.$watch('viewVisibility.visible', function(visible) {
        if (tetherElement) {
          tetherElement.toggleClass('readcube-tooltip-hidden', !visible);
        }
      });

      $scope.$on('$destroy', function () {
        if (tetherInstance) {
          tetherInstance.destroy();
        }
        if (tetherElement) {
          tetherElement.remove();
        }
        if (tetherScope) {
          tetherScope.$destroy();
        }
      });

      var hasRegistered = false;
      $scope.$watch(function() {
        if (hasRegistered) {
          return;
        }
        hasRegistered = true;
        $scope.$$postDigest(function() {
          hasRegistered = false;
          tetherInstance.position();
        });
      });
    }
  };
}

angular.module('App')
  .directive('tetherTooltip', TetherTooltip);

/***/ }),
/* 34 */
/***/ (function(module, exports, __webpack_require__) {

var angular = __webpack_require__(2),
  _ = __webpack_require__(1);

function TetherTooltipConfig() {
  this.config = {
    parentSelector: '.readcube-button-holder:first',
    attachment: 'bottom center',
    targetAttachment: 'top center',
    targetOffset: '-6px 0',
    constraints: [
      {
        to: 'scrollParent'
      }
    ]
  };

  this.setOptions = function(options) {
    _.extend(this.config, options);
  };

  this.getOptions = function() {
    return this.config;
  };

  this.$get = function() {
    return this;
  }
}

angular.module('App')
  .provider('tetherTooltipConfig', TetherTooltipConfig);


/***/ }),
/* 35 */
/***/ (function(module, exports, __webpack_require__) {

var angular = __webpack_require__(2);

function Tooltip() {
  return {
    restrict: 'E',
    templateUrl: 'tooltip/index',
    replace: true,
    scope: {
      side: '@',
      viewModel: '=',
      viewVisibility: '=',
      viewText: '@',
      viewUrl: '@',
      viewIndex: '@',
      viewClass: '@',
      viewClose: '@',
      viewRetry: '@',
      viewRetryMethod: '&'
    },
    link: function($scope, $element, $attrs) {
      $scope.onCloseTooltipClick = onCloseTooltipClick;
      $scope.onRetryClick = onRetryClick;

      if (!$scope.viewVisibility) {
        $scope.viewVisibility = {
          visible: false
        }
      }

      function onCloseTooltipClick(event) {
        event.stopPropagation();
        $scope.viewVisibility.visible = false;
      }

      function onRetryClick(event) {
        if (typeof $scope.viewRetryMethod === 'function') {
          $scope.viewRetryMethod();
        }
      }

    }
  };
}

angular.module('App')
  .directive('tooltip', Tooltip);


/***/ }),
/* 36 */
/***/ (function(module, exports, __webpack_require__) {

BrowserTab.$inject = ["$window", "Message"];
var angular = __webpack_require__(2),
  C = __webpack_require__(0),
  sprintf = __webpack_require__(5).sprintf;

function BrowserTab($window, Message) {
  return {

    openLibrary: function() {
      return Message.sendToBackground('tabs.OpenLibrary', null);
    },

    /**
     * Open an item in library
     * Try to find a tab which contains the library and update it, in other case just open
     * a new tab
     * @param itemId String
     * @param collectionId String
     */
    openItemInLibrary: function(itemId, collectionId) {
      return Message.sendToBackground('tabs.OpenItemInLibrary', {
        itemId: itemId,
        collectionId: collectionId
      });
    },

    openDocumentInLibrary: function(userId, articleId) {
      return $window.open(sprintf(C.URL_LIBRARY_DOCUMENT, userId, articleId));
    },

    /**
     * Simply open a new tab
     * @param url {String}
     * @returns {Window}
     */
    openTab: function (url) {
      return $window.open(url);
    },

    /**
     * Open extension options page
     *
     */
    openOptions: function () {
      chrome.tabs.create({
        url: 'options.html'
      });
    }
  }
}

angular.module('App')
  .factory('BrowserTab', BrowserTab);


/***/ }),
/* 37 */
/***/ (function(module, exports, __webpack_require__) {

Connection.$inject = ["$q"];
var angular = __webpack_require__(2),
  C = __webpack_require__(0);

function Connection($q) {
  return {

    /**
     * Establish a long live connection with background script
     */
    connectWithBackground: function (method, data) {
      var deferred = $q.defer(),
        port = chrome.runtime.connect({
          name: 'readcube-extension-connection'
        }),
        promiseResolved = false;
      //Send the initialize method
      port.postMessage({
        message: C.MESSAGE_START,
        data: data,
        method: method
      });
      port.onMessage.addListener(function(msg) {
        if (msg.message == C.MESSAGE_FINISH) {
          deferred.resolve(msg.data);
          promiseResolved = true;
        } else if (msg.message == C.MESSAGE_PROGRESS) {
          deferred.notify(msg.data);
        }
      });
      port.onDisconnect.addListener(function () {
        //If promise was not resolved
        if (!promiseResolved) {
          deferred.resolve(null);
        }
      });
      return deferred.promise;
    }

  }
}

angular.module('App')
  .factory('Connection', Connection);

/***/ }),
/* 38 */
/***/ (function(module, exports, __webpack_require__) {

FileRequest.$inject = ["$q"];
var angular = __webpack_require__(2);

function FileRequest($q) {
  return {

    /**
     * Process the upload of the PDF content to Readcube server
     *
     * @param {String} url
     * @param {Blob} blob
     * @returns {Promise}
     */
    getUploadPromise: function (url, blob) {
      var xhr = new XMLHttpRequest(),
        deferred = $q.defer();
      xhr.upload.addEventListener('progress', function(event) {
        if (event.lengthComputable) {
          deferred.notify(parseInt(event.loaded / event.total * 100));
        } else {
          // Unable to compute progress information since the total size is unknown
          deferred.notify(50);
        }
      });
      xhr.onreadystatechange = function (event) {
        if (event.target.readyState == 4) {
          if (event.target.status == 200) {
            deferred.resolve(event.target);
          } else {
            deferred.reject(event.target);
          }
        }
      };
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', 'application/pdf');
      xhr.send(blob);
      return deferred.promise;
    }

  }
}

angular.module('App')
  .factory('FileRequest', FileRequest);

/***/ }),
/* 39 */
/***/ (function(module, exports, __webpack_require__) {

OnlineStatus.$inject = ["$window"];
var angular = __webpack_require__(2);

function OnlineStatus($window) {
  var onlineStatus = $window.navigator.onLine;

  $window.addEventListener('offline', function() {
    onlineStatus = false;
  });
  $window.addEventListener('online', function() {
    onlineStatus = true;
  });

  return {
    isOnline: function() {
      return onlineStatus;
    },

    isOffline: function() {
      return !onlineStatus;
    }
  }
}

angular.module('App')
  .factory('OnlineStatus', OnlineStatus);

/***/ }),
/* 40 */
/***/ (function(module, exports, __webpack_require__) {

Article.$inject = ["$http", "$q"];
var angular = __webpack_require__(2),
  C = __webpack_require__(0),
  sprintf = __webpack_require__(5).sprintf,
  xhr = __webpack_require__(6),
  _ = __webpack_require__(1);

function Article($http, $q) {
  return {

    status: function (ids) {
      var self = this;
      if (ids.ext_ids.length > 100) {
        idsCopy = [].concat(ids.ext_ids);
        var first100 = idsCopy.splice(0, 100);
        return $q.all({
          statuses: xhr.post(C.URL_ARTICLES_STATUS,{ext_ids: first100}),
          others: xhr.post(C.URL_ARTICLES_STATUS,{ext_ids: idsCopy})
        }).then(function(res) {
          var statuses = _.get(res, 'statuses.data.items', []);
          var otherResults = _.get(res, 'others.data.items', []);

          res.statuses.data.items = statuses.concat(otherResults);
          
          return res.statuses;
        });
      } else {
        return xhr.post(C.URL_ARTICLES_STATUS, ids);
      }
    },

    updateStatusForArticle: function(article) {
      return this.status({ ext_ids: [article.getIdentifiers()]}).then(function(result) {
        var articleStatus = _.get(result, 'data.items[0]', null);
        if (articleStatus) {
          article.collections = articleStatus.collections;
          article.collection_id = articleStatus.collection_id;
          article.hasPdf = articleStatus.has_file;
          article.id = articleStatus.id;
        }
      })
    },

    metadata: function (ids) {
      return xhr.post(C.URL_ARTICLES_METADATA, ids);
    },

    getStatusWithMetadata: function (ids) {
      var params = {
        ext_ids: ids
      };
      return $q.all({
        articlesStatus: this.status(params),
        articlesMetadata: this.metadata(params)
      }).then(function (result) {
        var articlesStatus = _.get(result, 'articlesStatus.data.items', []),
          articlesMetadata = _.get(result, 'articlesMetadata.data', []);
        if (articlesStatus.length == 0) {
          return $q.reject('No items in the response');
        }
        if (articlesMetadata.length == 0) {
          //No metadata. Just return the status
          return articlesStatus;
        }
        //Get pdf_urls from details
        ids.forEach(function (id, index) {
          var metadata = _.find(articlesMetadata, function (record) {
            if (id.doi && record.doi) {
              var doi1 = id.doi.toLowerCase();
              var doi2 = record.doi.toLowerCase();
              if (doi1 == doi2) {
                return true;
              }
            }
            if (id.pmid && record.pmid == id.pmid) {
              return true;
            }
            if (id.gsid && record.gsid == id.gsid) {
              return true;
            }
            return false;
          });
          if (metadata) {
            _.extend(articlesStatus[index], {
              pdfUrl: _.get(metadata, 'pdf_urls[0]', null),
              pdfHash: _.get(metadata, 'hash', null),
              url: _.get(metadata, 'url', null)
            });
          }
        });
        return articlesStatus;
      });
    },

    add: function (data) {
      return xhr.post(C.URL_ADD_ARTICLE, data);
    },

    addWithMetadata: function (data) {
      return xhr.post(C.URL_ADD_ARTICLE_METADATA, data);
    },

    update: function (itemId, collectionId, data) {
      return xhr.patch(sprintf(C.URL_COLLECTION_ARTICLE, collectionId, itemId), data);
    },

    get: function (itemId) {
      return xhr.get(sprintf(C.URL_ARTICLE_GET, itemId));
    }

  };
}

angular.module('App')
  .factory('Article', Article);


/***/ }),
/* 41 */
/***/ (function(module, exports, __webpack_require__) {

List.$inject = ["$http", "Storage", "$q"];
var angular = __webpack_require__(2),
  C = __webpack_require__(0),
  q = __webpack_require__(8),
  _ = __webpack_require__(1),
  xhr = __webpack_require__(6),
  sprintf = __webpack_require__(5).sprintf;

function List($http, Storage, $q) {
  return {
    queryFlat: function () {
      return fetchCollections();
    },
    queryStorage: function () {
      return Storage.get('lists', null).then(function (lists) {
        if (_.isNull(lists)) {
          return $q.reject('The lists array is empty');
        } else {
          return lists;
        }
      });
    },
    addItems: function(listId, itemsIds) {
      return xhr.post(sprintf(C.URL_LISTS_ADD_ITEMS, listId), {
        item_ids: itemsIds
      });
    },
    clear: function() {
      Storage.set('lists', null);
    }
  };

  function isDefaultUserCollection(collection) {
    return !collection.group_id && !collection.name;
  }

  function fetchCollections() {
    return xhr.get(C.URL_COLLECTIONS).then(function(collectionsResp) {
      var collections = _.get(collectionsResp, 'data.collections', []);
      var listPromises = [];

      collections.forEach(function(collection) {
        if (isDefaultUserCollection(collection)) {
          collection.name = C.DEFAULT_PERSONAL_LIBRARY_NAME;
        }

        listPromises.push(
          xhr.get(sprintf(C.URL_COLLECTION_LISTS, collection.collection_id))
            .then(function(listResponse) {
              var lists = _.get(listResponse, 'data.lists', []);
              collection.lists = labelListLevels(lists);
              return true;
            })
        );
      });

      return q.all(listPromises).then(function() {
        return fetchGroupNames().then(function(groupNames) {
          var groupedCollections = _.reduce(groupNames, function(acc, value, key) {
            acc.push({
              group_id: key,
              collections: _.filter(collections, { group_id: parseInt(key) || null })
            });
            return acc;
          }, []).sort(function(x) { return x !== null; });

          return {
            groups: groupedCollections,
            groupNames: groupNames
          };
        });
      });
    });
  }

  function fetchGroupNames() {
    return xhr.get(C.URL_GROUPS).then(function(groupsResp) {
      var groups = _.get(groupsResp, 'data.groups', []);
      return _.reduce(groups, function(acc, group) {
        acc[group.id] = group.name;
        return acc;
      // also creates one for the default user collection
      }, { null: 'Personal' });
    });
  }

  // Each child has to come immediately after its parent in list for UI.
  function labelListLevels(items) {
    var rootsAndChilds = _.partition(items, function(item) {
      return !item.parent_id;
    });

    // TODO: less side effect-y
    function loop(roots, rest, depth, acc) {
      _.sortBy(roots, 'name').forEach(function(root) {
        root.level = depth;
        acc.push(root);
        var childsAndRest = _.partition(rest, { parent_id: root.id });
        loop(childsAndRest[0], childsAndRest[1], depth + 1, acc);
      });
      return acc;
    }

    return loop(rootsAndChilds[0], rootsAndChilds[1], 0, []);
  }
}

angular.module('App')
  .factory('List', List);


/***/ }),
/* 42 */
/***/ (function(module, exports, __webpack_require__) {

RawUpload.$inject = ["Upload", "$q", "$interval", "$http"];
var angular = __webpack_require__(2),
  C = __webpack_require__(0),
  sprintf = __webpack_require__(5).sprintf,
  _ = __webpack_require__(1),
  HTTPStatus = __webpack_require__(11),
  xhr = __webpack_require__(6),
  inherit = __webpack_require__(3);

function RawUpload(Upload, $q, $interval, $http) {

  return inherit(Upload, {

    /**
     * The pdf content needs time to be resolve on Readcube server.
     * Wait for 1 minute if the pdf manages to resolve.
     *
     * @param {string} hash The sha256 hash of the pdf file content
     * @returns {Promise}
     */
    getArticlePdfResolvePromise: function (hash) {
      var self = this,
        deferred = $q.defer(),
        count = 10;
      self.article.inLibraryStatus = C.STATUS_PDF_RESOLVING;
      function evaluateCycle() {
        count--;
        self.getArticleIdFromFileHash(hash).then(function (articleId) {
          $interval.cancel(intervalInstance);
          deferred.resolve(articleId);
          self.article.extend({
            id: articleId,
            inLibraryStatus: C.STATUS_IN_LIBRARY_WITH_PDF
          });
        });
        if (count == 0) {
          $interval.cancel(intervalInstance);
          deferred.reject('The PDF was not resolved during 1 minute');
          self.article.inLibraryStatus = C.STATUS_PDF_RESOLVE_WARNING;
        }
      }

      evaluateCycle();
      //The upload finished well. Now lets try to fetch the item id by pdf content hash
      var intervalInstance = $interval(evaluateCycle, 6000);
      return deferred.promise;
    },

    /**
     * Get the article id based on sha256 pdf content hash
     * @param {string} hash
     * @return {Promise}
     */
    getArticleIdFromFileHash: function (hash) {
      return xhr.get(sprintf(C.URL_FILES, hash)).then(function (result) {
        var itemId = _.chain(result)
          .get('data.items', [])
          .compact()
          .get('[0]', null)
          .value();
        if (itemId) {
          return itemId;
        } else {
          return $q.reject('Article id not found');
        }
      });
    },

    /**
     * Upload the raw pdf content
     * @returns {Promise}
     */
    upload: function () {
      var self = this;
      self.article.extend({
        progressPercent: 0,
        progressType: C.PROGRESS_DOWNLOAD,
        inLibraryStatus: C.STATUS_PDF_DOWNLOADING,
        usingPdfUrl: self.article.pdfUrl
      });
      return $q.when(function () {
        if (self.article.pdfUrl) {
          return self.getDownloadPromise({
            url: self.article.pdfUrl,
            isProxied: false
          });
        }
        return $q.reject('Pdf url not available');
      }()).catch(function (error) {
        //Unable to download PDF or pdf url not available
        self.article.inLibraryStatus = C.STATUS_IN_LIBRARY_WITHOUT_PDF_WARNING;
        return $q.reject(error);
      }).then(function (data) {
        return self.getArticleIdFromFileHash(data.sha256Hash).then(function (articleId) {
          //Article is already in library
          self.article.id = articleId;
          self.article.inLibraryStatus = C.STATUS_IN_LIBRARY_WITH_PDF;
          return articleId;
        }).catch(function (error) {
          if (error.status == HTTPStatus.UNAUTHORIZED) {
            //User is not logged in. Stop any processing.
            self.article.inLibraryStatus = C.STATUS_NOT_LOGGED_IN;
            return $q.reject(error);
          }
          //Article with this pdf doesn't exist in library. Upload it
          //
          var sourceUrl = '';

          if (self.article.pdfUrl && self.article.pdfUrl.length) {
            sourceUrl = encodeURIComponent(self.article.pdfUrl.substring(0, 500));
          }

          self.article.progressPercent = 0;
          self.article.progressType = C.PROGRESS_UPLOAD;
          var pdfFilename = self.fixPdfFilename(data.fileName);

          var url;

          if (self.article.collection_id && self.article.id) {
            url = sprintf(C.URL_UPLOAD,
              self.article.collection_id,
              'false',
              data.sha256Hash,
              '',
              '',
              data.fileSize,
              self.article.id,
              encodeURIComponent(pdfFilename),
              sourceUrl
            );
          } else {
            url = sprintf(C.URL_UPLOAD_DEFAULT,
              self.article.id ? 'false' : 'true',
              data.sha256Hash,
              '',
              '',
              data.fileSize,
              self.article.id ? self.article.id : '',
              encodeURIComponent(pdfFilename),
              sourceUrl
            );
          }
          return xhr.get(url).then(function(uploadParams) {
            var uploadUrl = _.get(uploadParams, 'data.url');
            if (!uploadUrl) {
              return $q.reject('Unable to receive the upload url');
            }
            return self.getUploadPromise(uploadUrl, data.blob);
          }).then(null, null, function (percent) {
            self.article.progressPercent = percent;
          }).catch(function (errorDetails) {
            return self.evaluateUploadError(errorDetails, C.STATUS_IN_LIBRARY_WITHOUT_PDF_WARNING);
          }).then(function () {
            if (self.article.id) {
              //If article has an id, no additional resolving is necessary
              self.article.inLibraryStatus = C.STATUS_IN_LIBRARY_WITH_PDF;
              return true;
            }
            return self.getArticlePdfResolvePromise(data.sha256Hash);
          });
        });
      });
    }
  });
}

angular.module('App')
  .factory('RawUpload', RawUpload);


/***/ }),
/* 43 */
/***/ (function(module, exports, __webpack_require__) {

Upload.$inject = ["$q", "Connection", "User"];
var angular = __webpack_require__(2),
  base64 = __webpack_require__(27),
  inherit = __webpack_require__(3),
  HTTPStatus = __webpack_require__(11),
  C = __webpack_require__(0),
  _ = __webpack_require__(1),
  urlHelper = __webpack_require__(13);

function Upload($q, Connection, User) {

  return inherit({

    /**
     * @param {Article} article
     * @constructor
     */
    __constructor: function (article) {
      this.article = article;
    },

    /**
     * Process the upload of the PDF content to Readcube server
     *
     * @param {String} url
     * @param {Blob} blob
     * @returns {Promise}
     */
    getUploadPromise: function (url, blob) {
      var xhr = new XMLHttpRequest(),
        deferred = $q.defer();
      xhr.upload.addEventListener('progress', function (event) {
        if (event.lengthComputable) {
          deferred.notify(parseInt(event.loaded / event.total * 100));
        } else {
          // Unable to compute progress information since the total size is unknown
          deferred.notify(50);
        }
      });
      xhr.onreadystatechange = function (event) {
        if (event.target.readyState == 4) {
          if (event.target.status == 200) {
            deferred.resolve(event.target);
          } else {
            deferred.reject(event.target);
          }
        }
      };
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', 'application/pdf');
      xhr.send(blob);
      return deferred.promise;
    },

    /**
     * Process the download of the pdf content. Used the connection to background script.
     *
     * @param {Object} options - The download options sent to background script
     * @param {string} options.url - The download url
     * @param {boolean} options.isProxied - If the download url is under an ezproxy
     * @returns {Promise}
     */
    getDownloadPromise: function (options) {
      var self = this;
      if (!options.url) {
        return $q.reject('No PDF url provided');
      }
      return Connection.connectWithBackground('request.GetPdfBase64', options).then(function(downloadResult) {
        if (downloadResult && downloadResult.base64 && downloadResult.sha256Hash) {
          return {
            blob: base64.toBlob(downloadResult.base64),
            sha256Hash: downloadResult.sha256Hash,
            fileSize: downloadResult.fileSize,
            fileName: downloadResult.fileName
          }
        } else {
          return $q.reject('No PDF file was found');
        }
      }, null, function (progressData) {
        self.article.progressPercent = progressData.percent;
      });
    },

    /**
     * Upload the raw pdf content
     * @returns {Promise}
     */
    upload: function () {
      throw new Error('Method not implemented');
    },

    evaluateUploadError: function(errorDetails, defaultErrorStatus) {
      var self = this;
      if (errorDetails.status === HTTPStatus.UNPROCESSABLE_ENTITY) {
        //The content exists already. No need to do any actions
        return errorDetails;
      }
      if (errorDetails.status === HTTPStatus.FORBIDDEN) {
        return User.getSubscriptionStatus().then(function(subscription) {
          switch (subscription) {
            case C.SUBSCRIPTION_TRIAL_EXPIRED:
              self.article.inLibraryStatus = C.STATUS_IN_LIBRARY_WITHOUT_PDF_EXPIRED_TRIAL;
              return $q.reject('Unable to add pdf because the trial period is expired');
            case C.SUBSCRIPTION_PRO_EXPIRED:
              self.article.inLibraryStatus = C.STATUS_IN_LIBRARY_WITHOUT_PDF_EXPIRED_SUBSCRIPTION;
              return $q.reject('Unable to add pdf because the subscription is expired');
            default:
              self.article.inLibraryStatus = C.STATUS_IN_LIBRARY_WITHOUT_PDF_NO_SUBSCRIPTION;
              return $q.reject('Unable to add pdf because the account is without subscription');
          }
        });
      }
      if (defaultErrorStatus) {
        self.article.inLibraryStatus = defaultErrorStatus;
      }
      return $q.reject(errorDetails);
    },

    /**
     * Get a fixed version of pdf filename.
     * Use <article_title>.pdf when we can, and if not <domain>_<datetime>.pdf when unable to get pdf filename from url
     *
     * @param {string} currentFilename
     * @returns {string}
     */
    fixPdfFilename: function(currentFilename) {
      if (currentFilename) {
        return currentFilename;
      }
      var articleTitle = _.get(this.article, 'metadata.title', ''),
        dateTimeString = new Date().toLocaleString();
      if (articleTitle) {
        return articleTitle + '.pdf';
      } else if (this.article.usingPdfUrl) {
        return urlHelper.getHostnameFromUrl(this.article.usingPdfUrl) + ' ' + dateTimeString + '.pdf';
      } else {
        return dateTimeString + '.pdf';
      }
    }
  });
}

angular.module('App')
  .factory('Upload', Upload);

/***/ }),
/* 44 */
/***/ (function(module, exports, __webpack_require__) {

var angular = __webpack_require__(2);

function TooltipApi() {
  return {

    downloadPdf: function(article, pdfUrl) {
      this.article = article;
      this.pdfUrl = pdfUrl;
      ++this.messageCount;
    },

    article: null,
    pdfUrl: null,
    messageCount: 0
  }
}

angular.module('App')
  .factory('TooltipApi', TooltipApi);

/***/ }),
/* 45 */
/***/ (function(module, exports) {

module.exports = "<div ng-switch=\"buttonData.inLibraryStatus\" class=\"readcube-relative\">\n  <a ng-switch-when=\"in_library\"  class=\"readcube-button right-space\" href ng-click=\"onInLibraryClick($event)\">\n    <span class=\"readcube-icon-extended readcube-icon-check\"></span> In Library\n    <span class=\"readcube-triangle-holder\" ng-click=\"onTriangleClick($event)\" ng-hide=\"isPopup\">\n      <span class=\"readcube-icon readcube-icon-triangle readcube-icon-triangle-imported\"></span>\n    </span>\n  </a>\n\n  <a ng-switch-when=\"in_library_with_pdf\" class=\"readcube-button right-space-icon\" href ng-click=\"onInLibraryClick($event)\">\n    <span class=\"readcube-icon-extended readcube-icon-check\"></span> In Library\n    <span class=\"readcube-triangle-holder\" ng-click=\"onTriangleClick($event)\" ng-hide=\"isPopup\">\n      <span class=\"readcube-icon readcube-icon-triangle readcube-icon-triangle-imported\"></span>\n    </span>\n    <span class=\"readcube-right-box\" ng-click=\"onInLibraryDocumentClick($event)\">\n      <span class=\"readcube-icon-extended readcube-icon-document\"></span>\n    </span>\n  </a>\n\n  <a ng-switch-when=\"in_library_without_pdf\" class=\"readcube-button right-space-icon\" href ng-click=\"onInLibraryClick($event)\">\n    <span class=\"readcube-icon-extended readcube-icon-check\"></span> In Library\n    <span class=\"readcube-triangle-holder\" ng-click=\"onTriangleClick($event)\" ng-hide=\"isPopup\">\n      <span class=\"readcube-icon readcube-icon-triangle readcube-icon-triangle-imported\"></span>\n    </span>\n    <span class=\"readcube-right-box-gray\" ng-click=\"onDownloadPdfClick($event)\">\n      <span class=\"readcube-icon-extended readcube-icon-arrow-down\"></span>\n    </span>\n  </a>\n\n  <a ng-switch-when=\"in_library_without_pdf_warning_proxy\" class=\"readcube-button right-space-icon\" href\n     ng-click=\"onInLibraryClick($event)\">\n    <span class=\"readcube-icon-extended readcube-icon-check\"></span> In Library\n    <span class=\"readcube-triangle-holder\" ng-click=\"onTriangleClick($event)\" ng-hide=\"isPopup\">\n      <span class=\"readcube-icon readcube-icon-triangle readcube-icon-triangle-imported\"></span>\n    </span>\n    <span class=\"readcube-right-box-orange\" ng-click=\"onShowTooltipClick($event)\">\n      <span class=\"readcube-exclamation\">!</span>\n    </span>\n  </a>\n\n  <div ng-switch-when=\"in_library_without_pdf_warning_proxy\">\n    <tether-tooltip view-visibility=\"tooltipVisibility\">\n      <tooltip view-visibility=\"tooltipVisibility\" view-url=\"tooltip/pdf_warning_proxy\" view-class=\"readcube-tooltip-warning\"\n        view-model=\"buttonData\" view-index=\"{{buttonIndex}}\" view-close=\"yes\"></tooltip>\n    </tether-tooltip>\n  </div>\n\n  <a ng-switch-when=\"in_library_without_pdf_warning\" class=\"readcube-button right-space-icon\" href ng-click=\"onInLibraryClick($event)\">\n    <span class=\"readcube-icon-extended readcube-icon-check\"></span> In Library\n    <span class=\"readcube-triangle-holder\" ng-click=\"onTriangleClick($event)\" ng-hide=\"isPopup\">\n      <span class=\"readcube-icon readcube-icon-triangle readcube-icon-triangle-imported\"></span>\n    </span>\n    <span class=\"readcube-right-box-orange\" ng-click=\"onShowTooltipClick($event)\">\n      <span class=\"readcube-exclamation\">!</span>\n    </span>\n  </a>\n  <div ng-switch-when=\"in_library_without_pdf_warning\">\n    <tether-tooltip view-visibility=\"tooltipVisibility\">\n      <tooltip view-url=\"tooltip/pdf_warning\" view-class=\"readcube-tooltip-warning\" view-visibility=\"tooltipVisibility\"\n        view-model=\"buttonData\" view-index=\"{{buttonIndex}}\" view-close=\"yes\"></tooltip>\n    </tether-tooltip>\n  </div>\n\n  <a ng-switch-when=\"not_found\" class=\"readcube-button readcube-decolored\" href ng-click=\"onAddToLibraryClick($event)\"\n     ng-mouseenter=\"onMouseEnter()\" ng-mouseleave=\"onMouseLeave()\">\n    <span class=\"readcube-icon readcube-icon-add\"></span>\n    ReadCube\n    <span class=\"readcube-triangle-holder\" ng-click=\"onTriangleClick($event)\">\n      <span class=\"readcube-icon readcube-icon-triangle\"></span>\n    </span>\n  </a>\n\n  <a ng-switch-when=\"metadata_adding\" class=\"readcube-button right-space-icon left-space\" href=\"#\"\n     ng-click=\"preventPropagation($event)\">\n    Importing...\n    <span class=\"readcube-right-box\" ng-click=\"onShowTooltipClick($event)\">\n      <span class=\"readcube-icon-extended readcube-icon-circle\"></span>\n    </span>\n  </a>\n  <div ng-switch-when=\"metadata_adding\">\n    <tether-tooltip view-visibility=\"tooltipVisibility\">\n      <tooltip view-visibility=\"tooltipVisibility\" view-text=\"Adding metadata to your library...\" view-close=\"yes\"></tooltip>\n    </tether-tooltip>\n  </div>\n\n  <a ng-switch-when=\"pdf_downloading\" class=\"readcube-button right-space-icon\" href=\"#\">\n    <span class=\"readcube-icon-extended readcube-icon-check\"></span> In Library\n    <span class=\"readcube-triangle-holder\" ng-click=\"onTriangleClick($event)\" ng-hide=\"isPopup\">\n      <span class=\"readcube-icon readcube-icon-triangle readcube-icon-triangle-imported\"></span>\n    </span>\n    <span class=\"readcube-right-box\" ng-click=\"onShowTooltipClick($event)\">\n      <span class=\"readcube-icon-extended readcube-icon-circle\"></span>\n    </span>\n  </a>\n  <div ng-switch-when=\"pdf_downloading\">\n    <tether-tooltip view-visibility=\"tooltipVisibility\">\n      <tooltip view-url=\"tooltip/pdf_downloading\" view-model=\"buttonData\" view-visibility=\"tooltipVisibility\"\n               view-class=\"readcube-tooltip-progress\" view-close=\"yes\"></tooltip>\n    </tether-tooltip>\n  </div>\n\n  <a href=\"#\" ng-switch-when=\"status_in_library_without_pdf_no_subscription\" class=\"readcube-button right-space-icon\"\n     ng-click=\"onInLibraryClick($event)\">\n    <span class=\"readcube-icon-extended readcube-icon-check\"></span> In Library\n    <span class=\"readcube-triangle-holder\" ng-click=\"onTriangleClick($event)\" ng-hide=\"isPopup\">\n      <span class=\"readcube-icon readcube-icon-triangle readcube-icon-triangle-imported\"></span>\n    </span>\n    <span class=\"readcube-right-box\" ng-click=\"onShowTooltipClick($event)\">\n      <span class=\"readcube-icon-extended readcube-icon-arrow-down\"></span>\n    </span>\n  </a>\n  <div ng-switch-when=\"status_in_library_without_pdf_no_subscription\">\n    <tether-tooltip view-visibility=\"tooltipVisibility\">\n      <tooltip view-close=\"yes\" view-class=\"readcube-tooltip-warning\" view-url=\"tooltip/pdf_no_subscription\"\n               view-visibility=\"tooltipVisibility\"></tooltip>\n    </tether-tooltip>\n  </div>\n\n  <a href=\"#\" ng-switch-when=\"status_in_library_without_pdf_expired_subscription\" class=\"readcube-button right-space-icon\"\n     ng-click=\"onInLibraryClick($event)\">\n    <span class=\"readcube-icon-extended readcube-icon-check\"></span> In Library\n    <span class=\"readcube-triangle-holder\" ng-click=\"onTriangleClick($event)\" ng-hide=\"isPopup\">\n      <span class=\"readcube-icon readcube-icon-triangle readcube-icon-triangle-imported\"></span>\n    </span>\n    <span class=\"readcube-right-box\" ng-click=\"onShowTooltipClick($event)\">\n      <span class=\"readcube-icon-extended readcube-icon-arrow-down\"></span>\n    </span>\n  </a>\n  <div ng-switch-when=\"status_in_library_without_pdf_expired_subscription\">\n    <tether-tooltip view-visibility=\"tooltipVisibility\">\n      <tooltip view-close=\"yes\" view-class=\"readcube-tooltip-warning\" view-url=\"tooltip/pdf_expired_subscription\"\n               view-visibility=\"tooltipVisibility\"></tooltip>\n    </tether-tooltip>\n  </div>\n\n  <a href=\"#\" ng-switch-when=\"status_in_library_without_pdf_expired_trial\" class=\"readcube-button right-space-icon\"\n     ng-click=\"onInLibraryClick($event)\">\n    <span class=\"readcube-icon-extended readcube-icon-check\"></span> In Library\n    <span class=\"readcube-triangle-holder\" ng-click=\"onTriangleClick($event)\" ng-hide=\"isPopup\">\n      <span class=\"readcube-icon readcube-icon-triangle readcube-icon-triangle-imported\"></span>\n    </span>\n    <span class=\"readcube-right-box\" ng-click=\"onShowTooltipClick($event)\">\n      <span class=\"readcube-icon-extended readcube-icon-arrow-down\"></span>\n    </span>\n  </a>\n  <div ng-switch-when=\"status_in_library_without_pdf_expired_trial\">\n    <tether-tooltip view-visibility=\"tooltipVisibility\">\n      <tooltip view-close=\"yes\" view-class=\"readcube-tooltip-warning\" view-url=\"tooltip/pdf_expired_trial\"\n               view-visibility=\"tooltipVisibility\"></tooltip>\n    </tether-tooltip>\n  </div>\n\n  <div ng-if=\"offlineTooltipVisibility.visible\">\n    <tether-tooltip view-visibility=\"offlineTooltipVisibility\">\n      <tooltip view-close=\"yes\" view-text=\"Import error - please check your network connection and try again\"\n               view-visibility=\"offlineTooltipVisibility\"></tooltip>\n    </tether-tooltip>\n  </div>\n\n  <a ng-if=\"buttonData.times_cited > 0\" class=\"readcube-button dimensions-button metrics\" href ng-click=\"onDimensionsMetricsButtonClick($event)\">\n    <span class=\"dimensions-icon metrics\"></span> {{buttonData.times_cited}}\n  </a>\n\n  <a ng-if=\"buttonData.dimensionsDataStatus == 'oa'\" class=\"readcube-button dimensions-button oa\" href ng-click=\"onDimensionsButtonClick($event)\">\n    <span class=\"dimensions-icon oa\"></span> Open Access\n  </a>\n  <a ng-if=\"buttonData.dimensionsDataStatus == 'subscription'\" class=\"readcube-button dimensions-button subscription\" href ng-click=\"onDimensionsButtonClick($event)\">\n    <span class=\"dimensions-icon subscription\"></span> Subscription Access\n  </a>\n  <a ng-if=\"buttonData.dimensionsDataStatus == 'preview'\" class=\"readcube-button dimensions-button preview\" href ng-click=\"onDimensionsButtonClick($event)\">\n    <span class=\"dimensions-icon preview\"></span> Get Article\n  </a>\n</div>\n"

/***/ }),
/* 46 */
/***/ (function(module, exports) {

module.exports = "<div class=\"readcube-dropdown-container\" ng-show=\"show\">\n  <div class=\"dropdown-menu-triangle\" ng-class=\"{down :!isBelowButton, up: isBelowButton}\" ng-style=\"triangleStyle\"></div>\n  <ul class=\"dropdown-menu\" ng-style=\"boxStyle\">\n    <button ng-if=\"shouldDisplayAddButton\" ng-click=\"addToLibrary()\" type=\"button\"\n            class=\"add-to-library-button\"\n            style=\"margin:0 auto; display:block;\">\n      Add to Library\n    </button>\n    <li ng-repeat=\"data in options.groups\"\n      class=\"dropdown-group-name\">\n      <span class=\"dropdown-collection-header\" ng-if=\"hasMultipleCollections()\">\n        {{ options.groupNames[data.group_id] }}\n      </span>\n      <ul class=\"dropdown-group-list\" ng-repeat=\"collection in data.collections\">\n        <li class=\"dropdown-collection-name\">\n          <label\n            ng-click=\"$event.stopPropagation()\"\n            style=\"padding-left: 20px\"\n            class=\"dropdown-truncate\">\n            <input\n              class=\"dropdown-checkbox\"\n              type=\"checkbox\"\n              ng-disabled=\"collection.disabled\"\n              ng-model=\"collection.selected\">\n              {{ collection.name }}<span\n                ng-show=\"!shouldDisplayAddButton && collection._imported\"\n                style=\"cursor: pointer\"\n                ng-click=\"onClickOpenArrow($event, collection.collection_id)\"> ➜</span>\n          </label>\n        </li>\n        <ul class=\"dropdown-group-list\" ng-repeat=\"list in collection.lists\">\n          <li class=\"dropdown-list-name\">\n            <label\n              ng-click=\"$event.stopPropagation()\"\n              ng-style=\"{'padding-left': ((list.level + 2) * 20) + 'px' }\"\n              class=\"dropdown-truncate\">\n              <input\n                class=\"dropdown-checkbox\"\n                type=\"checkbox\"\n                ng-disabled=\"list.disabled\"\n                ng-model=\"list.selected\">\n                {{ list.name }}<span\n                  ng-show=\"!shouldDisplayAddButton && list._imported\"\n                  style=\"cursor: pointer\"\n                  ng-click=\"onClickOpenArrow($event, collection.collection_id)\"> ➜</span>\n            </label>\n          </li>\n        </ul>\n      </ul>\n    </li>\n  </ul>\n</div>\n"

/***/ }),
/* 47 */
/***/ (function(module, exports) {

module.exports = "<div class=\"readcube-login-container\" ng-if=\"show\" ng-click=\"onCloseButtonClick()\">\n  <div class=\"readcube-login-close\">\n    <div class=\"readcube-login-close-button\">×</div>\n  </div>\n  <iframe class=\"readcube-login-iframe\" src=\"{{iframeUrl}}\"></iframe>\n</div>"

/***/ }),
/* 48 */
/***/ (function(module, exports) {

module.exports = "<span\n  ng-if=\"isInSharedLibrary()\"\n  class=\"readcube-icon-shared-library\"\n  ng-attr-title=\"{{sharedLibrariesTooltip()}}\"\n></span>\n"

/***/ }),
/* 49 */
/***/ (function(module, exports) {

module.exports = "<div class=\"readcube-progress-bar\"\n     ng-class=\"{'readcube-progress-bar-upload': viewModel.progressType == 'progress_upload',\n      'readcube-cancel-transition': viewModel.progressPercent == 100 }\"\n     style=\"width: {{ viewModel.progressPercent }}%\"></div>\n<div class=\"reacube-tooltip-content\">\n  <div class=\"readcube-tooltip-title\">\n    Downloading PDF from {{ viewModel.usingPdfUrl | hostname }}...\n  </div>\n</div>"

/***/ }),
/* 50 */
/***/ (function(module, exports) {

module.exports = "<div class=\"readcube-tooltip-title\">\n  Article metadata imported. <br/> Your <a href=\"{{ getAccountLink() }}\" target=\"_blank\">ReadCube Pro</a> has expired -\n  re-subscribe to also automatically find and import PDFs\n</div>\n<div>\n  <button ng-click=\"onOpenAccountClick()\" class=\"readcube-blue-button\">\n    Go Pro\n  </button>\n  <button ng-click=\"viewVisibility.visible = false\" class=\"readcube-blue-button readcube-blue-button-disabled\">\n    Later\n  </button>\n</div>"

/***/ }),
/* 51 */
/***/ (function(module, exports) {

module.exports = "<div class=\"readcube-tooltip-title\">\n  Article metadata imported. Your ReadCube Pro has expired - <a href=\"{{ getAccountLink() }}\" target=\"_blank\">re-subscribe</a>\n  or get another 30 day free trial to automatically find and import PDFs\n</div>\n<div>\n  <button ng-click=\"onOpenAccountClick()\" class=\"readcube-blue-button readcube-small-button\">\n    Go Pro\n  </button>\n  <button ng-click=\"onGetTrialClick()\" class=\"readcube-blue-button readcube-small-button\">\n    Get Trial\n  </button>\n  <button ng-click=\"viewVisibility.visible = false\" class=\"readcube-blue-button readcube-blue-button-disabled readcube-small-button\">\n    Later\n  </button>\n</div>"

/***/ }),
/* 52 */
/***/ (function(module, exports) {

module.exports = "<div ng-if=\"searchingPdfUrls\" class=\"readcube-tooltip-searching-locations\">\n  <span class=\"readcube-icon-extended readcube-icon-circle\"></span> Searching for more download locations...\n</div>\n<div ng-if=\"!searchingPdfUrls\" class=\"readcube-tooltip-pdf-text\">\n  This full text PDF of this article may be available from one or more of the following sites:\n</div>\n<div ng-if=\"!searchingPdfUrls\" class=\"readcube-tooltip-pdfs-list\">\n  <div class=\"readcube-tooltip-pdf\" ng-repeat=\"pdfUrl in pdfUrls\">\n    <span ng-click=\"onDownloadPdfClick(pdfUrl)\" title=\"Import pdf\" class=\"readcube-tooltip-pdf-download\">\n      <span class=\"readcube-icon-extended readcube-icon-download\"></span>\n    </span>\n    <span class=\"readcube-tooltip-pdf-hostname\" title=\"Open pdf file {{ pdfUrl }}\" ng-click=\"onOpenLinkClick(pdfUrl)\">{{pdfUrl | hostname}}</span>\n  </div>\n</div>\n"

/***/ }),
/* 53 */
/***/ (function(module, exports) {

module.exports = "<div class=\"readcube-tooltip-title\">\n  Article metadata imported. <br/> Try <a href=\"{{ getAccountLink() }}\" target=\"_blank\">ReadCube Pro</a> to also automatically\n  find and import PDFs. Start your risk-free 30 day trial?\n</div>\n<div>\n  <button ng-click=\"onOpenAccountClick()\" class=\"readcube-blue-button\">\n    Start trial\n  </button>\n  <button ng-click=\"viewVisibility.visible = false\" class=\"readcube-blue-button readcube-blue-button-disabled\">\n    Later\n  </button>\n</div>"

/***/ }),
/* 54 */
/***/ (function(module, exports) {

module.exports = "<div class=\"readcube-tooltip-title\">\n  Automatic PDF Download Unsuccessful\n</div>\n<div>\n  <button ng-if=\"viewModel.url\" ng-click=\"onOpenLinkClick(viewModel.url)\" class=\"readcube-blue-button\">\n    Go to Article Page\n  </button>\n  <button ng-if=\"!viewModel.url && viewModel.doi\" ng-click=\"onOpenDoiClick(viewModel.doi)\" class=\"readcube-blue-button\">\n    Go to Article Page\n  </button>\n  <span class=\"readcube-icon-holder\">\n    <button ng-if=\"viewModel.pdfUrl\" ng-click=\"onOpenLinkClick(viewModel.pdfUrl)\" class=\"readcube-blue-button\">\n      Go to PDF\n    </button>\n    <span ng-if=\"viewModel.pdfUrl\" class=\"readcube-icon-extended readcube-icon-lock\"></span>\n  </span>\n  <div ng-if=\"institutionName && sfxUrl\" class=\"readcube-institution-sfx\">\n    <a href=\"{{ sfxUrl }}\" target=\"_blank\"><span class=\"readcube-icon-extended readcube-icon-arrow-orange\"></span></a>\n    <a href=\"{{ sfxUrl }}\" target=\"_blank\">Find at {{ institutionName }} (SFX)</a>\n  </div>\n  <div ng-if=\"pdfUrlsAvailable\" ng-include=\"'tooltip/pdf_list'\" class=\"readcube-pdf-advanced-search\"></div>\n</div>"

/***/ }),
/* 55 */
/***/ (function(module, exports) {

module.exports = "<div class=\"readcube-tooltip-title\">\n  Automatic PDF Download Unsuccessful\n</div>\n<div>\n  <button ng-if=\"viewModel.url\" ng-click=\"onLoginWithProxyClick(viewModel.url, viewModel)\" class=\"readcube-blue-button\">\n    Go to Article Page\n  </button>\n  <button ng-if=\"!viewModel.url && viewModel.doi\" ng-click=\"onOpenDoiClick(viewModel.doi)\" class=\"readcube-blue-button\">\n    Go to Article Page\n  </button>\n  <span class=\"readcube-icon-holder\">\n    <button ng-if=\"viewModel.pdfUrl\" ng-click=\"onLoginWithProxyClick(viewModel.pdfUrl, viewModel)\"\n            class=\"readcube-blue-button\">\n      Go to PDF\n    </button>\n    <span ng-if=\"viewModel.pdfUrl\" class=\"readcube-icon-extended readcube-icon-lock\"></span>\n  </span>\n  <div ng-if=\"institutionName && sfxUrl\" class=\"readcube-institution-sfx\">\n    <a href=\"{{ sfxUrl }}\" target=\"_blank\"><span class=\"readcube-icon-extended readcube-icon-arrow-orange\"></span></a>\n    <a href=\"{{ sfxUrl }}\" target=\"_blank\">Find at {{ institutionName }} (SFX)</a>\n  </div>\n  <div ng-if=\"pdfUrlsAvailable\" ng-include=\"'tooltip/pdf_list'\" class=\"readcube-pdf-advanced-search\"></div>\n</div>"

/***/ }),
/* 56 */
/***/ (function(module, exports) {

module.exports = "<div class=\"readcube-button-holder\" add-to-library-button\n     ng-show=\"list.articlesList[%1$d].isReadyForShowing\"\n     when-add-to-library-click=\"list.onAddToLibraryClick(index)\"\n     when-dimensions-button-click=\"list.onDimensionsButtonClick(index)\"\n     when-dimensions-metrics-button-click=\"list.onDimensionsMetricsButtonClick(index)\"\n     when-in-library-click=\"list.onInLibraryClick(index)\"\n     when-in-library-document-click=\"list.onInLibraryDocumentClick(index)\"\n     when-download-pdf-click=\"list.onDownloadPdfClick(index)\"\n     when-triangle-click=\"list.onTriangleClick(event, index, isInLibrary)\"\n     button-data=\"list.articlesList[%1$d]\"\n     button-index=\"%1$d\"></div>\n"

/***/ }),
/* 57 */
/***/ (function(module, exports, __webpack_require__) {

var angular = __webpack_require__(2);

angular.module('App')
  .run(["$templateCache", function ($templateCache) {
    $templateCache.put('tooltip/pdf_expired_subscription', __webpack_require__(50));
    $templateCache.put('tooltip/pdf_expired_trial', __webpack_require__(51));
    $templateCache.put('tooltip/pdf_no_subscription', __webpack_require__(53));
    $templateCache.put('tooltip/pdf_downloading', __webpack_require__(49));
    $templateCache.put('tooltip/pdf_warning', __webpack_require__(54));
    $templateCache.put('tooltip/pdf_warning_proxy', __webpack_require__(55));
    $templateCache.put('tooltip/pdf_list', __webpack_require__(52));
    $templateCache.put('tooltip/index', __webpack_require__(29));
  }]);

/***/ }),
/* 58 */
/***/ (function(module, exports, __webpack_require__) {

var angular = __webpack_require__(2),
  C = __webpack_require__(0);

angular.module('App').config(["$sceDelegateProvider", function($sceDelegateProvider) {
  $sceDelegateProvider.resourceUrlWhitelist([
    // Allow same origin resource loads.
    'self',
    // Allow loading from login iframe
    C.URL_REGEXP_MAIN_URL
  ]);
}]);

/***/ }),
/* 59 */
/***/ (function(module, exports, __webpack_require__) {

GeneralList.$inject = ["ProxyUpload", "RawUpload", "BrowserTab", "Article", "Message", "ListDropdownApi", "$q", "Storage", "List", "User", "Mixpanel", "SiteType", "$scope", "TooltipApi"];
var angular = __webpack_require__(2),
  C = __webpack_require__(0),
  _ = __webpack_require__(1),
  HTTPStatus = __webpack_require__(11),
  xhr = __webpack_require__(6),
  ArticleModel = __webpack_require__(15);

function GeneralList(ProxyUpload, RawUpload, BrowserTab, Article, Message, ListDropdownApi, $q, Storage,
                     List, User, Mixpanel, SiteType, $scope, TooltipApi) {
  var self = this;

  self.articlesList = [];

  /**
   * Used to display the login iframe
   * @type {boolean}
   */
  self.loginIframe = {
    show: false
  };

  /**
   * A list of article indexes that should be added to library after Login.
   * Used when user was unable to add articles because he's logged out.
   * @type {Array}
   */
  self.queuedArticleIndexes = [];

  self.onInLibraryDocumentClick = onInLibraryDocumentClick;
  self.onInLibraryClick = onInLibraryClick;
  self.onTriangleClick = onTriangleClick;
  self.onAddToLibraryClick = onAddToLibraryClick;
  self.onDownloadRawPdf = onDownloadRawPdf;
  self.onDownloadPdfClick = onDownloadPdfClick;
  self.onListClick = onListClick;
  self.onSuccessfullyLoggedIn = onSuccessfullyLoggedIn;

  self.addArticleFromPDF = addArticleFromPDF;
  self.addArticleFromMetadata = addArticleFromMetadata;
  self.initArticles = initArticles;
  self.loadArticles = loadArticles;
  self.listenForMessages = listenForMessages;
  self.listenForTooltip = listenForTooltip;
  self.finishArticleStatus = finishArticleStatus;
  self.addQueuedArticles = addQueuedArticles;
  self.initDimensionsData = initDimensionsData;
  self.onDimensionsButtonClick = onDimensionsButtonClick;
  self.onDimensionsMetricsButtonClick = onDimensionsMetricsButtonClick;
  self.updateStatusForArticle = Article.updateStatusForArticle.bind(Article);


  function listenForMessages(searchService) {
    //Listen for message from Popup page
    Message.listenForMessages(function(request, callback) {
      switch (request.message) {
        case C.MESSAGE_GET_ARTICLES:
          callback(self.articlesList);
          break;
        case C.MESSAGE_UPDATE_ARTICLE:
          var updateDetails = _.get(request, 'data.updateDetails', {}),
            index = _.get(request, 'data.index', null);
          if (!_.isNull(index) && !_.isEmpty(updateDetails)) {
            var visibleArticles = self.articlesList.filter(function(article) {
              return article.isReadyForShowing;
            });
            _.extend(visibleArticles[index], updateDetails);
            $scope.$apply();
          }
          callback(true);
          break;
        case C.MESSAGE_IS_ABSTRACT_PAGE:
          callback(searchService.isAbstractPage());
          break;
        case C.MESSAGE_SELECT_ALL_SHOW:
          callback(true);
          break;
        case C.MESSAGE_SHOW_LOGIN:
          self.loginIframe.show = true;
          self.queuedArticleIndexes = _.get(request, 'data.queuedArticleIndexes', []);
          $scope.$apply();
          callback(true);
          break;
        default:
          callback(null);
          break;
      }
    });
  }

  function listenForTooltip() {
    $scope.tooltipApi = TooltipApi;
    $scope.$watchGroup(['tooltipApi.article', 'tooltipApi.pdfUrl', 'tooltipApi.messageCount'], function(tooltipValues) {
      var article = _.get(tooltipValues, '[0]'),
        pdfUrl = _.get(tooltipValues, '[1]');
      if (article && pdfUrl) {
        self.onDownloadRawPdf(article, pdfUrl);
      }
    });
  }


  /**
   * Handler to open the added to library item
   * @param index
   */
  function onInLibraryDocumentClick(index) {
    var article = self.articlesList[index];
    BrowserTab.openDocumentInLibrary(article.collection_id, article.id);
  }

  /**
   * Handler to open the added to library item
   * @param index
   */
  function onInLibraryClick(index) {
    var article = self.articlesList[index];
    BrowserTab.openItemInLibrary(article.id, article.collection_id);
    Mixpanel.trackEvent(C.MIXPANEL_EVENT_INJECTED_BUTTON_IN_LIBRARY_CLICKED);
  }

  /**
   * Load the articles status from Readcube server
   *
   * @return {Promise}
   */
   function loadArticles() {
    var showButtons = false,
      pdfImportEnabled = false;
    return Storage.get(C.SETTING_BUTTON_AVAILABLE_ON, [
      C.VALUE_BUTTON_AVAILABLE_ON_GOOGLE_SCHOLAR,
      C.VALUE_BUTTON_AVAILABLE_ON_PUBMED,
      C.VALUE_BUTTON_AVAILABLE_ON_PUBLISHER_WEBSITES
    ]).then(function (buttonsAvailableOn) {
      showButtons = buttonsAvailableOn.indexOf(SiteType) > -1;
      return Storage.get(C.SETTING_PDF_DOWNLOAD, C.VALUE_PDF_DOWNLOAD_AUTOMATIC_ENABLED);
    }).then(function (pdfImportSetting) {
      pdfImportEnabled = pdfImportSetting == C.VALUE_PDF_DOWNLOAD_AUTOMATIC_ENABLED;
      var identifiers = getIdentifiersFromArticles();
      // only query if we have identifiers.
      return identifiers.length
        ? Article.getStatusWithMetadata(identifiers)
        : [];
    }).then(function (statuses) {
      statuses.forEach(function (item, index) {
        var article = self.articlesList[index];
        article.extend({
          isReadyForShowing: article.metadata && showButtons,
          id: _.get(item, 'id', null),
          note: item.notes,
          pdfUrl: item.pdfUrl,
          pdfHash: item.pdfHash,
          hasPdf: item.has_file,
          collections: item.collections,
          collection_id: item.collection_id,
          url: item.url
        }).setInLibraryStatus(item.status, pdfImportEnabled);
      });
    }).catch(function (errorDetails) {
      //Some error appeared. Throw it to console, and display a default list
      _.each(self.articlesList, function (row) {
        row.isReadyForShowing = showButtons;
      });
      console.error(errorDetails);
      return true;
    }).finally(function () {
      //In case of success or error, we need to activate the browser icon and badge number
      //Send a message to background script about the number of found results
      var visibleArticles = self.articlesList.filter(function(article) {
        return article.isReadyForShowing;
      });
      Message.sendToBackground('browser_action.SetBadgeAndIcon', visibleArticles.length);
    });
  }

  /**
   * Get identifiers array from parsed articles
   * @return []
   */
  function getIdentifiersFromArticles() {
    return _.map(self.articlesList, function (item) {
      return item.getIdentifiers();
    })
  }

  /**
   * Init the articles array with initial information
   * @param searchService
   */
  function initArticles(searchService) {
    searchService.get().forEach(function (detail) {
      self.articlesList.push(new ArticleModel(detail));
    });
  }

  /**
   * Handler to open the lists dropdown
   * @param event
   * @param index
   */
  function onTriangleClick(event, index, isInLibrary) {
    var article = self.articlesList[index];
    ListDropdownApi.toggleDropdown(event, index, article, isInLibrary);
  }

  /**
   * The handler to add an article to library
   * @param index
   * @return Promise
   */
  function onAddToLibraryClick(index) {
    ListDropdownApi.hideDropdown();

    var article = self.articlesList[index],
      siteTypeName = '';
    switch (SiteType) {
      case C.VALUE_BUTTON_AVAILABLE_ON_GOOGLE_SCHOLAR:
        siteTypeName = 'Google scholar';
        break;
      case C.VALUE_BUTTON_AVAILABLE_ON_PUBMED:
        siteTypeName = 'Pubmed';
        break;
      default:
        siteTypeName = 'Publisher sites';
        break;
    }
    Mixpanel.trackEvent(C.MIXPANEL_EVENT_INJECTED_BUTTON_ADD_TO_LIBRARY_CLICKED, {
      'Browser Ext Site Type': siteTypeName
    });
    if (article.isProcessingStatus()) {
      //prevent duplicate clicks on the button
      return false;
    }
    article.inLibraryStatus = C.STATUS_METADATA_ADDING;
    return addArticleFromMetadata(article, index).then(function(addResult) {
      return addArticleFromPDF(article);
    }).finally(function () {
      self.updateStatusForArticle(article).then(function() {
        finishArticleStatus(article).then(function() {
          chrome.runtime.sendMessage({
            message: C.MESSAGE_UPDATE_POPUP_ARTICLE_FROM_CONTENT_SCRIPT,
            data: {
              index: index,
              updateDetails: {
                id: article.id,
                inLibraryStatus: article.inLibraryStatus,
                collection_id: article.collection_id,
                collections: article.collections
              }
            }
          });
        });
      });
    });
  }


  /**
   * The handler to download the pdf for an added to library article
   *
   * @param index
   * @return Promise
   */
  function onDownloadPdfClick(index) {
    var article = self.articlesList[index];
    if (article.isProcessingStatus()) {
      //prevent duplicate clicks on the button
      return false;
    }
    return addArticleFromPDF(article)
      .finally(function () {
        finishArticleStatus(article);
      });
  }

  /**
   * Upload to readcube raw pdf content
   */
  function onDownloadRawPdf(article, pdfUrl) {
    var uploadController = new RawUpload(article),
      existingPdfUrl = article.pdfUrl,
      currentStatus = article.inLibraryStatus;
    article.extend({
      pdfUrl: pdfUrl,
      usingPdfUrl: pdfUrl
    });
    Mixpanel.setProperty(C.MIXPANEL_PROPERTY_BROWSER_EXTENSION_LAST_SEEN, new Date().toISOString());
    return uploadController.upload().then(function(successMessage) {
      Mixpanel.incrementProperty(C.MIXPANEL_PROPERTY_BROWSER_EXTENSION_PDF, 1);
      Mixpanel.trackEvent(C.MIXPANEL_EVENT_PDF_DOWNLOADED);
    }).catch(function(errorMessage) {
      Mixpanel.trackEvent(C.MIXPANEL_EVENT_PDF_DOWNLOAD_FAILED);
    }).finally(function() {
      //Just restore the article statuses in download fails
      article.pdfUrl = existingPdfUrl;
      if (article.isPdfDownloadFailed()) {
        article.inLibraryStatus = currentStatus;
      }
    });
  }

  /**
   * Try to add the article using PDF.
   * We cannot add the article using PDF if:
   * 1) The setting is not enabled for PDF import;
   * 2) No PDF url is available;
   * 3) Unable to Download the PDF file;
   *
   * Example articles with PDFs available for download:
   *
   * Pubmed:
   * http://www.ncbi.nlm.nih.gov/pubmed/26413027
   * http://www.ncbi.nlm.nih.gov/pubmed/26422789
   *
   * Publisher websites:
   * http://journal.frontiersin.org/article/10.3389/fbioe.2013.00012/full
   * http://onlinelibrary.wiley.com/doi/10.1002/glia.22602/full
   *
   *
   * @param article
   *
   * @return Promise
   *
   */
  function addArticleFromPDF(article, index, articleIdLookup) {
    return Storage.get(C.SETTING_PDF_DOWNLOAD, C.VALUE_PDF_DOWNLOAD_AUTOMATIC_ENABLED).then(function (pdfUploadSetting) {
      if (pdfUploadSetting !== C.VALUE_PDF_DOWNLOAD_AUTOMATIC_ENABLED) {
        return $q.reject('Automatic PDF upload is not enabled');
      }
      Mixpanel.setProperty(C.MIXPANEL_PROPERTY_BROWSER_EXTENSION_LAST_SEEN, new Date().toISOString());
      article.inLibraryStatus = C.STATUS_PDF_DOWNLOADING;
      var uploadController = new ProxyUpload(article);
      return uploadController.upload(articleIdLookup).then(function (uploadResult) {
        Mixpanel.incrementProperty(C.MIXPANEL_PROPERTY_BROWSER_EXTENSION_PDF, 1);
        Mixpanel.trackEvent(C.MIXPANEL_EVENT_PDF_DOWNLOADED);
        _.extend(article, {
          inLibraryStatus: C.STATUS_IN_LIBRARY_WITH_PDF
        });
      }).catch(function (errorDetails) {
        Mixpanel.trackEvent(C.MIXPANEL_EVENT_PDF_DOWNLOAD_FAILED);
        //We're unable to import the item using PDF
        console.error(errorDetails);
        //throw new rejection to trigger simple adding, with metadata
        return $q.reject('PDF upload and resolve failed');
      })
    });
  }

  /**
   * Add article using standard method
   *
   * @param article
   * @param index
   * @param includeNote
   * @return Promise
   */

  function addArticleFromMetadata(article, index, includeNote) {
    if (typeof includeNote === 'undefined') {
      includeNote = false;
    }
    Mixpanel.setProperty(C.MIXPANEL_PROPERTY_BROWSER_EXTENSION_LAST_SEEN, new Date().toISOString());
    return Message.sendToBackground('article.AddFromMetadata', {
      article: article.toJson(),
      index: index,
      includeNote: includeNote
    }).then(function(addResult) {
      if (addResult.success) {
        article.extend(addResult.article);
        Mixpanel.incrementProperty(C.MIXPANEL_PROPERTY_BROWSER_EXTENSION_IMPORTED, 1);
        Mixpanel.trackEvent(C.MIXPANEL_EVENT_METADATA_IMPORTED);
        return addResult;
      } else {
        if (addResult.status === HTTPStatus.UNAUTHORIZED) {
          self.loginIframe.show = true;
          self.queuedArticleIndexes = [index];
          return $q.reject('User is not authorized');
        }
        return $q.reject(addResult);
      }
    });
  }

  /**
   * Function executed after successfully logged in using iframe login
   *
   * @param userData
   */
  function onSuccessfullyLoggedIn(userData) {
    //Hide the iframe login
    self.loginIframe.show = false;
    //Reload the articles list
    self.loadArticles()
      .then(ListDropdownApi.loadListOptions) // this will set the correct collection id to import to.
      .then(self.addQueuedArticles)
      .finally(function () {
        self.queuedArticleIndexes = [];
      });
    User.setLoggedInUserDetails(userData);
  }

  function addQueuedArticles() {
    var promises = [];
    _.each(self.queuedArticleIndexes, function (index) {
      if (!self.articlesList[index].isInLibrary()) {
        promises.push(self.onAddToLibraryClick(index));
      }
    });
    return $q.all(promises);
  }

  function finishArticleStatus(article) {
    return User.getInstitutionProxy().then(function (institutionProxyUrl) {
      //Proxy available
      article.finishProcessingStatus(true);
      return true;
    }).catch(function () {
      //No proxy available
      article.finishProcessingStatus(false);
      return false;
    });
  }

  function onListClick(index) {
    Mixpanel.trackEvent(C.MIXPANEL_EVENT_INJECTED_BUTTON_LIST_SELECTED);
    this.onAddToLibraryClick(index);
  }

  function initDimensionsData(isDimensions) {
    var ctrl = self;

    for (var i=0; i < ctrl.articlesList.length; i++) {
      dimensionsDataFetch(ctrl.articlesList[i].doi).then(function(result) {
        var doi = '';
        if (result.url) {
          doi = result.url.split('doi=')[1];
        }
        for (var j=0; j < ctrl.articlesList.length; j++) {
          if (ctrl.articlesList[j].doi == doi) {
            ctrl.articlesList[j].dimensionsDataStatus = result.data.access;
          }
        }
      }).catch(function(error) {
        //
      });
      if (!isDimensions) {
        dimensionsMetricsFetch(ctrl.articlesList[i].doi).then(function(result) {
          var doi = '';
          if (result.data.doi) {
            doi = result.data.doi;
          }
          for (var k=0; k < ctrl.articlesList.length; k++) {
            if (ctrl.articlesList[k].doi == doi) {
              ctrl.articlesList[k].times_cited = result.data.times_cited;
            }
          }
        }).catch(function(error) {
          //
        });
      }
    }
  }

  function dimensionsDataFetch(doi) {
    return xhr.get(C.URL_DIMENSIONS_SUBSCRIPTION_STATUS + doi);
  }

  function dimensionsMetricsFetch(doi) {
    return xhr.get(C.URL_DIMENSIONS_METRICS_DATA + doi);
  }

  function onDimensionsButtonClick(index) {
    var article = self.articlesList[index];

    var please = '';
    if (article.dimensionsDataStatus === 'oa' || article.dimensionsDataStatus === 'subscription') {
      please = '?please=1';
    }

    window.open(C.URL_ARTICLE_FORCE_STAGING + article.doi + please, '_blank');
  }

  function onDimensionsMetricsButtonClick(index) {
    var article = self.articlesList[index];

    window.open(C.URL_DIMENSIONS_METRICS_SEARCH_QUERY + article.doi, '_blank');
  }
}

angular.module('App')
  .controller('GeneralList', GeneralList);


/***/ }),
/* 60 */
/***/ (function(module, exports, __webpack_require__) {

AddToLibraryButton.$inject = ["Storage", "OnlineStatus"];
var angular = __webpack_require__(2),
  _ = __webpack_require__(1),
  C = __webpack_require__(0);

function AddToLibraryButton(Storage, OnlineStatus) {
  return {
    restrict: 'A',
    template: __webpack_require__(45),
    scope: {
      /**
       * Button data should contain:
       * pmid, doi, isInLibrary
       */
      buttonIndex: '@',
      buttonData: '=',
      isPopup: '=',
      whenAddToLibraryClick: '&',
      whenDimensionsButtonClick: '&',
      whenDimensionsMetricsButtonClick: '&',
      whenInLibraryClick: '&',
      whenInLibraryDocumentClick: '&',
      whenDownloadPdfClick: '&',
      whenTriangleClick: '&'
    },
    controller: ['$scope', function($scope) {
      $scope.onAddToLibraryClick = onAddToLibraryClick;
      $scope.onDimensionsButtonClick = onDimensionsButtonClick;
      $scope.onDimensionsMetricsButtonClick = onDimensionsMetricsButtonClick;
      $scope.onInLibraryClick = onInLibraryClick;
      $scope.onInLibraryDocumentClick = onInLibraryDocumentClick;
      $scope.onTriangleClick = onTriangleClick;
      $scope.preventPropagation = preventPropagation;
      $scope.onDownloadPdfClick = onDownloadPdfClick;
      $scope.onShowTooltipClick = onShowTooltipClick;
      $scope.onMouseEnter = onMouseEnter;
      $scope.onMouseLeave = onMouseLeave;

      $scope.tooltipVisibility = {
        visible: false
      };
      //Tooltip displayed when browser is offline
      $scope.offlineTooltipVisibility = {
        visible: false
      };
      $scope.online = navigator.onLine;

      $scope.$watch('buttonData.inLibraryStatus', function(newStatus) {
        //On status change, the tooltip should be hidden
        if (newStatus === C.STATUS_IN_LIBRARY_WITHOUT_PDF_EXPIRED_SUBSCRIPTION
          || newStatus === C.STATUS_IN_LIBRARY_WITHOUT_PDF_NO_SUBSCRIPTION) {
          Storage.get(C.STORAGE_KEY_DISPLAYED_GO_PRO_TOOLTIP, false).then(function(goProTooltipDisplayed) {
            if (goProTooltipDisplayed) {
              $scope.tooltipVisibility.visible = false;
            } else {
              Storage.set(C.STORAGE_KEY_DISPLAYED_GO_PRO_TOOLTIP, true);
              $scope.tooltipVisibility.visible = true;
            }
          })
        } else {
          $scope.tooltipVisibility.visible = false;
        }
      });

      function onAddToLibraryClick(event) {
        preventPropagation(event);
        if (!evaluateOnlineStatus()) {
          return;
        }
        if (_.isFunction($scope.whenAddToLibraryClick)) {
          $scope.whenAddToLibraryClick({
            index: $scope.buttonIndex
          });
        }
      }

      function onDimensionsButtonClick(event) {
        preventPropagation(event);
        if (!evaluateOnlineStatus()) {
          return;
        }
        if (_.isFunction($scope.whenDimensionsButtonClick)) {
          $scope.whenDimensionsButtonClick({
            index: $scope.buttonIndex
          });
        }
      }

      function onDimensionsMetricsButtonClick(event) {
        preventPropagation(event);
        if (!evaluateOnlineStatus()) {
          return;
        }
        if (_.isFunction($scope.whenDimensionsMetricsButtonClick)) {
          $scope.whenDimensionsMetricsButtonClick({
            index: $scope.buttonIndex
          });
        }
      }

      function onInLibraryClick(event) {
        preventPropagation(event);
        if (!evaluateOnlineStatus()) {
          return;
        }
        if (_.isFunction($scope.whenInLibraryClick)) {
          $scope.whenInLibraryClick({
            index: $scope.buttonIndex
          });
        }
      }

      function onInLibraryDocumentClick(event) {
        preventPropagation(event);
        if (!evaluateOnlineStatus()) {
          return;
        }
        if (_.isFunction($scope.whenInLibraryDocumentClick)) {
          $scope.whenInLibraryDocumentClick({
            index: $scope.buttonIndex
          });
        }
      }

      function onTriangleClick(event) {
        preventPropagation(event);
        var isInLibrary = $scope.buttonData.inLibraryStatus != 'not_found';
        if (!evaluateOnlineStatus()) {
          return;
        }
        if (_.isFunction($scope.whenTriangleClick)) {
          $scope.whenTriangleClick({
            index: $scope.buttonIndex,
            event: event,
            isInLibrary: isInLibrary
          });
        }
        return false;
      }

      function onDownloadPdfClick(event) {
        preventPropagation(event);
        if (!evaluateOnlineStatus()) {
          return;
        }
        if (_.isFunction($scope.whenDownloadPdfClick)) {
          $scope.whenDownloadPdfClick({
            index: $scope.buttonIndex
          });
        }
      }

      function onShowTooltipClick(event) {
        preventPropagation(event);
        if (!evaluateOnlineStatus()) {
          return;
        }
        $scope.tooltipVisibility.visible = true;
      }

      function preventPropagation(event) {
        if (event instanceof MouseEvent) {
          event.preventDefault();
          event.stopPropagation();
        }
      }

      function onMouseEnter() {
        if (!evaluateOnlineStatus(false)) {
          return;
        }
        $scope.tooltipVisibility.visible = true;
      }

      function onMouseLeave() {
        $scope.tooltipVisibility.visible = false;
      }

      function evaluateOnlineStatus(displayOfflineTooltip) {
        if (typeof displayOfflineTooltip === 'undefined') {
          displayOfflineTooltip = true;
        }
        if (OnlineStatus.isOffline()) {
          $scope.tooltipVisibility.visible = false;
          if (displayOfflineTooltip) {
            $scope.offlineTooltipVisibility.visible = true;
          }
        } else {
          $scope.offlineTooltipVisibility.visible = false;
        }
        return OnlineStatus.isOnline();
      }
    }]
  };
}

angular.module('App')
  .directive('addToLibraryButton', AddToLibraryButton);


/***/ }),
/* 61 */
/***/ (function(module, exports, __webpack_require__) {

ListDropdown.$inject = ["List", "Message", "BrowserTab", "Article", "Storage", "ListDropdownApi", "$document", "$window"];
var angular = __webpack_require__(2),
  _ = __webpack_require__(1),
  q = __webpack_require__(8),
  sprintf = __webpack_require__(5).sprintf,
  xhr = __webpack_require__(6),
  C = __webpack_require__(0),
  $ = __webpack_require__(4),
  HttpStatus = __webpack_require__(11);

function ListDropdown(List, Message, BrowserTab, Article, Storage, ListDropdownApi, $document, $window) {
  return {
    restrict: 'A',
    template: __webpack_require__(46),
    scope: {
      isBelowButton: '=?',
      selectedListName: '=?',
      whenListClick: '&',
      onAddToLibraryClick: '&',
      isAnySelected: '=?'
    },
    link: function($scope, $element, $attrs) {
      var lastUpdateTarget = null;
      $scope.options = {};
      ListDropdownApi.loadListOptions = loadListOptions;
      $scope.shouldDisplayAddButton = $attrs['shouldDisplayAddButton'] || false;
      $scope.api = ListDropdownApi;
      $scope.hasMultipleCollections = hasMultipleCollections;

      $scope.selectedItems = {};

      loadSelections()
        .then(loadListOptions)
        .then(loadSelections);

      $scope.addToLibrary = addToLibrary;
      $scope.onClickOpenArrow = onClickOpenArrow;

      Message.listenForMessages(function(request, callback) {
        switch (request.message) {
          case C.MESSAGE_UPDATE_LISTS:
            var lists = _.map(_.get(request, 'data.lists', []), 'data.list', [])
            _.each(lists, updateLists);
            break;
        default:
          callback(null);
          break;
        }
      });

      function addToLibrary() {
        if (_.isFunction($scope.onAddToLibraryClick)) {
          $scope.onAddToLibraryClick({index: $scope.api.index});
        }
      }

      function onClickOpenArrow(event, collectionId) {
        event.stopPropagation();
        event.preventDefault();
        var article = $scope.api.article;
        var articleId = articleIdForCollectionId(collectionId, article);
        BrowserTab.openItemInLibrary(articleId, collectionId);
      }

      function isSelected(collectionId, listId) {
        if (!listId) {
          // see if we have an array by this key
          return _.has($scope.selectedItems, collectionId);
        } else {
          // see if the collection has this list.
          var allLists = _.flatten(_.values($scope.selectedItems));
          return _.includes(allLists, listId);
        }
      }

      var onWindowResize = _.debounce(function() {
        if ($scope.show && lastUpdateTarget) {
          updatePositions(lastUpdateTarget);
          $scope.$apply();
        }
      }, 200);

      $document.on('click', onDocumentClick);
      $($window).on('resize', onWindowResize);

      $scope.$on('$destroy', function() {
        $document.off('click', onDocumentClick);
        $($window).off('resize', onWindowResize);
      });

      $scope.$watch('api.show', function() {
        var event = $scope.api.event;
        // only display button if not already in library
        $scope.shouldDisplayAddButton = !$scope.api.isInLibrary;
        if (!$scope.shouldDisplayAddButton) {
          // set state of dropdown to show which lists/collections an article
          // belongs to.
          updateStateForInLibraryArticle($scope.api.article);
        }
        if (event && $scope.api.show) {
          if (event.target.className == 'caret') {
            lastUpdateTarget = $(event.target.parentElement);
          } else {
            lastUpdateTarget = $(event.target);
          }
          updatePositions(lastUpdateTarget);
          $scope.show = true;
        } else {
          $scope.show = false;
          lastUpdateTarget = null;
        }
      });

      function updateStateForInLibraryArticle(article) {
        _.each($scope.options.groups, function(group) {
          _.each(group.collections, function(collection) {
            // is the article in this collection?
            collection._imported = _.some(article.collections, function(collectionInfo) {
              return collection.collection_id == collectionInfo.id;
            });
            _.each(collection.lists, function(list) {
              // is the article in this list?
              list._imported = _.some(list.item_ids, function(itemId) {
                return _.some(article.collections, { item_id: itemId });
              });
            });
          });
        });
      }

      function toggleItem(listId, collectionId) {
        if (!listId && collectionId) {
          // user only clicked collection so toggle it.
          if (!_.has($scope.selectedItems, collectionId)) {
            $scope.selectedItems[collectionId] = [];
          } else {
            delete $scope.selectedItems[collectionId];
          }
        } else {
          // user clicked a list in a collection
          if (!_.has($scope.selectedItems, collectionId)) {
            // the collection wasn't previously selected
            $scope.selectedItems[collectionId] = [listId];
          } else {
            // the collection was selected so toggle the listId presence
            if (_.includes($scope.selectedItems[collectionId], listId)) {
              _.pull($scope.selectedItems[collectionId], listId);
            } else {
              $scope.selectedItems[collectionId].push(listId);
            }
          }
        }

        $scope.isAnySelected = !(_.isEmpty($scope.selectedItems));

        Storage.set({ selectedItems: $scope.selectedItems });

        return false;
      }

      function articleIdForCollectionId(collectionId, article) {
        var collection = _.find(article.collections, { id: collectionId });
        return _.get(collection, 'item_id');
      }

      function toggleRemoteCollectionState(article, collection, value) {
        if (value == true) {
          var importUrl = sprintf(C.URL_COLLECTION_IMPORT_FROM_COLLECTION, collection.collection_id);
          return xhr.post(importUrl, {
            from_collection_id: article.collection_id,
            item_ids: [ article.id ],
            annotations: false
          }).then(function(response) {
            updateCollections(article, collection, response);
            return true;
          });
        } else {
          var articleId = articleIdForCollectionId(collection.collection_id, article);
          var deleteUrl = sprintf(C.URL_REMOVE_FROM_COLLECTION, collection.collection_id, articleId);
          return xhr.delete(deleteUrl);
        }
      }

      function updateCollections(article, collection, updateResponse) {
        var updatedItem = _.get(updateResponse, 'data.items[0]');
        if (collection.collection_id == updatedItem.collection_id) {
          // should always be true.
          var matchingCollection = _.some(article.collections, { id: collection.collection_id });
          // should be undefined
          if (!matchingCollection) {
            article.collections.push({
              id: updatedItem.collection_id,
              item_id: updatedItem.id,
              name: collection.name,
              shared: collection.shared
            });
          }
        }
      }

      function toggleRemoteListState(article, collection, list, value) {
        if (value == true) {
          // is it in the collection
          var articleId = articleIdForCollectionId(collection.collection_id, article);
          if (articleId) {
            return xhr.post(
              sprintf(C.URL_ADD_TO_COLLECTION_LIST, collection.collection_id, list.id),
              { item_ids: [articleId] }
            ).then(function(response) {
              var list = _.get(response, 'data.list');
              updateLists(list);
            });
          } else {
            var importUrl = sprintf(C.URL_COLLECTION_IMPORT_FROM_COLLECTION, collection.collection_id);
            return xhr.post(importUrl, {
              from_collection_id: article.collection_id,
              item_ids: [ article.id ],
              annotations: false
            }).then(function(importResponse) {
              // update article.collections
              if (importResponse.status == HttpStatus.OK) {
                updateCollections(article, collection, importResponse);
                var articleId = _.get(importResponse, 'data.items[0].id');
                collection._imported = true;
                return xhr.post(
                  sprintf(C.URL_ADD_TO_COLLECTION_LIST, collection.collection_id, list.id),
                  { item_ids: [articleId] }
                ).then(function(response) {
                  var list = _.get(response, 'data.list');
                  updateLists(list);
                });
              }
            });
          }
        } else {
          var articleId = articleIdForCollectionId(collection.collection_id, article);
          return xhr.post(
            sprintf(C.URL_REMOVE_FROM_COLLECTION_LIST, collection.collection_id, list.id),
            { item_ids: [articleId] }
          ).then(function(response) {
            // if successful, update the $scope.options lists
            var updated = _.get(response, 'data.list');
            updateLists(updated);
          });
        }
      }

      function updateLists(updated) {
        if (updated) {
          var matchingCollection = _.find(
            _.flatMap($scope.options.groups, 'collections'),
            { collection_id: updated.collection_id }
          );
          var matchingList = _.find(matchingCollection.lists, { id: updated.id });
          matchingList.item_ids = updated.item_ids;
          matchingList.items = updated.items;
        }
      }

      function addSelectedProperties(lists) {
        _.each(lists.groups, function(group) {
          _.each(group.collections, function(collection) {
            collection._selected = isSelected(collection.collection_id, null);
            Object.defineProperty(collection, 'selected', {
              get: function() {
                if ($scope.api.isInLibrary) {
                  // if in library, return imported state instead
                  return collection._imported;
                }
                return collection._selected;
              },
              set: function(value) {
                if ($scope.api.isInLibrary) {
                  collection.disabled = true;
                  toggleRemoteCollectionState($scope.api.article, collection, value).then(function() {
                    collection._imported = value;
                    collection.disabled = false;
                    _.each(collection.lists, function(list) { list._imported = false; });
                    $scope.$apply();
                    // c'est la vie
                    return q.delay(1000).then(function() {
                      return Article.updateStatusForArticle.bind(Article, $scope.api.article)();
                    });
                  }).finally(function() { collection.disabled = false });
                } else {
                  collection._selected = value;
                  if (value == false) {
                    _.each(collection.lists, function(list) {
                      if (list.selected == true) {
                        list.selected = false;
                      }
                    });
                  }
                  toggleItem(null, collection.collection_id);
                }
              }
            });
            _.each(collection.lists, function(list) {
              list._selected = isSelected(collection.collection_id, list.id);
              Object.defineProperty(list, 'selected', {
                get: function() {
                  if ($scope.api.isInLibrary) {
                    // if in library, return imported state instead
                    return list._imported;
                  }
                  return list._selected;
                },
                set: function(value) {
                  if ($scope.api.isInLibrary) {
                    list.disabled = true;
                    collection.disabled = true;
                    toggleRemoteListState($scope.api.article, collection, list, value).then(function() {
                      list._imported = value;
                      list.disabled = false;
                      collection.disabled = false;
                      $scope.$apply();
                      // c'est la vie
                      return q.delay(1000).then(function() {
                        // could be that it has been added to a collection too.
                        return Article.updateStatusForArticle.bind(Article, $scope.api.article)();
                      });
                    }).finally(function() {
                      collection.disabled = false;
                      list.disabled = false;
                    });
                  } else {
                    list._selected = value;
                    if (collection.selected == false && value == true) {
                      collection.selected = true;
                    }
                    if (collection.selected) {
                      toggleItem(list.id, collection.collection_id);

                      if (_.every(collection.lists, { 'selected': false })) {
                        // if we have deselected all the lists then deselect the
                        // parent collection.
                        collection.selected = false;
                      }
                    }
                  }
                }
              });
            });
          });
        });
      }

      $scope.$watch('selectedItems', function() {
        if (!_.isEmpty($scope.options)) {
          $scope.selectedListName = getSelectedNames();
        }
        Storage.set({ selectedItems: $scope.selectedItems });
      }, true);

      // determine if the selection ids match the collection ids
      // if they don't it's likely they are for another account.
      function hasAllCollections(selections) {
        var collections = getFlatCollectionDict();

        return _.chain(selections)
          .keys()
          .every(_.partial(_.has, collections))
          .value();
      }

      function loadSelections() {
        return Storage.get('selectedItems', {}).then(function(selectedItems) {
          if (!_.isEmpty($scope.options)) {
            // we have the lists of collections
            if (_.isEmpty(selectedItems) || _.has(selectedItems, '0') || !hasAllCollections(selectedItems)) {
              // either nothing is selected
              // or the fake collection from when the user wasn't logged in.
              // or another users account data.
              // so select the default collection
              var defaultCollection =
                _.chain($scope.options)
                  .get('groups', [])
                  .find(function(group) {
                    return group.group_id == null || group.group_id == 'null';
                  })
                  .get('collections[0]', null)
                  .value();

              if (defaultCollection) {
                defaultCollection.selected = true;
                var defaultCollectionId = defaultCollection.collection_id;
                $scope.selectedItems = {};
                $scope.selectedItems[defaultCollectionId] = [];
                Storage.set({ selectedItems: $scope.selectedItems });
              }
            } else {
              // we have valid selection data
              $scope.selectedItems = selectedItems;
            }
          } else {
            // we don't have remote options, user not logged in.
            $scope.selectedItems = selectedItems;
          }
          return true;
        });
      }

      function removeSelectionsThatDontExistAnymore(remoteData) {
        var remoteCollectionDict = _.chain(remoteData.groups)
          .flatMap('collections')
          .keyBy('collection_id')
          .value();

        var collectionsToUnselect = [];

        _.each($scope.selectedItems, function(listIds, collectionId) {
          var remote = remoteCollectionDict[collectionId];
          if (!remote) {
            // no longer a remote collection
            collectionsToUnselect.push(collectionId);
          } else {
            // still exists, what about all the lists?
            var listIdsThatStillExist = _.filter(listIds, function(listId) {
              return _.some(remote.lists, { id: listId });
            });

            $scope.selectedItems[collectionId] = listIdsThatStillExist;
          }
        });

        _.each(collectionsToUnselect, function(collectionId) {
          delete $scope.selectedItems[collectionId];
        });
      }

      function loadListOptions() {
        return List.queryStorage().then(function(lists) {
          addSelectedProperties(lists);
          $scope.options = lists;
          return true;
        }).catch(function(errorDetails) {
          //the local storage list is empty. Just log this an continue
          console.error(errorDetails);
          return true;
        }).then(function() {
          return List.queryFlat();
        }).then(function(remoteData) {
          if (!_.isEqual(remoteData, $scope.options)) {
            //remote and local lists not equal. The storage needs to be updated
            Storage.set({ lists: remoteData });
            removeSelectionsThatDontExistAnymore(remoteData);
            addSelectedProperties(remoteData);
            $scope.options = remoteData;
          }
          $scope.selectedListName = getSelectedNames();
          return loadSelections();
        }).catch(function(error) {
          if (error.status == HttpStatus.UNAUTHORIZED) {
            //We have unauthorized problem. Clear the storage related to lists
            Storage.set({ lists: null });
            $scope.options = {
              groups: [{
                group_id: null,
                collections: [
                  {
                    name: C.DEFAULT_PERSONAL_LIBRARY_NAME,
                    collection_id: '0',
                    lists: [],
                    selected: true
                  }
                ]
              }]
            };
            $scope.selectedItems = { '0': [] };
          }
        });
      }

      function hasMultipleCollections() {
        return $scope.options
          && $scope.options.groups
          && $scope.options.groups.length > 1;
      }

      function updatePositions(target) {
        var offset = target.offset();
        var width = target.width();
        var pageX = offset.left;
        var pageY = offset.top;

        // get dropdown element
        var dropdownElement = $('#readcube-injected-button-dropdown');
        // if its an injected dropdown, popup does not have id.
        if (dropdownElement.length) {
          // get containing element
          var containerParentOffset = dropdownElement.offsetParent().offset();
          pageX = pageX - containerParentOffset.left;
          pageY = pageY - containerParentOffset.top;
        }

        var left = ((pageX + (width / 2)) - 70) + 'px';

        if ($scope.isBelowButton) {
          $scope.triangleStyle = {
            left: left,
            top: (pageY + 23) + 'px'
          };
          $scope.boxStyle = {
            left: left,
            top: (pageY + 20) + 'px'
          };
        } else {
          var bodyHeight = $document[0].body.clientHeight;
          $scope.triangleStyle = {
            left: left,
            bottom: (bodyHeight - pageY + 10) + 'px'
          };
          $scope.boxStyle = {
            left: left,
            bottom: (bodyHeight - pageY + 15) + 'px'
          };
        }

      }

      function getFlatCollectionDict() {
        return _.chain($scope.options.groups)
          .flatMap('collections')
          .keyBy('collection_id')
          .value();
      }

      function getSelectedNames() {
        var collections = getFlatCollectionDict();

        return _.chain($scope.selectedItems).toPairs()
          .reduce(function(acc, pair) {
            var collectionId = pair[0];
            var listIds = pair[1];
            var collection = collections[collectionId];
            if (collection) {
              // if the user has logged out we will still have their selections
              // of ids that don't exist.
              var listNames = _.reduce(collection.lists, function(acc, list) {
                return _.includes(listIds, list.id) ? acc.concat(list.name) : acc;
              }, []);
              return _.isEmpty(listNames)
                ? acc.concat(collection.name)
                : acc.concat(listNames);
            } else {
              return acc;
            }
          }, [])
          .join(', ')
          .value();
      }

      var elementClassesToIgnoreClick = [
        'dropdown-menu',
        'dropdown-group-name',
        'dropdown-group-list',
        'dropdown-collection-header'
      ];

      function onDocumentClick(event) {
        // TODO: proper preventDefaults/click handling code.
        var hasClass = _.some(elementClassesToIgnoreClick, function(className) {
          return event.target.className.indexOf(className) > -1;
        });

        if (hasClass) return;

        $scope.$apply(function () {
          $scope.api.hideDropdown();
        });
      }
    }
  };
}

angular.module('App')
  .directive('listDropdown', ListDropdown);


/***/ }),
/* 62 */
/***/ (function(module, exports, __webpack_require__) {

/**
 * The iframe uses "postMessage" to to notify the parent page of the following events:
 * Login page show: { type: 'auth:new', auth: 'login' }
 * Login success: { type: ‘auth:success', user: data.user, auth: 'login' } (edited)
 * Register page show: { type: 'auth:new', auth: 'register' }
 * Register success: { type: ‘auth:success', user: USER_JSON, auth: 'register' }
 * Those are the postMessage event.data objects
 */

LoginIframe.$inject = ["$window"];
var angular = __webpack_require__(2),
  _ = __webpack_require__(1),
  C = __webpack_require__(0),
  $ = __webpack_require__(4),
  sprintf = __webpack_require__(5).sprintf,
  deparam = __webpack_require__(79);

function LoginIframe($window) {
  return {
    restrict: 'A',
    template: __webpack_require__(47),
    scope: {
      show: '=',
      whenSuccessfullyLoggedIn: '&'
    },
    link: function($scope, $element, $attrs) {
      $scope.iframeUrl = sprintf(C.URL_LOGIN_FORM, encodeURIComponent($window.location.toString()));
      $scope.onCloseButtonClick = onCloseButtonClick;

      $scope.$watch('show', function() {
        var doc = $window.document;
        $(doc.body)
          .add(doc.documentElement)
          .toggleClass('readcube-iframe-displayed', $scope.show);
      });

      $window.addEventListener('message', function(event) {
        var eventOrigin = _.get(event, 'origin', '');
        if (!eventOrigin.match(C.URL_REGEXP_MAIN_URL)) {
          //Messages only from Readcube urls are accepted
          return false;
        }
        var iframeMessage = _.defaults(deparam(_.get(event, 'data', '')), {
          type: null,
          auth: null,
          user: {}
        });
        if (iframeMessage.type === 'auth:success' && (iframeMessage.auth === 'login'
          || iframeMessage.auth === 'register')) {
          //Logged in successfully
          $scope.whenSuccessfullyLoggedIn({
            userData: iframeMessage.user
          });
          $scope.$apply();
        }
      });

      function onCloseButtonClick() {
        $scope.show = false;
      }
    }
  };
}

angular.module('App')
  .directive('loginIframe', LoginIframe);


/***/ }),
/* 63 */
/***/ (function(module, exports, __webpack_require__) {

var angular = __webpack_require__(2),
  _ = __webpack_require__(1),
  C = __webpack_require__(0);

function SharedLibraryIcon() {
  return {
    restrict: 'A',
    template: __webpack_require__(48),
    scope: {
      buttonData: '=',
    },
    controller: ['$scope', function($scope) {
      $scope.isInSharedLibrary = isInSharedLibrary;
      $scope.sharedLibrariesTooltip = sharedLibrariesTooltip;

      function isInSharedLibrary() {
        var collections = $scope.buttonData.collections;
        if (collections) {
          return collections.some(function(collection) {
            return collection.shared;
          });
        } else {
          return false;
        }
      }

      function sharedLibrariesTooltip() {
        var collections = $scope.buttonData.collections;
        if (collections) {
          var shared = collections.map(function(collection) {
            return collection.name || 'Personal';
          });
          return shared.join(', ');
        } else {
          return '';
        }
      }
    }]
  };
}

angular.module('App')
  .directive('sharedLibraryIcon', SharedLibraryIcon);


/***/ }),
/* 64 */
/***/ (function(module, exports, __webpack_require__) {

var angular = __webpack_require__(2),
  _ = __webpack_require__(1),
  url = __webpack_require__(9);

function hostname() {
  return function (urlString) {
    if (_.isString(urlString)) {
      return url.parse(urlString).hostname;
    }
    return '';
  };
}

angular.module('App')
  .filter('hostname', hostname);

/***/ }),
/* 65 */
/***/ (function(module, exports, __webpack_require__) {

ClearUserDataInterceptor.$inject = ["Storage", "$q"];
var angular = __webpack_require__(2),
  C = __webpack_require__(0),
  HttpStatus = __webpack_require__(11),
  _ = __webpack_require__(1);

function ClearUserDataInterceptor(Storage, $q) {
  return {
    responseError: function(rejection) {
      if (_.get(rejection, 'config.url', '').indexOf(C.DOMAIN_READCUBE) !== -1
        && rejection.status == HttpStatus.UNAUTHORIZED) {
        //If a Unauthorized error message was received, clear the storage data related to User
        Storage.set({
          loggedInUserDetails: null
        });
      }
      return $q.reject(rejection);
    }
  };
}

angular.module('App')
  .factory('ClearUserDataInterceptor', ClearUserDataInterceptor)
  .config(['$httpProvider', function ($httpProvider) {
    $httpProvider.interceptors.push('ClearUserDataInterceptor');
  }]);

/***/ }),
/* 66 */
/***/ (function(module, exports, __webpack_require__) {

var angular = __webpack_require__(2);

function ListDropdownApi() {
  return {
    show: false,
    isInLibrary: false,
    index: null,
    event: null,
    article: null,
    showDropdown: function(event, index, article, isInLibrary) {
      this.event = event;
      this.show = true;
      this.index = index;
      this.isInLibrary = isInLibrary;
      this.article = article;
    },
    hideDropdown: function() {
      this.event = null;
      this.show = false;
      this.index = null;
    },
    toggleDropdown: function(event, index, article, isInLibrary) {
      if (this.show) {
        this.hideDropdown();
      } else {
        this.showDropdown(event, index, article, isInLibrary);
      }
    },
    loadListOptions: function () {
      //An empty method. Should be update in directive
    }
  }
}

angular.module('App')
  .factory('ListDropdownApi', ListDropdownApi);


/***/ }),
/* 67 */
/***/ (function(module, exports, __webpack_require__) {

ProxyUpload.$inject = ["$q", "User", "Upload", "$http", "Message"];
var angular = __webpack_require__(2),
  C = __webpack_require__(0),
  storage = __webpack_require__(28),
  sprintf = __webpack_require__(5).sprintf,
  xhr = __webpack_require__(6),
  _ = __webpack_require__(1),
  inherit = __webpack_require__(3);

function ProxyUpload($q, User, Upload, $http, Message) {

  function getUserIdAndCollectionAndListIdsFromStorage() {
    return storage.get('loggedInUserDetails', null).then(function(userDetails) {
      return storage.get('selectedItems', {}).then(function(selectedItems) {
        return {
          userId: _.get(userDetails, 'id', null),
          selectedItems: selectedItems
        };
      });
    });
  }

  return inherit(Upload, {

    /**
     * Download from remote source and upload the PDF content to Readcube server
     *
     * @return {Promise}
     */
    upload: function(articleIdLookup) {
      var self = this;
      self.article.extend({
        progressPercent: 0,
        progressType: C.PROGRESS_DOWNLOAD,
        usingPdfUrl: self.article.pdfUrl
      });

      var pdfSrcUrl;

      return $q.when(function() {
        if (!self.article.pdfUrl) {
          return $q.reject('Pdf url not available');
        }
        pdfSrcUrl = self.article.pdfUrl;
        return self.getProxiedDownloadPromise(self.article.pdfUrl);
      }()).catch(function(errorDetailsDownload) {

        function getPdfUrlFromDoi() {
          if (!self.article.doi) {
            return $q.reject(errorDetailsDownload);
          }
          // Unable to download the pdf url from google scholar url.
          // Lets use dx.doi.org to get the article html, and from there parse the pdf url
          return Message.sendToBackground('request.GetPdfUrlsFromDxDoi', self.article.doi).then(function(pdfUrlsFromDoiResolve) {
            var pdfUrl = _.get(pdfUrlsFromDoiResolve, '[0]', null);
            if (!pdfUrl) {
              return $q.reject('Unable to find PDF url from dx.doi.org resolve');
            }
            self.article.extend({
              progressPercent: 0,
              usingPdfUrl: pdfUrl
            });

            pdfSrcUrl = pdfUrl;
            return self.getProxiedDownloadPromise(pdfUrl);
          });
        }

        if (self.article.parsedPdfUrl) {
          pdfSrcUrl = self.article.parsedPdfUrl;
          return self.getProxiedDownloadPromise(self.article.parsedPdfUrl)
            .catch(function(parsedPdfUrlError) {
              return getPdfUrlFromDoi();
            });
        } else {
          return getPdfUrlFromDoi();
        }

      }).then(function (data) {
        var pdfFilename = self.fixPdfFilename(data.fileName);

        var readcubeGetUploadPromises = getUserIdAndCollectionAndListIdsFromStorage()
          .then(function(ids) {
            var collectionIds = _.keys(ids.selectedItems);

            var sourceUrl = '';

            if (pdfSrcUrl && pdfSrcUrl.length) {
              sourceUrl = encodeURIComponent(pdfSrcUrl.substring(0, 500));
            }

            return _.map(collectionIds, function(collectionId) {
              var url = sprintf(C.URL_UPLOAD,
                collectionId,
                'false',
                data.sha256Hash,
                self.article.doi ? self.article.doi : '',
                self.article.pmid ? self.article.pmid : '',
                data.fileSize,
                (articleIdLookup ? articleIdLookup[collectionId] : null) || self.article.id || '',
                encodeURIComponent(pdfFilename),
                sourceUrl
              );
              return xhr.get(url);
            });
          });

        return readcubeGetUploadPromises.then(function(promises) {
          return $q.all(promises).then(function (results) {
            // if the responses are 422 (file already on RC) then catch block
            // is instead called.
            return $q.all(_.map(results, function(result, index) {
              var uploadUrl = _.get(result, 'data.url', null);
              if (!uploadUrl) {
                return $q.reject('Url not received from preparing to upload');
              } else {
                if (index == 0) {
                  self.article.progressPercent = 0;
                  self.article.progressType = C.PROGRESS_UPLOAD;
                }
                return self.getUploadPromise(uploadUrl, data.blob).then(null, null, function(percent) {
                  self.article.progressPercent = percent;
                });
              }
            }));
          });
        });
      }).catch(function (errorDetails) {
        return self.evaluateUploadError(errorDetails);
      });
    },

    /**
     * Download the pdf content: normal or ezproxied
     *
     * @param {string} url
     */
    getProxiedDownloadPromise: function(url) {
      var self = this;
      return self.getDownloadPromise({url: url, isProxied: false}).catch(function() {
        //Unable to download the pdf with simple link.
        //Try to do this with proxied url
        return User.getInstitutionProxy().then(function (institutionProxyUrl) {
          var proxiedPdfUrl = institutionProxyUrl.replace(C.EZPROXY_URL_REPLACE_KEY, url);
          self.article.progressPercent = 0;
          return self.getDownloadPromise({
            url: proxiedPdfUrl,
            isProxied: true
          });
        });
      });
    }

  });

}

angular.module('App')
  .factory('ProxyUpload', ProxyUpload);


/***/ }),
/* 68 */
/***/ (function(module, exports, __webpack_require__) {

var inherit = __webpack_require__(3);

module.exports = inherit({

  /**
   * Insert angular directive into existing DOM
   */
  insertAngularDirectives: function () {
  },

  bootstrapAngular: function() {
  },

  /**
   * Get the Identifiers and Metadata for existing rows
   * @return {*|Array}
   */
  get: function () {
  },

  /**
   * Get the Identifiers array only. Useful for parse result verification
   *  @return {*|Array}
   */
  getPlain: function() {
  },

  /**
   * An abstract method to get the Identifiers from a result row
   * @param row
   * @return {{doi: null, pmid: null, gsid: null}}
   */
  getIdentifiers: function (row) {
  },

  /**
   * Get the metadata from a row
   * @param row
   */
  getMetadata: function (row) {
  },

  /**
   * A list of jQuery elements when each article is described
   */
  getArticleHolders: function() {
  },

  /**
   * If the current page is single ref (true) or multiple refs (false)
   * @return {boolean}
   */
  isAbstractPage: function () {
  },

  /**
   * Get the element where the custom Readcube button will be injected
   * @param articleHolder A jQuery element where the article is presented
   */
  getButtonHolder: function (articleHolder) {
  },

  /**
   * Insert the Readcube buttons
   */
  insertButtons: function () {
  },

  getAngularInjector: function(callback, injector) {
  },

  /**
   * Sometimes the DOI can be parsed not right after the DOM load, but based on other events
   */
  getExecutePromise: function() {
  },

  /**
   * Parse doi parameter from text of the specified element
   * @param element
   */
  getDoiFromElement: function(element) {
  }
});

/***/ }),
/* 69 */,
/* 70 */,
/* 71 */,
/* 72 */,
/* 73 */,
/* 74 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var partNames = [
    'lastName',
    'nondropped',
    'dropped',
    'firstName',
    'middle',
    'suffix'
];
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = partNames;


/***/ }),
/* 75 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var tokenizer_1 = __webpack_require__(26);
var name_string_builder_1 = __webpack_require__(25);
var nsrange_1 = __webpack_require__(16);
var util_1 = __webpack_require__(17);
function parseLastName(value) {
    var lastNameDict = {};
    var vonLastTokens = tokenizer_1.default(value);
    if (vonLastTokens.length == 0) {
        return lastNameDict;
    }
    var lastNameRange = new nsrange_1.default(0, vonLastTokens.length);
    if (vonLastTokens.length > 1) {
        lastNameDict.suffix = util_1.tryGetSuffix(vonLastTokens[vonLastTokens.length - 1]);
        if (lastNameDict.suffix) {
            lastNameRange.length--;
        }
        var maxParticleCount = lastNameRange.length - 1;
        if (maxParticleCount > 0) {
            if (maxParticleCount > 2) {
                maxParticleCount = 2;
            }
            var r = new nsrange_1.default(0, maxParticleCount);
            var potentialParticles = r.sliceArray(vonLastTokens);
            var particleRange = util_1.particlesRangeInTokens(potentialParticles, true);
            if (particleRange.location == 0) {
                lastNameRange.location += particleRange.length;
                lastNameRange.length -= particleRange.length;
                var particles = particleRange.sliceArray(vonLastTokens);
                _a = util_1.splitParticleParts(particles), lastNameDict.dropped = _a[0], lastNameDict.nondropped = _a[1];
            }
        }
    }
    if (lastNameRange.location != null) {
        lastNameDict.lastName = lastNameRange
            .sliceArray(vonLastTokens)
            .map(function (token) { return token[0] == '{' ? token.substring(1) : token; })
            .join(' ');
    }
    return lastNameDict;
    var _a;
}
function parseDelimited(value) {
    var author = {};
    var commaSeparatedComponents = value.split(',');
    var lastNameDictionary = parseLastName(commaSeparatedComponents[0]);
    author.lastName = lastNameDictionary.lastName;
    author.dropped = lastNameDictionary.dropped;
    author.nondropped = lastNameDictionary.nondropped;
    author.suffix = lastNameDictionary.suffix;
    var componentCount = commaSeparatedComponents.length;
    if (componentCount > 1) {
        var firstNameLocation = 1;
        if (!author.suffix && componentCount > 2) {
            author.suffix = util_1.tryGetSuffix(commaSeparatedComponents[1].trim());
            if (author.suffix) {
                firstNameLocation = 2;
            }
        }
        var r = new nsrange_1.default(firstNameLocation, componentCount - firstNameLocation);
        var firstNameComponents = r.sliceArray(commaSeparatedComponents);
        var firstNameTokens = firstNameComponents
            .reduce(function (acc, component) {
            return acc.concat(tokenizer_1.default(component));
        }, []);
        _a = util_1.firstAndMiddleFromTokens(firstNameTokens), author.firstName = _a[0], author.middle = _a[1];
    }
    author.nameString = name_string_builder_1.default(author);
    return author;
    var _a;
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = parseDelimited;


/***/ }),
/* 76 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var tokenizer_1 = __webpack_require__(26);
var nsrange_1 = __webpack_require__(16);
var name_string_builder_1 = __webpack_require__(25);
var util_1 = __webpack_require__(17);
function parseIncreasing(value) {
    var author = {};
    var tokens = tokenizer_1.default(value);
    if (tokens.length > 1) {
        var token = tokens[tokens.length - 1];
        author.suffix = util_1.tryGetSuffix(token);
    }
    var lastNameMaxStart = tokens.length;
    if (author.suffix) {
        lastNameMaxStart--;
    }
    if (tokens.length > 0) {
        lastNameMaxStart--;
    }
    var potentialParticles = tokens.slice(0, lastNameMaxStart);
    var particleRange = util_1.particlesRangeInTokens(potentialParticles);
    var lastNameRange = new nsrange_1.default();
    if (particleRange.notFound()) {
        if (tokens.length > 0) {
            lastNameRange = new nsrange_1.default(tokens.length - 1, 1);
            if (author.suffix) {
                lastNameRange.location--;
            }
        }
        particleRange = new nsrange_1.default(lastNameRange.location, 0);
    }
    else {
        lastNameRange.location = particleRange.maxRange();
        lastNameRange.length = tokens.length - lastNameRange.location;
        if (author.suffix) {
            lastNameRange.length--;
        }
    }
    tokens = tokens.map(function (token) { return token[0] == '{' ? token.substring(1) : token; });
    var firstNameRange = new nsrange_1.default(0, particleRange.location);
    var firstNameTokens = firstNameRange.sliceArray(tokens);
    _a = util_1.firstAndMiddleFromTokens(firstNameTokens), author.firstName = _a[0], author.middle = _a[1];
    if (particleRange.length > 0) {
        var particles = particleRange.sliceArray(tokens);
        _b = util_1.splitParticleParts(particles), author.dropped = _b[0], author.nondropped = _b[1];
    }
    if (lastNameRange.length == 1 && lastNameRange.location !== undefined) {
        author.lastName = tokens[lastNameRange.location];
    }
    else if (lastNameRange.length > 1) {
        var lastNameParts = lastNameRange.sliceArray(tokens);
        author.lastName = lastNameParts.join(' ');
    }
    author.nameString = name_string_builder_1.default(author);
    return author;
    var _a, _b;
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = parseIncreasing;


/***/ }),
/* 77 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var increasing_parser_1 = __webpack_require__(76);
var delimited_parser_1 = __webpack_require__(75);
var util_1 = __webpack_require__(17);
exports.fullnameForAuthor = util_1.fullnameForAuthor;
function parse(value) {
    if (!value)
        throw 'Invalid value';
    if (value.indexOf(',') > -1) {
        return delimited_parser_1.default(value);
    }
    else {
        return increasing_parser_1.default(value);
    }
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = parse;


/***/ }),
/* 78 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var particleRules = {
    'al': ['al', ''],
    'dos': ['dos', ''],
    'el': ['el', ''],
    'de las': ['de', 'Las'],
    'lo': ['lo', ''],
    'les': ['les', ''],
    // italy (??)
    'il': ['il', ''],
    'del': ['', 'del'],
    'dela': ['dela', ''],
    'della': ['della', ''],
    'dello': ['dello', ''],
    'di': ['', 'Di'],
    'da': ['', 'Da'],
    'do': ['', 'Do'],
    // 'des': ['', 'Des'], this is dup-key. (see germany/austria).
    'lou': ['', 'Lou'],
    'pietro': ['', 'Pietro'],
    // france -- checked by Charles
    'de': ['', 'de'],
    'de la': ['de', 'La'],
    'du': ['du', ''],
    'd\'': ['d\'', ''],
    'le': ['', 'Le'],
    'la': ['', 'La'],
    'l\'': ['', 'L\''],
    'saint': ['', 'Saint'],
    'sainte': ['', 'Sainte'],
    'st.': ['', 'Saint'],
    'ste.': ['', 'Sainte'],
    // holland
    'van': ['', 'van'],
    'van de': ['', 'van de'],
    'van der': ['', 'van der'],
    'van den': ['', 'van den'],
    'vander': ['', 'vander'],
    'v.d.': ['', 'vander'],
    'vd': ['', 'vander'],
    'van het': ['', 'van het'],
    'ver': ['', 'ver'],
    'ten': ['ten', ''],
    'ter': ['ter', ''],
    'te': ['te', ''],
    'op de': ['op de', ''],
    'in de': ['in de', ''],
    'in \'t': ['in \'t', ''],
    'in het': ['in het', ''],
    'uit de': ['uit de', ''],
    'uit den': ['uit den', ''],
    // germany / austria
    'von': ['von', ''],
    'von der': ['von der', ''],
    'von dem': ['von dem', ''],
    'von zu': ['von zu', ''],
    'v.': ['von', ''],
    'v': ['von', ''],
    'vom': ['vom', ''],
    'das': ['das', ''],
    'zum': ['zum', ''],
    'zur': ['zur', ''],
    'den': ['den', ''],
    'der': ['der', ''],
    'des': ['des', ''],
    'auf den': ['auf den', ''],
    // scotland (?)
    'mac': ['', 'Mac'],
    // not really particles since they are always attached and not used for sorting (?)
    'mc': ['', 'Mc'],
    'o\'': ['', 'O\''],
    // north africa / middle east (?)
    'ben': ['', 'Ben'],
    'bin': ['', 'Bin'],
    'sen': ['sen', '']
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = particleRules;


/***/ }),
/* 79 */,
/* 80 */,
/* 81 */,
/* 82 */,
/* 83 */,
/* 84 */,
/* 85 */,
/* 86 */,
/* 87 */,
/* 88 */,
/* 89 */,
/* 90 */,
/* 91 */,
/* 92 */,
/* 93 */,
/* 94 */,
/* 95 */,
/* 96 */,
/* 97 */,
/* 98 */,
/* 99 */,
/* 100 */,
/* 101 */,
/* 102 */,
/* 103 */,
/* 104 */,
/* 105 */,
/* 106 */,
/* 107 */,
/* 108 */,
/* 109 */,
/* 110 */,
/* 111 */,
/* 112 */,
/* 113 */,
/* 114 */,
/* 115 */,
/* 116 */,
/* 117 */,
/* 118 */,
/* 119 */,
/* 120 */,
/* 121 */,
/* 122 */,
/* 123 */,
/* 124 */,
/* 125 */,
/* 126 */,
/* 127 */,
/* 128 */,
/* 129 */,
/* 130 */,
/* 131 */,
/* 132 */,
/* 133 */,
/* 134 */,
/* 135 */,
/* 136 */,
/* 137 */,
/* 138 */,
/* 139 */,
/* 140 */,
/* 141 */,
/* 142 */,
/* 143 */,
/* 144 */,
/* 145 */,
/* 146 */,
/* 147 */,
/* 148 */,
/* 149 */,
/* 150 */,
/* 151 */,
/* 152 */,
/* 153 */,
/* 154 */,
/* 155 */,
/* 156 */,
/* 157 */,
/* 158 */,
/* 159 */,
/* 160 */,
/* 161 */,
/* 162 */,
/* 163 */,
/* 164 */,
/* 165 */
/***/ (function(module, exports, __webpack_require__) {

var angular = __webpack_require__(2);

__webpack_require__(188);

__webpack_require__(72);

angular.module('App', [
  'ngAnimate'
])
  .constant('DimensionsIds', __webpack_require__(166));

//Require all the files for current Angular App
function requireAll(r) { r.keys().forEach(r); }
requireAll(__webpack_require__(227));

//require the necessary directives
__webpack_require__(63);
__webpack_require__(60);
__webpack_require__(35);
__webpack_require__(33);
__webpack_require__(61);
__webpack_require__(62);

__webpack_require__(34);

__webpack_require__(66);
__webpack_require__(44);
__webpack_require__(65);
__webpack_require__(36);
__webpack_require__(23);
__webpack_require__(37);
__webpack_require__(70);
__webpack_require__(22);
__webpack_require__(39);

//the article requests
__webpack_require__(38);
__webpack_require__(40);
__webpack_require__(24);
__webpack_require__(41);

//config and run
__webpack_require__(58);
__webpack_require__(57);
__webpack_require__(21);

//composition methods
__webpack_require__(43);
__webpack_require__(67);
__webpack_require__(42);

__webpack_require__(64);

__webpack_require__(32);
__webpack_require__(59);

module.exports = angular.module('App');


/***/ }),
/* 166 */
/***/ (function(module, exports, __webpack_require__) {

var $ = __webpack_require__(4);

if ($('article.document_details').length > 0) {
  //On abstract page
  module.exports = __webpack_require__(230);
} else {
  //On results list
  module.exports = __webpack_require__(231);
}


/***/ }),
/* 167 */,
/* 168 */,
/* 169 */,
/* 170 */,
/* 171 */,
/* 172 */,
/* 173 */,
/* 174 */,
/* 175 */,
/* 176 */,
/* 177 */,
/* 178 */,
/* 179 */,
/* 180 */,
/* 181 */,
/* 182 */,
/* 183 */,
/* 184 */,
/* 185 */,
/* 186 */,
/* 187 */,
/* 188 */
/***/ (function(module, exports) {

// removed by extract-text-webpack-plugin

/***/ }),
/* 189 */,
/* 190 */,
/* 191 */,
/* 192 */,
/* 193 */,
/* 194 */,
/* 195 */,
/* 196 */,
/* 197 */,
/* 198 */,
/* 199 */,
/* 200 */,
/* 201 */,
/* 202 */,
/* 203 */,
/* 204 */,
/* 205 */,
/* 206 */,
/* 207 */,
/* 208 */,
/* 209 */,
/* 210 */,
/* 211 */,
/* 212 */,
/* 213 */,
/* 214 */,
/* 215 */,
/* 216 */,
/* 217 */,
/* 218 */,
/* 219 */,
/* 220 */,
/* 221 */,
/* 222 */,
/* 223 */,
/* 224 */,
/* 225 */,
/* 226 */,
/* 227 */
/***/ (function(module, exports, __webpack_require__) {

var map = {
	"./app.js": 165,
	"./controllers/list.js": 228
};
function webpackContext(req) {
	return __webpack_require__(webpackContextResolve(req));
};
function webpackContextResolve(req) {
	var id = map[req];
	if(!(id + 1)) // check for number or string
		throw new Error("Cannot find module '" + req + "'.");
	return id;
};
webpackContext.keys = function webpackContextKeys() {
	return Object.keys(map);
};
webpackContext.resolve = webpackContextResolve;
module.exports = webpackContext;
webpackContext.id = 227;

/***/ }),
/* 228 */
/***/ (function(module, exports, __webpack_require__) {

List.$inject = ["DimensionsIds", "$scope", "TooltipApi", "$controller", "ProxyUpload", "RawUpload", "BrowserTab", "Article", "Message", "ListDropdownApi", "$q", "Storage", "List", "User", "Mixpanel"];
var angular = __webpack_require__(2),
  _ = __webpack_require__(1),
  C = __webpack_require__(0);
  xhr = __webpack_require__(6);
  $ = __webpack_require__(4);

function List(DimensionsIds, $scope, TooltipApi, $controller, ProxyUpload, RawUpload,
              BrowserTab, Article, Message, ListDropdownApi, $q, Storage,
              List, User, Mixpanel) {

  var self = this;

  angular.extend(self, $controller('GeneralList', {
    ProxyUpload: ProxyUpload,
    RawUpload: RawUpload,
    BrowserTab: BrowserTab,
    Article: Article,
    Message: Message,
    ListDropdownApi: ListDropdownApi,
    $q: $q,
    Storage: Storage,
    List: List,
    User: User,
    Mixpanel: Mixpanel,
    SiteType: C.VALUE_BUTTON_AVAILABLE_ON_PUBMED,
    $scope: $scope,
    TooltipApi: TooltipApi
  }));

  self.hideFullTextButtons = hideFullTextButtons;
  self.onDimensionsButtonClick = onDimensionsButtonClick;
  self.injectReadcubeViewerCode = injectReadcubeViewerCode;

  self.initArticles(DimensionsIds);
  self.loadArticles();
  self.initDimensionsData(true);
  self.listenForMessages(DimensionsIds);
  self.listenForTooltip();

  self.hideFullTextButtons();
  self.injectReadcubeViewerCode();

  function hideFullTextButtons() {
    $('[data-bt="fulltext"]').hide();
  }

  function onDimensionsButtonClick(index) {
    var article = self.articlesList[index];

    var please = false;
    if (article.dimensionsDataStatus === 'oa' || article.dimensionsDataStatus === 'subscription') {
      please = true;
    }
    
    if (please){
      myInjectedJs='window.readcube_read && readcube_read("' + article.doi + '", {please: 1});!window.readcube_read && window.open("' + C.URL_ARTICLE_FORCE_STAGING + article.doi + '?please=1", "_blank");';
    } else {
      myInjectedJs='window.readcube_read && readcube_read("' + article.doi + '", {please: 1});!window.readcube_read && window.open("' + C.URL_ARTICLE_FORCE_STAGING + article.doi + '", "_blank");';
    }
    window.location = 'javascript:' + myInjectedJs;
  }

  function injectReadcubeViewerCode() {
    var myInjectedJs = '';
    
    if ($('script[src*="injections.readcube.com/dimensions"]').length === 0) {
      myInjectedJs = 'var script = document.createElement("script"); script.async = true; script.type = "text/javascript"; script.src = "https://injections.readcube.com/dimensions/epdf.js"; document.getElementsByTagName("head").item(0).appendChild(script);';
    }

    window.location = 'javascript:' + myInjectedJs;
  }
}

angular.module('App')
  .controller('List', List);

/***/ }),
/* 229 */
/***/ (function(module, exports, __webpack_require__) {

//Initialize the Dimensoins inserted into search results
var searchResults = __webpack_require__(166);
searchResults.insertAngularDirectives();
__webpack_require__(165);
searchResults.bootstrapAngular();

/***/ }),
/* 230 */
/***/ (function(module, exports, __webpack_require__) {

var $ = __webpack_require__(4),
  C = __webpack_require__(0),
  _ = __webpack_require__(1),
  parserHelper = __webpack_require__(12),
  Base = __webpack_require__(10),
  inherit = __webpack_require__(3);

var Parser = inherit(Base, {

  getButtonHolder: function(articleHolder) {
    return articleHolder.find('.details__doi');
  },

  getArticleHolders: function () {
    return $('.document_details__main_column');
  },

  getMetadata: function(row) {
    var year = _.get(row.find('.details_title__subtitle.details_title__subtitle--secondary').text().match(C.REGEXP_YEAR), '[0]', '');
    return {
      title: row.find('h1').text(),
      authors: parserHelper.getAuthorsArray($('.showmore__list').text()),
      journal: row.find('a.add_facet ').text(),
      abstract: row.find('.abridged_text__layout').text(),
      year: year
    }
  },

  getIdentifiers: function(row) {
    return {
      pmid: null,
      doi: _.get(row.find('.details__doi').text().match(C.REGEXP_DOI), '[0]', null),
      gsid: null
    };
  }
});

module.exports = new Parser();

/***/ }),
/* 231 */
/***/ (function(module, exports, __webpack_require__) {

var $ = __webpack_require__(4),
_ = __webpack_require__(1),
C = __webpack_require__(0),
parserHelper = __webpack_require__(12),
Base = __webpack_require__(10),
inherit = __webpack_require__(3);

var Parser = inherit(Base, {

getButtonHolder: function(articleHolder) {
  return articleHolder.find('.resultList__item__metadata.resultList__item__title__tertiary');
},

getArticleHolders: function () {
  return $('article.resultList__item')
},

getMetadata: function (row) {
  var year = _.get(row.find('.resultList__item__metadata.resultList__item__title__tertiary').text().match(C.REGEXP_YEAR), '[0]', '');
  var jr = '';
  try {
    jr = row.find('.resultList__item__metadata.resultList__item__title__tertiary').text().split(',') ? row.find('.resultList__item__metadata.resultList__item__title__tertiary').text().split(',')[1].trim() : '';
  } catch (er) {
      //
  }
  return {
    title: row.find('.resultList__item__title__primary').text(),
    authors: parserHelper.getAuthorsArray(row.find('.resultList__item__title__secondary > div').text()),
    journal: jr,
    year: year
  };
},

getIdentifiers: function (row) {
  var doiNodeText = row.find('.“readcube-button-hook”').attr('data-doi');
  var doi = _.get(doiNodeText.match(C.REGEXP_DOI), '[0]', null);

  var identifiers = {
    pmid: null,
    gsid: null,
    doi: doi
  };
  return identifiers;
},

isAbstractPage: function () {
  return false;
}

});

module.exports = new Parser();


/***/ })
],[229]);