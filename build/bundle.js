(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
window.App = require("./App");
window.document.addEventListener('DOMContentLoaded',  window.App.init);


},{"./App":11}],2:[function(require,module,exports){
"use strict";
/*globals Handlebars: true */
var base = require("./handlebars/base");

// Each of these augment the Handlebars object. No need to setup here.
// (This is done to easily share code between commonjs and browse envs)
var SafeString = require("./handlebars/safe-string")["default"];
var Exception = require("./handlebars/exception")["default"];
var Utils = require("./handlebars/utils");
var runtime = require("./handlebars/runtime");

// For compatibility and usage outside of module systems, make the Handlebars object a namespace
var create = function() {
  var hb = new base.HandlebarsEnvironment();

  Utils.extend(hb, base);
  hb.SafeString = SafeString;
  hb.Exception = Exception;
  hb.Utils = Utils;
  hb.escapeExpression = Utils.escapeExpression;

  hb.VM = runtime;
  hb.template = function(spec) {
    return runtime.template(spec, hb);
  };

  return hb;
};

var Handlebars = create();
Handlebars.create = create;

Handlebars['default'] = Handlebars;

exports["default"] = Handlebars;
},{"./handlebars/base":3,"./handlebars/exception":4,"./handlebars/runtime":5,"./handlebars/safe-string":6,"./handlebars/utils":7}],3:[function(require,module,exports){
"use strict";
var Utils = require("./utils");
var Exception = require("./exception")["default"];

var VERSION = "2.0.0";
exports.VERSION = VERSION;var COMPILER_REVISION = 6;
exports.COMPILER_REVISION = COMPILER_REVISION;
var REVISION_CHANGES = {
  1: '<= 1.0.rc.2', // 1.0.rc.2 is actually rev2 but doesn't report it
  2: '== 1.0.0-rc.3',
  3: '== 1.0.0-rc.4',
  4: '== 1.x.x',
  5: '== 2.0.0-alpha.x',
  6: '>= 2.0.0-beta.1'
};
exports.REVISION_CHANGES = REVISION_CHANGES;
var isArray = Utils.isArray,
    isFunction = Utils.isFunction,
    toString = Utils.toString,
    objectType = '[object Object]';

function HandlebarsEnvironment(helpers, partials) {
  this.helpers = helpers || {};
  this.partials = partials || {};

  registerDefaultHelpers(this);
}

exports.HandlebarsEnvironment = HandlebarsEnvironment;HandlebarsEnvironment.prototype = {
  constructor: HandlebarsEnvironment,

  logger: logger,
  log: log,

  registerHelper: function(name, fn) {
    if (toString.call(name) === objectType) {
      if (fn) { throw new Exception('Arg not supported with multiple helpers'); }
      Utils.extend(this.helpers, name);
    } else {
      this.helpers[name] = fn;
    }
  },
  unregisterHelper: function(name) {
    delete this.helpers[name];
  },

  registerPartial: function(name, partial) {
    if (toString.call(name) === objectType) {
      Utils.extend(this.partials,  name);
    } else {
      this.partials[name] = partial;
    }
  },
  unregisterPartial: function(name) {
    delete this.partials[name];
  }
};

function registerDefaultHelpers(instance) {
  instance.registerHelper('helperMissing', function(/* [args, ]options */) {
    if(arguments.length === 1) {
      // A missing field in a {{foo}} constuct.
      return undefined;
    } else {
      // Someone is actually trying to call something, blow up.
      throw new Exception("Missing helper: '" + arguments[arguments.length-1].name + "'");
    }
  });

  instance.registerHelper('blockHelperMissing', function(context, options) {
    var inverse = options.inverse,
        fn = options.fn;

    if(context === true) {
      return fn(this);
    } else if(context === false || context == null) {
      return inverse(this);
    } else if (isArray(context)) {
      if(context.length > 0) {
        if (options.ids) {
          options.ids = [options.name];
        }

        return instance.helpers.each(context, options);
      } else {
        return inverse(this);
      }
    } else {
      if (options.data && options.ids) {
        var data = createFrame(options.data);
        data.contextPath = Utils.appendContextPath(options.data.contextPath, options.name);
        options = {data: data};
      }

      return fn(context, options);
    }
  });

  instance.registerHelper('each', function(context, options) {
    if (!options) {
      throw new Exception('Must pass iterator to #each');
    }

    var fn = options.fn, inverse = options.inverse;
    var i = 0, ret = "", data;

    var contextPath;
    if (options.data && options.ids) {
      contextPath = Utils.appendContextPath(options.data.contextPath, options.ids[0]) + '.';
    }

    if (isFunction(context)) { context = context.call(this); }

    if (options.data) {
      data = createFrame(options.data);
    }

    if(context && typeof context === 'object') {
      if (isArray(context)) {
        for(var j = context.length; i<j; i++) {
          if (data) {
            data.index = i;
            data.first = (i === 0);
            data.last  = (i === (context.length-1));

            if (contextPath) {
              data.contextPath = contextPath + i;
            }
          }
          ret = ret + fn(context[i], { data: data });
        }
      } else {
        for(var key in context) {
          if(context.hasOwnProperty(key)) {
            if(data) {
              data.key = key;
              data.index = i;
              data.first = (i === 0);

              if (contextPath) {
                data.contextPath = contextPath + key;
              }
            }
            ret = ret + fn(context[key], {data: data});
            i++;
          }
        }
      }
    }

    if(i === 0){
      ret = inverse(this);
    }

    return ret;
  });

  instance.registerHelper('if', function(conditional, options) {
    if (isFunction(conditional)) { conditional = conditional.call(this); }

    // Default behavior is to render the positive path if the value is truthy and not empty.
    // The `includeZero` option may be set to treat the condtional as purely not empty based on the
    // behavior of isEmpty. Effectively this determines if 0 is handled by the positive path or negative.
    if ((!options.hash.includeZero && !conditional) || Utils.isEmpty(conditional)) {
      return options.inverse(this);
    } else {
      return options.fn(this);
    }
  });

  instance.registerHelper('unless', function(conditional, options) {
    return instance.helpers['if'].call(this, conditional, {fn: options.inverse, inverse: options.fn, hash: options.hash});
  });

  instance.registerHelper('with', function(context, options) {
    if (isFunction(context)) { context = context.call(this); }

    var fn = options.fn;

    if (!Utils.isEmpty(context)) {
      if (options.data && options.ids) {
        var data = createFrame(options.data);
        data.contextPath = Utils.appendContextPath(options.data.contextPath, options.ids[0]);
        options = {data:data};
      }

      return fn(context, options);
    } else {
      return options.inverse(this);
    }
  });

  instance.registerHelper('log', function(message, options) {
    var level = options.data && options.data.level != null ? parseInt(options.data.level, 10) : 1;
    instance.log(level, message);
  });

  instance.registerHelper('lookup', function(obj, field) {
    return obj && obj[field];
  });
}

var logger = {
  methodMap: { 0: 'debug', 1: 'info', 2: 'warn', 3: 'error' },

  // State enum
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  level: 3,

  // can be overridden in the host environment
  log: function(level, message) {
    if (logger.level <= level) {
      var method = logger.methodMap[level];
      if (typeof console !== 'undefined' && console[method]) {
        console[method].call(console, message);
      }
    }
  }
};
exports.logger = logger;
var log = logger.log;
exports.log = log;
var createFrame = function(object) {
  var frame = Utils.extend({}, object);
  frame._parent = object;
  return frame;
};
exports.createFrame = createFrame;
},{"./exception":4,"./utils":7}],4:[function(require,module,exports){
"use strict";

var errorProps = ['description', 'fileName', 'lineNumber', 'message', 'name', 'number', 'stack'];

function Exception(message, node) {
  var line;
  if (node && node.firstLine) {
    line = node.firstLine;

    message += ' - ' + line + ':' + node.firstColumn;
  }

  var tmp = Error.prototype.constructor.call(this, message);

  // Unfortunately errors are not enumerable in Chrome (at least), so `for prop in tmp` doesn't work.
  for (var idx = 0; idx < errorProps.length; idx++) {
    this[errorProps[idx]] = tmp[errorProps[idx]];
  }

  if (line) {
    this.lineNumber = line;
    this.column = node.firstColumn;
  }
}

Exception.prototype = new Error();

exports["default"] = Exception;
},{}],5:[function(require,module,exports){
"use strict";
var Utils = require("./utils");
var Exception = require("./exception")["default"];
var COMPILER_REVISION = require("./base").COMPILER_REVISION;
var REVISION_CHANGES = require("./base").REVISION_CHANGES;
var createFrame = require("./base").createFrame;

function checkRevision(compilerInfo) {
  var compilerRevision = compilerInfo && compilerInfo[0] || 1,
      currentRevision = COMPILER_REVISION;

  if (compilerRevision !== currentRevision) {
    if (compilerRevision < currentRevision) {
      var runtimeVersions = REVISION_CHANGES[currentRevision],
          compilerVersions = REVISION_CHANGES[compilerRevision];
      throw new Exception("Template was precompiled with an older version of Handlebars than the current runtime. "+
            "Please update your precompiler to a newer version ("+runtimeVersions+") or downgrade your runtime to an older version ("+compilerVersions+").");
    } else {
      // Use the embedded version info since the runtime doesn't know about this revision yet
      throw new Exception("Template was precompiled with a newer version of Handlebars than the current runtime. "+
            "Please update your runtime to a newer version ("+compilerInfo[1]+").");
    }
  }
}

exports.checkRevision = checkRevision;// TODO: Remove this line and break up compilePartial

function template(templateSpec, env) {
  /* istanbul ignore next */
  if (!env) {
    throw new Exception("No environment passed to template");
  }
  if (!templateSpec || !templateSpec.main) {
    throw new Exception('Unknown template object: ' + typeof templateSpec);
  }

  // Note: Using env.VM references rather than local var references throughout this section to allow
  // for external users to override these as psuedo-supported APIs.
  env.VM.checkRevision(templateSpec.compiler);

  var invokePartialWrapper = function(partial, indent, name, context, hash, helpers, partials, data, depths) {
    if (hash) {
      context = Utils.extend({}, context, hash);
    }

    var result = env.VM.invokePartial.call(this, partial, name, context, helpers, partials, data, depths);

    if (result == null && env.compile) {
      var options = { helpers: helpers, partials: partials, data: data, depths: depths };
      partials[name] = env.compile(partial, { data: data !== undefined, compat: templateSpec.compat }, env);
      result = partials[name](context, options);
    }
    if (result != null) {
      if (indent) {
        var lines = result.split('\n');
        for (var i = 0, l = lines.length; i < l; i++) {
          if (!lines[i] && i + 1 === l) {
            break;
          }

          lines[i] = indent + lines[i];
        }
        result = lines.join('\n');
      }
      return result;
    } else {
      throw new Exception("The partial " + name + " could not be compiled when running in runtime-only mode");
    }
  };

  // Just add water
  var container = {
    lookup: function(depths, name) {
      var len = depths.length;
      for (var i = 0; i < len; i++) {
        if (depths[i] && depths[i][name] != null) {
          return depths[i][name];
        }
      }
    },
    lambda: function(current, context) {
      return typeof current === 'function' ? current.call(context) : current;
    },

    escapeExpression: Utils.escapeExpression,
    invokePartial: invokePartialWrapper,

    fn: function(i) {
      return templateSpec[i];
    },

    programs: [],
    program: function(i, data, depths) {
      var programWrapper = this.programs[i],
          fn = this.fn(i);
      if (data || depths) {
        programWrapper = program(this, i, fn, data, depths);
      } else if (!programWrapper) {
        programWrapper = this.programs[i] = program(this, i, fn);
      }
      return programWrapper;
    },

    data: function(data, depth) {
      while (data && depth--) {
        data = data._parent;
      }
      return data;
    },
    merge: function(param, common) {
      var ret = param || common;

      if (param && common && (param !== common)) {
        ret = Utils.extend({}, common, param);
      }

      return ret;
    },

    noop: env.VM.noop,
    compilerInfo: templateSpec.compiler
  };

  var ret = function(context, options) {
    options = options || {};
    var data = options.data;

    ret._setup(options);
    if (!options.partial && templateSpec.useData) {
      data = initData(context, data);
    }
    var depths;
    if (templateSpec.useDepths) {
      depths = options.depths ? [context].concat(options.depths) : [context];
    }

    return templateSpec.main.call(container, context, container.helpers, container.partials, data, depths);
  };
  ret.isTop = true;

  ret._setup = function(options) {
    if (!options.partial) {
      container.helpers = container.merge(options.helpers, env.helpers);

      if (templateSpec.usePartial) {
        container.partials = container.merge(options.partials, env.partials);
      }
    } else {
      container.helpers = options.helpers;
      container.partials = options.partials;
    }
  };

  ret._child = function(i, data, depths) {
    if (templateSpec.useDepths && !depths) {
      throw new Exception('must pass parent depths');
    }

    return program(container, i, templateSpec[i], data, depths);
  };
  return ret;
}

exports.template = template;function program(container, i, fn, data, depths) {
  var prog = function(context, options) {
    options = options || {};

    return fn.call(container, context, container.helpers, container.partials, options.data || data, depths && [context].concat(depths));
  };
  prog.program = i;
  prog.depth = depths ? depths.length : 0;
  return prog;
}

exports.program = program;function invokePartial(partial, name, context, helpers, partials, data, depths) {
  var options = { partial: true, helpers: helpers, partials: partials, data: data, depths: depths };

  if(partial === undefined) {
    throw new Exception("The partial " + name + " could not be found");
  } else if(partial instanceof Function) {
    return partial(context, options);
  }
}

exports.invokePartial = invokePartial;function noop() { return ""; }

exports.noop = noop;function initData(context, data) {
  if (!data || !('root' in data)) {
    data = data ? createFrame(data) : {};
    data.root = context;
  }
  return data;
}
},{"./base":3,"./exception":4,"./utils":7}],6:[function(require,module,exports){
"use strict";
// Build out our basic SafeString type
function SafeString(string) {
  this.string = string;
}

SafeString.prototype.toString = function() {
  return "" + this.string;
};

exports["default"] = SafeString;
},{}],7:[function(require,module,exports){
"use strict";
/*jshint -W004 */
var SafeString = require("./safe-string")["default"];

var escape = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "`": "&#x60;"
};

var badChars = /[&<>"'`]/g;
var possible = /[&<>"'`]/;

function escapeChar(chr) {
  return escape[chr];
}

function extend(obj /* , ...source */) {
  for (var i = 1; i < arguments.length; i++) {
    for (var key in arguments[i]) {
      if (Object.prototype.hasOwnProperty.call(arguments[i], key)) {
        obj[key] = arguments[i][key];
      }
    }
  }

  return obj;
}

exports.extend = extend;var toString = Object.prototype.toString;
exports.toString = toString;
// Sourced from lodash
// https://github.com/bestiejs/lodash/blob/master/LICENSE.txt
var isFunction = function(value) {
  return typeof value === 'function';
};
// fallback for older versions of Chrome and Safari
/* istanbul ignore next */
if (isFunction(/x/)) {
  isFunction = function(value) {
    return typeof value === 'function' && toString.call(value) === '[object Function]';
  };
}
var isFunction;
exports.isFunction = isFunction;
/* istanbul ignore next */
var isArray = Array.isArray || function(value) {
  return (value && typeof value === 'object') ? toString.call(value) === '[object Array]' : false;
};
exports.isArray = isArray;

function escapeExpression(string) {
  // don't escape SafeStrings, since they're already safe
  if (string instanceof SafeString) {
    return string.toString();
  } else if (string == null) {
    return "";
  } else if (!string) {
    return string + '';
  }

  // Force a string conversion as this will be done by the append regardless and
  // the regex test will do this transparently behind the scenes, causing issues if
  // an object's to string has escaped characters in it.
  string = "" + string;

  if(!possible.test(string)) { return string; }
  return string.replace(badChars, escapeChar);
}

exports.escapeExpression = escapeExpression;function isEmpty(value) {
  if (!value && value !== 0) {
    return true;
  } else if (isArray(value) && value.length === 0) {
    return true;
  } else {
    return false;
  }
}

exports.isEmpty = isEmpty;function appendContextPath(contextPath, id) {
  return (contextPath ? contextPath + '.' : '') + id;
}

exports.appendContextPath = appendContextPath;
},{"./safe-string":6}],8:[function(require,module,exports){
// Create a simple path alias to allow browserify to resolve
// the runtime on a supported path.
module.exports = require('./dist/cjs/handlebars.runtime');

},{"./dist/cjs/handlebars.runtime":2}],9:[function(require,module,exports){
module.exports = require("handlebars/runtime")["default"];

},{"handlebars/runtime":8}],10:[function(require,module,exports){
/*!
 * jQuery JavaScript Library v2.1.3
 * http://jquery.com/
 *
 * Includes Sizzle.js
 * http://sizzlejs.com/
 *
 * Copyright 2005, 2014 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2014-12-18T15:11Z
 */

(function( global, factory ) {

	if ( typeof module === "object" && typeof module.exports === "object" ) {
		// For CommonJS and CommonJS-like environments where a proper `window`
		// is present, execute the factory and get jQuery.
		// For environments that do not have a `window` with a `document`
		// (such as Node.js), expose a factory as module.exports.
		// This accentuates the need for the creation of a real `window`.
		// e.g. var jQuery = require("jquery")(window);
		// See ticket #14549 for more info.
		module.exports = global.document ?
			factory( global, true ) :
			function( w ) {
				if ( !w.document ) {
					throw new Error( "jQuery requires a window with a document" );
				}
				return factory( w );
			};
	} else {
		factory( global );
	}

// Pass this if window is not defined yet
}(typeof window !== "undefined" ? window : this, function( window, noGlobal ) {

// Support: Firefox 18+
// Can't be in strict mode, several libs including ASP.NET trace
// the stack via arguments.caller.callee and Firefox dies if
// you try to trace through "use strict" call chains. (#13335)
//

var arr = [];

var slice = arr.slice;

var concat = arr.concat;

var push = arr.push;

var indexOf = arr.indexOf;

var class2type = {};

var toString = class2type.toString;

var hasOwn = class2type.hasOwnProperty;

var support = {};



var
	// Use the correct document accordingly with window argument (sandbox)
	document = window.document,

	version = "2.1.3",

	// Define a local copy of jQuery
	jQuery = function( selector, context ) {
		// The jQuery object is actually just the init constructor 'enhanced'
		// Need init if jQuery is called (just allow error to be thrown if not included)
		return new jQuery.fn.init( selector, context );
	},

	// Support: Android<4.1
	// Make sure we trim BOM and NBSP
	rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,

	// Matches dashed string for camelizing
	rmsPrefix = /^-ms-/,
	rdashAlpha = /-([\da-z])/gi,

	// Used by jQuery.camelCase as callback to replace()
	fcamelCase = function( all, letter ) {
		return letter.toUpperCase();
	};

jQuery.fn = jQuery.prototype = {
	// The current version of jQuery being used
	jquery: version,

	constructor: jQuery,

	// Start with an empty selector
	selector: "",

	// The default length of a jQuery object is 0
	length: 0,

	toArray: function() {
		return slice.call( this );
	},

	// Get the Nth element in the matched element set OR
	// Get the whole matched element set as a clean array
	get: function( num ) {
		return num != null ?

			// Return just the one element from the set
			( num < 0 ? this[ num + this.length ] : this[ num ] ) :

			// Return all the elements in a clean array
			slice.call( this );
	},

	// Take an array of elements and push it onto the stack
	// (returning the new matched element set)
	pushStack: function( elems ) {

		// Build a new jQuery matched element set
		var ret = jQuery.merge( this.constructor(), elems );

		// Add the old object onto the stack (as a reference)
		ret.prevObject = this;
		ret.context = this.context;

		// Return the newly-formed element set
		return ret;
	},

	// Execute a callback for every element in the matched set.
	// (You can seed the arguments with an array of args, but this is
	// only used internally.)
	each: function( callback, args ) {
		return jQuery.each( this, callback, args );
	},

	map: function( callback ) {
		return this.pushStack( jQuery.map(this, function( elem, i ) {
			return callback.call( elem, i, elem );
		}));
	},

	slice: function() {
		return this.pushStack( slice.apply( this, arguments ) );
	},

	first: function() {
		return this.eq( 0 );
	},

	last: function() {
		return this.eq( -1 );
	},

	eq: function( i ) {
		var len = this.length,
			j = +i + ( i < 0 ? len : 0 );
		return this.pushStack( j >= 0 && j < len ? [ this[j] ] : [] );
	},

	end: function() {
		return this.prevObject || this.constructor(null);
	},

	// For internal use only.
	// Behaves like an Array's method, not like a jQuery method.
	push: push,
	sort: arr.sort,
	splice: arr.splice
};

jQuery.extend = jQuery.fn.extend = function() {
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[0] || {},
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;

		// Skip the boolean and the target
		target = arguments[ i ] || {};
		i++;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && !jQuery.isFunction(target) ) {
		target = {};
	}

	// Extend jQuery itself if only one argument is passed
	if ( i === length ) {
		target = this;
		i--;
	}

	for ( ; i < length; i++ ) {
		// Only deal with non-null/undefined values
		if ( (options = arguments[ i ]) != null ) {
			// Extend the base object
			for ( name in options ) {
				src = target[ name ];
				copy = options[ name ];

				// Prevent never-ending loop
				if ( target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)) ) ) {
					if ( copyIsArray ) {
						copyIsArray = false;
						clone = src && jQuery.isArray(src) ? src : [];

					} else {
						clone = src && jQuery.isPlainObject(src) ? src : {};
					}

					// Never move original objects, clone them
					target[ name ] = jQuery.extend( deep, clone, copy );

				// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

jQuery.extend({
	// Unique for each copy of jQuery on the page
	expando: "jQuery" + ( version + Math.random() ).replace( /\D/g, "" ),

	// Assume jQuery is ready without the ready module
	isReady: true,

	error: function( msg ) {
		throw new Error( msg );
	},

	noop: function() {},

	isFunction: function( obj ) {
		return jQuery.type(obj) === "function";
	},

	isArray: Array.isArray,

	isWindow: function( obj ) {
		return obj != null && obj === obj.window;
	},

	isNumeric: function( obj ) {
		// parseFloat NaNs numeric-cast false positives (null|true|false|"")
		// ...but misinterprets leading-number strings, particularly hex literals ("0x...")
		// subtraction forces infinities to NaN
		// adding 1 corrects loss of precision from parseFloat (#15100)
		return !jQuery.isArray( obj ) && (obj - parseFloat( obj ) + 1) >= 0;
	},

	isPlainObject: function( obj ) {
		// Not plain objects:
		// - Any object or value whose internal [[Class]] property is not "[object Object]"
		// - DOM nodes
		// - window
		if ( jQuery.type( obj ) !== "object" || obj.nodeType || jQuery.isWindow( obj ) ) {
			return false;
		}

		if ( obj.constructor &&
				!hasOwn.call( obj.constructor.prototype, "isPrototypeOf" ) ) {
			return false;
		}

		// If the function hasn't returned already, we're confident that
		// |obj| is a plain object, created by {} or constructed with new Object
		return true;
	},

	isEmptyObject: function( obj ) {
		var name;
		for ( name in obj ) {
			return false;
		}
		return true;
	},

	type: function( obj ) {
		if ( obj == null ) {
			return obj + "";
		}
		// Support: Android<4.0, iOS<6 (functionish RegExp)
		return typeof obj === "object" || typeof obj === "function" ?
			class2type[ toString.call(obj) ] || "object" :
			typeof obj;
	},

	// Evaluates a script in a global context
	globalEval: function( code ) {
		var script,
			indirect = eval;

		code = jQuery.trim( code );

		if ( code ) {
			// If the code includes a valid, prologue position
			// strict mode pragma, execute code by injecting a
			// script tag into the document.
			if ( code.indexOf("use strict") === 1 ) {
				script = document.createElement("script");
				script.text = code;
				document.head.appendChild( script ).parentNode.removeChild( script );
			} else {
			// Otherwise, avoid the DOM node creation, insertion
			// and removal by using an indirect global eval
				indirect( code );
			}
		}
	},

	// Convert dashed to camelCase; used by the css and data modules
	// Support: IE9-11+
	// Microsoft forgot to hump their vendor prefix (#9572)
	camelCase: function( string ) {
		return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
	},

	nodeName: function( elem, name ) {
		return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();
	},

	// args is for internal usage only
	each: function( obj, callback, args ) {
		var value,
			i = 0,
			length = obj.length,
			isArray = isArraylike( obj );

		if ( args ) {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			}

		// A special, fast, case for the most common use of each
		} else {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			}
		}

		return obj;
	},

	// Support: Android<4.1
	trim: function( text ) {
		return text == null ?
			"" :
			( text + "" ).replace( rtrim, "" );
	},

	// results is for internal usage only
	makeArray: function( arr, results ) {
		var ret = results || [];

		if ( arr != null ) {
			if ( isArraylike( Object(arr) ) ) {
				jQuery.merge( ret,
					typeof arr === "string" ?
					[ arr ] : arr
				);
			} else {
				push.call( ret, arr );
			}
		}

		return ret;
	},

	inArray: function( elem, arr, i ) {
		return arr == null ? -1 : indexOf.call( arr, elem, i );
	},

	merge: function( first, second ) {
		var len = +second.length,
			j = 0,
			i = first.length;

		for ( ; j < len; j++ ) {
			first[ i++ ] = second[ j ];
		}

		first.length = i;

		return first;
	},

	grep: function( elems, callback, invert ) {
		var callbackInverse,
			matches = [],
			i = 0,
			length = elems.length,
			callbackExpect = !invert;

		// Go through the array, only saving the items
		// that pass the validator function
		for ( ; i < length; i++ ) {
			callbackInverse = !callback( elems[ i ], i );
			if ( callbackInverse !== callbackExpect ) {
				matches.push( elems[ i ] );
			}
		}

		return matches;
	},

	// arg is for internal usage only
	map: function( elems, callback, arg ) {
		var value,
			i = 0,
			length = elems.length,
			isArray = isArraylike( elems ),
			ret = [];

		// Go through the array, translating each of the items to their new values
		if ( isArray ) {
			for ( ; i < length; i++ ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}

		// Go through every key on the object,
		} else {
			for ( i in elems ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}
		}

		// Flatten any nested arrays
		return concat.apply( [], ret );
	},

	// A global GUID counter for objects
	guid: 1,

	// Bind a function to a context, optionally partially applying any
	// arguments.
	proxy: function( fn, context ) {
		var tmp, args, proxy;

		if ( typeof context === "string" ) {
			tmp = fn[ context ];
			context = fn;
			fn = tmp;
		}

		// Quick check to determine if target is callable, in the spec
		// this throws a TypeError, but we will just return undefined.
		if ( !jQuery.isFunction( fn ) ) {
			return undefined;
		}

		// Simulated bind
		args = slice.call( arguments, 2 );
		proxy = function() {
			return fn.apply( context || this, args.concat( slice.call( arguments ) ) );
		};

		// Set the guid of unique handler to the same of original handler, so it can be removed
		proxy.guid = fn.guid = fn.guid || jQuery.guid++;

		return proxy;
	},

	now: Date.now,

	// jQuery.support is not used in Core but other projects attach their
	// properties to it so it needs to exist.
	support: support
});

// Populate the class2type map
jQuery.each("Boolean Number String Function Array Date RegExp Object Error".split(" "), function(i, name) {
	class2type[ "[object " + name + "]" ] = name.toLowerCase();
});

function isArraylike( obj ) {
	var length = obj.length,
		type = jQuery.type( obj );

	if ( type === "function" || jQuery.isWindow( obj ) ) {
		return false;
	}

	if ( obj.nodeType === 1 && length ) {
		return true;
	}

	return type === "array" || length === 0 ||
		typeof length === "number" && length > 0 && ( length - 1 ) in obj;
}
var Sizzle =
/*!
 * Sizzle CSS Selector Engine v2.2.0-pre
 * http://sizzlejs.com/
 *
 * Copyright 2008, 2014 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2014-12-16
 */
(function( window ) {

var i,
	support,
	Expr,
	getText,
	isXML,
	tokenize,
	compile,
	select,
	outermostContext,
	sortInput,
	hasDuplicate,

	// Local document vars
	setDocument,
	document,
	docElem,
	documentIsHTML,
	rbuggyQSA,
	rbuggyMatches,
	matches,
	contains,

	// Instance-specific data
	expando = "sizzle" + 1 * new Date(),
	preferredDoc = window.document,
	dirruns = 0,
	done = 0,
	classCache = createCache(),
	tokenCache = createCache(),
	compilerCache = createCache(),
	sortOrder = function( a, b ) {
		if ( a === b ) {
			hasDuplicate = true;
		}
		return 0;
	},

	// General-purpose constants
	MAX_NEGATIVE = 1 << 31,

	// Instance methods
	hasOwn = ({}).hasOwnProperty,
	arr = [],
	pop = arr.pop,
	push_native = arr.push,
	push = arr.push,
	slice = arr.slice,
	// Use a stripped-down indexOf as it's faster than native
	// http://jsperf.com/thor-indexof-vs-for/5
	indexOf = function( list, elem ) {
		var i = 0,
			len = list.length;
		for ( ; i < len; i++ ) {
			if ( list[i] === elem ) {
				return i;
			}
		}
		return -1;
	},

	booleans = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",

	// Regular expressions

	// Whitespace characters http://www.w3.org/TR/css3-selectors/#whitespace
	whitespace = "[\\x20\\t\\r\\n\\f]",
	// http://www.w3.org/TR/css3-syntax/#characters
	characterEncoding = "(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",

	// Loosely modeled on CSS identifier characters
	// An unquoted value should be a CSS identifier http://www.w3.org/TR/css3-selectors/#attribute-selectors
	// Proper syntax: http://www.w3.org/TR/CSS21/syndata.html#value-def-identifier
	identifier = characterEncoding.replace( "w", "w#" ),

	// Attribute selectors: http://www.w3.org/TR/selectors/#attribute-selectors
	attributes = "\\[" + whitespace + "*(" + characterEncoding + ")(?:" + whitespace +
		// Operator (capture 2)
		"*([*^$|!~]?=)" + whitespace +
		// "Attribute values must be CSS identifiers [capture 5] or strings [capture 3 or capture 4]"
		"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" + identifier + "))|)" + whitespace +
		"*\\]",

	pseudos = ":(" + characterEncoding + ")(?:\\((" +
		// To reduce the number of selectors needing tokenize in the preFilter, prefer arguments:
		// 1. quoted (capture 3; capture 4 or capture 5)
		"('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|" +
		// 2. simple (capture 6)
		"((?:\\\\.|[^\\\\()[\\]]|" + attributes + ")*)|" +
		// 3. anything else (capture 2)
		".*" +
		")\\)|)",

	// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
	rwhitespace = new RegExp( whitespace + "+", "g" ),
	rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g" ),

	rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
	rcombinators = new RegExp( "^" + whitespace + "*([>+~]|" + whitespace + ")" + whitespace + "*" ),

	rattributeQuotes = new RegExp( "=" + whitespace + "*([^\\]'\"]*?)" + whitespace + "*\\]", "g" ),

	rpseudo = new RegExp( pseudos ),
	ridentifier = new RegExp( "^" + identifier + "$" ),

	matchExpr = {
		"ID": new RegExp( "^#(" + characterEncoding + ")" ),
		"CLASS": new RegExp( "^\\.(" + characterEncoding + ")" ),
		"TAG": new RegExp( "^(" + characterEncoding.replace( "w", "w*" ) + ")" ),
		"ATTR": new RegExp( "^" + attributes ),
		"PSEUDO": new RegExp( "^" + pseudos ),
		"CHILD": new RegExp( "^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + whitespace +
			"*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace +
			"*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
		"bool": new RegExp( "^(?:" + booleans + ")$", "i" ),
		// For use in libraries implementing .is()
		// We use this for POS matching in `select`
		"needsContext": new RegExp( "^" + whitespace + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" +
			whitespace + "*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
	},

	rinputs = /^(?:input|select|textarea|button)$/i,
	rheader = /^h\d$/i,

	rnative = /^[^{]+\{\s*\[native \w/,

	// Easily-parseable/retrievable ID or TAG or CLASS selectors
	rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

	rsibling = /[+~]/,
	rescape = /'|\\/g,

	// CSS escapes http://www.w3.org/TR/CSS21/syndata.html#escaped-characters
	runescape = new RegExp( "\\\\([\\da-f]{1,6}" + whitespace + "?|(" + whitespace + ")|.)", "ig" ),
	funescape = function( _, escaped, escapedWhitespace ) {
		var high = "0x" + escaped - 0x10000;
		// NaN means non-codepoint
		// Support: Firefox<24
		// Workaround erroneous numeric interpretation of +"0x"
		return high !== high || escapedWhitespace ?
			escaped :
			high < 0 ?
				// BMP codepoint
				String.fromCharCode( high + 0x10000 ) :
				// Supplemental Plane codepoint (surrogate pair)
				String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
	},

	// Used for iframes
	// See setDocument()
	// Removing the function wrapper causes a "Permission Denied"
	// error in IE
	unloadHandler = function() {
		setDocument();
	};

// Optimize for push.apply( _, NodeList )
try {
	push.apply(
		(arr = slice.call( preferredDoc.childNodes )),
		preferredDoc.childNodes
	);
	// Support: Android<4.0
	// Detect silently failing push.apply
	arr[ preferredDoc.childNodes.length ].nodeType;
} catch ( e ) {
	push = { apply: arr.length ?

		// Leverage slice if possible
		function( target, els ) {
			push_native.apply( target, slice.call(els) );
		} :

		// Support: IE<9
		// Otherwise append directly
		function( target, els ) {
			var j = target.length,
				i = 0;
			// Can't trust NodeList.length
			while ( (target[j++] = els[i++]) ) {}
			target.length = j - 1;
		}
	};
}

function Sizzle( selector, context, results, seed ) {
	var match, elem, m, nodeType,
		// QSA vars
		i, groups, old, nid, newContext, newSelector;

	if ( ( context ? context.ownerDocument || context : preferredDoc ) !== document ) {
		setDocument( context );
	}

	context = context || document;
	results = results || [];
	nodeType = context.nodeType;

	if ( typeof selector !== "string" || !selector ||
		nodeType !== 1 && nodeType !== 9 && nodeType !== 11 ) {

		return results;
	}

	if ( !seed && documentIsHTML ) {

		// Try to shortcut find operations when possible (e.g., not under DocumentFragment)
		if ( nodeType !== 11 && (match = rquickExpr.exec( selector )) ) {
			// Speed-up: Sizzle("#ID")
			if ( (m = match[1]) ) {
				if ( nodeType === 9 ) {
					elem = context.getElementById( m );
					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document (jQuery #6963)
					if ( elem && elem.parentNode ) {
						// Handle the case where IE, Opera, and Webkit return items
						// by name instead of ID
						if ( elem.id === m ) {
							results.push( elem );
							return results;
						}
					} else {
						return results;
					}
				} else {
					// Context is not a document
					if ( context.ownerDocument && (elem = context.ownerDocument.getElementById( m )) &&
						contains( context, elem ) && elem.id === m ) {
						results.push( elem );
						return results;
					}
				}

			// Speed-up: Sizzle("TAG")
			} else if ( match[2] ) {
				push.apply( results, context.getElementsByTagName( selector ) );
				return results;

			// Speed-up: Sizzle(".CLASS")
			} else if ( (m = match[3]) && support.getElementsByClassName ) {
				push.apply( results, context.getElementsByClassName( m ) );
				return results;
			}
		}

		// QSA path
		if ( support.qsa && (!rbuggyQSA || !rbuggyQSA.test( selector )) ) {
			nid = old = expando;
			newContext = context;
			newSelector = nodeType !== 1 && selector;

			// qSA works strangely on Element-rooted queries
			// We can work around this by specifying an extra ID on the root
			// and working up from there (Thanks to Andrew Dupont for the technique)
			// IE 8 doesn't work on object elements
			if ( nodeType === 1 && context.nodeName.toLowerCase() !== "object" ) {
				groups = tokenize( selector );

				if ( (old = context.getAttribute("id")) ) {
					nid = old.replace( rescape, "\\$&" );
				} else {
					context.setAttribute( "id", nid );
				}
				nid = "[id='" + nid + "'] ";

				i = groups.length;
				while ( i-- ) {
					groups[i] = nid + toSelector( groups[i] );
				}
				newContext = rsibling.test( selector ) && testContext( context.parentNode ) || context;
				newSelector = groups.join(",");
			}

			if ( newSelector ) {
				try {
					push.apply( results,
						newContext.querySelectorAll( newSelector )
					);
					return results;
				} catch(qsaError) {
				} finally {
					if ( !old ) {
						context.removeAttribute("id");
					}
				}
			}
		}
	}

	// All others
	return select( selector.replace( rtrim, "$1" ), context, results, seed );
}

/**
 * Create key-value caches of limited size
 * @returns {Function(string, Object)} Returns the Object data after storing it on itself with
 *	property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
 *	deleting the oldest entry
 */
function createCache() {
	var keys = [];

	function cache( key, value ) {
		// Use (key + " ") to avoid collision with native prototype properties (see Issue #157)
		if ( keys.push( key + " " ) > Expr.cacheLength ) {
			// Only keep the most recent entries
			delete cache[ keys.shift() ];
		}
		return (cache[ key + " " ] = value);
	}
	return cache;
}

/**
 * Mark a function for special use by Sizzle
 * @param {Function} fn The function to mark
 */
function markFunction( fn ) {
	fn[ expando ] = true;
	return fn;
}

/**
 * Support testing using an element
 * @param {Function} fn Passed the created div and expects a boolean result
 */
function assert( fn ) {
	var div = document.createElement("div");

	try {
		return !!fn( div );
	} catch (e) {
		return false;
	} finally {
		// Remove from its parent by default
		if ( div.parentNode ) {
			div.parentNode.removeChild( div );
		}
		// release memory in IE
		div = null;
	}
}

/**
 * Adds the same handler for all of the specified attrs
 * @param {String} attrs Pipe-separated list of attributes
 * @param {Function} handler The method that will be applied
 */
function addHandle( attrs, handler ) {
	var arr = attrs.split("|"),
		i = attrs.length;

	while ( i-- ) {
		Expr.attrHandle[ arr[i] ] = handler;
	}
}

/**
 * Checks document order of two siblings
 * @param {Element} a
 * @param {Element} b
 * @returns {Number} Returns less than 0 if a precedes b, greater than 0 if a follows b
 */
function siblingCheck( a, b ) {
	var cur = b && a,
		diff = cur && a.nodeType === 1 && b.nodeType === 1 &&
			( ~b.sourceIndex || MAX_NEGATIVE ) -
			( ~a.sourceIndex || MAX_NEGATIVE );

	// Use IE sourceIndex if available on both nodes
	if ( diff ) {
		return diff;
	}

	// Check if b follows a
	if ( cur ) {
		while ( (cur = cur.nextSibling) ) {
			if ( cur === b ) {
				return -1;
			}
		}
	}

	return a ? 1 : -1;
}

/**
 * Returns a function to use in pseudos for input types
 * @param {String} type
 */
function createInputPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return name === "input" && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for buttons
 * @param {String} type
 */
function createButtonPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return (name === "input" || name === "button") && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for positionals
 * @param {Function} fn
 */
function createPositionalPseudo( fn ) {
	return markFunction(function( argument ) {
		argument = +argument;
		return markFunction(function( seed, matches ) {
			var j,
				matchIndexes = fn( [], seed.length, argument ),
				i = matchIndexes.length;

			// Match elements found at the specified indexes
			while ( i-- ) {
				if ( seed[ (j = matchIndexes[i]) ] ) {
					seed[j] = !(matches[j] = seed[j]);
				}
			}
		});
	});
}

/**
 * Checks a node for validity as a Sizzle context
 * @param {Element|Object=} context
 * @returns {Element|Object|Boolean} The input node if acceptable, otherwise a falsy value
 */
function testContext( context ) {
	return context && typeof context.getElementsByTagName !== "undefined" && context;
}

// Expose support vars for convenience
support = Sizzle.support = {};

/**
 * Detects XML nodes
 * @param {Element|Object} elem An element or a document
 * @returns {Boolean} True iff elem is a non-HTML XML node
 */
isXML = Sizzle.isXML = function( elem ) {
	// documentElement is verified for cases where it doesn't yet exist
	// (such as loading iframes in IE - #4833)
	var documentElement = elem && (elem.ownerDocument || elem).documentElement;
	return documentElement ? documentElement.nodeName !== "HTML" : false;
};

/**
 * Sets document-related variables once based on the current document
 * @param {Element|Object} [doc] An element or document object to use to set the document
 * @returns {Object} Returns the current document
 */
setDocument = Sizzle.setDocument = function( node ) {
	var hasCompare, parent,
		doc = node ? node.ownerDocument || node : preferredDoc;

	// If no document and documentElement is available, return
	if ( doc === document || doc.nodeType !== 9 || !doc.documentElement ) {
		return document;
	}

	// Set our document
	document = doc;
	docElem = doc.documentElement;
	parent = doc.defaultView;

	// Support: IE>8
	// If iframe document is assigned to "document" variable and if iframe has been reloaded,
	// IE will throw "permission denied" error when accessing "document" variable, see jQuery #13936
	// IE6-8 do not support the defaultView property so parent will be undefined
	if ( parent && parent !== parent.top ) {
		// IE11 does not have attachEvent, so all must suffer
		if ( parent.addEventListener ) {
			parent.addEventListener( "unload", unloadHandler, false );
		} else if ( parent.attachEvent ) {
			parent.attachEvent( "onunload", unloadHandler );
		}
	}

	/* Support tests
	---------------------------------------------------------------------- */
	documentIsHTML = !isXML( doc );

	/* Attributes
	---------------------------------------------------------------------- */

	// Support: IE<8
	// Verify that getAttribute really returns attributes and not properties
	// (excepting IE8 booleans)
	support.attributes = assert(function( div ) {
		div.className = "i";
		return !div.getAttribute("className");
	});

	/* getElement(s)By*
	---------------------------------------------------------------------- */

	// Check if getElementsByTagName("*") returns only elements
	support.getElementsByTagName = assert(function( div ) {
		div.appendChild( doc.createComment("") );
		return !div.getElementsByTagName("*").length;
	});

	// Support: IE<9
	support.getElementsByClassName = rnative.test( doc.getElementsByClassName );

	// Support: IE<10
	// Check if getElementById returns elements by name
	// The broken getElementById methods don't pick up programatically-set names,
	// so use a roundabout getElementsByName test
	support.getById = assert(function( div ) {
		docElem.appendChild( div ).id = expando;
		return !doc.getElementsByName || !doc.getElementsByName( expando ).length;
	});

	// ID find and filter
	if ( support.getById ) {
		Expr.find["ID"] = function( id, context ) {
			if ( typeof context.getElementById !== "undefined" && documentIsHTML ) {
				var m = context.getElementById( id );
				// Check parentNode to catch when Blackberry 4.6 returns
				// nodes that are no longer in the document #6963
				return m && m.parentNode ? [ m ] : [];
			}
		};
		Expr.filter["ID"] = function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				return elem.getAttribute("id") === attrId;
			};
		};
	} else {
		// Support: IE6/7
		// getElementById is not reliable as a find shortcut
		delete Expr.find["ID"];

		Expr.filter["ID"] =  function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				var node = typeof elem.getAttributeNode !== "undefined" && elem.getAttributeNode("id");
				return node && node.value === attrId;
			};
		};
	}

	// Tag
	Expr.find["TAG"] = support.getElementsByTagName ?
		function( tag, context ) {
			if ( typeof context.getElementsByTagName !== "undefined" ) {
				return context.getElementsByTagName( tag );

			// DocumentFragment nodes don't have gEBTN
			} else if ( support.qsa ) {
				return context.querySelectorAll( tag );
			}
		} :

		function( tag, context ) {
			var elem,
				tmp = [],
				i = 0,
				// By happy coincidence, a (broken) gEBTN appears on DocumentFragment nodes too
				results = context.getElementsByTagName( tag );

			// Filter out possible comments
			if ( tag === "*" ) {
				while ( (elem = results[i++]) ) {
					if ( elem.nodeType === 1 ) {
						tmp.push( elem );
					}
				}

				return tmp;
			}
			return results;
		};

	// Class
	Expr.find["CLASS"] = support.getElementsByClassName && function( className, context ) {
		if ( documentIsHTML ) {
			return context.getElementsByClassName( className );
		}
	};

	/* QSA/matchesSelector
	---------------------------------------------------------------------- */

	// QSA and matchesSelector support

	// matchesSelector(:active) reports false when true (IE9/Opera 11.5)
	rbuggyMatches = [];

	// qSa(:focus) reports false when true (Chrome 21)
	// We allow this because of a bug in IE8/9 that throws an error
	// whenever `document.activeElement` is accessed on an iframe
	// So, we allow :focus to pass through QSA all the time to avoid the IE error
	// See http://bugs.jquery.com/ticket/13378
	rbuggyQSA = [];

	if ( (support.qsa = rnative.test( doc.querySelectorAll )) ) {
		// Build QSA regex
		// Regex strategy adopted from Diego Perini
		assert(function( div ) {
			// Select is set to empty string on purpose
			// This is to test IE's treatment of not explicitly
			// setting a boolean content attribute,
			// since its presence should be enough
			// http://bugs.jquery.com/ticket/12359
			docElem.appendChild( div ).innerHTML = "<a id='" + expando + "'></a>" +
				"<select id='" + expando + "-\f]' msallowcapture=''>" +
				"<option selected=''></option></select>";

			// Support: IE8, Opera 11-12.16
			// Nothing should be selected when empty strings follow ^= or $= or *=
			// The test attribute must be unknown in Opera but "safe" for WinRT
			// http://msdn.microsoft.com/en-us/library/ie/hh465388.aspx#attribute_section
			if ( div.querySelectorAll("[msallowcapture^='']").length ) {
				rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:''|\"\")" );
			}

			// Support: IE8
			// Boolean attributes and "value" are not treated correctly
			if ( !div.querySelectorAll("[selected]").length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*(?:value|" + booleans + ")" );
			}

			// Support: Chrome<29, Android<4.2+, Safari<7.0+, iOS<7.0+, PhantomJS<1.9.7+
			if ( !div.querySelectorAll( "[id~=" + expando + "-]" ).length ) {
				rbuggyQSA.push("~=");
			}

			// Webkit/Opera - :checked should return selected option elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":checked").length ) {
				rbuggyQSA.push(":checked");
			}

			// Support: Safari 8+, iOS 8+
			// https://bugs.webkit.org/show_bug.cgi?id=136851
			// In-page `selector#id sibing-combinator selector` fails
			if ( !div.querySelectorAll( "a#" + expando + "+*" ).length ) {
				rbuggyQSA.push(".#.+[+~]");
			}
		});

		assert(function( div ) {
			// Support: Windows 8 Native Apps
			// The type and name attributes are restricted during .innerHTML assignment
			var input = doc.createElement("input");
			input.setAttribute( "type", "hidden" );
			div.appendChild( input ).setAttribute( "name", "D" );

			// Support: IE8
			// Enforce case-sensitivity of name attribute
			if ( div.querySelectorAll("[name=d]").length ) {
				rbuggyQSA.push( "name" + whitespace + "*[*^$|!~]?=" );
			}

			// FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":enabled").length ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Opera 10-11 does not throw on post-comma invalid pseudos
			div.querySelectorAll("*,:x");
			rbuggyQSA.push(",.*:");
		});
	}

	if ( (support.matchesSelector = rnative.test( (matches = docElem.matches ||
		docElem.webkitMatchesSelector ||
		docElem.mozMatchesSelector ||
		docElem.oMatchesSelector ||
		docElem.msMatchesSelector) )) ) {

		assert(function( div ) {
			// Check to see if it's possible to do matchesSelector
			// on a disconnected node (IE 9)
			support.disconnectedMatch = matches.call( div, "div" );

			// This should fail with an exception
			// Gecko does not error, returns false instead
			matches.call( div, "[s!='']:x" );
			rbuggyMatches.push( "!=", pseudos );
		});
	}

	rbuggyQSA = rbuggyQSA.length && new RegExp( rbuggyQSA.join("|") );
	rbuggyMatches = rbuggyMatches.length && new RegExp( rbuggyMatches.join("|") );

	/* Contains
	---------------------------------------------------------------------- */
	hasCompare = rnative.test( docElem.compareDocumentPosition );

	// Element contains another
	// Purposefully does not implement inclusive descendent
	// As in, an element does not contain itself
	contains = hasCompare || rnative.test( docElem.contains ) ?
		function( a, b ) {
			var adown = a.nodeType === 9 ? a.documentElement : a,
				bup = b && b.parentNode;
			return a === bup || !!( bup && bup.nodeType === 1 && (
				adown.contains ?
					adown.contains( bup ) :
					a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
			));
		} :
		function( a, b ) {
			if ( b ) {
				while ( (b = b.parentNode) ) {
					if ( b === a ) {
						return true;
					}
				}
			}
			return false;
		};

	/* Sorting
	---------------------------------------------------------------------- */

	// Document order sorting
	sortOrder = hasCompare ?
	function( a, b ) {

		// Flag for duplicate removal
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		// Sort on method existence if only one input has compareDocumentPosition
		var compare = !a.compareDocumentPosition - !b.compareDocumentPosition;
		if ( compare ) {
			return compare;
		}

		// Calculate position if both inputs belong to the same document
		compare = ( a.ownerDocument || a ) === ( b.ownerDocument || b ) ?
			a.compareDocumentPosition( b ) :

			// Otherwise we know they are disconnected
			1;

		// Disconnected nodes
		if ( compare & 1 ||
			(!support.sortDetached && b.compareDocumentPosition( a ) === compare) ) {

			// Choose the first element that is related to our preferred document
			if ( a === doc || a.ownerDocument === preferredDoc && contains(preferredDoc, a) ) {
				return -1;
			}
			if ( b === doc || b.ownerDocument === preferredDoc && contains(preferredDoc, b) ) {
				return 1;
			}

			// Maintain original order
			return sortInput ?
				( indexOf( sortInput, a ) - indexOf( sortInput, b ) ) :
				0;
		}

		return compare & 4 ? -1 : 1;
	} :
	function( a, b ) {
		// Exit early if the nodes are identical
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		var cur,
			i = 0,
			aup = a.parentNode,
			bup = b.parentNode,
			ap = [ a ],
			bp = [ b ];

		// Parentless nodes are either documents or disconnected
		if ( !aup || !bup ) {
			return a === doc ? -1 :
				b === doc ? 1 :
				aup ? -1 :
				bup ? 1 :
				sortInput ?
				( indexOf( sortInput, a ) - indexOf( sortInput, b ) ) :
				0;

		// If the nodes are siblings, we can do a quick check
		} else if ( aup === bup ) {
			return siblingCheck( a, b );
		}

		// Otherwise we need full lists of their ancestors for comparison
		cur = a;
		while ( (cur = cur.parentNode) ) {
			ap.unshift( cur );
		}
		cur = b;
		while ( (cur = cur.parentNode) ) {
			bp.unshift( cur );
		}

		// Walk down the tree looking for a discrepancy
		while ( ap[i] === bp[i] ) {
			i++;
		}

		return i ?
			// Do a sibling check if the nodes have a common ancestor
			siblingCheck( ap[i], bp[i] ) :

			// Otherwise nodes in our document sort first
			ap[i] === preferredDoc ? -1 :
			bp[i] === preferredDoc ? 1 :
			0;
	};

	return doc;
};

Sizzle.matches = function( expr, elements ) {
	return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	// Make sure that attribute selectors are quoted
	expr = expr.replace( rattributeQuotes, "='$1']" );

	if ( support.matchesSelector && documentIsHTML &&
		( !rbuggyMatches || !rbuggyMatches.test( expr ) ) &&
		( !rbuggyQSA     || !rbuggyQSA.test( expr ) ) ) {

		try {
			var ret = matches.call( elem, expr );

			// IE 9's matchesSelector returns false on disconnected nodes
			if ( ret || support.disconnectedMatch ||
					// As well, disconnected nodes are said to be in a document
					// fragment in IE 9
					elem.document && elem.document.nodeType !== 11 ) {
				return ret;
			}
		} catch (e) {}
	}

	return Sizzle( expr, document, null, [ elem ] ).length > 0;
};

Sizzle.contains = function( context, elem ) {
	// Set document vars if needed
	if ( ( context.ownerDocument || context ) !== document ) {
		setDocument( context );
	}
	return contains( context, elem );
};

Sizzle.attr = function( elem, name ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	var fn = Expr.attrHandle[ name.toLowerCase() ],
		// Don't get fooled by Object.prototype properties (jQuery #13807)
		val = fn && hasOwn.call( Expr.attrHandle, name.toLowerCase() ) ?
			fn( elem, name, !documentIsHTML ) :
			undefined;

	return val !== undefined ?
		val :
		support.attributes || !documentIsHTML ?
			elem.getAttribute( name ) :
			(val = elem.getAttributeNode(name)) && val.specified ?
				val.value :
				null;
};

Sizzle.error = function( msg ) {
	throw new Error( "Syntax error, unrecognized expression: " + msg );
};

/**
 * Document sorting and removing duplicates
 * @param {ArrayLike} results
 */
Sizzle.uniqueSort = function( results ) {
	var elem,
		duplicates = [],
		j = 0,
		i = 0;

	// Unless we *know* we can detect duplicates, assume their presence
	hasDuplicate = !support.detectDuplicates;
	sortInput = !support.sortStable && results.slice( 0 );
	results.sort( sortOrder );

	if ( hasDuplicate ) {
		while ( (elem = results[i++]) ) {
			if ( elem === results[ i ] ) {
				j = duplicates.push( i );
			}
		}
		while ( j-- ) {
			results.splice( duplicates[ j ], 1 );
		}
	}

	// Clear input after sorting to release objects
	// See https://github.com/jquery/sizzle/pull/225
	sortInput = null;

	return results;
};

/**
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
	var node,
		ret = "",
		i = 0,
		nodeType = elem.nodeType;

	if ( !nodeType ) {
		// If no nodeType, this is expected to be an array
		while ( (node = elem[i++]) ) {
			// Do not traverse comment nodes
			ret += getText( node );
		}
	} else if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {
		// Use textContent for elements
		// innerText usage removed for consistency of new lines (jQuery #11153)
		if ( typeof elem.textContent === "string" ) {
			return elem.textContent;
		} else {
			// Traverse its children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				ret += getText( elem );
			}
		}
	} else if ( nodeType === 3 || nodeType === 4 ) {
		return elem.nodeValue;
	}
	// Do not include comment or processing instruction nodes

	return ret;
};

Expr = Sizzle.selectors = {

	// Can be adjusted by the user
	cacheLength: 50,

	createPseudo: markFunction,

	match: matchExpr,

	attrHandle: {},

	find: {},

	relative: {
		">": { dir: "parentNode", first: true },
		" ": { dir: "parentNode" },
		"+": { dir: "previousSibling", first: true },
		"~": { dir: "previousSibling" }
	},

	preFilter: {
		"ATTR": function( match ) {
			match[1] = match[1].replace( runescape, funescape );

			// Move the given value to match[3] whether quoted or unquoted
			match[3] = ( match[3] || match[4] || match[5] || "" ).replace( runescape, funescape );

			if ( match[2] === "~=" ) {
				match[3] = " " + match[3] + " ";
			}

			return match.slice( 0, 4 );
		},

		"CHILD": function( match ) {
			/* matches from matchExpr["CHILD"]
				1 type (only|nth|...)
				2 what (child|of-type)
				3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
				4 xn-component of xn+y argument ([+-]?\d*n|)
				5 sign of xn-component
				6 x of xn-component
				7 sign of y-component
				8 y of y-component
			*/
			match[1] = match[1].toLowerCase();

			if ( match[1].slice( 0, 3 ) === "nth" ) {
				// nth-* requires argument
				if ( !match[3] ) {
					Sizzle.error( match[0] );
				}

				// numeric x and y parameters for Expr.filter.CHILD
				// remember that false/true cast respectively to 0/1
				match[4] = +( match[4] ? match[5] + (match[6] || 1) : 2 * ( match[3] === "even" || match[3] === "odd" ) );
				match[5] = +( ( match[7] + match[8] ) || match[3] === "odd" );

			// other types prohibit arguments
			} else if ( match[3] ) {
				Sizzle.error( match[0] );
			}

			return match;
		},

		"PSEUDO": function( match ) {
			var excess,
				unquoted = !match[6] && match[2];

			if ( matchExpr["CHILD"].test( match[0] ) ) {
				return null;
			}

			// Accept quoted arguments as-is
			if ( match[3] ) {
				match[2] = match[4] || match[5] || "";

			// Strip excess characters from unquoted arguments
			} else if ( unquoted && rpseudo.test( unquoted ) &&
				// Get excess from tokenize (recursively)
				(excess = tokenize( unquoted, true )) &&
				// advance to the next closing parenthesis
				(excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length) ) {

				// excess is a negative index
				match[0] = match[0].slice( 0, excess );
				match[2] = unquoted.slice( 0, excess );
			}

			// Return only captures needed by the pseudo filter method (type and argument)
			return match.slice( 0, 3 );
		}
	},

	filter: {

		"TAG": function( nodeNameSelector ) {
			var nodeName = nodeNameSelector.replace( runescape, funescape ).toLowerCase();
			return nodeNameSelector === "*" ?
				function() { return true; } :
				function( elem ) {
					return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
				};
		},

		"CLASS": function( className ) {
			var pattern = classCache[ className + " " ];

			return pattern ||
				(pattern = new RegExp( "(^|" + whitespace + ")" + className + "(" + whitespace + "|$)" )) &&
				classCache( className, function( elem ) {
					return pattern.test( typeof elem.className === "string" && elem.className || typeof elem.getAttribute !== "undefined" && elem.getAttribute("class") || "" );
				});
		},

		"ATTR": function( name, operator, check ) {
			return function( elem ) {
				var result = Sizzle.attr( elem, name );

				if ( result == null ) {
					return operator === "!=";
				}
				if ( !operator ) {
					return true;
				}

				result += "";

				return operator === "=" ? result === check :
					operator === "!=" ? result !== check :
					operator === "^=" ? check && result.indexOf( check ) === 0 :
					operator === "*=" ? check && result.indexOf( check ) > -1 :
					operator === "$=" ? check && result.slice( -check.length ) === check :
					operator === "~=" ? ( " " + result.replace( rwhitespace, " " ) + " " ).indexOf( check ) > -1 :
					operator === "|=" ? result === check || result.slice( 0, check.length + 1 ) === check + "-" :
					false;
			};
		},

		"CHILD": function( type, what, argument, first, last ) {
			var simple = type.slice( 0, 3 ) !== "nth",
				forward = type.slice( -4 ) !== "last",
				ofType = what === "of-type";

			return first === 1 && last === 0 ?

				// Shortcut for :nth-*(n)
				function( elem ) {
					return !!elem.parentNode;
				} :

				function( elem, context, xml ) {
					var cache, outerCache, node, diff, nodeIndex, start,
						dir = simple !== forward ? "nextSibling" : "previousSibling",
						parent = elem.parentNode,
						name = ofType && elem.nodeName.toLowerCase(),
						useCache = !xml && !ofType;

					if ( parent ) {

						// :(first|last|only)-(child|of-type)
						if ( simple ) {
							while ( dir ) {
								node = elem;
								while ( (node = node[ dir ]) ) {
									if ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) {
										return false;
									}
								}
								// Reverse direction for :only-* (if we haven't yet done so)
								start = dir = type === "only" && !start && "nextSibling";
							}
							return true;
						}

						start = [ forward ? parent.firstChild : parent.lastChild ];

						// non-xml :nth-child(...) stores cache data on `parent`
						if ( forward && useCache ) {
							// Seek `elem` from a previously-cached index
							outerCache = parent[ expando ] || (parent[ expando ] = {});
							cache = outerCache[ type ] || [];
							nodeIndex = cache[0] === dirruns && cache[1];
							diff = cache[0] === dirruns && cache[2];
							node = nodeIndex && parent.childNodes[ nodeIndex ];

							while ( (node = ++nodeIndex && node && node[ dir ] ||

								// Fallback to seeking `elem` from the start
								(diff = nodeIndex = 0) || start.pop()) ) {

								// When found, cache indexes on `parent` and break
								if ( node.nodeType === 1 && ++diff && node === elem ) {
									outerCache[ type ] = [ dirruns, nodeIndex, diff ];
									break;
								}
							}

						// Use previously-cached element index if available
						} else if ( useCache && (cache = (elem[ expando ] || (elem[ expando ] = {}))[ type ]) && cache[0] === dirruns ) {
							diff = cache[1];

						// xml :nth-child(...) or :nth-last-child(...) or :nth(-last)?-of-type(...)
						} else {
							// Use the same loop as above to seek `elem` from the start
							while ( (node = ++nodeIndex && node && node[ dir ] ||
								(diff = nodeIndex = 0) || start.pop()) ) {

								if ( ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) && ++diff ) {
									// Cache the index of each encountered element
									if ( useCache ) {
										(node[ expando ] || (node[ expando ] = {}))[ type ] = [ dirruns, diff ];
									}

									if ( node === elem ) {
										break;
									}
								}
							}
						}

						// Incorporate the offset, then check against cycle size
						diff -= last;
						return diff === first || ( diff % first === 0 && diff / first >= 0 );
					}
				};
		},

		"PSEUDO": function( pseudo, argument ) {
			// pseudo-class names are case-insensitive
			// http://www.w3.org/TR/selectors/#pseudo-classes
			// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
			// Remember that setFilters inherits from pseudos
			var args,
				fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
					Sizzle.error( "unsupported pseudo: " + pseudo );

			// The user may use createPseudo to indicate that
			// arguments are needed to create the filter function
			// just as Sizzle does
			if ( fn[ expando ] ) {
				return fn( argument );
			}

			// But maintain support for old signatures
			if ( fn.length > 1 ) {
				args = [ pseudo, pseudo, "", argument ];
				return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
					markFunction(function( seed, matches ) {
						var idx,
							matched = fn( seed, argument ),
							i = matched.length;
						while ( i-- ) {
							idx = indexOf( seed, matched[i] );
							seed[ idx ] = !( matches[ idx ] = matched[i] );
						}
					}) :
					function( elem ) {
						return fn( elem, 0, args );
					};
			}

			return fn;
		}
	},

	pseudos: {
		// Potentially complex pseudos
		"not": markFunction(function( selector ) {
			// Trim the selector passed to compile
			// to avoid treating leading and trailing
			// spaces as combinators
			var input = [],
				results = [],
				matcher = compile( selector.replace( rtrim, "$1" ) );

			return matcher[ expando ] ?
				markFunction(function( seed, matches, context, xml ) {
					var elem,
						unmatched = matcher( seed, null, xml, [] ),
						i = seed.length;

					// Match elements unmatched by `matcher`
					while ( i-- ) {
						if ( (elem = unmatched[i]) ) {
							seed[i] = !(matches[i] = elem);
						}
					}
				}) :
				function( elem, context, xml ) {
					input[0] = elem;
					matcher( input, null, xml, results );
					// Don't keep the element (issue #299)
					input[0] = null;
					return !results.pop();
				};
		}),

		"has": markFunction(function( selector ) {
			return function( elem ) {
				return Sizzle( selector, elem ).length > 0;
			};
		}),

		"contains": markFunction(function( text ) {
			text = text.replace( runescape, funescape );
			return function( elem ) {
				return ( elem.textContent || elem.innerText || getText( elem ) ).indexOf( text ) > -1;
			};
		}),

		// "Whether an element is represented by a :lang() selector
		// is based solely on the element's language value
		// being equal to the identifier C,
		// or beginning with the identifier C immediately followed by "-".
		// The matching of C against the element's language value is performed case-insensitively.
		// The identifier C does not have to be a valid language name."
		// http://www.w3.org/TR/selectors/#lang-pseudo
		"lang": markFunction( function( lang ) {
			// lang value must be a valid identifier
			if ( !ridentifier.test(lang || "") ) {
				Sizzle.error( "unsupported lang: " + lang );
			}
			lang = lang.replace( runescape, funescape ).toLowerCase();
			return function( elem ) {
				var elemLang;
				do {
					if ( (elemLang = documentIsHTML ?
						elem.lang :
						elem.getAttribute("xml:lang") || elem.getAttribute("lang")) ) {

						elemLang = elemLang.toLowerCase();
						return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
					}
				} while ( (elem = elem.parentNode) && elem.nodeType === 1 );
				return false;
			};
		}),

		// Miscellaneous
		"target": function( elem ) {
			var hash = window.location && window.location.hash;
			return hash && hash.slice( 1 ) === elem.id;
		},

		"root": function( elem ) {
			return elem === docElem;
		},

		"focus": function( elem ) {
			return elem === document.activeElement && (!document.hasFocus || document.hasFocus()) && !!(elem.type || elem.href || ~elem.tabIndex);
		},

		// Boolean properties
		"enabled": function( elem ) {
			return elem.disabled === false;
		},

		"disabled": function( elem ) {
			return elem.disabled === true;
		},

		"checked": function( elem ) {
			// In CSS3, :checked should return both checked and selected elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			var nodeName = elem.nodeName.toLowerCase();
			return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
		},

		"selected": function( elem ) {
			// Accessing this property makes selected-by-default
			// options in Safari work properly
			if ( elem.parentNode ) {
				elem.parentNode.selectedIndex;
			}

			return elem.selected === true;
		},

		// Contents
		"empty": function( elem ) {
			// http://www.w3.org/TR/selectors/#empty-pseudo
			// :empty is negated by element (1) or content nodes (text: 3; cdata: 4; entity ref: 5),
			//   but not by others (comment: 8; processing instruction: 7; etc.)
			// nodeType < 6 works because attributes (2) do not appear as children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				if ( elem.nodeType < 6 ) {
					return false;
				}
			}
			return true;
		},

		"parent": function( elem ) {
			return !Expr.pseudos["empty"]( elem );
		},

		// Element/input types
		"header": function( elem ) {
			return rheader.test( elem.nodeName );
		},

		"input": function( elem ) {
			return rinputs.test( elem.nodeName );
		},

		"button": function( elem ) {
			var name = elem.nodeName.toLowerCase();
			return name === "input" && elem.type === "button" || name === "button";
		},

		"text": function( elem ) {
			var attr;
			return elem.nodeName.toLowerCase() === "input" &&
				elem.type === "text" &&

				// Support: IE<8
				// New HTML5 attribute values (e.g., "search") appear with elem.type === "text"
				( (attr = elem.getAttribute("type")) == null || attr.toLowerCase() === "text" );
		},

		// Position-in-collection
		"first": createPositionalPseudo(function() {
			return [ 0 ];
		}),

		"last": createPositionalPseudo(function( matchIndexes, length ) {
			return [ length - 1 ];
		}),

		"eq": createPositionalPseudo(function( matchIndexes, length, argument ) {
			return [ argument < 0 ? argument + length : argument ];
		}),

		"even": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 0;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"odd": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 1;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"lt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; --i >= 0; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"gt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; ++i < length; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		})
	}
};

Expr.pseudos["nth"] = Expr.pseudos["eq"];

// Add button/input type pseudos
for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
	Expr.pseudos[ i ] = createInputPseudo( i );
}
for ( i in { submit: true, reset: true } ) {
	Expr.pseudos[ i ] = createButtonPseudo( i );
}

// Easy API for creating new setFilters
function setFilters() {}
setFilters.prototype = Expr.filters = Expr.pseudos;
Expr.setFilters = new setFilters();

tokenize = Sizzle.tokenize = function( selector, parseOnly ) {
	var matched, match, tokens, type,
		soFar, groups, preFilters,
		cached = tokenCache[ selector + " " ];

	if ( cached ) {
		return parseOnly ? 0 : cached.slice( 0 );
	}

	soFar = selector;
	groups = [];
	preFilters = Expr.preFilter;

	while ( soFar ) {

		// Comma and first run
		if ( !matched || (match = rcomma.exec( soFar )) ) {
			if ( match ) {
				// Don't consume trailing commas as valid
				soFar = soFar.slice( match[0].length ) || soFar;
			}
			groups.push( (tokens = []) );
		}

		matched = false;

		// Combinators
		if ( (match = rcombinators.exec( soFar )) ) {
			matched = match.shift();
			tokens.push({
				value: matched,
				// Cast descendant combinators to space
				type: match[0].replace( rtrim, " " )
			});
			soFar = soFar.slice( matched.length );
		}

		// Filters
		for ( type in Expr.filter ) {
			if ( (match = matchExpr[ type ].exec( soFar )) && (!preFilters[ type ] ||
				(match = preFilters[ type ]( match ))) ) {
				matched = match.shift();
				tokens.push({
					value: matched,
					type: type,
					matches: match
				});
				soFar = soFar.slice( matched.length );
			}
		}

		if ( !matched ) {
			break;
		}
	}

	// Return the length of the invalid excess
	// if we're just parsing
	// Otherwise, throw an error or return tokens
	return parseOnly ?
		soFar.length :
		soFar ?
			Sizzle.error( selector ) :
			// Cache the tokens
			tokenCache( selector, groups ).slice( 0 );
};

function toSelector( tokens ) {
	var i = 0,
		len = tokens.length,
		selector = "";
	for ( ; i < len; i++ ) {
		selector += tokens[i].value;
	}
	return selector;
}

function addCombinator( matcher, combinator, base ) {
	var dir = combinator.dir,
		checkNonElements = base && dir === "parentNode",
		doneName = done++;

	return combinator.first ?
		// Check against closest ancestor/preceding element
		function( elem, context, xml ) {
			while ( (elem = elem[ dir ]) ) {
				if ( elem.nodeType === 1 || checkNonElements ) {
					return matcher( elem, context, xml );
				}
			}
		} :

		// Check against all ancestor/preceding elements
		function( elem, context, xml ) {
			var oldCache, outerCache,
				newCache = [ dirruns, doneName ];

			// We can't set arbitrary data on XML nodes, so they don't benefit from dir caching
			if ( xml ) {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						if ( matcher( elem, context, xml ) ) {
							return true;
						}
					}
				}
			} else {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						outerCache = elem[ expando ] || (elem[ expando ] = {});
						if ( (oldCache = outerCache[ dir ]) &&
							oldCache[ 0 ] === dirruns && oldCache[ 1 ] === doneName ) {

							// Assign to newCache so results back-propagate to previous elements
							return (newCache[ 2 ] = oldCache[ 2 ]);
						} else {
							// Reuse newcache so results back-propagate to previous elements
							outerCache[ dir ] = newCache;

							// A match means we're done; a fail means we have to keep checking
							if ( (newCache[ 2 ] = matcher( elem, context, xml )) ) {
								return true;
							}
						}
					}
				}
			}
		};
}

function elementMatcher( matchers ) {
	return matchers.length > 1 ?
		function( elem, context, xml ) {
			var i = matchers.length;
			while ( i-- ) {
				if ( !matchers[i]( elem, context, xml ) ) {
					return false;
				}
			}
			return true;
		} :
		matchers[0];
}

function multipleContexts( selector, contexts, results ) {
	var i = 0,
		len = contexts.length;
	for ( ; i < len; i++ ) {
		Sizzle( selector, contexts[i], results );
	}
	return results;
}

function condense( unmatched, map, filter, context, xml ) {
	var elem,
		newUnmatched = [],
		i = 0,
		len = unmatched.length,
		mapped = map != null;

	for ( ; i < len; i++ ) {
		if ( (elem = unmatched[i]) ) {
			if ( !filter || filter( elem, context, xml ) ) {
				newUnmatched.push( elem );
				if ( mapped ) {
					map.push( i );
				}
			}
		}
	}

	return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
	if ( postFilter && !postFilter[ expando ] ) {
		postFilter = setMatcher( postFilter );
	}
	if ( postFinder && !postFinder[ expando ] ) {
		postFinder = setMatcher( postFinder, postSelector );
	}
	return markFunction(function( seed, results, context, xml ) {
		var temp, i, elem,
			preMap = [],
			postMap = [],
			preexisting = results.length,

			// Get initial elements from seed or context
			elems = seed || multipleContexts( selector || "*", context.nodeType ? [ context ] : context, [] ),

			// Prefilter to get matcher input, preserving a map for seed-results synchronization
			matcherIn = preFilter && ( seed || !selector ) ?
				condense( elems, preMap, preFilter, context, xml ) :
				elems,

			matcherOut = matcher ?
				// If we have a postFinder, or filtered seed, or non-seed postFilter or preexisting results,
				postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

					// ...intermediate processing is necessary
					[] :

					// ...otherwise use results directly
					results :
				matcherIn;

		// Find primary matches
		if ( matcher ) {
			matcher( matcherIn, matcherOut, context, xml );
		}

		// Apply postFilter
		if ( postFilter ) {
			temp = condense( matcherOut, postMap );
			postFilter( temp, [], context, xml );

			// Un-match failing elements by moving them back to matcherIn
			i = temp.length;
			while ( i-- ) {
				if ( (elem = temp[i]) ) {
					matcherOut[ postMap[i] ] = !(matcherIn[ postMap[i] ] = elem);
				}
			}
		}

		if ( seed ) {
			if ( postFinder || preFilter ) {
				if ( postFinder ) {
					// Get the final matcherOut by condensing this intermediate into postFinder contexts
					temp = [];
					i = matcherOut.length;
					while ( i-- ) {
						if ( (elem = matcherOut[i]) ) {
							// Restore matcherIn since elem is not yet a final match
							temp.push( (matcherIn[i] = elem) );
						}
					}
					postFinder( null, (matcherOut = []), temp, xml );
				}

				// Move matched elements from seed to results to keep them synchronized
				i = matcherOut.length;
				while ( i-- ) {
					if ( (elem = matcherOut[i]) &&
						(temp = postFinder ? indexOf( seed, elem ) : preMap[i]) > -1 ) {

						seed[temp] = !(results[temp] = elem);
					}
				}
			}

		// Add elements to results, through postFinder if defined
		} else {
			matcherOut = condense(
				matcherOut === results ?
					matcherOut.splice( preexisting, matcherOut.length ) :
					matcherOut
			);
			if ( postFinder ) {
				postFinder( null, results, matcherOut, xml );
			} else {
				push.apply( results, matcherOut );
			}
		}
	});
}

function matcherFromTokens( tokens ) {
	var checkContext, matcher, j,
		len = tokens.length,
		leadingRelative = Expr.relative[ tokens[0].type ],
		implicitRelative = leadingRelative || Expr.relative[" "],
		i = leadingRelative ? 1 : 0,

		// The foundational matcher ensures that elements are reachable from top-level context(s)
		matchContext = addCombinator( function( elem ) {
			return elem === checkContext;
		}, implicitRelative, true ),
		matchAnyContext = addCombinator( function( elem ) {
			return indexOf( checkContext, elem ) > -1;
		}, implicitRelative, true ),
		matchers = [ function( elem, context, xml ) {
			var ret = ( !leadingRelative && ( xml || context !== outermostContext ) ) || (
				(checkContext = context).nodeType ?
					matchContext( elem, context, xml ) :
					matchAnyContext( elem, context, xml ) );
			// Avoid hanging onto element (issue #299)
			checkContext = null;
			return ret;
		} ];

	for ( ; i < len; i++ ) {
		if ( (matcher = Expr.relative[ tokens[i].type ]) ) {
			matchers = [ addCombinator(elementMatcher( matchers ), matcher) ];
		} else {
			matcher = Expr.filter[ tokens[i].type ].apply( null, tokens[i].matches );

			// Return special upon seeing a positional matcher
			if ( matcher[ expando ] ) {
				// Find the next relative operator (if any) for proper handling
				j = ++i;
				for ( ; j < len; j++ ) {
					if ( Expr.relative[ tokens[j].type ] ) {
						break;
					}
				}
				return setMatcher(
					i > 1 && elementMatcher( matchers ),
					i > 1 && toSelector(
						// If the preceding token was a descendant combinator, insert an implicit any-element `*`
						tokens.slice( 0, i - 1 ).concat({ value: tokens[ i - 2 ].type === " " ? "*" : "" })
					).replace( rtrim, "$1" ),
					matcher,
					i < j && matcherFromTokens( tokens.slice( i, j ) ),
					j < len && matcherFromTokens( (tokens = tokens.slice( j )) ),
					j < len && toSelector( tokens )
				);
			}
			matchers.push( matcher );
		}
	}

	return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
	var bySet = setMatchers.length > 0,
		byElement = elementMatchers.length > 0,
		superMatcher = function( seed, context, xml, results, outermost ) {
			var elem, j, matcher,
				matchedCount = 0,
				i = "0",
				unmatched = seed && [],
				setMatched = [],
				contextBackup = outermostContext,
				// We must always have either seed elements or outermost context
				elems = seed || byElement && Expr.find["TAG"]( "*", outermost ),
				// Use integer dirruns iff this is the outermost matcher
				dirrunsUnique = (dirruns += contextBackup == null ? 1 : Math.random() || 0.1),
				len = elems.length;

			if ( outermost ) {
				outermostContext = context !== document && context;
			}

			// Add elements passing elementMatchers directly to results
			// Keep `i` a string if there are no elements so `matchedCount` will be "00" below
			// Support: IE<9, Safari
			// Tolerate NodeList properties (IE: "length"; Safari: <number>) matching elements by id
			for ( ; i !== len && (elem = elems[i]) != null; i++ ) {
				if ( byElement && elem ) {
					j = 0;
					while ( (matcher = elementMatchers[j++]) ) {
						if ( matcher( elem, context, xml ) ) {
							results.push( elem );
							break;
						}
					}
					if ( outermost ) {
						dirruns = dirrunsUnique;
					}
				}

				// Track unmatched elements for set filters
				if ( bySet ) {
					// They will have gone through all possible matchers
					if ( (elem = !matcher && elem) ) {
						matchedCount--;
					}

					// Lengthen the array for every element, matched or not
					if ( seed ) {
						unmatched.push( elem );
					}
				}
			}

			// Apply set filters to unmatched elements
			matchedCount += i;
			if ( bySet && i !== matchedCount ) {
				j = 0;
				while ( (matcher = setMatchers[j++]) ) {
					matcher( unmatched, setMatched, context, xml );
				}

				if ( seed ) {
					// Reintegrate element matches to eliminate the need for sorting
					if ( matchedCount > 0 ) {
						while ( i-- ) {
							if ( !(unmatched[i] || setMatched[i]) ) {
								setMatched[i] = pop.call( results );
							}
						}
					}

					// Discard index placeholder values to get only actual matches
					setMatched = condense( setMatched );
				}

				// Add matches to results
				push.apply( results, setMatched );

				// Seedless set matches succeeding multiple successful matchers stipulate sorting
				if ( outermost && !seed && setMatched.length > 0 &&
					( matchedCount + setMatchers.length ) > 1 ) {

					Sizzle.uniqueSort( results );
				}
			}

			// Override manipulation of globals by nested matchers
			if ( outermost ) {
				dirruns = dirrunsUnique;
				outermostContext = contextBackup;
			}

			return unmatched;
		};

	return bySet ?
		markFunction( superMatcher ) :
		superMatcher;
}

compile = Sizzle.compile = function( selector, match /* Internal Use Only */ ) {
	var i,
		setMatchers = [],
		elementMatchers = [],
		cached = compilerCache[ selector + " " ];

	if ( !cached ) {
		// Generate a function of recursive functions that can be used to check each element
		if ( !match ) {
			match = tokenize( selector );
		}
		i = match.length;
		while ( i-- ) {
			cached = matcherFromTokens( match[i] );
			if ( cached[ expando ] ) {
				setMatchers.push( cached );
			} else {
				elementMatchers.push( cached );
			}
		}

		// Cache the compiled function
		cached = compilerCache( selector, matcherFromGroupMatchers( elementMatchers, setMatchers ) );

		// Save selector and tokenization
		cached.selector = selector;
	}
	return cached;
};

/**
 * A low-level selection function that works with Sizzle's compiled
 *  selector functions
 * @param {String|Function} selector A selector or a pre-compiled
 *  selector function built with Sizzle.compile
 * @param {Element} context
 * @param {Array} [results]
 * @param {Array} [seed] A set of elements to match against
 */
select = Sizzle.select = function( selector, context, results, seed ) {
	var i, tokens, token, type, find,
		compiled = typeof selector === "function" && selector,
		match = !seed && tokenize( (selector = compiled.selector || selector) );

	results = results || [];

	// Try to minimize operations if there is no seed and only one group
	if ( match.length === 1 ) {

		// Take a shortcut and set the context if the root selector is an ID
		tokens = match[0] = match[0].slice( 0 );
		if ( tokens.length > 2 && (token = tokens[0]).type === "ID" &&
				support.getById && context.nodeType === 9 && documentIsHTML &&
				Expr.relative[ tokens[1].type ] ) {

			context = ( Expr.find["ID"]( token.matches[0].replace(runescape, funescape), context ) || [] )[0];
			if ( !context ) {
				return results;

			// Precompiled matchers will still verify ancestry, so step up a level
			} else if ( compiled ) {
				context = context.parentNode;
			}

			selector = selector.slice( tokens.shift().value.length );
		}

		// Fetch a seed set for right-to-left matching
		i = matchExpr["needsContext"].test( selector ) ? 0 : tokens.length;
		while ( i-- ) {
			token = tokens[i];

			// Abort if we hit a combinator
			if ( Expr.relative[ (type = token.type) ] ) {
				break;
			}
			if ( (find = Expr.find[ type ]) ) {
				// Search, expanding context for leading sibling combinators
				if ( (seed = find(
					token.matches[0].replace( runescape, funescape ),
					rsibling.test( tokens[0].type ) && testContext( context.parentNode ) || context
				)) ) {

					// If seed is empty or no tokens remain, we can return early
					tokens.splice( i, 1 );
					selector = seed.length && toSelector( tokens );
					if ( !selector ) {
						push.apply( results, seed );
						return results;
					}

					break;
				}
			}
		}
	}

	// Compile and execute a filtering function if one is not provided
	// Provide `match` to avoid retokenization if we modified the selector above
	( compiled || compile( selector, match ) )(
		seed,
		context,
		!documentIsHTML,
		results,
		rsibling.test( selector ) && testContext( context.parentNode ) || context
	);
	return results;
};

// One-time assignments

// Sort stability
support.sortStable = expando.split("").sort( sortOrder ).join("") === expando;

// Support: Chrome 14-35+
// Always assume duplicates if they aren't passed to the comparison function
support.detectDuplicates = !!hasDuplicate;

// Initialize against the default document
setDocument();

// Support: Webkit<537.32 - Safari 6.0.3/Chrome 25 (fixed in Chrome 27)
// Detached nodes confoundingly follow *each other*
support.sortDetached = assert(function( div1 ) {
	// Should return 1, but returns 4 (following)
	return div1.compareDocumentPosition( document.createElement("div") ) & 1;
});

// Support: IE<8
// Prevent attribute/property "interpolation"
// http://msdn.microsoft.com/en-us/library/ms536429%28VS.85%29.aspx
if ( !assert(function( div ) {
	div.innerHTML = "<a href='#'></a>";
	return div.firstChild.getAttribute("href") === "#" ;
}) ) {
	addHandle( "type|href|height|width", function( elem, name, isXML ) {
		if ( !isXML ) {
			return elem.getAttribute( name, name.toLowerCase() === "type" ? 1 : 2 );
		}
	});
}

// Support: IE<9
// Use defaultValue in place of getAttribute("value")
if ( !support.attributes || !assert(function( div ) {
	div.innerHTML = "<input/>";
	div.firstChild.setAttribute( "value", "" );
	return div.firstChild.getAttribute( "value" ) === "";
}) ) {
	addHandle( "value", function( elem, name, isXML ) {
		if ( !isXML && elem.nodeName.toLowerCase() === "input" ) {
			return elem.defaultValue;
		}
	});
}

// Support: IE<9
// Use getAttributeNode to fetch booleans when getAttribute lies
if ( !assert(function( div ) {
	return div.getAttribute("disabled") == null;
}) ) {
	addHandle( booleans, function( elem, name, isXML ) {
		var val;
		if ( !isXML ) {
			return elem[ name ] === true ? name.toLowerCase() :
					(val = elem.getAttributeNode( name )) && val.specified ?
					val.value :
				null;
		}
	});
}

return Sizzle;

})( window );



jQuery.find = Sizzle;
jQuery.expr = Sizzle.selectors;
jQuery.expr[":"] = jQuery.expr.pseudos;
jQuery.unique = Sizzle.uniqueSort;
jQuery.text = Sizzle.getText;
jQuery.isXMLDoc = Sizzle.isXML;
jQuery.contains = Sizzle.contains;



var rneedsContext = jQuery.expr.match.needsContext;

var rsingleTag = (/^<(\w+)\s*\/?>(?:<\/\1>|)$/);



var risSimple = /^.[^:#\[\.,]*$/;

// Implement the identical functionality for filter and not
function winnow( elements, qualifier, not ) {
	if ( jQuery.isFunction( qualifier ) ) {
		return jQuery.grep( elements, function( elem, i ) {
			/* jshint -W018 */
			return !!qualifier.call( elem, i, elem ) !== not;
		});

	}

	if ( qualifier.nodeType ) {
		return jQuery.grep( elements, function( elem ) {
			return ( elem === qualifier ) !== not;
		});

	}

	if ( typeof qualifier === "string" ) {
		if ( risSimple.test( qualifier ) ) {
			return jQuery.filter( qualifier, elements, not );
		}

		qualifier = jQuery.filter( qualifier, elements );
	}

	return jQuery.grep( elements, function( elem ) {
		return ( indexOf.call( qualifier, elem ) >= 0 ) !== not;
	});
}

jQuery.filter = function( expr, elems, not ) {
	var elem = elems[ 0 ];

	if ( not ) {
		expr = ":not(" + expr + ")";
	}

	return elems.length === 1 && elem.nodeType === 1 ?
		jQuery.find.matchesSelector( elem, expr ) ? [ elem ] : [] :
		jQuery.find.matches( expr, jQuery.grep( elems, function( elem ) {
			return elem.nodeType === 1;
		}));
};

jQuery.fn.extend({
	find: function( selector ) {
		var i,
			len = this.length,
			ret = [],
			self = this;

		if ( typeof selector !== "string" ) {
			return this.pushStack( jQuery( selector ).filter(function() {
				for ( i = 0; i < len; i++ ) {
					if ( jQuery.contains( self[ i ], this ) ) {
						return true;
					}
				}
			}) );
		}

		for ( i = 0; i < len; i++ ) {
			jQuery.find( selector, self[ i ], ret );
		}

		// Needed because $( selector, context ) becomes $( context ).find( selector )
		ret = this.pushStack( len > 1 ? jQuery.unique( ret ) : ret );
		ret.selector = this.selector ? this.selector + " " + selector : selector;
		return ret;
	},
	filter: function( selector ) {
		return this.pushStack( winnow(this, selector || [], false) );
	},
	not: function( selector ) {
		return this.pushStack( winnow(this, selector || [], true) );
	},
	is: function( selector ) {
		return !!winnow(
			this,

			// If this is a positional/relative selector, check membership in the returned set
			// so $("p:first").is("p:last") won't return true for a doc with two "p".
			typeof selector === "string" && rneedsContext.test( selector ) ?
				jQuery( selector ) :
				selector || [],
			false
		).length;
	}
});


// Initialize a jQuery object


// A central reference to the root jQuery(document)
var rootjQuery,

	// A simple way to check for HTML strings
	// Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
	// Strict HTML recognition (#11290: must start with <)
	rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,

	init = jQuery.fn.init = function( selector, context ) {
		var match, elem;

		// HANDLE: $(""), $(null), $(undefined), $(false)
		if ( !selector ) {
			return this;
		}

		// Handle HTML strings
		if ( typeof selector === "string" ) {
			if ( selector[0] === "<" && selector[ selector.length - 1 ] === ">" && selector.length >= 3 ) {
				// Assume that strings that start and end with <> are HTML and skip the regex check
				match = [ null, selector, null ];

			} else {
				match = rquickExpr.exec( selector );
			}

			// Match html or make sure no context is specified for #id
			if ( match && (match[1] || !context) ) {

				// HANDLE: $(html) -> $(array)
				if ( match[1] ) {
					context = context instanceof jQuery ? context[0] : context;

					// Option to run scripts is true for back-compat
					// Intentionally let the error be thrown if parseHTML is not present
					jQuery.merge( this, jQuery.parseHTML(
						match[1],
						context && context.nodeType ? context.ownerDocument || context : document,
						true
					) );

					// HANDLE: $(html, props)
					if ( rsingleTag.test( match[1] ) && jQuery.isPlainObject( context ) ) {
						for ( match in context ) {
							// Properties of context are called as methods if possible
							if ( jQuery.isFunction( this[ match ] ) ) {
								this[ match ]( context[ match ] );

							// ...and otherwise set as attributes
							} else {
								this.attr( match, context[ match ] );
							}
						}
					}

					return this;

				// HANDLE: $(#id)
				} else {
					elem = document.getElementById( match[2] );

					// Support: Blackberry 4.6
					// gEBID returns nodes no longer in the document (#6963)
					if ( elem && elem.parentNode ) {
						// Inject the element directly into the jQuery object
						this.length = 1;
						this[0] = elem;
					}

					this.context = document;
					this.selector = selector;
					return this;
				}

			// HANDLE: $(expr, $(...))
			} else if ( !context || context.jquery ) {
				return ( context || rootjQuery ).find( selector );

			// HANDLE: $(expr, context)
			// (which is just equivalent to: $(context).find(expr)
			} else {
				return this.constructor( context ).find( selector );
			}

		// HANDLE: $(DOMElement)
		} else if ( selector.nodeType ) {
			this.context = this[0] = selector;
			this.length = 1;
			return this;

		// HANDLE: $(function)
		// Shortcut for document ready
		} else if ( jQuery.isFunction( selector ) ) {
			return typeof rootjQuery.ready !== "undefined" ?
				rootjQuery.ready( selector ) :
				// Execute immediately if ready is not present
				selector( jQuery );
		}

		if ( selector.selector !== undefined ) {
			this.selector = selector.selector;
			this.context = selector.context;
		}

		return jQuery.makeArray( selector, this );
	};

// Give the init function the jQuery prototype for later instantiation
init.prototype = jQuery.fn;

// Initialize central reference
rootjQuery = jQuery( document );


var rparentsprev = /^(?:parents|prev(?:Until|All))/,
	// Methods guaranteed to produce a unique set when starting from a unique set
	guaranteedUnique = {
		children: true,
		contents: true,
		next: true,
		prev: true
	};

jQuery.extend({
	dir: function( elem, dir, until ) {
		var matched = [],
			truncate = until !== undefined;

		while ( (elem = elem[ dir ]) && elem.nodeType !== 9 ) {
			if ( elem.nodeType === 1 ) {
				if ( truncate && jQuery( elem ).is( until ) ) {
					break;
				}
				matched.push( elem );
			}
		}
		return matched;
	},

	sibling: function( n, elem ) {
		var matched = [];

		for ( ; n; n = n.nextSibling ) {
			if ( n.nodeType === 1 && n !== elem ) {
				matched.push( n );
			}
		}

		return matched;
	}
});

jQuery.fn.extend({
	has: function( target ) {
		var targets = jQuery( target, this ),
			l = targets.length;

		return this.filter(function() {
			var i = 0;
			for ( ; i < l; i++ ) {
				if ( jQuery.contains( this, targets[i] ) ) {
					return true;
				}
			}
		});
	},

	closest: function( selectors, context ) {
		var cur,
			i = 0,
			l = this.length,
			matched = [],
			pos = rneedsContext.test( selectors ) || typeof selectors !== "string" ?
				jQuery( selectors, context || this.context ) :
				0;

		for ( ; i < l; i++ ) {
			for ( cur = this[i]; cur && cur !== context; cur = cur.parentNode ) {
				// Always skip document fragments
				if ( cur.nodeType < 11 && (pos ?
					pos.index(cur) > -1 :

					// Don't pass non-elements to Sizzle
					cur.nodeType === 1 &&
						jQuery.find.matchesSelector(cur, selectors)) ) {

					matched.push( cur );
					break;
				}
			}
		}

		return this.pushStack( matched.length > 1 ? jQuery.unique( matched ) : matched );
	},

	// Determine the position of an element within the set
	index: function( elem ) {

		// No argument, return index in parent
		if ( !elem ) {
			return ( this[ 0 ] && this[ 0 ].parentNode ) ? this.first().prevAll().length : -1;
		}

		// Index in selector
		if ( typeof elem === "string" ) {
			return indexOf.call( jQuery( elem ), this[ 0 ] );
		}

		// Locate the position of the desired element
		return indexOf.call( this,

			// If it receives a jQuery object, the first element is used
			elem.jquery ? elem[ 0 ] : elem
		);
	},

	add: function( selector, context ) {
		return this.pushStack(
			jQuery.unique(
				jQuery.merge( this.get(), jQuery( selector, context ) )
			)
		);
	},

	addBack: function( selector ) {
		return this.add( selector == null ?
			this.prevObject : this.prevObject.filter(selector)
		);
	}
});

function sibling( cur, dir ) {
	while ( (cur = cur[dir]) && cur.nodeType !== 1 ) {}
	return cur;
}

jQuery.each({
	parent: function( elem ) {
		var parent = elem.parentNode;
		return parent && parent.nodeType !== 11 ? parent : null;
	},
	parents: function( elem ) {
		return jQuery.dir( elem, "parentNode" );
	},
	parentsUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "parentNode", until );
	},
	next: function( elem ) {
		return sibling( elem, "nextSibling" );
	},
	prev: function( elem ) {
		return sibling( elem, "previousSibling" );
	},
	nextAll: function( elem ) {
		return jQuery.dir( elem, "nextSibling" );
	},
	prevAll: function( elem ) {
		return jQuery.dir( elem, "previousSibling" );
	},
	nextUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "nextSibling", until );
	},
	prevUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "previousSibling", until );
	},
	siblings: function( elem ) {
		return jQuery.sibling( ( elem.parentNode || {} ).firstChild, elem );
	},
	children: function( elem ) {
		return jQuery.sibling( elem.firstChild );
	},
	contents: function( elem ) {
		return elem.contentDocument || jQuery.merge( [], elem.childNodes );
	}
}, function( name, fn ) {
	jQuery.fn[ name ] = function( until, selector ) {
		var matched = jQuery.map( this, fn, until );

		if ( name.slice( -5 ) !== "Until" ) {
			selector = until;
		}

		if ( selector && typeof selector === "string" ) {
			matched = jQuery.filter( selector, matched );
		}

		if ( this.length > 1 ) {
			// Remove duplicates
			if ( !guaranteedUnique[ name ] ) {
				jQuery.unique( matched );
			}

			// Reverse order for parents* and prev-derivatives
			if ( rparentsprev.test( name ) ) {
				matched.reverse();
			}
		}

		return this.pushStack( matched );
	};
});
var rnotwhite = (/\S+/g);



// String to Object options format cache
var optionsCache = {};

// Convert String-formatted options into Object-formatted ones and store in cache
function createOptions( options ) {
	var object = optionsCache[ options ] = {};
	jQuery.each( options.match( rnotwhite ) || [], function( _, flag ) {
		object[ flag ] = true;
	});
	return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *	options: an optional list of space-separated options that will change how
 *			the callback list behaves or a more traditional option object
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible options:
 *
 *	once:			will ensure the callback list can only be fired once (like a Deferred)
 *
 *	memory:			will keep track of previous values and will call any callback added
 *					after the list has been fired right away with the latest "memorized"
 *					values (like a Deferred)
 *
 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
 *
 *	stopOnFalse:	interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( options ) {

	// Convert options from String-formatted to Object-formatted if needed
	// (we check in cache first)
	options = typeof options === "string" ?
		( optionsCache[ options ] || createOptions( options ) ) :
		jQuery.extend( {}, options );

	var // Last fire value (for non-forgettable lists)
		memory,
		// Flag to know if list was already fired
		fired,
		// Flag to know if list is currently firing
		firing,
		// First callback to fire (used internally by add and fireWith)
		firingStart,
		// End of the loop when firing
		firingLength,
		// Index of currently firing callback (modified by remove if needed)
		firingIndex,
		// Actual callback list
		list = [],
		// Stack of fire calls for repeatable lists
		stack = !options.once && [],
		// Fire callbacks
		fire = function( data ) {
			memory = options.memory && data;
			fired = true;
			firingIndex = firingStart || 0;
			firingStart = 0;
			firingLength = list.length;
			firing = true;
			for ( ; list && firingIndex < firingLength; firingIndex++ ) {
				if ( list[ firingIndex ].apply( data[ 0 ], data[ 1 ] ) === false && options.stopOnFalse ) {
					memory = false; // To prevent further calls using add
					break;
				}
			}
			firing = false;
			if ( list ) {
				if ( stack ) {
					if ( stack.length ) {
						fire( stack.shift() );
					}
				} else if ( memory ) {
					list = [];
				} else {
					self.disable();
				}
			}
		},
		// Actual Callbacks object
		self = {
			// Add a callback or a collection of callbacks to the list
			add: function() {
				if ( list ) {
					// First, we save the current length
					var start = list.length;
					(function add( args ) {
						jQuery.each( args, function( _, arg ) {
							var type = jQuery.type( arg );
							if ( type === "function" ) {
								if ( !options.unique || !self.has( arg ) ) {
									list.push( arg );
								}
							} else if ( arg && arg.length && type !== "string" ) {
								// Inspect recursively
								add( arg );
							}
						});
					})( arguments );
					// Do we need to add the callbacks to the
					// current firing batch?
					if ( firing ) {
						firingLength = list.length;
					// With memory, if we're not firing then
					// we should call right away
					} else if ( memory ) {
						firingStart = start;
						fire( memory );
					}
				}
				return this;
			},
			// Remove a callback from the list
			remove: function() {
				if ( list ) {
					jQuery.each( arguments, function( _, arg ) {
						var index;
						while ( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
							list.splice( index, 1 );
							// Handle firing indexes
							if ( firing ) {
								if ( index <= firingLength ) {
									firingLength--;
								}
								if ( index <= firingIndex ) {
									firingIndex--;
								}
							}
						}
					});
				}
				return this;
			},
			// Check if a given callback is in the list.
			// If no argument is given, return whether or not list has callbacks attached.
			has: function( fn ) {
				return fn ? jQuery.inArray( fn, list ) > -1 : !!( list && list.length );
			},
			// Remove all callbacks from the list
			empty: function() {
				list = [];
				firingLength = 0;
				return this;
			},
			// Have the list do nothing anymore
			disable: function() {
				list = stack = memory = undefined;
				return this;
			},
			// Is it disabled?
			disabled: function() {
				return !list;
			},
			// Lock the list in its current state
			lock: function() {
				stack = undefined;
				if ( !memory ) {
					self.disable();
				}
				return this;
			},
			// Is it locked?
			locked: function() {
				return !stack;
			},
			// Call all callbacks with the given context and arguments
			fireWith: function( context, args ) {
				if ( list && ( !fired || stack ) ) {
					args = args || [];
					args = [ context, args.slice ? args.slice() : args ];
					if ( firing ) {
						stack.push( args );
					} else {
						fire( args );
					}
				}
				return this;
			},
			// Call all the callbacks with the given arguments
			fire: function() {
				self.fireWith( this, arguments );
				return this;
			},
			// To know if the callbacks have already been called at least once
			fired: function() {
				return !!fired;
			}
		};

	return self;
};


jQuery.extend({

	Deferred: function( func ) {
		var tuples = [
				// action, add listener, listener list, final state
				[ "resolve", "done", jQuery.Callbacks("once memory"), "resolved" ],
				[ "reject", "fail", jQuery.Callbacks("once memory"), "rejected" ],
				[ "notify", "progress", jQuery.Callbacks("memory") ]
			],
			state = "pending",
			promise = {
				state: function() {
					return state;
				},
				always: function() {
					deferred.done( arguments ).fail( arguments );
					return this;
				},
				then: function( /* fnDone, fnFail, fnProgress */ ) {
					var fns = arguments;
					return jQuery.Deferred(function( newDefer ) {
						jQuery.each( tuples, function( i, tuple ) {
							var fn = jQuery.isFunction( fns[ i ] ) && fns[ i ];
							// deferred[ done | fail | progress ] for forwarding actions to newDefer
							deferred[ tuple[1] ](function() {
								var returned = fn && fn.apply( this, arguments );
								if ( returned && jQuery.isFunction( returned.promise ) ) {
									returned.promise()
										.done( newDefer.resolve )
										.fail( newDefer.reject )
										.progress( newDefer.notify );
								} else {
									newDefer[ tuple[ 0 ] + "With" ]( this === promise ? newDefer.promise() : this, fn ? [ returned ] : arguments );
								}
							});
						});
						fns = null;
					}).promise();
				},
				// Get a promise for this deferred
				// If obj is provided, the promise aspect is added to the object
				promise: function( obj ) {
					return obj != null ? jQuery.extend( obj, promise ) : promise;
				}
			},
			deferred = {};

		// Keep pipe for back-compat
		promise.pipe = promise.then;

		// Add list-specific methods
		jQuery.each( tuples, function( i, tuple ) {
			var list = tuple[ 2 ],
				stateString = tuple[ 3 ];

			// promise[ done | fail | progress ] = list.add
			promise[ tuple[1] ] = list.add;

			// Handle state
			if ( stateString ) {
				list.add(function() {
					// state = [ resolved | rejected ]
					state = stateString;

				// [ reject_list | resolve_list ].disable; progress_list.lock
				}, tuples[ i ^ 1 ][ 2 ].disable, tuples[ 2 ][ 2 ].lock );
			}

			// deferred[ resolve | reject | notify ]
			deferred[ tuple[0] ] = function() {
				deferred[ tuple[0] + "With" ]( this === deferred ? promise : this, arguments );
				return this;
			};
			deferred[ tuple[0] + "With" ] = list.fireWith;
		});

		// Make the deferred a promise
		promise.promise( deferred );

		// Call given func if any
		if ( func ) {
			func.call( deferred, deferred );
		}

		// All done!
		return deferred;
	},

	// Deferred helper
	when: function( subordinate /* , ..., subordinateN */ ) {
		var i = 0,
			resolveValues = slice.call( arguments ),
			length = resolveValues.length,

			// the count of uncompleted subordinates
			remaining = length !== 1 || ( subordinate && jQuery.isFunction( subordinate.promise ) ) ? length : 0,

			// the master Deferred. If resolveValues consist of only a single Deferred, just use that.
			deferred = remaining === 1 ? subordinate : jQuery.Deferred(),

			// Update function for both resolve and progress values
			updateFunc = function( i, contexts, values ) {
				return function( value ) {
					contexts[ i ] = this;
					values[ i ] = arguments.length > 1 ? slice.call( arguments ) : value;
					if ( values === progressValues ) {
						deferred.notifyWith( contexts, values );
					} else if ( !( --remaining ) ) {
						deferred.resolveWith( contexts, values );
					}
				};
			},

			progressValues, progressContexts, resolveContexts;

		// Add listeners to Deferred subordinates; treat others as resolved
		if ( length > 1 ) {
			progressValues = new Array( length );
			progressContexts = new Array( length );
			resolveContexts = new Array( length );
			for ( ; i < length; i++ ) {
				if ( resolveValues[ i ] && jQuery.isFunction( resolveValues[ i ].promise ) ) {
					resolveValues[ i ].promise()
						.done( updateFunc( i, resolveContexts, resolveValues ) )
						.fail( deferred.reject )
						.progress( updateFunc( i, progressContexts, progressValues ) );
				} else {
					--remaining;
				}
			}
		}

		// If we're not waiting on anything, resolve the master
		if ( !remaining ) {
			deferred.resolveWith( resolveContexts, resolveValues );
		}

		return deferred.promise();
	}
});


// The deferred used on DOM ready
var readyList;

jQuery.fn.ready = function( fn ) {
	// Add the callback
	jQuery.ready.promise().done( fn );

	return this;
};

jQuery.extend({
	// Is the DOM ready to be used? Set to true once it occurs.
	isReady: false,

	// A counter to track how many items to wait for before
	// the ready event fires. See #6781
	readyWait: 1,

	// Hold (or release) the ready event
	holdReady: function( hold ) {
		if ( hold ) {
			jQuery.readyWait++;
		} else {
			jQuery.ready( true );
		}
	},

	// Handle when the DOM is ready
	ready: function( wait ) {

		// Abort if there are pending holds or we're already ready
		if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
			return;
		}

		// Remember that the DOM is ready
		jQuery.isReady = true;

		// If a normal DOM Ready event fired, decrement, and wait if need be
		if ( wait !== true && --jQuery.readyWait > 0 ) {
			return;
		}

		// If there are functions bound, to execute
		readyList.resolveWith( document, [ jQuery ] );

		// Trigger any bound ready events
		if ( jQuery.fn.triggerHandler ) {
			jQuery( document ).triggerHandler( "ready" );
			jQuery( document ).off( "ready" );
		}
	}
});

/**
 * The ready event handler and self cleanup method
 */
function completed() {
	document.removeEventListener( "DOMContentLoaded", completed, false );
	window.removeEventListener( "load", completed, false );
	jQuery.ready();
}

jQuery.ready.promise = function( obj ) {
	if ( !readyList ) {

		readyList = jQuery.Deferred();

		// Catch cases where $(document).ready() is called after the browser event has already occurred.
		// We once tried to use readyState "interactive" here, but it caused issues like the one
		// discovered by ChrisS here: http://bugs.jquery.com/ticket/12282#comment:15
		if ( document.readyState === "complete" ) {
			// Handle it asynchronously to allow scripts the opportunity to delay ready
			setTimeout( jQuery.ready );

		} else {

			// Use the handy event callback
			document.addEventListener( "DOMContentLoaded", completed, false );

			// A fallback to window.onload, that will always work
			window.addEventListener( "load", completed, false );
		}
	}
	return readyList.promise( obj );
};

// Kick off the DOM ready check even if the user does not
jQuery.ready.promise();




// Multifunctional method to get and set values of a collection
// The value/s can optionally be executed if it's a function
var access = jQuery.access = function( elems, fn, key, value, chainable, emptyGet, raw ) {
	var i = 0,
		len = elems.length,
		bulk = key == null;

	// Sets many values
	if ( jQuery.type( key ) === "object" ) {
		chainable = true;
		for ( i in key ) {
			jQuery.access( elems, fn, i, key[i], true, emptyGet, raw );
		}

	// Sets one value
	} else if ( value !== undefined ) {
		chainable = true;

		if ( !jQuery.isFunction( value ) ) {
			raw = true;
		}

		if ( bulk ) {
			// Bulk operations run against the entire set
			if ( raw ) {
				fn.call( elems, value );
				fn = null;

			// ...except when executing function values
			} else {
				bulk = fn;
				fn = function( elem, key, value ) {
					return bulk.call( jQuery( elem ), value );
				};
			}
		}

		if ( fn ) {
			for ( ; i < len; i++ ) {
				fn( elems[i], key, raw ? value : value.call( elems[i], i, fn( elems[i], key ) ) );
			}
		}
	}

	return chainable ?
		elems :

		// Gets
		bulk ?
			fn.call( elems ) :
			len ? fn( elems[0], key ) : emptyGet;
};


/**
 * Determines whether an object can have data
 */
jQuery.acceptData = function( owner ) {
	// Accepts only:
	//  - Node
	//    - Node.ELEMENT_NODE
	//    - Node.DOCUMENT_NODE
	//  - Object
	//    - Any
	/* jshint -W018 */
	return owner.nodeType === 1 || owner.nodeType === 9 || !( +owner.nodeType );
};


function Data() {
	// Support: Android<4,
	// Old WebKit does not have Object.preventExtensions/freeze method,
	// return new empty object instead with no [[set]] accessor
	Object.defineProperty( this.cache = {}, 0, {
		get: function() {
			return {};
		}
	});

	this.expando = jQuery.expando + Data.uid++;
}

Data.uid = 1;
Data.accepts = jQuery.acceptData;

Data.prototype = {
	key: function( owner ) {
		// We can accept data for non-element nodes in modern browsers,
		// but we should not, see #8335.
		// Always return the key for a frozen object.
		if ( !Data.accepts( owner ) ) {
			return 0;
		}

		var descriptor = {},
			// Check if the owner object already has a cache key
			unlock = owner[ this.expando ];

		// If not, create one
		if ( !unlock ) {
			unlock = Data.uid++;

			// Secure it in a non-enumerable, non-writable property
			try {
				descriptor[ this.expando ] = { value: unlock };
				Object.defineProperties( owner, descriptor );

			// Support: Android<4
			// Fallback to a less secure definition
			} catch ( e ) {
				descriptor[ this.expando ] = unlock;
				jQuery.extend( owner, descriptor );
			}
		}

		// Ensure the cache object
		if ( !this.cache[ unlock ] ) {
			this.cache[ unlock ] = {};
		}

		return unlock;
	},
	set: function( owner, data, value ) {
		var prop,
			// There may be an unlock assigned to this node,
			// if there is no entry for this "owner", create one inline
			// and set the unlock as though an owner entry had always existed
			unlock = this.key( owner ),
			cache = this.cache[ unlock ];

		// Handle: [ owner, key, value ] args
		if ( typeof data === "string" ) {
			cache[ data ] = value;

		// Handle: [ owner, { properties } ] args
		} else {
			// Fresh assignments by object are shallow copied
			if ( jQuery.isEmptyObject( cache ) ) {
				jQuery.extend( this.cache[ unlock ], data );
			// Otherwise, copy the properties one-by-one to the cache object
			} else {
				for ( prop in data ) {
					cache[ prop ] = data[ prop ];
				}
			}
		}
		return cache;
	},
	get: function( owner, key ) {
		// Either a valid cache is found, or will be created.
		// New caches will be created and the unlock returned,
		// allowing direct access to the newly created
		// empty data object. A valid owner object must be provided.
		var cache = this.cache[ this.key( owner ) ];

		return key === undefined ?
			cache : cache[ key ];
	},
	access: function( owner, key, value ) {
		var stored;
		// In cases where either:
		//
		//   1. No key was specified
		//   2. A string key was specified, but no value provided
		//
		// Take the "read" path and allow the get method to determine
		// which value to return, respectively either:
		//
		//   1. The entire cache object
		//   2. The data stored at the key
		//
		if ( key === undefined ||
				((key && typeof key === "string") && value === undefined) ) {

			stored = this.get( owner, key );

			return stored !== undefined ?
				stored : this.get( owner, jQuery.camelCase(key) );
		}

		// [*]When the key is not a string, or both a key and value
		// are specified, set or extend (existing objects) with either:
		//
		//   1. An object of properties
		//   2. A key and value
		//
		this.set( owner, key, value );

		// Since the "set" path can have two possible entry points
		// return the expected data based on which path was taken[*]
		return value !== undefined ? value : key;
	},
	remove: function( owner, key ) {
		var i, name, camel,
			unlock = this.key( owner ),
			cache = this.cache[ unlock ];

		if ( key === undefined ) {
			this.cache[ unlock ] = {};

		} else {
			// Support array or space separated string of keys
			if ( jQuery.isArray( key ) ) {
				// If "name" is an array of keys...
				// When data is initially created, via ("key", "val") signature,
				// keys will be converted to camelCase.
				// Since there is no way to tell _how_ a key was added, remove
				// both plain key and camelCase key. #12786
				// This will only penalize the array argument path.
				name = key.concat( key.map( jQuery.camelCase ) );
			} else {
				camel = jQuery.camelCase( key );
				// Try the string as a key before any manipulation
				if ( key in cache ) {
					name = [ key, camel ];
				} else {
					// If a key with the spaces exists, use it.
					// Otherwise, create an array by matching non-whitespace
					name = camel;
					name = name in cache ?
						[ name ] : ( name.match( rnotwhite ) || [] );
				}
			}

			i = name.length;
			while ( i-- ) {
				delete cache[ name[ i ] ];
			}
		}
	},
	hasData: function( owner ) {
		return !jQuery.isEmptyObject(
			this.cache[ owner[ this.expando ] ] || {}
		);
	},
	discard: function( owner ) {
		if ( owner[ this.expando ] ) {
			delete this.cache[ owner[ this.expando ] ];
		}
	}
};
var data_priv = new Data();

var data_user = new Data();



//	Implementation Summary
//
//	1. Enforce API surface and semantic compatibility with 1.9.x branch
//	2. Improve the module's maintainability by reducing the storage
//		paths to a single mechanism.
//	3. Use the same single mechanism to support "private" and "user" data.
//	4. _Never_ expose "private" data to user code (TODO: Drop _data, _removeData)
//	5. Avoid exposing implementation details on user objects (eg. expando properties)
//	6. Provide a clear path for implementation upgrade to WeakMap in 2014

var rbrace = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
	rmultiDash = /([A-Z])/g;

function dataAttr( elem, key, data ) {
	var name;

	// If nothing was found internally, try to fetch any
	// data from the HTML5 data-* attribute
	if ( data === undefined && elem.nodeType === 1 ) {
		name = "data-" + key.replace( rmultiDash, "-$1" ).toLowerCase();
		data = elem.getAttribute( name );

		if ( typeof data === "string" ) {
			try {
				data = data === "true" ? true :
					data === "false" ? false :
					data === "null" ? null :
					// Only convert to a number if it doesn't change the string
					+data + "" === data ? +data :
					rbrace.test( data ) ? jQuery.parseJSON( data ) :
					data;
			} catch( e ) {}

			// Make sure we set the data so it isn't changed later
			data_user.set( elem, key, data );
		} else {
			data = undefined;
		}
	}
	return data;
}

jQuery.extend({
	hasData: function( elem ) {
		return data_user.hasData( elem ) || data_priv.hasData( elem );
	},

	data: function( elem, name, data ) {
		return data_user.access( elem, name, data );
	},

	removeData: function( elem, name ) {
		data_user.remove( elem, name );
	},

	// TODO: Now that all calls to _data and _removeData have been replaced
	// with direct calls to data_priv methods, these can be deprecated.
	_data: function( elem, name, data ) {
		return data_priv.access( elem, name, data );
	},

	_removeData: function( elem, name ) {
		data_priv.remove( elem, name );
	}
});

jQuery.fn.extend({
	data: function( key, value ) {
		var i, name, data,
			elem = this[ 0 ],
			attrs = elem && elem.attributes;

		// Gets all values
		if ( key === undefined ) {
			if ( this.length ) {
				data = data_user.get( elem );

				if ( elem.nodeType === 1 && !data_priv.get( elem, "hasDataAttrs" ) ) {
					i = attrs.length;
					while ( i-- ) {

						// Support: IE11+
						// The attrs elements can be null (#14894)
						if ( attrs[ i ] ) {
							name = attrs[ i ].name;
							if ( name.indexOf( "data-" ) === 0 ) {
								name = jQuery.camelCase( name.slice(5) );
								dataAttr( elem, name, data[ name ] );
							}
						}
					}
					data_priv.set( elem, "hasDataAttrs", true );
				}
			}

			return data;
		}

		// Sets multiple values
		if ( typeof key === "object" ) {
			return this.each(function() {
				data_user.set( this, key );
			});
		}

		return access( this, function( value ) {
			var data,
				camelKey = jQuery.camelCase( key );

			// The calling jQuery object (element matches) is not empty
			// (and therefore has an element appears at this[ 0 ]) and the
			// `value` parameter was not undefined. An empty jQuery object
			// will result in `undefined` for elem = this[ 0 ] which will
			// throw an exception if an attempt to read a data cache is made.
			if ( elem && value === undefined ) {
				// Attempt to get data from the cache
				// with the key as-is
				data = data_user.get( elem, key );
				if ( data !== undefined ) {
					return data;
				}

				// Attempt to get data from the cache
				// with the key camelized
				data = data_user.get( elem, camelKey );
				if ( data !== undefined ) {
					return data;
				}

				// Attempt to "discover" the data in
				// HTML5 custom data-* attrs
				data = dataAttr( elem, camelKey, undefined );
				if ( data !== undefined ) {
					return data;
				}

				// We tried really hard, but the data doesn't exist.
				return;
			}

			// Set the data...
			this.each(function() {
				// First, attempt to store a copy or reference of any
				// data that might've been store with a camelCased key.
				var data = data_user.get( this, camelKey );

				// For HTML5 data-* attribute interop, we have to
				// store property names with dashes in a camelCase form.
				// This might not apply to all properties...*
				data_user.set( this, camelKey, value );

				// *... In the case of properties that might _actually_
				// have dashes, we need to also store a copy of that
				// unchanged property.
				if ( key.indexOf("-") !== -1 && data !== undefined ) {
					data_user.set( this, key, value );
				}
			});
		}, null, value, arguments.length > 1, null, true );
	},

	removeData: function( key ) {
		return this.each(function() {
			data_user.remove( this, key );
		});
	}
});


jQuery.extend({
	queue: function( elem, type, data ) {
		var queue;

		if ( elem ) {
			type = ( type || "fx" ) + "queue";
			queue = data_priv.get( elem, type );

			// Speed up dequeue by getting out quickly if this is just a lookup
			if ( data ) {
				if ( !queue || jQuery.isArray( data ) ) {
					queue = data_priv.access( elem, type, jQuery.makeArray(data) );
				} else {
					queue.push( data );
				}
			}
			return queue || [];
		}
	},

	dequeue: function( elem, type ) {
		type = type || "fx";

		var queue = jQuery.queue( elem, type ),
			startLength = queue.length,
			fn = queue.shift(),
			hooks = jQuery._queueHooks( elem, type ),
			next = function() {
				jQuery.dequeue( elem, type );
			};

		// If the fx queue is dequeued, always remove the progress sentinel
		if ( fn === "inprogress" ) {
			fn = queue.shift();
			startLength--;
		}

		if ( fn ) {

			// Add a progress sentinel to prevent the fx queue from being
			// automatically dequeued
			if ( type === "fx" ) {
				queue.unshift( "inprogress" );
			}

			// Clear up the last queue stop function
			delete hooks.stop;
			fn.call( elem, next, hooks );
		}

		if ( !startLength && hooks ) {
			hooks.empty.fire();
		}
	},

	// Not public - generate a queueHooks object, or return the current one
	_queueHooks: function( elem, type ) {
		var key = type + "queueHooks";
		return data_priv.get( elem, key ) || data_priv.access( elem, key, {
			empty: jQuery.Callbacks("once memory").add(function() {
				data_priv.remove( elem, [ type + "queue", key ] );
			})
		});
	}
});

jQuery.fn.extend({
	queue: function( type, data ) {
		var setter = 2;

		if ( typeof type !== "string" ) {
			data = type;
			type = "fx";
			setter--;
		}

		if ( arguments.length < setter ) {
			return jQuery.queue( this[0], type );
		}

		return data === undefined ?
			this :
			this.each(function() {
				var queue = jQuery.queue( this, type, data );

				// Ensure a hooks for this queue
				jQuery._queueHooks( this, type );

				if ( type === "fx" && queue[0] !== "inprogress" ) {
					jQuery.dequeue( this, type );
				}
			});
	},
	dequeue: function( type ) {
		return this.each(function() {
			jQuery.dequeue( this, type );
		});
	},
	clearQueue: function( type ) {
		return this.queue( type || "fx", [] );
	},
	// Get a promise resolved when queues of a certain type
	// are emptied (fx is the type by default)
	promise: function( type, obj ) {
		var tmp,
			count = 1,
			defer = jQuery.Deferred(),
			elements = this,
			i = this.length,
			resolve = function() {
				if ( !( --count ) ) {
					defer.resolveWith( elements, [ elements ] );
				}
			};

		if ( typeof type !== "string" ) {
			obj = type;
			type = undefined;
		}
		type = type || "fx";

		while ( i-- ) {
			tmp = data_priv.get( elements[ i ], type + "queueHooks" );
			if ( tmp && tmp.empty ) {
				count++;
				tmp.empty.add( resolve );
			}
		}
		resolve();
		return defer.promise( obj );
	}
});
var pnum = (/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/).source;

var cssExpand = [ "Top", "Right", "Bottom", "Left" ];

var isHidden = function( elem, el ) {
		// isHidden might be called from jQuery#filter function;
		// in that case, element will be second argument
		elem = el || elem;
		return jQuery.css( elem, "display" ) === "none" || !jQuery.contains( elem.ownerDocument, elem );
	};

var rcheckableType = (/^(?:checkbox|radio)$/i);



(function() {
	var fragment = document.createDocumentFragment(),
		div = fragment.appendChild( document.createElement( "div" ) ),
		input = document.createElement( "input" );

	// Support: Safari<=5.1
	// Check state lost if the name is set (#11217)
	// Support: Windows Web Apps (WWA)
	// `name` and `type` must use .setAttribute for WWA (#14901)
	input.setAttribute( "type", "radio" );
	input.setAttribute( "checked", "checked" );
	input.setAttribute( "name", "t" );

	div.appendChild( input );

	// Support: Safari<=5.1, Android<4.2
	// Older WebKit doesn't clone checked state correctly in fragments
	support.checkClone = div.cloneNode( true ).cloneNode( true ).lastChild.checked;

	// Support: IE<=11+
	// Make sure textarea (and checkbox) defaultValue is properly cloned
	div.innerHTML = "<textarea>x</textarea>";
	support.noCloneChecked = !!div.cloneNode( true ).lastChild.defaultValue;
})();
var strundefined = typeof undefined;



support.focusinBubbles = "onfocusin" in window;


var
	rkeyEvent = /^key/,
	rmouseEvent = /^(?:mouse|pointer|contextmenu)|click/,
	rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	rtypenamespace = /^([^.]*)(?:\.(.+)|)$/;

function returnTrue() {
	return true;
}

function returnFalse() {
	return false;
}

function safeActiveElement() {
	try {
		return document.activeElement;
	} catch ( err ) { }
}

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	global: {},

	add: function( elem, types, handler, data, selector ) {

		var handleObjIn, eventHandle, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = data_priv.get( elem );

		// Don't attach events to noData or text/comment nodes (but allow plain objects)
		if ( !elemData ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure and main handler, if this is the first
		if ( !(events = elemData.events) ) {
			events = elemData.events = {};
		}
		if ( !(eventHandle = elemData.handle) ) {
			eventHandle = elemData.handle = function( e ) {
				// Discard the second event of a jQuery.event.trigger() and
				// when an event is called after a page has unloaded
				return typeof jQuery !== strundefined && jQuery.event.triggered !== e.type ?
					jQuery.event.dispatch.apply( elem, arguments ) : undefined;
			};
		}

		// Handle multiple events separated by a space
		types = ( types || "" ).match( rnotwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// There *must* be a type, no attaching namespace-only handlers
			if ( !type ) {
				continue;
			}

			// If event changes its type, use the special event handlers for the changed type
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend({
				type: type,
				origType: origType,
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join(".")
			}, handleObjIn );

			// Init the event handler queue if we're the first
			if ( !(handlers = events[ type ]) ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Only use addEventListener if the special events handler returns false
				if ( !special.setup || special.setup.call( elem, data, namespaces, eventHandle ) === false ) {
					if ( elem.addEventListener ) {
						elem.addEventListener( type, eventHandle, false );
					}
				}
			}

			if ( special.add ) {
				special.add.call( elem, handleObj );

				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}

			// Keep track of which events have ever been used, for event optimization
			jQuery.event.global[ type ] = true;
		}

	},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {

		var j, origCount, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = data_priv.hasData( elem ) && data_priv.get( elem );

		if ( !elemData || !(events = elemData.events) ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = ( types || "" ).match( rnotwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector ? special.delegateType : special.bindType ) || type;
			handlers = events[ type ] || [];
			tmp = tmp[2] && new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" );

			// Remove matching events
			origCount = j = handlers.length;
			while ( j-- ) {
				handleObj = handlers[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					( !handler || handler.guid === handleObj.guid ) &&
					( !tmp || tmp.test( handleObj.namespace ) ) &&
					( !selector || selector === handleObj.selector || selector === "**" && handleObj.selector ) ) {
					handlers.splice( j, 1 );

					if ( handleObj.selector ) {
						handlers.delegateCount--;
					}
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist
			// (avoids potential for endless recursion during removal of special event handlers)
			if ( origCount && !handlers.length ) {
				if ( !special.teardown || special.teardown.call( elem, namespaces, elemData.handle ) === false ) {
					jQuery.removeEvent( elem, type, elemData.handle );
				}

				delete events[ type ];
			}
		}

		// Remove the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			delete elemData.handle;
			data_priv.remove( elem, "events" );
		}
	},

	trigger: function( event, data, elem, onlyHandlers ) {

		var i, cur, tmp, bubbleType, ontype, handle, special,
			eventPath = [ elem || document ],
			type = hasOwn.call( event, "type" ) ? event.type : event,
			namespaces = hasOwn.call( event, "namespace" ) ? event.namespace.split(".") : [];

		cur = tmp = elem = elem || document;

		// Don't do events on text and comment nodes
		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
			return;
		}

		// focus/blur morphs to focusin/out; ensure we're not firing them right now
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf(".") >= 0 ) {
			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split(".");
			type = namespaces.shift();
			namespaces.sort();
		}
		ontype = type.indexOf(":") < 0 && "on" + type;

		// Caller can pass in a jQuery.Event object, Object, or just an event type string
		event = event[ jQuery.expando ] ?
			event :
			new jQuery.Event( type, typeof event === "object" && event );

		// Trigger bitmask: & 1 for native handlers; & 2 for jQuery (always true)
		event.isTrigger = onlyHandlers ? 2 : 3;
		event.namespace = namespaces.join(".");
		event.namespace_re = event.namespace ?
			new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" ) :
			null;

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data == null ?
			[ event ] :
			jQuery.makeArray( data, [ event ] );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (#9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
		if ( !onlyHandlers && !special.noBubble && !jQuery.isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			if ( !rfocusMorph.test( bubbleType + type ) ) {
				cur = cur.parentNode;
			}
			for ( ; cur; cur = cur.parentNode ) {
				eventPath.push( cur );
				tmp = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( tmp === (elem.ownerDocument || document) ) {
				eventPath.push( tmp.defaultView || tmp.parentWindow || window );
			}
		}

		// Fire handlers on the event path
		i = 0;
		while ( (cur = eventPath[i++]) && !event.isPropagationStopped() ) {

			event.type = i > 1 ?
				bubbleType :
				special.bindType || type;

			// jQuery handler
			handle = ( data_priv.get( cur, "events" ) || {} )[ event.type ] && data_priv.get( cur, "handle" );
			if ( handle ) {
				handle.apply( cur, data );
			}

			// Native handler
			handle = ontype && cur[ ontype ];
			if ( handle && handle.apply && jQuery.acceptData( cur ) ) {
				event.result = handle.apply( cur, data );
				if ( event.result === false ) {
					event.preventDefault();
				}
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( (!special._default || special._default.apply( eventPath.pop(), data ) === false) &&
				jQuery.acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name name as the event.
				// Don't do default actions on window, that's where global variables be (#6170)
				if ( ontype && jQuery.isFunction( elem[ type ] ) && !jQuery.isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					tmp = elem[ ontype ];

					if ( tmp ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above
					jQuery.event.triggered = type;
					elem[ type ]();
					jQuery.event.triggered = undefined;

					if ( tmp ) {
						elem[ ontype ] = tmp;
					}
				}
			}
		}

		return event.result;
	},

	dispatch: function( event ) {

		// Make a writable jQuery.Event from the native event object
		event = jQuery.event.fix( event );

		var i, j, ret, matched, handleObj,
			handlerQueue = [],
			args = slice.call( arguments ),
			handlers = ( data_priv.get( this, "events" ) || {} )[ event.type ] || [],
			special = jQuery.event.special[ event.type ] || {};

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[0] = event;
		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers
		handlerQueue = jQuery.event.handlers.call( this, event, handlers );

		// Run delegates first; they may want to stop propagation beneath us
		i = 0;
		while ( (matched = handlerQueue[ i++ ]) && !event.isPropagationStopped() ) {
			event.currentTarget = matched.elem;

			j = 0;
			while ( (handleObj = matched.handlers[ j++ ]) && !event.isImmediatePropagationStopped() ) {

				// Triggered event must either 1) have no namespace, or 2) have namespace(s)
				// a subset or equal to those in the bound event (both can have no namespace).
				if ( !event.namespace_re || event.namespace_re.test( handleObj.namespace ) ) {

					event.handleObj = handleObj;
					event.data = handleObj.data;

					ret = ( (jQuery.event.special[ handleObj.origType ] || {}).handle || handleObj.handler )
							.apply( matched.elem, args );

					if ( ret !== undefined ) {
						if ( (event.result = ret) === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	handlers: function( event, handlers ) {
		var i, matches, sel, handleObj,
			handlerQueue = [],
			delegateCount = handlers.delegateCount,
			cur = event.target;

		// Find delegate handlers
		// Black-hole SVG <use> instance trees (#13180)
		// Avoid non-left-click bubbling in Firefox (#3861)
		if ( delegateCount && cur.nodeType && (!event.button || event.type !== "click") ) {

			for ( ; cur !== this; cur = cur.parentNode || this ) {

				// Don't process clicks on disabled elements (#6911, #8165, #11382, #11764)
				if ( cur.disabled !== true || event.type !== "click" ) {
					matches = [];
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];

						// Don't conflict with Object.prototype properties (#13203)
						sel = handleObj.selector + " ";

						if ( matches[ sel ] === undefined ) {
							matches[ sel ] = handleObj.needsContext ?
								jQuery( sel, this ).index( cur ) >= 0 :
								jQuery.find( sel, this, null, [ cur ] ).length;
						}
						if ( matches[ sel ] ) {
							matches.push( handleObj );
						}
					}
					if ( matches.length ) {
						handlerQueue.push({ elem: cur, handlers: matches });
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		if ( delegateCount < handlers.length ) {
			handlerQueue.push({ elem: this, handlers: handlers.slice( delegateCount ) });
		}

		return handlerQueue;
	},

	// Includes some event props shared by KeyEvent and MouseEvent
	props: "altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),

	fixHooks: {},

	keyHooks: {
		props: "char charCode key keyCode".split(" "),
		filter: function( event, original ) {

			// Add which for key events
			if ( event.which == null ) {
				event.which = original.charCode != null ? original.charCode : original.keyCode;
			}

			return event;
		}
	},

	mouseHooks: {
		props: "button buttons clientX clientY offsetX offsetY pageX pageY screenX screenY toElement".split(" "),
		filter: function( event, original ) {
			var eventDoc, doc, body,
				button = original.button;

			// Calculate pageX/Y if missing and clientX/Y available
			if ( event.pageX == null && original.clientX != null ) {
				eventDoc = event.target.ownerDocument || document;
				doc = eventDoc.documentElement;
				body = eventDoc.body;

				event.pageX = original.clientX + ( doc && doc.scrollLeft || body && body.scrollLeft || 0 ) - ( doc && doc.clientLeft || body && body.clientLeft || 0 );
				event.pageY = original.clientY + ( doc && doc.scrollTop  || body && body.scrollTop  || 0 ) - ( doc && doc.clientTop  || body && body.clientTop  || 0 );
			}

			// Add which for click: 1 === left; 2 === middle; 3 === right
			// Note: button is not normalized, so don't use it
			if ( !event.which && button !== undefined ) {
				event.which = ( button & 1 ? 1 : ( button & 2 ? 3 : ( button & 4 ? 2 : 0 ) ) );
			}

			return event;
		}
	},

	fix: function( event ) {
		if ( event[ jQuery.expando ] ) {
			return event;
		}

		// Create a writable copy of the event object and normalize some properties
		var i, prop, copy,
			type = event.type,
			originalEvent = event,
			fixHook = this.fixHooks[ type ];

		if ( !fixHook ) {
			this.fixHooks[ type ] = fixHook =
				rmouseEvent.test( type ) ? this.mouseHooks :
				rkeyEvent.test( type ) ? this.keyHooks :
				{};
		}
		copy = fixHook.props ? this.props.concat( fixHook.props ) : this.props;

		event = new jQuery.Event( originalEvent );

		i = copy.length;
		while ( i-- ) {
			prop = copy[ i ];
			event[ prop ] = originalEvent[ prop ];
		}

		// Support: Cordova 2.5 (WebKit) (#13255)
		// All events should have a target; Cordova deviceready doesn't
		if ( !event.target ) {
			event.target = document;
		}

		// Support: Safari 6.0+, Chrome<28
		// Target should not be a text node (#504, #13143)
		if ( event.target.nodeType === 3 ) {
			event.target = event.target.parentNode;
		}

		return fixHook.filter ? fixHook.filter( event, originalEvent ) : event;
	},

	special: {
		load: {
			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},
		focus: {
			// Fire native event if possible so blur/focus sequence is correct
			trigger: function() {
				if ( this !== safeActiveElement() && this.focus ) {
					this.focus();
					return false;
				}
			},
			delegateType: "focusin"
		},
		blur: {
			trigger: function() {
				if ( this === safeActiveElement() && this.blur ) {
					this.blur();
					return false;
				}
			},
			delegateType: "focusout"
		},
		click: {
			// For checkbox, fire native event so checked state will be right
			trigger: function() {
				if ( this.type === "checkbox" && this.click && jQuery.nodeName( this, "input" ) ) {
					this.click();
					return false;
				}
			},

			// For cross-browser consistency, don't fire native .click() on links
			_default: function( event ) {
				return jQuery.nodeName( event.target, "a" );
			}
		},

		beforeunload: {
			postDispatch: function( event ) {

				// Support: Firefox 20+
				// Firefox doesn't alert if the returnValue field is not set.
				if ( event.result !== undefined && event.originalEvent ) {
					event.originalEvent.returnValue = event.result;
				}
			}
		}
	},

	simulate: function( type, elem, event, bubble ) {
		// Piggyback on a donor event to simulate a different one.
		// Fake originalEvent to avoid donor's stopPropagation, but if the
		// simulated event prevents default then we do the same on the donor.
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{
				type: type,
				isSimulated: true,
				originalEvent: {}
			}
		);
		if ( bubble ) {
			jQuery.event.trigger( e, null, elem );
		} else {
			jQuery.event.dispatch.call( elem, e );
		}
		if ( e.isDefaultPrevented() ) {
			event.preventDefault();
		}
	}
};

jQuery.removeEvent = function( elem, type, handle ) {
	if ( elem.removeEventListener ) {
		elem.removeEventListener( type, handle, false );
	}
};

jQuery.Event = function( src, props ) {
	// Allow instantiation without the 'new' keyword
	if ( !(this instanceof jQuery.Event) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = src.defaultPrevented ||
				src.defaultPrevented === undefined &&
				// Support: Android<4.0
				src.returnValue === false ?
			returnTrue :
			returnFalse;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || jQuery.now();

	// Mark it as fixed
	this[ jQuery.expando ] = true;
};

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// http://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
	isDefaultPrevented: returnFalse,
	isPropagationStopped: returnFalse,
	isImmediatePropagationStopped: returnFalse,

	preventDefault: function() {
		var e = this.originalEvent;

		this.isDefaultPrevented = returnTrue;

		if ( e && e.preventDefault ) {
			e.preventDefault();
		}
	},
	stopPropagation: function() {
		var e = this.originalEvent;

		this.isPropagationStopped = returnTrue;

		if ( e && e.stopPropagation ) {
			e.stopPropagation();
		}
	},
	stopImmediatePropagation: function() {
		var e = this.originalEvent;

		this.isImmediatePropagationStopped = returnTrue;

		if ( e && e.stopImmediatePropagation ) {
			e.stopImmediatePropagation();
		}

		this.stopPropagation();
	}
};

// Create mouseenter/leave events using mouseover/out and event-time checks
// Support: Chrome 15+
jQuery.each({
	mouseenter: "mouseover",
	mouseleave: "mouseout",
	pointerenter: "pointerover",
	pointerleave: "pointerout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		handle: function( event ) {
			var ret,
				target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj;

			// For mousenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || (related !== target && !jQuery.contains( target, related )) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
});

// Support: Firefox, Chrome, Safari
// Create "bubbling" focus and blur events
if ( !support.focusinBubbles ) {
	jQuery.each({ focus: "focusin", blur: "focusout" }, function( orig, fix ) {

		// Attach a single capturing handler on the document while someone wants focusin/focusout
		var handler = function( event ) {
				jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ), true );
			};

		jQuery.event.special[ fix ] = {
			setup: function() {
				var doc = this.ownerDocument || this,
					attaches = data_priv.access( doc, fix );

				if ( !attaches ) {
					doc.addEventListener( orig, handler, true );
				}
				data_priv.access( doc, fix, ( attaches || 0 ) + 1 );
			},
			teardown: function() {
				var doc = this.ownerDocument || this,
					attaches = data_priv.access( doc, fix ) - 1;

				if ( !attaches ) {
					doc.removeEventListener( orig, handler, true );
					data_priv.remove( doc, fix );

				} else {
					data_priv.access( doc, fix, attaches );
				}
			}
		};
	});
}

jQuery.fn.extend({

	on: function( types, selector, data, fn, /*INTERNAL*/ one ) {
		var origFn, type;

		// Types can be a map of types/handlers
		if ( typeof types === "object" ) {
			// ( types-Object, selector, data )
			if ( typeof selector !== "string" ) {
				// ( types-Object, data )
				data = data || selector;
				selector = undefined;
			}
			for ( type in types ) {
				this.on( type, selector, data, types[ type ], one );
			}
			return this;
		}

		if ( data == null && fn == null ) {
			// ( types, fn )
			fn = selector;
			data = selector = undefined;
		} else if ( fn == null ) {
			if ( typeof selector === "string" ) {
				// ( types, selector, fn )
				fn = data;
				data = undefined;
			} else {
				// ( types, data, fn )
				fn = data;
				data = selector;
				selector = undefined;
			}
		}
		if ( fn === false ) {
			fn = returnFalse;
		} else if ( !fn ) {
			return this;
		}

		if ( one === 1 ) {
			origFn = fn;
			fn = function( event ) {
				// Can use an empty set, since event contains the info
				jQuery().off( event );
				return origFn.apply( this, arguments );
			};
			// Use same guid so caller can remove using origFn
			fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
		}
		return this.each( function() {
			jQuery.event.add( this, types, fn, data, selector );
		});
	},
	one: function( types, selector, data, fn ) {
		return this.on( types, selector, data, fn, 1 );
	},
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {
			// ( event )  dispatched jQuery.Event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ? handleObj.origType + "." + handleObj.namespace : handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {
			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {
			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each(function() {
			jQuery.event.remove( this, types, fn, selector );
		});
	},

	trigger: function( type, data ) {
		return this.each(function() {
			jQuery.event.trigger( type, data, this );
		});
	},
	triggerHandler: function( type, data ) {
		var elem = this[0];
		if ( elem ) {
			return jQuery.event.trigger( type, data, elem, true );
		}
	}
});


var
	rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,
	rtagName = /<([\w:]+)/,
	rhtml = /<|&#?\w+;/,
	rnoInnerhtml = /<(?:script|style|link)/i,
	// checked="checked" or checked
	rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
	rscriptType = /^$|\/(?:java|ecma)script/i,
	rscriptTypeMasked = /^true\/(.*)/,
	rcleanScript = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,

	// We have to close these tags to support XHTML (#13200)
	wrapMap = {

		// Support: IE9
		option: [ 1, "<select multiple='multiple'>", "</select>" ],

		thead: [ 1, "<table>", "</table>" ],
		col: [ 2, "<table><colgroup>", "</colgroup></table>" ],
		tr: [ 2, "<table><tbody>", "</tbody></table>" ],
		td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],

		_default: [ 0, "", "" ]
	};

// Support: IE9
wrapMap.optgroup = wrapMap.option;

wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;

// Support: 1.x compatibility
// Manipulating tables requires a tbody
function manipulationTarget( elem, content ) {
	return jQuery.nodeName( elem, "table" ) &&
		jQuery.nodeName( content.nodeType !== 11 ? content : content.firstChild, "tr" ) ?

		elem.getElementsByTagName("tbody")[0] ||
			elem.appendChild( elem.ownerDocument.createElement("tbody") ) :
		elem;
}

// Replace/restore the type attribute of script elements for safe DOM manipulation
function disableScript( elem ) {
	elem.type = (elem.getAttribute("type") !== null) + "/" + elem.type;
	return elem;
}
function restoreScript( elem ) {
	var match = rscriptTypeMasked.exec( elem.type );

	if ( match ) {
		elem.type = match[ 1 ];
	} else {
		elem.removeAttribute("type");
	}

	return elem;
}

// Mark scripts as having already been evaluated
function setGlobalEval( elems, refElements ) {
	var i = 0,
		l = elems.length;

	for ( ; i < l; i++ ) {
		data_priv.set(
			elems[ i ], "globalEval", !refElements || data_priv.get( refElements[ i ], "globalEval" )
		);
	}
}

function cloneCopyEvent( src, dest ) {
	var i, l, type, pdataOld, pdataCur, udataOld, udataCur, events;

	if ( dest.nodeType !== 1 ) {
		return;
	}

	// 1. Copy private data: events, handlers, etc.
	if ( data_priv.hasData( src ) ) {
		pdataOld = data_priv.access( src );
		pdataCur = data_priv.set( dest, pdataOld );
		events = pdataOld.events;

		if ( events ) {
			delete pdataCur.handle;
			pdataCur.events = {};

			for ( type in events ) {
				for ( i = 0, l = events[ type ].length; i < l; i++ ) {
					jQuery.event.add( dest, type, events[ type ][ i ] );
				}
			}
		}
	}

	// 2. Copy user data
	if ( data_user.hasData( src ) ) {
		udataOld = data_user.access( src );
		udataCur = jQuery.extend( {}, udataOld );

		data_user.set( dest, udataCur );
	}
}

function getAll( context, tag ) {
	var ret = context.getElementsByTagName ? context.getElementsByTagName( tag || "*" ) :
			context.querySelectorAll ? context.querySelectorAll( tag || "*" ) :
			[];

	return tag === undefined || tag && jQuery.nodeName( context, tag ) ?
		jQuery.merge( [ context ], ret ) :
		ret;
}

// Fix IE bugs, see support tests
function fixInput( src, dest ) {
	var nodeName = dest.nodeName.toLowerCase();

	// Fails to persist the checked state of a cloned checkbox or radio button.
	if ( nodeName === "input" && rcheckableType.test( src.type ) ) {
		dest.checked = src.checked;

	// Fails to return the selected option to the default selected state when cloning options
	} else if ( nodeName === "input" || nodeName === "textarea" ) {
		dest.defaultValue = src.defaultValue;
	}
}

jQuery.extend({
	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var i, l, srcElements, destElements,
			clone = elem.cloneNode( true ),
			inPage = jQuery.contains( elem.ownerDocument, elem );

		// Fix IE cloning issues
		if ( !support.noCloneChecked && ( elem.nodeType === 1 || elem.nodeType === 11 ) &&
				!jQuery.isXMLDoc( elem ) ) {

			// We eschew Sizzle here for performance reasons: http://jsperf.com/getall-vs-sizzle/2
			destElements = getAll( clone );
			srcElements = getAll( elem );

			for ( i = 0, l = srcElements.length; i < l; i++ ) {
				fixInput( srcElements[ i ], destElements[ i ] );
			}
		}

		// Copy the events from the original to the clone
		if ( dataAndEvents ) {
			if ( deepDataAndEvents ) {
				srcElements = srcElements || getAll( elem );
				destElements = destElements || getAll( clone );

				for ( i = 0, l = srcElements.length; i < l; i++ ) {
					cloneCopyEvent( srcElements[ i ], destElements[ i ] );
				}
			} else {
				cloneCopyEvent( elem, clone );
			}
		}

		// Preserve script evaluation history
		destElements = getAll( clone, "script" );
		if ( destElements.length > 0 ) {
			setGlobalEval( destElements, !inPage && getAll( elem, "script" ) );
		}

		// Return the cloned set
		return clone;
	},

	buildFragment: function( elems, context, scripts, selection ) {
		var elem, tmp, tag, wrap, contains, j,
			fragment = context.createDocumentFragment(),
			nodes = [],
			i = 0,
			l = elems.length;

		for ( ; i < l; i++ ) {
			elem = elems[ i ];

			if ( elem || elem === 0 ) {

				// Add nodes directly
				if ( jQuery.type( elem ) === "object" ) {
					// Support: QtWebKit, PhantomJS
					// push.apply(_, arraylike) throws on ancient WebKit
					jQuery.merge( nodes, elem.nodeType ? [ elem ] : elem );

				// Convert non-html into a text node
				} else if ( !rhtml.test( elem ) ) {
					nodes.push( context.createTextNode( elem ) );

				// Convert html into DOM nodes
				} else {
					tmp = tmp || fragment.appendChild( context.createElement("div") );

					// Deserialize a standard representation
					tag = ( rtagName.exec( elem ) || [ "", "" ] )[ 1 ].toLowerCase();
					wrap = wrapMap[ tag ] || wrapMap._default;
					tmp.innerHTML = wrap[ 1 ] + elem.replace( rxhtmlTag, "<$1></$2>" ) + wrap[ 2 ];

					// Descend through wrappers to the right content
					j = wrap[ 0 ];
					while ( j-- ) {
						tmp = tmp.lastChild;
					}

					// Support: QtWebKit, PhantomJS
					// push.apply(_, arraylike) throws on ancient WebKit
					jQuery.merge( nodes, tmp.childNodes );

					// Remember the top-level container
					tmp = fragment.firstChild;

					// Ensure the created nodes are orphaned (#12392)
					tmp.textContent = "";
				}
			}
		}

		// Remove wrapper from fragment
		fragment.textContent = "";

		i = 0;
		while ( (elem = nodes[ i++ ]) ) {

			// #4087 - If origin and destination elements are the same, and this is
			// that element, do not do anything
			if ( selection && jQuery.inArray( elem, selection ) !== -1 ) {
				continue;
			}

			contains = jQuery.contains( elem.ownerDocument, elem );

			// Append to fragment
			tmp = getAll( fragment.appendChild( elem ), "script" );

			// Preserve script evaluation history
			if ( contains ) {
				setGlobalEval( tmp );
			}

			// Capture executables
			if ( scripts ) {
				j = 0;
				while ( (elem = tmp[ j++ ]) ) {
					if ( rscriptType.test( elem.type || "" ) ) {
						scripts.push( elem );
					}
				}
			}
		}

		return fragment;
	},

	cleanData: function( elems ) {
		var data, elem, type, key,
			special = jQuery.event.special,
			i = 0;

		for ( ; (elem = elems[ i ]) !== undefined; i++ ) {
			if ( jQuery.acceptData( elem ) ) {
				key = elem[ data_priv.expando ];

				if ( key && (data = data_priv.cache[ key ]) ) {
					if ( data.events ) {
						for ( type in data.events ) {
							if ( special[ type ] ) {
								jQuery.event.remove( elem, type );

							// This is a shortcut to avoid jQuery.event.remove's overhead
							} else {
								jQuery.removeEvent( elem, type, data.handle );
							}
						}
					}
					if ( data_priv.cache[ key ] ) {
						// Discard any remaining `private` data
						delete data_priv.cache[ key ];
					}
				}
			}
			// Discard any remaining `user` data
			delete data_user.cache[ elem[ data_user.expando ] ];
		}
	}
});

jQuery.fn.extend({
	text: function( value ) {
		return access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().each(function() {
					if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
						this.textContent = value;
					}
				});
		}, null, value, arguments.length );
	},

	append: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.appendChild( elem );
			}
		});
	},

	prepend: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.insertBefore( elem, target.firstChild );
			}
		});
	},

	before: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this );
			}
		});
	},

	after: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this.nextSibling );
			}
		});
	},

	remove: function( selector, keepData /* Internal Use Only */ ) {
		var elem,
			elems = selector ? jQuery.filter( selector, this ) : this,
			i = 0;

		for ( ; (elem = elems[i]) != null; i++ ) {
			if ( !keepData && elem.nodeType === 1 ) {
				jQuery.cleanData( getAll( elem ) );
			}

			if ( elem.parentNode ) {
				if ( keepData && jQuery.contains( elem.ownerDocument, elem ) ) {
					setGlobalEval( getAll( elem, "script" ) );
				}
				elem.parentNode.removeChild( elem );
			}
		}

		return this;
	},

	empty: function() {
		var elem,
			i = 0;

		for ( ; (elem = this[i]) != null; i++ ) {
			if ( elem.nodeType === 1 ) {

				// Prevent memory leaks
				jQuery.cleanData( getAll( elem, false ) );

				// Remove any remaining nodes
				elem.textContent = "";
			}
		}

		return this;
	},

	clone: function( dataAndEvents, deepDataAndEvents ) {
		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

		return this.map(function() {
			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
		});
	},

	html: function( value ) {
		return access( this, function( value ) {
			var elem = this[ 0 ] || {},
				i = 0,
				l = this.length;

			if ( value === undefined && elem.nodeType === 1 ) {
				return elem.innerHTML;
			}

			// See if we can take a shortcut and just use innerHTML
			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				!wrapMap[ ( rtagName.exec( value ) || [ "", "" ] )[ 1 ].toLowerCase() ] ) {

				value = value.replace( rxhtmlTag, "<$1></$2>" );

				try {
					for ( ; i < l; i++ ) {
						elem = this[ i ] || {};

						// Remove element nodes and prevent memory leaks
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( getAll( elem, false ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch( e ) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
	},

	replaceWith: function() {
		var arg = arguments[ 0 ];

		// Make the changes, replacing each context element with the new content
		this.domManip( arguments, function( elem ) {
			arg = this.parentNode;

			jQuery.cleanData( getAll( this ) );

			if ( arg ) {
				arg.replaceChild( elem, this );
			}
		});

		// Force removal if there was no new content (e.g., from empty arguments)
		return arg && (arg.length || arg.nodeType) ? this : this.remove();
	},

	detach: function( selector ) {
		return this.remove( selector, true );
	},

	domManip: function( args, callback ) {

		// Flatten any nested arrays
		args = concat.apply( [], args );

		var fragment, first, scripts, hasScripts, node, doc,
			i = 0,
			l = this.length,
			set = this,
			iNoClone = l - 1,
			value = args[ 0 ],
			isFunction = jQuery.isFunction( value );

		// We can't cloneNode fragments that contain checked, in WebKit
		if ( isFunction ||
				( l > 1 && typeof value === "string" &&
					!support.checkClone && rchecked.test( value ) ) ) {
			return this.each(function( index ) {
				var self = set.eq( index );
				if ( isFunction ) {
					args[ 0 ] = value.call( this, index, self.html() );
				}
				self.domManip( args, callback );
			});
		}

		if ( l ) {
			fragment = jQuery.buildFragment( args, this[ 0 ].ownerDocument, false, this );
			first = fragment.firstChild;

			if ( fragment.childNodes.length === 1 ) {
				fragment = first;
			}

			if ( first ) {
				scripts = jQuery.map( getAll( fragment, "script" ), disableScript );
				hasScripts = scripts.length;

				// Use the original fragment for the last item instead of the first because it can end up
				// being emptied incorrectly in certain situations (#8070).
				for ( ; i < l; i++ ) {
					node = fragment;

					if ( i !== iNoClone ) {
						node = jQuery.clone( node, true, true );

						// Keep references to cloned scripts for later restoration
						if ( hasScripts ) {
							// Support: QtWebKit
							// jQuery.merge because push.apply(_, arraylike) throws
							jQuery.merge( scripts, getAll( node, "script" ) );
						}
					}

					callback.call( this[ i ], node, i );
				}

				if ( hasScripts ) {
					doc = scripts[ scripts.length - 1 ].ownerDocument;

					// Reenable scripts
					jQuery.map( scripts, restoreScript );

					// Evaluate executable scripts on first document insertion
					for ( i = 0; i < hasScripts; i++ ) {
						node = scripts[ i ];
						if ( rscriptType.test( node.type || "" ) &&
							!data_priv.access( node, "globalEval" ) && jQuery.contains( doc, node ) ) {

							if ( node.src ) {
								// Optional AJAX dependency, but won't run scripts if not present
								if ( jQuery._evalUrl ) {
									jQuery._evalUrl( node.src );
								}
							} else {
								jQuery.globalEval( node.textContent.replace( rcleanScript, "" ) );
							}
						}
					}
				}
			}
		}

		return this;
	}
});

jQuery.each({
	appendTo: "append",
	prependTo: "prepend",
	insertBefore: "before",
	insertAfter: "after",
	replaceAll: "replaceWith"
}, function( name, original ) {
	jQuery.fn[ name ] = function( selector ) {
		var elems,
			ret = [],
			insert = jQuery( selector ),
			last = insert.length - 1,
			i = 0;

		for ( ; i <= last; i++ ) {
			elems = i === last ? this : this.clone( true );
			jQuery( insert[ i ] )[ original ]( elems );

			// Support: QtWebKit
			// .get() because push.apply(_, arraylike) throws
			push.apply( ret, elems.get() );
		}

		return this.pushStack( ret );
	};
});


var iframe,
	elemdisplay = {};

/**
 * Retrieve the actual display of a element
 * @param {String} name nodeName of the element
 * @param {Object} doc Document object
 */
// Called only from within defaultDisplay
function actualDisplay( name, doc ) {
	var style,
		elem = jQuery( doc.createElement( name ) ).appendTo( doc.body ),

		// getDefaultComputedStyle might be reliably used only on attached element
		display = window.getDefaultComputedStyle && ( style = window.getDefaultComputedStyle( elem[ 0 ] ) ) ?

			// Use of this method is a temporary fix (more like optimization) until something better comes along,
			// since it was removed from specification and supported only in FF
			style.display : jQuery.css( elem[ 0 ], "display" );

	// We don't have any data stored on the element,
	// so use "detach" method as fast way to get rid of the element
	elem.detach();

	return display;
}

/**
 * Try to determine the default display value of an element
 * @param {String} nodeName
 */
function defaultDisplay( nodeName ) {
	var doc = document,
		display = elemdisplay[ nodeName ];

	if ( !display ) {
		display = actualDisplay( nodeName, doc );

		// If the simple way fails, read from inside an iframe
		if ( display === "none" || !display ) {

			// Use the already-created iframe if possible
			iframe = (iframe || jQuery( "<iframe frameborder='0' width='0' height='0'/>" )).appendTo( doc.documentElement );

			// Always write a new HTML skeleton so Webkit and Firefox don't choke on reuse
			doc = iframe[ 0 ].contentDocument;

			// Support: IE
			doc.write();
			doc.close();

			display = actualDisplay( nodeName, doc );
			iframe.detach();
		}

		// Store the correct default display
		elemdisplay[ nodeName ] = display;
	}

	return display;
}
var rmargin = (/^margin/);

var rnumnonpx = new RegExp( "^(" + pnum + ")(?!px)[a-z%]+$", "i" );

var getStyles = function( elem ) {
		// Support: IE<=11+, Firefox<=30+ (#15098, #14150)
		// IE throws on elements created in popups
		// FF meanwhile throws on frame elements through "defaultView.getComputedStyle"
		if ( elem.ownerDocument.defaultView.opener ) {
			return elem.ownerDocument.defaultView.getComputedStyle( elem, null );
		}

		return window.getComputedStyle( elem, null );
	};



function curCSS( elem, name, computed ) {
	var width, minWidth, maxWidth, ret,
		style = elem.style;

	computed = computed || getStyles( elem );

	// Support: IE9
	// getPropertyValue is only needed for .css('filter') (#12537)
	if ( computed ) {
		ret = computed.getPropertyValue( name ) || computed[ name ];
	}

	if ( computed ) {

		if ( ret === "" && !jQuery.contains( elem.ownerDocument, elem ) ) {
			ret = jQuery.style( elem, name );
		}

		// Support: iOS < 6
		// A tribute to the "awesome hack by Dean Edwards"
		// iOS < 6 (at least) returns percentage for a larger set of values, but width seems to be reliably pixels
		// this is against the CSSOM draft spec: http://dev.w3.org/csswg/cssom/#resolved-values
		if ( rnumnonpx.test( ret ) && rmargin.test( name ) ) {

			// Remember the original values
			width = style.width;
			minWidth = style.minWidth;
			maxWidth = style.maxWidth;

			// Put in the new values to get a computed value out
			style.minWidth = style.maxWidth = style.width = ret;
			ret = computed.width;

			// Revert the changed values
			style.width = width;
			style.minWidth = minWidth;
			style.maxWidth = maxWidth;
		}
	}

	return ret !== undefined ?
		// Support: IE
		// IE returns zIndex value as an integer.
		ret + "" :
		ret;
}


function addGetHookIf( conditionFn, hookFn ) {
	// Define the hook, we'll check on the first run if it's really needed.
	return {
		get: function() {
			if ( conditionFn() ) {
				// Hook not needed (or it's not possible to use it due
				// to missing dependency), remove it.
				delete this.get;
				return;
			}

			// Hook needed; redefine it so that the support test is not executed again.
			return (this.get = hookFn).apply( this, arguments );
		}
	};
}


(function() {
	var pixelPositionVal, boxSizingReliableVal,
		docElem = document.documentElement,
		container = document.createElement( "div" ),
		div = document.createElement( "div" );

	if ( !div.style ) {
		return;
	}

	// Support: IE9-11+
	// Style of cloned element affects source element cloned (#8908)
	div.style.backgroundClip = "content-box";
	div.cloneNode( true ).style.backgroundClip = "";
	support.clearCloneStyle = div.style.backgroundClip === "content-box";

	container.style.cssText = "border:0;width:0;height:0;top:0;left:-9999px;margin-top:1px;" +
		"position:absolute";
	container.appendChild( div );

	// Executing both pixelPosition & boxSizingReliable tests require only one layout
	// so they're executed at the same time to save the second computation.
	function computePixelPositionAndBoxSizingReliable() {
		div.style.cssText =
			// Support: Firefox<29, Android 2.3
			// Vendor-prefix box-sizing
			"-webkit-box-sizing:border-box;-moz-box-sizing:border-box;" +
			"box-sizing:border-box;display:block;margin-top:1%;top:1%;" +
			"border:1px;padding:1px;width:4px;position:absolute";
		div.innerHTML = "";
		docElem.appendChild( container );

		var divStyle = window.getComputedStyle( div, null );
		pixelPositionVal = divStyle.top !== "1%";
		boxSizingReliableVal = divStyle.width === "4px";

		docElem.removeChild( container );
	}

	// Support: node.js jsdom
	// Don't assume that getComputedStyle is a property of the global object
	if ( window.getComputedStyle ) {
		jQuery.extend( support, {
			pixelPosition: function() {

				// This test is executed only once but we still do memoizing
				// since we can use the boxSizingReliable pre-computing.
				// No need to check if the test was already performed, though.
				computePixelPositionAndBoxSizingReliable();
				return pixelPositionVal;
			},
			boxSizingReliable: function() {
				if ( boxSizingReliableVal == null ) {
					computePixelPositionAndBoxSizingReliable();
				}
				return boxSizingReliableVal;
			},
			reliableMarginRight: function() {

				// Support: Android 2.3
				// Check if div with explicit width and no margin-right incorrectly
				// gets computed margin-right based on width of container. (#3333)
				// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
				// This support function is only executed once so no memoizing is needed.
				var ret,
					marginDiv = div.appendChild( document.createElement( "div" ) );

				// Reset CSS: box-sizing; display; margin; border; padding
				marginDiv.style.cssText = div.style.cssText =
					// Support: Firefox<29, Android 2.3
					// Vendor-prefix box-sizing
					"-webkit-box-sizing:content-box;-moz-box-sizing:content-box;" +
					"box-sizing:content-box;display:block;margin:0;border:0;padding:0";
				marginDiv.style.marginRight = marginDiv.style.width = "0";
				div.style.width = "1px";
				docElem.appendChild( container );

				ret = !parseFloat( window.getComputedStyle( marginDiv, null ).marginRight );

				docElem.removeChild( container );
				div.removeChild( marginDiv );

				return ret;
			}
		});
	}
})();


// A method for quickly swapping in/out CSS properties to get correct calculations.
jQuery.swap = function( elem, options, callback, args ) {
	var ret, name,
		old = {};

	// Remember the old values, and insert the new ones
	for ( name in options ) {
		old[ name ] = elem.style[ name ];
		elem.style[ name ] = options[ name ];
	}

	ret = callback.apply( elem, args || [] );

	// Revert the old values
	for ( name in options ) {
		elem.style[ name ] = old[ name ];
	}

	return ret;
};


var
	// Swappable if display is none or starts with table except "table", "table-cell", or "table-caption"
	// See here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
	rdisplayswap = /^(none|table(?!-c[ea]).+)/,
	rnumsplit = new RegExp( "^(" + pnum + ")(.*)$", "i" ),
	rrelNum = new RegExp( "^([+-])=(" + pnum + ")", "i" ),

	cssShow = { position: "absolute", visibility: "hidden", display: "block" },
	cssNormalTransform = {
		letterSpacing: "0",
		fontWeight: "400"
	},

	cssPrefixes = [ "Webkit", "O", "Moz", "ms" ];

// Return a css property mapped to a potentially vendor prefixed property
function vendorPropName( style, name ) {

	// Shortcut for names that are not vendor prefixed
	if ( name in style ) {
		return name;
	}

	// Check for vendor prefixed names
	var capName = name[0].toUpperCase() + name.slice(1),
		origName = name,
		i = cssPrefixes.length;

	while ( i-- ) {
		name = cssPrefixes[ i ] + capName;
		if ( name in style ) {
			return name;
		}
	}

	return origName;
}

function setPositiveNumber( elem, value, subtract ) {
	var matches = rnumsplit.exec( value );
	return matches ?
		// Guard against undefined "subtract", e.g., when used as in cssHooks
		Math.max( 0, matches[ 1 ] - ( subtract || 0 ) ) + ( matches[ 2 ] || "px" ) :
		value;
}

function augmentWidthOrHeight( elem, name, extra, isBorderBox, styles ) {
	var i = extra === ( isBorderBox ? "border" : "content" ) ?
		// If we already have the right measurement, avoid augmentation
		4 :
		// Otherwise initialize for horizontal or vertical properties
		name === "width" ? 1 : 0,

		val = 0;

	for ( ; i < 4; i += 2 ) {
		// Both box models exclude margin, so add it if we want it
		if ( extra === "margin" ) {
			val += jQuery.css( elem, extra + cssExpand[ i ], true, styles );
		}

		if ( isBorderBox ) {
			// border-box includes padding, so remove it if we want content
			if ( extra === "content" ) {
				val -= jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );
			}

			// At this point, extra isn't border nor margin, so remove border
			if ( extra !== "margin" ) {
				val -= jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		} else {
			// At this point, extra isn't content, so add padding
			val += jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );

			// At this point, extra isn't content nor padding, so add border
			if ( extra !== "padding" ) {
				val += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		}
	}

	return val;
}

function getWidthOrHeight( elem, name, extra ) {

	// Start with offset property, which is equivalent to the border-box value
	var valueIsBorderBox = true,
		val = name === "width" ? elem.offsetWidth : elem.offsetHeight,
		styles = getStyles( elem ),
		isBorderBox = jQuery.css( elem, "boxSizing", false, styles ) === "border-box";

	// Some non-html elements return undefined for offsetWidth, so check for null/undefined
	// svg - https://bugzilla.mozilla.org/show_bug.cgi?id=649285
	// MathML - https://bugzilla.mozilla.org/show_bug.cgi?id=491668
	if ( val <= 0 || val == null ) {
		// Fall back to computed then uncomputed css if necessary
		val = curCSS( elem, name, styles );
		if ( val < 0 || val == null ) {
			val = elem.style[ name ];
		}

		// Computed unit is not pixels. Stop here and return.
		if ( rnumnonpx.test(val) ) {
			return val;
		}

		// Check for style in case a browser which returns unreliable values
		// for getComputedStyle silently falls back to the reliable elem.style
		valueIsBorderBox = isBorderBox &&
			( support.boxSizingReliable() || val === elem.style[ name ] );

		// Normalize "", auto, and prepare for extra
		val = parseFloat( val ) || 0;
	}

	// Use the active box-sizing model to add/subtract irrelevant styles
	return ( val +
		augmentWidthOrHeight(
			elem,
			name,
			extra || ( isBorderBox ? "border" : "content" ),
			valueIsBorderBox,
			styles
		)
	) + "px";
}

function showHide( elements, show ) {
	var display, elem, hidden,
		values = [],
		index = 0,
		length = elements.length;

	for ( ; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}

		values[ index ] = data_priv.get( elem, "olddisplay" );
		display = elem.style.display;
		if ( show ) {
			// Reset the inline display of this element to learn if it is
			// being hidden by cascaded rules or not
			if ( !values[ index ] && display === "none" ) {
				elem.style.display = "";
			}

			// Set elements which have been overridden with display: none
			// in a stylesheet to whatever the default browser style is
			// for such an element
			if ( elem.style.display === "" && isHidden( elem ) ) {
				values[ index ] = data_priv.access( elem, "olddisplay", defaultDisplay(elem.nodeName) );
			}
		} else {
			hidden = isHidden( elem );

			if ( display !== "none" || !hidden ) {
				data_priv.set( elem, "olddisplay", hidden ? display : jQuery.css( elem, "display" ) );
			}
		}
	}

	// Set the display of most of the elements in a second loop
	// to avoid the constant reflow
	for ( index = 0; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}
		if ( !show || elem.style.display === "none" || elem.style.display === "" ) {
			elem.style.display = show ? values[ index ] || "" : "none";
		}
	}

	return elements;
}

jQuery.extend({

	// Add in style property hooks for overriding the default
	// behavior of getting and setting a style property
	cssHooks: {
		opacity: {
			get: function( elem, computed ) {
				if ( computed ) {

					// We should always get a number back from opacity
					var ret = curCSS( elem, "opacity" );
					return ret === "" ? "1" : ret;
				}
			}
		}
	},

	// Don't automatically add "px" to these possibly-unitless properties
	cssNumber: {
		"columnCount": true,
		"fillOpacity": true,
		"flexGrow": true,
		"flexShrink": true,
		"fontWeight": true,
		"lineHeight": true,
		"opacity": true,
		"order": true,
		"orphans": true,
		"widows": true,
		"zIndex": true,
		"zoom": true
	},

	// Add in properties whose names you wish to fix before
	// setting or getting the value
	cssProps: {
		"float": "cssFloat"
	},

	// Get and set the style property on a DOM Node
	style: function( elem, name, value, extra ) {

		// Don't set styles on text and comment nodes
		if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
			return;
		}

		// Make sure that we're working with the right name
		var ret, type, hooks,
			origName = jQuery.camelCase( name ),
			style = elem.style;

		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( style, origName ) );

		// Gets hook for the prefixed version, then unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// Check if we're setting a value
		if ( value !== undefined ) {
			type = typeof value;

			// Convert "+=" or "-=" to relative numbers (#7345)
			if ( type === "string" && (ret = rrelNum.exec( value )) ) {
				value = ( ret[1] + 1 ) * ret[2] + parseFloat( jQuery.css( elem, name ) );
				// Fixes bug #9237
				type = "number";
			}

			// Make sure that null and NaN values aren't set (#7116)
			if ( value == null || value !== value ) {
				return;
			}

			// If a number, add 'px' to the (except for certain CSS properties)
			if ( type === "number" && !jQuery.cssNumber[ origName ] ) {
				value += "px";
			}

			// Support: IE9-11+
			// background-* props affect original clone's values
			if ( !support.clearCloneStyle && value === "" && name.indexOf( "background" ) === 0 ) {
				style[ name ] = "inherit";
			}

			// If a hook was provided, use that value, otherwise just set the specified value
			if ( !hooks || !("set" in hooks) || (value = hooks.set( elem, value, extra )) !== undefined ) {
				style[ name ] = value;
			}

		} else {
			// If a hook was provided get the non-computed value from there
			if ( hooks && "get" in hooks && (ret = hooks.get( elem, false, extra )) !== undefined ) {
				return ret;
			}

			// Otherwise just get the value from the style object
			return style[ name ];
		}
	},

	css: function( elem, name, extra, styles ) {
		var val, num, hooks,
			origName = jQuery.camelCase( name );

		// Make sure that we're working with the right name
		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( elem.style, origName ) );

		// Try prefixed name followed by the unprefixed name
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// If a hook was provided get the computed value from there
		if ( hooks && "get" in hooks ) {
			val = hooks.get( elem, true, extra );
		}

		// Otherwise, if a way to get the computed value exists, use that
		if ( val === undefined ) {
			val = curCSS( elem, name, styles );
		}

		// Convert "normal" to computed value
		if ( val === "normal" && name in cssNormalTransform ) {
			val = cssNormalTransform[ name ];
		}

		// Make numeric if forced or a qualifier was provided and val looks numeric
		if ( extra === "" || extra ) {
			num = parseFloat( val );
			return extra === true || jQuery.isNumeric( num ) ? num || 0 : val;
		}
		return val;
	}
});

jQuery.each([ "height", "width" ], function( i, name ) {
	jQuery.cssHooks[ name ] = {
		get: function( elem, computed, extra ) {
			if ( computed ) {

				// Certain elements can have dimension info if we invisibly show them
				// but it must have a current display style that would benefit
				return rdisplayswap.test( jQuery.css( elem, "display" ) ) && elem.offsetWidth === 0 ?
					jQuery.swap( elem, cssShow, function() {
						return getWidthOrHeight( elem, name, extra );
					}) :
					getWidthOrHeight( elem, name, extra );
			}
		},

		set: function( elem, value, extra ) {
			var styles = extra && getStyles( elem );
			return setPositiveNumber( elem, value, extra ?
				augmentWidthOrHeight(
					elem,
					name,
					extra,
					jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
					styles
				) : 0
			);
		}
	};
});

// Support: Android 2.3
jQuery.cssHooks.marginRight = addGetHookIf( support.reliableMarginRight,
	function( elem, computed ) {
		if ( computed ) {
			return jQuery.swap( elem, { "display": "inline-block" },
				curCSS, [ elem, "marginRight" ] );
		}
	}
);

// These hooks are used by animate to expand properties
jQuery.each({
	margin: "",
	padding: "",
	border: "Width"
}, function( prefix, suffix ) {
	jQuery.cssHooks[ prefix + suffix ] = {
		expand: function( value ) {
			var i = 0,
				expanded = {},

				// Assumes a single number if not a string
				parts = typeof value === "string" ? value.split(" ") : [ value ];

			for ( ; i < 4; i++ ) {
				expanded[ prefix + cssExpand[ i ] + suffix ] =
					parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
			}

			return expanded;
		}
	};

	if ( !rmargin.test( prefix ) ) {
		jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
	}
});

jQuery.fn.extend({
	css: function( name, value ) {
		return access( this, function( elem, name, value ) {
			var styles, len,
				map = {},
				i = 0;

			if ( jQuery.isArray( name ) ) {
				styles = getStyles( elem );
				len = name.length;

				for ( ; i < len; i++ ) {
					map[ name[ i ] ] = jQuery.css( elem, name[ i ], false, styles );
				}

				return map;
			}

			return value !== undefined ?
				jQuery.style( elem, name, value ) :
				jQuery.css( elem, name );
		}, name, value, arguments.length > 1 );
	},
	show: function() {
		return showHide( this, true );
	},
	hide: function() {
		return showHide( this );
	},
	toggle: function( state ) {
		if ( typeof state === "boolean" ) {
			return state ? this.show() : this.hide();
		}

		return this.each(function() {
			if ( isHidden( this ) ) {
				jQuery( this ).show();
			} else {
				jQuery( this ).hide();
			}
		});
	}
});


function Tween( elem, options, prop, end, easing ) {
	return new Tween.prototype.init( elem, options, prop, end, easing );
}
jQuery.Tween = Tween;

Tween.prototype = {
	constructor: Tween,
	init: function( elem, options, prop, end, easing, unit ) {
		this.elem = elem;
		this.prop = prop;
		this.easing = easing || "swing";
		this.options = options;
		this.start = this.now = this.cur();
		this.end = end;
		this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
	},
	cur: function() {
		var hooks = Tween.propHooks[ this.prop ];

		return hooks && hooks.get ?
			hooks.get( this ) :
			Tween.propHooks._default.get( this );
	},
	run: function( percent ) {
		var eased,
			hooks = Tween.propHooks[ this.prop ];

		if ( this.options.duration ) {
			this.pos = eased = jQuery.easing[ this.easing ](
				percent, this.options.duration * percent, 0, 1, this.options.duration
			);
		} else {
			this.pos = eased = percent;
		}
		this.now = ( this.end - this.start ) * eased + this.start;

		if ( this.options.step ) {
			this.options.step.call( this.elem, this.now, this );
		}

		if ( hooks && hooks.set ) {
			hooks.set( this );
		} else {
			Tween.propHooks._default.set( this );
		}
		return this;
	}
};

Tween.prototype.init.prototype = Tween.prototype;

Tween.propHooks = {
	_default: {
		get: function( tween ) {
			var result;

			if ( tween.elem[ tween.prop ] != null &&
				(!tween.elem.style || tween.elem.style[ tween.prop ] == null) ) {
				return tween.elem[ tween.prop ];
			}

			// Passing an empty string as a 3rd parameter to .css will automatically
			// attempt a parseFloat and fallback to a string if the parse fails.
			// Simple values such as "10px" are parsed to Float;
			// complex values such as "rotate(1rad)" are returned as-is.
			result = jQuery.css( tween.elem, tween.prop, "" );
			// Empty strings, null, undefined and "auto" are converted to 0.
			return !result || result === "auto" ? 0 : result;
		},
		set: function( tween ) {
			// Use step hook for back compat.
			// Use cssHook if its there.
			// Use .style if available and use plain properties where available.
			if ( jQuery.fx.step[ tween.prop ] ) {
				jQuery.fx.step[ tween.prop ]( tween );
			} else if ( tween.elem.style && ( tween.elem.style[ jQuery.cssProps[ tween.prop ] ] != null || jQuery.cssHooks[ tween.prop ] ) ) {
				jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
			} else {
				tween.elem[ tween.prop ] = tween.now;
			}
		}
	}
};

// Support: IE9
// Panic based approach to setting things on disconnected nodes
Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
	set: function( tween ) {
		if ( tween.elem.nodeType && tween.elem.parentNode ) {
			tween.elem[ tween.prop ] = tween.now;
		}
	}
};

jQuery.easing = {
	linear: function( p ) {
		return p;
	},
	swing: function( p ) {
		return 0.5 - Math.cos( p * Math.PI ) / 2;
	}
};

jQuery.fx = Tween.prototype.init;

// Back Compat <1.8 extension point
jQuery.fx.step = {};




var
	fxNow, timerId,
	rfxtypes = /^(?:toggle|show|hide)$/,
	rfxnum = new RegExp( "^(?:([+-])=|)(" + pnum + ")([a-z%]*)$", "i" ),
	rrun = /queueHooks$/,
	animationPrefilters = [ defaultPrefilter ],
	tweeners = {
		"*": [ function( prop, value ) {
			var tween = this.createTween( prop, value ),
				target = tween.cur(),
				parts = rfxnum.exec( value ),
				unit = parts && parts[ 3 ] || ( jQuery.cssNumber[ prop ] ? "" : "px" ),

				// Starting value computation is required for potential unit mismatches
				start = ( jQuery.cssNumber[ prop ] || unit !== "px" && +target ) &&
					rfxnum.exec( jQuery.css( tween.elem, prop ) ),
				scale = 1,
				maxIterations = 20;

			if ( start && start[ 3 ] !== unit ) {
				// Trust units reported by jQuery.css
				unit = unit || start[ 3 ];

				// Make sure we update the tween properties later on
				parts = parts || [];

				// Iteratively approximate from a nonzero starting point
				start = +target || 1;

				do {
					// If previous iteration zeroed out, double until we get *something*.
					// Use string for doubling so we don't accidentally see scale as unchanged below
					scale = scale || ".5";

					// Adjust and apply
					start = start / scale;
					jQuery.style( tween.elem, prop, start + unit );

				// Update scale, tolerating zero or NaN from tween.cur(),
				// break the loop if scale is unchanged or perfect, or if we've just had enough
				} while ( scale !== (scale = tween.cur() / target) && scale !== 1 && --maxIterations );
			}

			// Update tween properties
			if ( parts ) {
				start = tween.start = +start || +target || 0;
				tween.unit = unit;
				// If a +=/-= token was provided, we're doing a relative animation
				tween.end = parts[ 1 ] ?
					start + ( parts[ 1 ] + 1 ) * parts[ 2 ] :
					+parts[ 2 ];
			}

			return tween;
		} ]
	};

// Animations created synchronously will run synchronously
function createFxNow() {
	setTimeout(function() {
		fxNow = undefined;
	});
	return ( fxNow = jQuery.now() );
}

// Generate parameters to create a standard animation
function genFx( type, includeWidth ) {
	var which,
		i = 0,
		attrs = { height: type };

	// If we include width, step value is 1 to do all cssExpand values,
	// otherwise step value is 2 to skip over Left and Right
	includeWidth = includeWidth ? 1 : 0;
	for ( ; i < 4 ; i += 2 - includeWidth ) {
		which = cssExpand[ i ];
		attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
	}

	if ( includeWidth ) {
		attrs.opacity = attrs.width = type;
	}

	return attrs;
}

function createTween( value, prop, animation ) {
	var tween,
		collection = ( tweeners[ prop ] || [] ).concat( tweeners[ "*" ] ),
		index = 0,
		length = collection.length;
	for ( ; index < length; index++ ) {
		if ( (tween = collection[ index ].call( animation, prop, value )) ) {

			// We're done with this property
			return tween;
		}
	}
}

function defaultPrefilter( elem, props, opts ) {
	/* jshint validthis: true */
	var prop, value, toggle, tween, hooks, oldfire, display, checkDisplay,
		anim = this,
		orig = {},
		style = elem.style,
		hidden = elem.nodeType && isHidden( elem ),
		dataShow = data_priv.get( elem, "fxshow" );

	// Handle queue: false promises
	if ( !opts.queue ) {
		hooks = jQuery._queueHooks( elem, "fx" );
		if ( hooks.unqueued == null ) {
			hooks.unqueued = 0;
			oldfire = hooks.empty.fire;
			hooks.empty.fire = function() {
				if ( !hooks.unqueued ) {
					oldfire();
				}
			};
		}
		hooks.unqueued++;

		anim.always(function() {
			// Ensure the complete handler is called before this completes
			anim.always(function() {
				hooks.unqueued--;
				if ( !jQuery.queue( elem, "fx" ).length ) {
					hooks.empty.fire();
				}
			});
		});
	}

	// Height/width overflow pass
	if ( elem.nodeType === 1 && ( "height" in props || "width" in props ) ) {
		// Make sure that nothing sneaks out
		// Record all 3 overflow attributes because IE9-10 do not
		// change the overflow attribute when overflowX and
		// overflowY are set to the same value
		opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

		// Set display property to inline-block for height/width
		// animations on inline elements that are having width/height animated
		display = jQuery.css( elem, "display" );

		// Test default display if display is currently "none"
		checkDisplay = display === "none" ?
			data_priv.get( elem, "olddisplay" ) || defaultDisplay( elem.nodeName ) : display;

		if ( checkDisplay === "inline" && jQuery.css( elem, "float" ) === "none" ) {
			style.display = "inline-block";
		}
	}

	if ( opts.overflow ) {
		style.overflow = "hidden";
		anim.always(function() {
			style.overflow = opts.overflow[ 0 ];
			style.overflowX = opts.overflow[ 1 ];
			style.overflowY = opts.overflow[ 2 ];
		});
	}

	// show/hide pass
	for ( prop in props ) {
		value = props[ prop ];
		if ( rfxtypes.exec( value ) ) {
			delete props[ prop ];
			toggle = toggle || value === "toggle";
			if ( value === ( hidden ? "hide" : "show" ) ) {

				// If there is dataShow left over from a stopped hide or show and we are going to proceed with show, we should pretend to be hidden
				if ( value === "show" && dataShow && dataShow[ prop ] !== undefined ) {
					hidden = true;
				} else {
					continue;
				}
			}
			orig[ prop ] = dataShow && dataShow[ prop ] || jQuery.style( elem, prop );

		// Any non-fx value stops us from restoring the original display value
		} else {
			display = undefined;
		}
	}

	if ( !jQuery.isEmptyObject( orig ) ) {
		if ( dataShow ) {
			if ( "hidden" in dataShow ) {
				hidden = dataShow.hidden;
			}
		} else {
			dataShow = data_priv.access( elem, "fxshow", {} );
		}

		// Store state if its toggle - enables .stop().toggle() to "reverse"
		if ( toggle ) {
			dataShow.hidden = !hidden;
		}
		if ( hidden ) {
			jQuery( elem ).show();
		} else {
			anim.done(function() {
				jQuery( elem ).hide();
			});
		}
		anim.done(function() {
			var prop;

			data_priv.remove( elem, "fxshow" );
			for ( prop in orig ) {
				jQuery.style( elem, prop, orig[ prop ] );
			}
		});
		for ( prop in orig ) {
			tween = createTween( hidden ? dataShow[ prop ] : 0, prop, anim );

			if ( !( prop in dataShow ) ) {
				dataShow[ prop ] = tween.start;
				if ( hidden ) {
					tween.end = tween.start;
					tween.start = prop === "width" || prop === "height" ? 1 : 0;
				}
			}
		}

	// If this is a noop like .hide().hide(), restore an overwritten display value
	} else if ( (display === "none" ? defaultDisplay( elem.nodeName ) : display) === "inline" ) {
		style.display = display;
	}
}

function propFilter( props, specialEasing ) {
	var index, name, easing, value, hooks;

	// camelCase, specialEasing and expand cssHook pass
	for ( index in props ) {
		name = jQuery.camelCase( index );
		easing = specialEasing[ name ];
		value = props[ index ];
		if ( jQuery.isArray( value ) ) {
			easing = value[ 1 ];
			value = props[ index ] = value[ 0 ];
		}

		if ( index !== name ) {
			props[ name ] = value;
			delete props[ index ];
		}

		hooks = jQuery.cssHooks[ name ];
		if ( hooks && "expand" in hooks ) {
			value = hooks.expand( value );
			delete props[ name ];

			// Not quite $.extend, this won't overwrite existing keys.
			// Reusing 'index' because we have the correct "name"
			for ( index in value ) {
				if ( !( index in props ) ) {
					props[ index ] = value[ index ];
					specialEasing[ index ] = easing;
				}
			}
		} else {
			specialEasing[ name ] = easing;
		}
	}
}

function Animation( elem, properties, options ) {
	var result,
		stopped,
		index = 0,
		length = animationPrefilters.length,
		deferred = jQuery.Deferred().always( function() {
			// Don't match elem in the :animated selector
			delete tick.elem;
		}),
		tick = function() {
			if ( stopped ) {
				return false;
			}
			var currentTime = fxNow || createFxNow(),
				remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),
				// Support: Android 2.3
				// Archaic crash bug won't allow us to use `1 - ( 0.5 || 0 )` (#12497)
				temp = remaining / animation.duration || 0,
				percent = 1 - temp,
				index = 0,
				length = animation.tweens.length;

			for ( ; index < length ; index++ ) {
				animation.tweens[ index ].run( percent );
			}

			deferred.notifyWith( elem, [ animation, percent, remaining ]);

			if ( percent < 1 && length ) {
				return remaining;
			} else {
				deferred.resolveWith( elem, [ animation ] );
				return false;
			}
		},
		animation = deferred.promise({
			elem: elem,
			props: jQuery.extend( {}, properties ),
			opts: jQuery.extend( true, { specialEasing: {} }, options ),
			originalProperties: properties,
			originalOptions: options,
			startTime: fxNow || createFxNow(),
			duration: options.duration,
			tweens: [],
			createTween: function( prop, end ) {
				var tween = jQuery.Tween( elem, animation.opts, prop, end,
						animation.opts.specialEasing[ prop ] || animation.opts.easing );
				animation.tweens.push( tween );
				return tween;
			},
			stop: function( gotoEnd ) {
				var index = 0,
					// If we are going to the end, we want to run all the tweens
					// otherwise we skip this part
					length = gotoEnd ? animation.tweens.length : 0;
				if ( stopped ) {
					return this;
				}
				stopped = true;
				for ( ; index < length ; index++ ) {
					animation.tweens[ index ].run( 1 );
				}

				// Resolve when we played the last frame; otherwise, reject
				if ( gotoEnd ) {
					deferred.resolveWith( elem, [ animation, gotoEnd ] );
				} else {
					deferred.rejectWith( elem, [ animation, gotoEnd ] );
				}
				return this;
			}
		}),
		props = animation.props;

	propFilter( props, animation.opts.specialEasing );

	for ( ; index < length ; index++ ) {
		result = animationPrefilters[ index ].call( animation, elem, props, animation.opts );
		if ( result ) {
			return result;
		}
	}

	jQuery.map( props, createTween, animation );

	if ( jQuery.isFunction( animation.opts.start ) ) {
		animation.opts.start.call( elem, animation );
	}

	jQuery.fx.timer(
		jQuery.extend( tick, {
			elem: elem,
			anim: animation,
			queue: animation.opts.queue
		})
	);

	// attach callbacks from options
	return animation.progress( animation.opts.progress )
		.done( animation.opts.done, animation.opts.complete )
		.fail( animation.opts.fail )
		.always( animation.opts.always );
}

jQuery.Animation = jQuery.extend( Animation, {

	tweener: function( props, callback ) {
		if ( jQuery.isFunction( props ) ) {
			callback = props;
			props = [ "*" ];
		} else {
			props = props.split(" ");
		}

		var prop,
			index = 0,
			length = props.length;

		for ( ; index < length ; index++ ) {
			prop = props[ index ];
			tweeners[ prop ] = tweeners[ prop ] || [];
			tweeners[ prop ].unshift( callback );
		}
	},

	prefilter: function( callback, prepend ) {
		if ( prepend ) {
			animationPrefilters.unshift( callback );
		} else {
			animationPrefilters.push( callback );
		}
	}
});

jQuery.speed = function( speed, easing, fn ) {
	var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
		complete: fn || !fn && easing ||
			jQuery.isFunction( speed ) && speed,
		duration: speed,
		easing: fn && easing || easing && !jQuery.isFunction( easing ) && easing
	};

	opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration :
		opt.duration in jQuery.fx.speeds ? jQuery.fx.speeds[ opt.duration ] : jQuery.fx.speeds._default;

	// Normalize opt.queue - true/undefined/null -> "fx"
	if ( opt.queue == null || opt.queue === true ) {
		opt.queue = "fx";
	}

	// Queueing
	opt.old = opt.complete;

	opt.complete = function() {
		if ( jQuery.isFunction( opt.old ) ) {
			opt.old.call( this );
		}

		if ( opt.queue ) {
			jQuery.dequeue( this, opt.queue );
		}
	};

	return opt;
};

jQuery.fn.extend({
	fadeTo: function( speed, to, easing, callback ) {

		// Show any hidden elements after setting opacity to 0
		return this.filter( isHidden ).css( "opacity", 0 ).show()

			// Animate to the value specified
			.end().animate({ opacity: to }, speed, easing, callback );
	},
	animate: function( prop, speed, easing, callback ) {
		var empty = jQuery.isEmptyObject( prop ),
			optall = jQuery.speed( speed, easing, callback ),
			doAnimation = function() {
				// Operate on a copy of prop so per-property easing won't be lost
				var anim = Animation( this, jQuery.extend( {}, prop ), optall );

				// Empty animations, or finishing resolves immediately
				if ( empty || data_priv.get( this, "finish" ) ) {
					anim.stop( true );
				}
			};
			doAnimation.finish = doAnimation;

		return empty || optall.queue === false ?
			this.each( doAnimation ) :
			this.queue( optall.queue, doAnimation );
	},
	stop: function( type, clearQueue, gotoEnd ) {
		var stopQueue = function( hooks ) {
			var stop = hooks.stop;
			delete hooks.stop;
			stop( gotoEnd );
		};

		if ( typeof type !== "string" ) {
			gotoEnd = clearQueue;
			clearQueue = type;
			type = undefined;
		}
		if ( clearQueue && type !== false ) {
			this.queue( type || "fx", [] );
		}

		return this.each(function() {
			var dequeue = true,
				index = type != null && type + "queueHooks",
				timers = jQuery.timers,
				data = data_priv.get( this );

			if ( index ) {
				if ( data[ index ] && data[ index ].stop ) {
					stopQueue( data[ index ] );
				}
			} else {
				for ( index in data ) {
					if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
						stopQueue( data[ index ] );
					}
				}
			}

			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && (type == null || timers[ index ].queue === type) ) {
					timers[ index ].anim.stop( gotoEnd );
					dequeue = false;
					timers.splice( index, 1 );
				}
			}

			// Start the next in the queue if the last step wasn't forced.
			// Timers currently will call their complete callbacks, which
			// will dequeue but only if they were gotoEnd.
			if ( dequeue || !gotoEnd ) {
				jQuery.dequeue( this, type );
			}
		});
	},
	finish: function( type ) {
		if ( type !== false ) {
			type = type || "fx";
		}
		return this.each(function() {
			var index,
				data = data_priv.get( this ),
				queue = data[ type + "queue" ],
				hooks = data[ type + "queueHooks" ],
				timers = jQuery.timers,
				length = queue ? queue.length : 0;

			// Enable finishing flag on private data
			data.finish = true;

			// Empty the queue first
			jQuery.queue( this, type, [] );

			if ( hooks && hooks.stop ) {
				hooks.stop.call( this, true );
			}

			// Look for any active animations, and finish them
			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && timers[ index ].queue === type ) {
					timers[ index ].anim.stop( true );
					timers.splice( index, 1 );
				}
			}

			// Look for any animations in the old queue and finish them
			for ( index = 0; index < length; index++ ) {
				if ( queue[ index ] && queue[ index ].finish ) {
					queue[ index ].finish.call( this );
				}
			}

			// Turn off finishing flag
			delete data.finish;
		});
	}
});

jQuery.each([ "toggle", "show", "hide" ], function( i, name ) {
	var cssFn = jQuery.fn[ name ];
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return speed == null || typeof speed === "boolean" ?
			cssFn.apply( this, arguments ) :
			this.animate( genFx( name, true ), speed, easing, callback );
	};
});

// Generate shortcuts for custom animations
jQuery.each({
	slideDown: genFx("show"),
	slideUp: genFx("hide"),
	slideToggle: genFx("toggle"),
	fadeIn: { opacity: "show" },
	fadeOut: { opacity: "hide" },
	fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return this.animate( props, speed, easing, callback );
	};
});

jQuery.timers = [];
jQuery.fx.tick = function() {
	var timer,
		i = 0,
		timers = jQuery.timers;

	fxNow = jQuery.now();

	for ( ; i < timers.length; i++ ) {
		timer = timers[ i ];
		// Checks the timer has not already been removed
		if ( !timer() && timers[ i ] === timer ) {
			timers.splice( i--, 1 );
		}
	}

	if ( !timers.length ) {
		jQuery.fx.stop();
	}
	fxNow = undefined;
};

jQuery.fx.timer = function( timer ) {
	jQuery.timers.push( timer );
	if ( timer() ) {
		jQuery.fx.start();
	} else {
		jQuery.timers.pop();
	}
};

jQuery.fx.interval = 13;

jQuery.fx.start = function() {
	if ( !timerId ) {
		timerId = setInterval( jQuery.fx.tick, jQuery.fx.interval );
	}
};

jQuery.fx.stop = function() {
	clearInterval( timerId );
	timerId = null;
};

jQuery.fx.speeds = {
	slow: 600,
	fast: 200,
	// Default speed
	_default: 400
};


// Based off of the plugin by Clint Helfers, with permission.
// http://blindsignals.com/index.php/2009/07/jquery-delay/
jQuery.fn.delay = function( time, type ) {
	time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
	type = type || "fx";

	return this.queue( type, function( next, hooks ) {
		var timeout = setTimeout( next, time );
		hooks.stop = function() {
			clearTimeout( timeout );
		};
	});
};


(function() {
	var input = document.createElement( "input" ),
		select = document.createElement( "select" ),
		opt = select.appendChild( document.createElement( "option" ) );

	input.type = "checkbox";

	// Support: iOS<=5.1, Android<=4.2+
	// Default value for a checkbox should be "on"
	support.checkOn = input.value !== "";

	// Support: IE<=11+
	// Must access selectedIndex to make default options select
	support.optSelected = opt.selected;

	// Support: Android<=2.3
	// Options inside disabled selects are incorrectly marked as disabled
	select.disabled = true;
	support.optDisabled = !opt.disabled;

	// Support: IE<=11+
	// An input loses its value after becoming a radio
	input = document.createElement( "input" );
	input.value = "t";
	input.type = "radio";
	support.radioValue = input.value === "t";
})();


var nodeHook, boolHook,
	attrHandle = jQuery.expr.attrHandle;

jQuery.fn.extend({
	attr: function( name, value ) {
		return access( this, jQuery.attr, name, value, arguments.length > 1 );
	},

	removeAttr: function( name ) {
		return this.each(function() {
			jQuery.removeAttr( this, name );
		});
	}
});

jQuery.extend({
	attr: function( elem, name, value ) {
		var hooks, ret,
			nType = elem.nodeType;

		// don't get/set attributes on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		// Fallback to prop when attributes are not supported
		if ( typeof elem.getAttribute === strundefined ) {
			return jQuery.prop( elem, name, value );
		}

		// All attributes are lowercase
		// Grab necessary hook if one is defined
		if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {
			name = name.toLowerCase();
			hooks = jQuery.attrHooks[ name ] ||
				( jQuery.expr.match.bool.test( name ) ? boolHook : nodeHook );
		}

		if ( value !== undefined ) {

			if ( value === null ) {
				jQuery.removeAttr( elem, name );

			} else if ( hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ) {
				return ret;

			} else {
				elem.setAttribute( name, value + "" );
				return value;
			}

		} else if ( hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ) {
			return ret;

		} else {
			ret = jQuery.find.attr( elem, name );

			// Non-existent attributes return null, we normalize to undefined
			return ret == null ?
				undefined :
				ret;
		}
	},

	removeAttr: function( elem, value ) {
		var name, propName,
			i = 0,
			attrNames = value && value.match( rnotwhite );

		if ( attrNames && elem.nodeType === 1 ) {
			while ( (name = attrNames[i++]) ) {
				propName = jQuery.propFix[ name ] || name;

				// Boolean attributes get special treatment (#10870)
				if ( jQuery.expr.match.bool.test( name ) ) {
					// Set corresponding property to false
					elem[ propName ] = false;
				}

				elem.removeAttribute( name );
			}
		}
	},

	attrHooks: {
		type: {
			set: function( elem, value ) {
				if ( !support.radioValue && value === "radio" &&
					jQuery.nodeName( elem, "input" ) ) {
					var val = elem.value;
					elem.setAttribute( "type", value );
					if ( val ) {
						elem.value = val;
					}
					return value;
				}
			}
		}
	}
});

// Hooks for boolean attributes
boolHook = {
	set: function( elem, value, name ) {
		if ( value === false ) {
			// Remove boolean attributes when set to false
			jQuery.removeAttr( elem, name );
		} else {
			elem.setAttribute( name, name );
		}
		return name;
	}
};
jQuery.each( jQuery.expr.match.bool.source.match( /\w+/g ), function( i, name ) {
	var getter = attrHandle[ name ] || jQuery.find.attr;

	attrHandle[ name ] = function( elem, name, isXML ) {
		var ret, handle;
		if ( !isXML ) {
			// Avoid an infinite loop by temporarily removing this function from the getter
			handle = attrHandle[ name ];
			attrHandle[ name ] = ret;
			ret = getter( elem, name, isXML ) != null ?
				name.toLowerCase() :
				null;
			attrHandle[ name ] = handle;
		}
		return ret;
	};
});




var rfocusable = /^(?:input|select|textarea|button)$/i;

jQuery.fn.extend({
	prop: function( name, value ) {
		return access( this, jQuery.prop, name, value, arguments.length > 1 );
	},

	removeProp: function( name ) {
		return this.each(function() {
			delete this[ jQuery.propFix[ name ] || name ];
		});
	}
});

jQuery.extend({
	propFix: {
		"for": "htmlFor",
		"class": "className"
	},

	prop: function( elem, name, value ) {
		var ret, hooks, notxml,
			nType = elem.nodeType;

		// Don't get/set properties on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

		if ( notxml ) {
			// Fix name and attach hooks
			name = jQuery.propFix[ name ] || name;
			hooks = jQuery.propHooks[ name ];
		}

		if ( value !== undefined ) {
			return hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ?
				ret :
				( elem[ name ] = value );

		} else {
			return hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ?
				ret :
				elem[ name ];
		}
	},

	propHooks: {
		tabIndex: {
			get: function( elem ) {
				return elem.hasAttribute( "tabindex" ) || rfocusable.test( elem.nodeName ) || elem.href ?
					elem.tabIndex :
					-1;
			}
		}
	}
});

if ( !support.optSelected ) {
	jQuery.propHooks.selected = {
		get: function( elem ) {
			var parent = elem.parentNode;
			if ( parent && parent.parentNode ) {
				parent.parentNode.selectedIndex;
			}
			return null;
		}
	};
}

jQuery.each([
	"tabIndex",
	"readOnly",
	"maxLength",
	"cellSpacing",
	"cellPadding",
	"rowSpan",
	"colSpan",
	"useMap",
	"frameBorder",
	"contentEditable"
], function() {
	jQuery.propFix[ this.toLowerCase() ] = this;
});




var rclass = /[\t\r\n\f]/g;

jQuery.fn.extend({
	addClass: function( value ) {
		var classes, elem, cur, clazz, j, finalValue,
			proceed = typeof value === "string" && value,
			i = 0,
			len = this.length;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).addClass( value.call( this, j, this.className ) );
			});
		}

		if ( proceed ) {
			// The disjunction here is for better compressibility (see removeClass)
			classes = ( value || "" ).match( rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					" "
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						if ( cur.indexOf( " " + clazz + " " ) < 0 ) {
							cur += clazz + " ";
						}
					}

					// only assign if different to avoid unneeded rendering.
					finalValue = jQuery.trim( cur );
					if ( elem.className !== finalValue ) {
						elem.className = finalValue;
					}
				}
			}
		}

		return this;
	},

	removeClass: function( value ) {
		var classes, elem, cur, clazz, j, finalValue,
			proceed = arguments.length === 0 || typeof value === "string" && value,
			i = 0,
			len = this.length;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).removeClass( value.call( this, j, this.className ) );
			});
		}
		if ( proceed ) {
			classes = ( value || "" ).match( rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				// This expression is here for better compressibility (see addClass)
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					""
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						// Remove *all* instances
						while ( cur.indexOf( " " + clazz + " " ) >= 0 ) {
							cur = cur.replace( " " + clazz + " ", " " );
						}
					}

					// Only assign if different to avoid unneeded rendering.
					finalValue = value ? jQuery.trim( cur ) : "";
					if ( elem.className !== finalValue ) {
						elem.className = finalValue;
					}
				}
			}
		}

		return this;
	},

	toggleClass: function( value, stateVal ) {
		var type = typeof value;

		if ( typeof stateVal === "boolean" && type === "string" ) {
			return stateVal ? this.addClass( value ) : this.removeClass( value );
		}

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( i ) {
				jQuery( this ).toggleClass( value.call(this, i, this.className, stateVal), stateVal );
			});
		}

		return this.each(function() {
			if ( type === "string" ) {
				// Toggle individual class names
				var className,
					i = 0,
					self = jQuery( this ),
					classNames = value.match( rnotwhite ) || [];

				while ( (className = classNames[ i++ ]) ) {
					// Check each className given, space separated list
					if ( self.hasClass( className ) ) {
						self.removeClass( className );
					} else {
						self.addClass( className );
					}
				}

			// Toggle whole class name
			} else if ( type === strundefined || type === "boolean" ) {
				if ( this.className ) {
					// store className if set
					data_priv.set( this, "__className__", this.className );
				}

				// If the element has a class name or if we're passed `false`,
				// then remove the whole classname (if there was one, the above saved it).
				// Otherwise bring back whatever was previously saved (if anything),
				// falling back to the empty string if nothing was stored.
				this.className = this.className || value === false ? "" : data_priv.get( this, "__className__" ) || "";
			}
		});
	},

	hasClass: function( selector ) {
		var className = " " + selector + " ",
			i = 0,
			l = this.length;
		for ( ; i < l; i++ ) {
			if ( this[i].nodeType === 1 && (" " + this[i].className + " ").replace(rclass, " ").indexOf( className ) >= 0 ) {
				return true;
			}
		}

		return false;
	}
});




var rreturn = /\r/g;

jQuery.fn.extend({
	val: function( value ) {
		var hooks, ret, isFunction,
			elem = this[0];

		if ( !arguments.length ) {
			if ( elem ) {
				hooks = jQuery.valHooks[ elem.type ] || jQuery.valHooks[ elem.nodeName.toLowerCase() ];

				if ( hooks && "get" in hooks && (ret = hooks.get( elem, "value" )) !== undefined ) {
					return ret;
				}

				ret = elem.value;

				return typeof ret === "string" ?
					// Handle most common string cases
					ret.replace(rreturn, "") :
					// Handle cases where value is null/undef or number
					ret == null ? "" : ret;
			}

			return;
		}

		isFunction = jQuery.isFunction( value );

		return this.each(function( i ) {
			var val;

			if ( this.nodeType !== 1 ) {
				return;
			}

			if ( isFunction ) {
				val = value.call( this, i, jQuery( this ).val() );
			} else {
				val = value;
			}

			// Treat null/undefined as ""; convert numbers to string
			if ( val == null ) {
				val = "";

			} else if ( typeof val === "number" ) {
				val += "";

			} else if ( jQuery.isArray( val ) ) {
				val = jQuery.map( val, function( value ) {
					return value == null ? "" : value + "";
				});
			}

			hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

			// If set returns undefined, fall back to normal setting
			if ( !hooks || !("set" in hooks) || hooks.set( this, val, "value" ) === undefined ) {
				this.value = val;
			}
		});
	}
});

jQuery.extend({
	valHooks: {
		option: {
			get: function( elem ) {
				var val = jQuery.find.attr( elem, "value" );
				return val != null ?
					val :
					// Support: IE10-11+
					// option.text throws exceptions (#14686, #14858)
					jQuery.trim( jQuery.text( elem ) );
			}
		},
		select: {
			get: function( elem ) {
				var value, option,
					options = elem.options,
					index = elem.selectedIndex,
					one = elem.type === "select-one" || index < 0,
					values = one ? null : [],
					max = one ? index + 1 : options.length,
					i = index < 0 ?
						max :
						one ? index : 0;

				// Loop through all the selected options
				for ( ; i < max; i++ ) {
					option = options[ i ];

					// IE6-9 doesn't update selected after form reset (#2551)
					if ( ( option.selected || i === index ) &&
							// Don't return options that are disabled or in a disabled optgroup
							( support.optDisabled ? !option.disabled : option.getAttribute( "disabled" ) === null ) &&
							( !option.parentNode.disabled || !jQuery.nodeName( option.parentNode, "optgroup" ) ) ) {

						// Get the specific value for the option
						value = jQuery( option ).val();

						// We don't need an array for one selects
						if ( one ) {
							return value;
						}

						// Multi-Selects return an array
						values.push( value );
					}
				}

				return values;
			},

			set: function( elem, value ) {
				var optionSet, option,
					options = elem.options,
					values = jQuery.makeArray( value ),
					i = options.length;

				while ( i-- ) {
					option = options[ i ];
					if ( (option.selected = jQuery.inArray( option.value, values ) >= 0) ) {
						optionSet = true;
					}
				}

				// Force browsers to behave consistently when non-matching value is set
				if ( !optionSet ) {
					elem.selectedIndex = -1;
				}
				return values;
			}
		}
	}
});

// Radios and checkboxes getter/setter
jQuery.each([ "radio", "checkbox" ], function() {
	jQuery.valHooks[ this ] = {
		set: function( elem, value ) {
			if ( jQuery.isArray( value ) ) {
				return ( elem.checked = jQuery.inArray( jQuery(elem).val(), value ) >= 0 );
			}
		}
	};
	if ( !support.checkOn ) {
		jQuery.valHooks[ this ].get = function( elem ) {
			return elem.getAttribute("value") === null ? "on" : elem.value;
		};
	}
});




// Return jQuery for attributes-only inclusion


jQuery.each( ("blur focus focusin focusout load resize scroll unload click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup error contextmenu").split(" "), function( i, name ) {

	// Handle event binding
	jQuery.fn[ name ] = function( data, fn ) {
		return arguments.length > 0 ?
			this.on( name, null, data, fn ) :
			this.trigger( name );
	};
});

jQuery.fn.extend({
	hover: function( fnOver, fnOut ) {
		return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
	},

	bind: function( types, data, fn ) {
		return this.on( types, null, data, fn );
	},
	unbind: function( types, fn ) {
		return this.off( types, null, fn );
	},

	delegate: function( selector, types, data, fn ) {
		return this.on( types, selector, data, fn );
	},
	undelegate: function( selector, types, fn ) {
		// ( namespace ) or ( selector, types [, fn] )
		return arguments.length === 1 ? this.off( selector, "**" ) : this.off( types, selector || "**", fn );
	}
});


var nonce = jQuery.now();

var rquery = (/\?/);



// Support: Android 2.3
// Workaround failure to string-cast null input
jQuery.parseJSON = function( data ) {
	return JSON.parse( data + "" );
};


// Cross-browser xml parsing
jQuery.parseXML = function( data ) {
	var xml, tmp;
	if ( !data || typeof data !== "string" ) {
		return null;
	}

	// Support: IE9
	try {
		tmp = new DOMParser();
		xml = tmp.parseFromString( data, "text/xml" );
	} catch ( e ) {
		xml = undefined;
	}

	if ( !xml || xml.getElementsByTagName( "parsererror" ).length ) {
		jQuery.error( "Invalid XML: " + data );
	}
	return xml;
};


var
	rhash = /#.*$/,
	rts = /([?&])_=[^&]*/,
	rheaders = /^(.*?):[ \t]*([^\r\n]*)$/mg,
	// #7653, #8125, #8152: local protocol detection
	rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
	rnoContent = /^(?:GET|HEAD)$/,
	rprotocol = /^\/\//,
	rurl = /^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,

	/* Prefilters
	 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
	 * 2) These are called:
	 *    - BEFORE asking for a transport
	 *    - AFTER param serialization (s.data is a string if s.processData is true)
	 * 3) key is the dataType
	 * 4) the catchall symbol "*" can be used
	 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
	 */
	prefilters = {},

	/* Transports bindings
	 * 1) key is the dataType
	 * 2) the catchall symbol "*" can be used
	 * 3) selection will start with transport dataType and THEN go to "*" if needed
	 */
	transports = {},

	// Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
	allTypes = "*/".concat( "*" ),

	// Document location
	ajaxLocation = window.location.href,

	// Segment location into parts
	ajaxLocParts = rurl.exec( ajaxLocation.toLowerCase() ) || [];

// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
function addToPrefiltersOrTransports( structure ) {

	// dataTypeExpression is optional and defaults to "*"
	return function( dataTypeExpression, func ) {

		if ( typeof dataTypeExpression !== "string" ) {
			func = dataTypeExpression;
			dataTypeExpression = "*";
		}

		var dataType,
			i = 0,
			dataTypes = dataTypeExpression.toLowerCase().match( rnotwhite ) || [];

		if ( jQuery.isFunction( func ) ) {
			// For each dataType in the dataTypeExpression
			while ( (dataType = dataTypes[i++]) ) {
				// Prepend if requested
				if ( dataType[0] === "+" ) {
					dataType = dataType.slice( 1 ) || "*";
					(structure[ dataType ] = structure[ dataType ] || []).unshift( func );

				// Otherwise append
				} else {
					(structure[ dataType ] = structure[ dataType ] || []).push( func );
				}
			}
		}
	};
}

// Base inspection function for prefilters and transports
function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR ) {

	var inspected = {},
		seekingTransport = ( structure === transports );

	function inspect( dataType ) {
		var selected;
		inspected[ dataType ] = true;
		jQuery.each( structure[ dataType ] || [], function( _, prefilterOrFactory ) {
			var dataTypeOrTransport = prefilterOrFactory( options, originalOptions, jqXHR );
			if ( typeof dataTypeOrTransport === "string" && !seekingTransport && !inspected[ dataTypeOrTransport ] ) {
				options.dataTypes.unshift( dataTypeOrTransport );
				inspect( dataTypeOrTransport );
				return false;
			} else if ( seekingTransport ) {
				return !( selected = dataTypeOrTransport );
			}
		});
		return selected;
	}

	return inspect( options.dataTypes[ 0 ] ) || !inspected[ "*" ] && inspect( "*" );
}

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes #9887
function ajaxExtend( target, src ) {
	var key, deep,
		flatOptions = jQuery.ajaxSettings.flatOptions || {};

	for ( key in src ) {
		if ( src[ key ] !== undefined ) {
			( flatOptions[ key ] ? target : ( deep || (deep = {}) ) )[ key ] = src[ key ];
		}
	}
	if ( deep ) {
		jQuery.extend( true, target, deep );
	}

	return target;
}

/* Handles responses to an ajax request:
 * - finds the right dataType (mediates between content-type and expected dataType)
 * - returns the corresponding response
 */
function ajaxHandleResponses( s, jqXHR, responses ) {

	var ct, type, finalDataType, firstDataType,
		contents = s.contents,
		dataTypes = s.dataTypes;

	// Remove auto dataType and get content-type in the process
	while ( dataTypes[ 0 ] === "*" ) {
		dataTypes.shift();
		if ( ct === undefined ) {
			ct = s.mimeType || jqXHR.getResponseHeader("Content-Type");
		}
	}

	// Check if we're dealing with a known content-type
	if ( ct ) {
		for ( type in contents ) {
			if ( contents[ type ] && contents[ type ].test( ct ) ) {
				dataTypes.unshift( type );
				break;
			}
		}
	}

	// Check to see if we have a response for the expected dataType
	if ( dataTypes[ 0 ] in responses ) {
		finalDataType = dataTypes[ 0 ];
	} else {
		// Try convertible dataTypes
		for ( type in responses ) {
			if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[0] ] ) {
				finalDataType = type;
				break;
			}
			if ( !firstDataType ) {
				firstDataType = type;
			}
		}
		// Or just use first one
		finalDataType = finalDataType || firstDataType;
	}

	// If we found a dataType
	// We add the dataType to the list if needed
	// and return the corresponding response
	if ( finalDataType ) {
		if ( finalDataType !== dataTypes[ 0 ] ) {
			dataTypes.unshift( finalDataType );
		}
		return responses[ finalDataType ];
	}
}

/* Chain conversions given the request and the original response
 * Also sets the responseXXX fields on the jqXHR instance
 */
function ajaxConvert( s, response, jqXHR, isSuccess ) {
	var conv2, current, conv, tmp, prev,
		converters = {},
		// Work with a copy of dataTypes in case we need to modify it for conversion
		dataTypes = s.dataTypes.slice();

	// Create converters map with lowercased keys
	if ( dataTypes[ 1 ] ) {
		for ( conv in s.converters ) {
			converters[ conv.toLowerCase() ] = s.converters[ conv ];
		}
	}

	current = dataTypes.shift();

	// Convert to each sequential dataType
	while ( current ) {

		if ( s.responseFields[ current ] ) {
			jqXHR[ s.responseFields[ current ] ] = response;
		}

		// Apply the dataFilter if provided
		if ( !prev && isSuccess && s.dataFilter ) {
			response = s.dataFilter( response, s.dataType );
		}

		prev = current;
		current = dataTypes.shift();

		if ( current ) {

		// There's only work to do if current dataType is non-auto
			if ( current === "*" ) {

				current = prev;

			// Convert response if prev dataType is non-auto and differs from current
			} else if ( prev !== "*" && prev !== current ) {

				// Seek a direct converter
				conv = converters[ prev + " " + current ] || converters[ "* " + current ];

				// If none found, seek a pair
				if ( !conv ) {
					for ( conv2 in converters ) {

						// If conv2 outputs current
						tmp = conv2.split( " " );
						if ( tmp[ 1 ] === current ) {

							// If prev can be converted to accepted input
							conv = converters[ prev + " " + tmp[ 0 ] ] ||
								converters[ "* " + tmp[ 0 ] ];
							if ( conv ) {
								// Condense equivalence converters
								if ( conv === true ) {
									conv = converters[ conv2 ];

								// Otherwise, insert the intermediate dataType
								} else if ( converters[ conv2 ] !== true ) {
									current = tmp[ 0 ];
									dataTypes.unshift( tmp[ 1 ] );
								}
								break;
							}
						}
					}
				}

				// Apply converter (if not an equivalence)
				if ( conv !== true ) {

					// Unless errors are allowed to bubble, catch and return them
					if ( conv && s[ "throws" ] ) {
						response = conv( response );
					} else {
						try {
							response = conv( response );
						} catch ( e ) {
							return { state: "parsererror", error: conv ? e : "No conversion from " + prev + " to " + current };
						}
					}
				}
			}
		}
	}

	return { state: "success", data: response };
}

jQuery.extend({

	// Counter for holding the number of active queries
	active: 0,

	// Last-Modified header cache for next request
	lastModified: {},
	etag: {},

	ajaxSettings: {
		url: ajaxLocation,
		type: "GET",
		isLocal: rlocalProtocol.test( ajaxLocParts[ 1 ] ),
		global: true,
		processData: true,
		async: true,
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",
		/*
		timeout: 0,
		data: null,
		dataType: null,
		username: null,
		password: null,
		cache: null,
		throws: false,
		traditional: false,
		headers: {},
		*/

		accepts: {
			"*": allTypes,
			text: "text/plain",
			html: "text/html",
			xml: "application/xml, text/xml",
			json: "application/json, text/javascript"
		},

		contents: {
			xml: /xml/,
			html: /html/,
			json: /json/
		},

		responseFields: {
			xml: "responseXML",
			text: "responseText",
			json: "responseJSON"
		},

		// Data converters
		// Keys separate source (or catchall "*") and destination types with a single space
		converters: {

			// Convert anything to text
			"* text": String,

			// Text to html (true = no transformation)
			"text html": true,

			// Evaluate text as a json expression
			"text json": jQuery.parseJSON,

			// Parse text as xml
			"text xml": jQuery.parseXML
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			url: true,
			context: true
		}
	},

	// Creates a full fledged settings object into target
	// with both ajaxSettings and settings fields.
	// If target is omitted, writes into ajaxSettings.
	ajaxSetup: function( target, settings ) {
		return settings ?

			// Building a settings object
			ajaxExtend( ajaxExtend( target, jQuery.ajaxSettings ), settings ) :

			// Extending ajaxSettings
			ajaxExtend( jQuery.ajaxSettings, target );
	},

	ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
	ajaxTransport: addToPrefiltersOrTransports( transports ),

	// Main method
	ajax: function( url, options ) {

		// If url is an object, simulate pre-1.5 signature
		if ( typeof url === "object" ) {
			options = url;
			url = undefined;
		}

		// Force options to be an object
		options = options || {};

		var transport,
			// URL without anti-cache param
			cacheURL,
			// Response headers
			responseHeadersString,
			responseHeaders,
			// timeout handle
			timeoutTimer,
			// Cross-domain detection vars
			parts,
			// To know if global events are to be dispatched
			fireGlobals,
			// Loop variable
			i,
			// Create the final options object
			s = jQuery.ajaxSetup( {}, options ),
			// Callbacks context
			callbackContext = s.context || s,
			// Context for global events is callbackContext if it is a DOM node or jQuery collection
			globalEventContext = s.context && ( callbackContext.nodeType || callbackContext.jquery ) ?
				jQuery( callbackContext ) :
				jQuery.event,
			// Deferreds
			deferred = jQuery.Deferred(),
			completeDeferred = jQuery.Callbacks("once memory"),
			// Status-dependent callbacks
			statusCode = s.statusCode || {},
			// Headers (they are sent all at once)
			requestHeaders = {},
			requestHeadersNames = {},
			// The jqXHR state
			state = 0,
			// Default abort message
			strAbort = "canceled",
			// Fake xhr
			jqXHR = {
				readyState: 0,

				// Builds headers hashtable if needed
				getResponseHeader: function( key ) {
					var match;
					if ( state === 2 ) {
						if ( !responseHeaders ) {
							responseHeaders = {};
							while ( (match = rheaders.exec( responseHeadersString )) ) {
								responseHeaders[ match[1].toLowerCase() ] = match[ 2 ];
							}
						}
						match = responseHeaders[ key.toLowerCase() ];
					}
					return match == null ? null : match;
				},

				// Raw string
				getAllResponseHeaders: function() {
					return state === 2 ? responseHeadersString : null;
				},

				// Caches the header
				setRequestHeader: function( name, value ) {
					var lname = name.toLowerCase();
					if ( !state ) {
						name = requestHeadersNames[ lname ] = requestHeadersNames[ lname ] || name;
						requestHeaders[ name ] = value;
					}
					return this;
				},

				// Overrides response content-type header
				overrideMimeType: function( type ) {
					if ( !state ) {
						s.mimeType = type;
					}
					return this;
				},

				// Status-dependent callbacks
				statusCode: function( map ) {
					var code;
					if ( map ) {
						if ( state < 2 ) {
							for ( code in map ) {
								// Lazy-add the new callback in a way that preserves old ones
								statusCode[ code ] = [ statusCode[ code ], map[ code ] ];
							}
						} else {
							// Execute the appropriate callbacks
							jqXHR.always( map[ jqXHR.status ] );
						}
					}
					return this;
				},

				// Cancel the request
				abort: function( statusText ) {
					var finalText = statusText || strAbort;
					if ( transport ) {
						transport.abort( finalText );
					}
					done( 0, finalText );
					return this;
				}
			};

		// Attach deferreds
		deferred.promise( jqXHR ).complete = completeDeferred.add;
		jqXHR.success = jqXHR.done;
		jqXHR.error = jqXHR.fail;

		// Remove hash character (#7531: and string promotion)
		// Add protocol if not provided (prefilters might expect it)
		// Handle falsy url in the settings object (#10093: consistency with old signature)
		// We also use the url parameter if available
		s.url = ( ( url || s.url || ajaxLocation ) + "" ).replace( rhash, "" )
			.replace( rprotocol, ajaxLocParts[ 1 ] + "//" );

		// Alias method option to type as per ticket #12004
		s.type = options.method || options.type || s.method || s.type;

		// Extract dataTypes list
		s.dataTypes = jQuery.trim( s.dataType || "*" ).toLowerCase().match( rnotwhite ) || [ "" ];

		// A cross-domain request is in order when we have a protocol:host:port mismatch
		if ( s.crossDomain == null ) {
			parts = rurl.exec( s.url.toLowerCase() );
			s.crossDomain = !!( parts &&
				( parts[ 1 ] !== ajaxLocParts[ 1 ] || parts[ 2 ] !== ajaxLocParts[ 2 ] ||
					( parts[ 3 ] || ( parts[ 1 ] === "http:" ? "80" : "443" ) ) !==
						( ajaxLocParts[ 3 ] || ( ajaxLocParts[ 1 ] === "http:" ? "80" : "443" ) ) )
			);
		}

		// Convert data if not already a string
		if ( s.data && s.processData && typeof s.data !== "string" ) {
			s.data = jQuery.param( s.data, s.traditional );
		}

		// Apply prefilters
		inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

		// If request was aborted inside a prefilter, stop there
		if ( state === 2 ) {
			return jqXHR;
		}

		// We can fire global events as of now if asked to
		// Don't fire events if jQuery.event is undefined in an AMD-usage scenario (#15118)
		fireGlobals = jQuery.event && s.global;

		// Watch for a new set of requests
		if ( fireGlobals && jQuery.active++ === 0 ) {
			jQuery.event.trigger("ajaxStart");
		}

		// Uppercase the type
		s.type = s.type.toUpperCase();

		// Determine if request has content
		s.hasContent = !rnoContent.test( s.type );

		// Save the URL in case we're toying with the If-Modified-Since
		// and/or If-None-Match header later on
		cacheURL = s.url;

		// More options handling for requests with no content
		if ( !s.hasContent ) {

			// If data is available, append data to url
			if ( s.data ) {
				cacheURL = ( s.url += ( rquery.test( cacheURL ) ? "&" : "?" ) + s.data );
				// #9682: remove data so that it's not used in an eventual retry
				delete s.data;
			}

			// Add anti-cache in url if needed
			if ( s.cache === false ) {
				s.url = rts.test( cacheURL ) ?

					// If there is already a '_' parameter, set its value
					cacheURL.replace( rts, "$1_=" + nonce++ ) :

					// Otherwise add one to the end
					cacheURL + ( rquery.test( cacheURL ) ? "&" : "?" ) + "_=" + nonce++;
			}
		}

		// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
		if ( s.ifModified ) {
			if ( jQuery.lastModified[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ cacheURL ] );
			}
			if ( jQuery.etag[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ cacheURL ] );
			}
		}

		// Set the correct header, if data is being sent
		if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
			jqXHR.setRequestHeader( "Content-Type", s.contentType );
		}

		// Set the Accepts header for the server, depending on the dataType
		jqXHR.setRequestHeader(
			"Accept",
			s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[0] ] ?
				s.accepts[ s.dataTypes[0] ] + ( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
				s.accepts[ "*" ]
		);

		// Check for headers option
		for ( i in s.headers ) {
			jqXHR.setRequestHeader( i, s.headers[ i ] );
		}

		// Allow custom headers/mimetypes and early abort
		if ( s.beforeSend && ( s.beforeSend.call( callbackContext, jqXHR, s ) === false || state === 2 ) ) {
			// Abort if not done already and return
			return jqXHR.abort();
		}

		// Aborting is no longer a cancellation
		strAbort = "abort";

		// Install callbacks on deferreds
		for ( i in { success: 1, error: 1, complete: 1 } ) {
			jqXHR[ i ]( s[ i ] );
		}

		// Get transport
		transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

		// If no transport, we auto-abort
		if ( !transport ) {
			done( -1, "No Transport" );
		} else {
			jqXHR.readyState = 1;

			// Send global event
			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
			}
			// Timeout
			if ( s.async && s.timeout > 0 ) {
				timeoutTimer = setTimeout(function() {
					jqXHR.abort("timeout");
				}, s.timeout );
			}

			try {
				state = 1;
				transport.send( requestHeaders, done );
			} catch ( e ) {
				// Propagate exception as error if not done
				if ( state < 2 ) {
					done( -1, e );
				// Simply rethrow otherwise
				} else {
					throw e;
				}
			}
		}

		// Callback for when everything is done
		function done( status, nativeStatusText, responses, headers ) {
			var isSuccess, success, error, response, modified,
				statusText = nativeStatusText;

			// Called once
			if ( state === 2 ) {
				return;
			}

			// State is "done" now
			state = 2;

			// Clear timeout if it exists
			if ( timeoutTimer ) {
				clearTimeout( timeoutTimer );
			}

			// Dereference transport for early garbage collection
			// (no matter how long the jqXHR object will be used)
			transport = undefined;

			// Cache response headers
			responseHeadersString = headers || "";

			// Set readyState
			jqXHR.readyState = status > 0 ? 4 : 0;

			// Determine if successful
			isSuccess = status >= 200 && status < 300 || status === 304;

			// Get response data
			if ( responses ) {
				response = ajaxHandleResponses( s, jqXHR, responses );
			}

			// Convert no matter what (that way responseXXX fields are always set)
			response = ajaxConvert( s, response, jqXHR, isSuccess );

			// If successful, handle type chaining
			if ( isSuccess ) {

				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
				if ( s.ifModified ) {
					modified = jqXHR.getResponseHeader("Last-Modified");
					if ( modified ) {
						jQuery.lastModified[ cacheURL ] = modified;
					}
					modified = jqXHR.getResponseHeader("etag");
					if ( modified ) {
						jQuery.etag[ cacheURL ] = modified;
					}
				}

				// if no content
				if ( status === 204 || s.type === "HEAD" ) {
					statusText = "nocontent";

				// if not modified
				} else if ( status === 304 ) {
					statusText = "notmodified";

				// If we have data, let's convert it
				} else {
					statusText = response.state;
					success = response.data;
					error = response.error;
					isSuccess = !error;
				}
			} else {
				// Extract error from statusText and normalize for non-aborts
				error = statusText;
				if ( status || !statusText ) {
					statusText = "error";
					if ( status < 0 ) {
						status = 0;
					}
				}
			}

			// Set data for the fake xhr object
			jqXHR.status = status;
			jqXHR.statusText = ( nativeStatusText || statusText ) + "";

			// Success/Error
			if ( isSuccess ) {
				deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
			} else {
				deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
			}

			// Status-dependent callbacks
			jqXHR.statusCode( statusCode );
			statusCode = undefined;

			if ( fireGlobals ) {
				globalEventContext.trigger( isSuccess ? "ajaxSuccess" : "ajaxError",
					[ jqXHR, s, isSuccess ? success : error ] );
			}

			// Complete
			completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );
				// Handle the global AJAX counter
				if ( !( --jQuery.active ) ) {
					jQuery.event.trigger("ajaxStop");
				}
			}
		}

		return jqXHR;
	},

	getJSON: function( url, data, callback ) {
		return jQuery.get( url, data, callback, "json" );
	},

	getScript: function( url, callback ) {
		return jQuery.get( url, undefined, callback, "script" );
	}
});

jQuery.each( [ "get", "post" ], function( i, method ) {
	jQuery[ method ] = function( url, data, callback, type ) {
		// Shift arguments if data argument was omitted
		if ( jQuery.isFunction( data ) ) {
			type = type || callback;
			callback = data;
			data = undefined;
		}

		return jQuery.ajax({
			url: url,
			type: method,
			dataType: type,
			data: data,
			success: callback
		});
	};
});


jQuery._evalUrl = function( url ) {
	return jQuery.ajax({
		url: url,
		type: "GET",
		dataType: "script",
		async: false,
		global: false,
		"throws": true
	});
};


jQuery.fn.extend({
	wrapAll: function( html ) {
		var wrap;

		if ( jQuery.isFunction( html ) ) {
			return this.each(function( i ) {
				jQuery( this ).wrapAll( html.call(this, i) );
			});
		}

		if ( this[ 0 ] ) {

			// The elements to wrap the target around
			wrap = jQuery( html, this[ 0 ].ownerDocument ).eq( 0 ).clone( true );

			if ( this[ 0 ].parentNode ) {
				wrap.insertBefore( this[ 0 ] );
			}

			wrap.map(function() {
				var elem = this;

				while ( elem.firstElementChild ) {
					elem = elem.firstElementChild;
				}

				return elem;
			}).append( this );
		}

		return this;
	},

	wrapInner: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function( i ) {
				jQuery( this ).wrapInner( html.call(this, i) );
			});
		}

		return this.each(function() {
			var self = jQuery( this ),
				contents = self.contents();

			if ( contents.length ) {
				contents.wrapAll( html );

			} else {
				self.append( html );
			}
		});
	},

	wrap: function( html ) {
		var isFunction = jQuery.isFunction( html );

		return this.each(function( i ) {
			jQuery( this ).wrapAll( isFunction ? html.call(this, i) : html );
		});
	},

	unwrap: function() {
		return this.parent().each(function() {
			if ( !jQuery.nodeName( this, "body" ) ) {
				jQuery( this ).replaceWith( this.childNodes );
			}
		}).end();
	}
});


jQuery.expr.filters.hidden = function( elem ) {
	// Support: Opera <= 12.12
	// Opera reports offsetWidths and offsetHeights less than zero on some elements
	return elem.offsetWidth <= 0 && elem.offsetHeight <= 0;
};
jQuery.expr.filters.visible = function( elem ) {
	return !jQuery.expr.filters.hidden( elem );
};




var r20 = /%20/g,
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
	rsubmittable = /^(?:input|select|textarea|keygen)/i;

function buildParams( prefix, obj, traditional, add ) {
	var name;

	if ( jQuery.isArray( obj ) ) {
		// Serialize array item.
		jQuery.each( obj, function( i, v ) {
			if ( traditional || rbracket.test( prefix ) ) {
				// Treat each array item as a scalar.
				add( prefix, v );

			} else {
				// Item is non-scalar (array or object), encode its numeric index.
				buildParams( prefix + "[" + ( typeof v === "object" ? i : "" ) + "]", v, traditional, add );
			}
		});

	} else if ( !traditional && jQuery.type( obj ) === "object" ) {
		// Serialize object item.
		for ( name in obj ) {
			buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
		}

	} else {
		// Serialize scalar item.
		add( prefix, obj );
	}
}

// Serialize an array of form elements or a set of
// key/values into a query string
jQuery.param = function( a, traditional ) {
	var prefix,
		s = [],
		add = function( key, value ) {
			// If value is a function, invoke it and return its value
			value = jQuery.isFunction( value ) ? value() : ( value == null ? "" : value );
			s[ s.length ] = encodeURIComponent( key ) + "=" + encodeURIComponent( value );
		};

	// Set traditional to true for jQuery <= 1.3.2 behavior.
	if ( traditional === undefined ) {
		traditional = jQuery.ajaxSettings && jQuery.ajaxSettings.traditional;
	}

	// If an array was passed in, assume that it is an array of form elements.
	if ( jQuery.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {
		// Serialize the form elements
		jQuery.each( a, function() {
			add( this.name, this.value );
		});

	} else {
		// If traditional, encode the "old" way (the way 1.3.2 or older
		// did it), otherwise encode params recursively.
		for ( prefix in a ) {
			buildParams( prefix, a[ prefix ], traditional, add );
		}
	}

	// Return the resulting serialization
	return s.join( "&" ).replace( r20, "+" );
};

jQuery.fn.extend({
	serialize: function() {
		return jQuery.param( this.serializeArray() );
	},
	serializeArray: function() {
		return this.map(function() {
			// Can add propHook for "elements" to filter or add form elements
			var elements = jQuery.prop( this, "elements" );
			return elements ? jQuery.makeArray( elements ) : this;
		})
		.filter(function() {
			var type = this.type;

			// Use .is( ":disabled" ) so that fieldset[disabled] works
			return this.name && !jQuery( this ).is( ":disabled" ) &&
				rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
				( this.checked || !rcheckableType.test( type ) );
		})
		.map(function( i, elem ) {
			var val = jQuery( this ).val();

			return val == null ?
				null :
				jQuery.isArray( val ) ?
					jQuery.map( val, function( val ) {
						return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
					}) :
					{ name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
		}).get();
	}
});


jQuery.ajaxSettings.xhr = function() {
	try {
		return new XMLHttpRequest();
	} catch( e ) {}
};

var xhrId = 0,
	xhrCallbacks = {},
	xhrSuccessStatus = {
		// file protocol always yields status code 0, assume 200
		0: 200,
		// Support: IE9
		// #1450: sometimes IE returns 1223 when it should be 204
		1223: 204
	},
	xhrSupported = jQuery.ajaxSettings.xhr();

// Support: IE9
// Open requests must be manually aborted on unload (#5280)
// See https://support.microsoft.com/kb/2856746 for more info
if ( window.attachEvent ) {
	window.attachEvent( "onunload", function() {
		for ( var key in xhrCallbacks ) {
			xhrCallbacks[ key ]();
		}
	});
}

support.cors = !!xhrSupported && ( "withCredentials" in xhrSupported );
support.ajax = xhrSupported = !!xhrSupported;

jQuery.ajaxTransport(function( options ) {
	var callback;

	// Cross domain only allowed if supported through XMLHttpRequest
	if ( support.cors || xhrSupported && !options.crossDomain ) {
		return {
			send: function( headers, complete ) {
				var i,
					xhr = options.xhr(),
					id = ++xhrId;

				xhr.open( options.type, options.url, options.async, options.username, options.password );

				// Apply custom fields if provided
				if ( options.xhrFields ) {
					for ( i in options.xhrFields ) {
						xhr[ i ] = options.xhrFields[ i ];
					}
				}

				// Override mime type if needed
				if ( options.mimeType && xhr.overrideMimeType ) {
					xhr.overrideMimeType( options.mimeType );
				}

				// X-Requested-With header
				// For cross-domain requests, seeing as conditions for a preflight are
				// akin to a jigsaw puzzle, we simply never set it to be sure.
				// (it can always be set on a per-request basis or even using ajaxSetup)
				// For same-domain requests, won't change header if already provided.
				if ( !options.crossDomain && !headers["X-Requested-With"] ) {
					headers["X-Requested-With"] = "XMLHttpRequest";
				}

				// Set headers
				for ( i in headers ) {
					xhr.setRequestHeader( i, headers[ i ] );
				}

				// Callback
				callback = function( type ) {
					return function() {
						if ( callback ) {
							delete xhrCallbacks[ id ];
							callback = xhr.onload = xhr.onerror = null;

							if ( type === "abort" ) {
								xhr.abort();
							} else if ( type === "error" ) {
								complete(
									// file: protocol always yields status 0; see #8605, #14207
									xhr.status,
									xhr.statusText
								);
							} else {
								complete(
									xhrSuccessStatus[ xhr.status ] || xhr.status,
									xhr.statusText,
									// Support: IE9
									// Accessing binary-data responseText throws an exception
									// (#11426)
									typeof xhr.responseText === "string" ? {
										text: xhr.responseText
									} : undefined,
									xhr.getAllResponseHeaders()
								);
							}
						}
					};
				};

				// Listen to events
				xhr.onload = callback();
				xhr.onerror = callback("error");

				// Create the abort callback
				callback = xhrCallbacks[ id ] = callback("abort");

				try {
					// Do send the request (this may raise an exception)
					xhr.send( options.hasContent && options.data || null );
				} catch ( e ) {
					// #14683: Only rethrow if this hasn't been notified as an error yet
					if ( callback ) {
						throw e;
					}
				}
			},

			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
});




// Install script dataType
jQuery.ajaxSetup({
	accepts: {
		script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"
	},
	contents: {
		script: /(?:java|ecma)script/
	},
	converters: {
		"text script": function( text ) {
			jQuery.globalEval( text );
			return text;
		}
	}
});

// Handle cache's special case and crossDomain
jQuery.ajaxPrefilter( "script", function( s ) {
	if ( s.cache === undefined ) {
		s.cache = false;
	}
	if ( s.crossDomain ) {
		s.type = "GET";
	}
});

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function( s ) {
	// This transport only deals with cross domain requests
	if ( s.crossDomain ) {
		var script, callback;
		return {
			send: function( _, complete ) {
				script = jQuery("<script>").prop({
					async: true,
					charset: s.scriptCharset,
					src: s.url
				}).on(
					"load error",
					callback = function( evt ) {
						script.remove();
						callback = null;
						if ( evt ) {
							complete( evt.type === "error" ? 404 : 200, evt.type );
						}
					}
				);
				document.head.appendChild( script[ 0 ] );
			},
			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
});




var oldCallbacks = [],
	rjsonp = /(=)\?(?=&|$)|\?\?/;

// Default jsonp settings
jQuery.ajaxSetup({
	jsonp: "callback",
	jsonpCallback: function() {
		var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( nonce++ ) );
		this[ callback ] = true;
		return callback;
	}
});

// Detect, normalize options and install callbacks for jsonp requests
jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

	var callbackName, overwritten, responseContainer,
		jsonProp = s.jsonp !== false && ( rjsonp.test( s.url ) ?
			"url" :
			typeof s.data === "string" && !( s.contentType || "" ).indexOf("application/x-www-form-urlencoded") && rjsonp.test( s.data ) && "data"
		);

	// Handle iff the expected data type is "jsonp" or we have a parameter to set
	if ( jsonProp || s.dataTypes[ 0 ] === "jsonp" ) {

		// Get callback name, remembering preexisting value associated with it
		callbackName = s.jsonpCallback = jQuery.isFunction( s.jsonpCallback ) ?
			s.jsonpCallback() :
			s.jsonpCallback;

		// Insert callback into url or form data
		if ( jsonProp ) {
			s[ jsonProp ] = s[ jsonProp ].replace( rjsonp, "$1" + callbackName );
		} else if ( s.jsonp !== false ) {
			s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
		}

		// Use data converter to retrieve json after script execution
		s.converters["script json"] = function() {
			if ( !responseContainer ) {
				jQuery.error( callbackName + " was not called" );
			}
			return responseContainer[ 0 ];
		};

		// force json dataType
		s.dataTypes[ 0 ] = "json";

		// Install callback
		overwritten = window[ callbackName ];
		window[ callbackName ] = function() {
			responseContainer = arguments;
		};

		// Clean-up function (fires after converters)
		jqXHR.always(function() {
			// Restore preexisting value
			window[ callbackName ] = overwritten;

			// Save back as free
			if ( s[ callbackName ] ) {
				// make sure that re-using the options doesn't screw things around
				s.jsonpCallback = originalSettings.jsonpCallback;

				// save the callback name for future use
				oldCallbacks.push( callbackName );
			}

			// Call if it was a function and we have a response
			if ( responseContainer && jQuery.isFunction( overwritten ) ) {
				overwritten( responseContainer[ 0 ] );
			}

			responseContainer = overwritten = undefined;
		});

		// Delegate to script
		return "script";
	}
});




// data: string of html
// context (optional): If specified, the fragment will be created in this context, defaults to document
// keepScripts (optional): If true, will include scripts passed in the html string
jQuery.parseHTML = function( data, context, keepScripts ) {
	if ( !data || typeof data !== "string" ) {
		return null;
	}
	if ( typeof context === "boolean" ) {
		keepScripts = context;
		context = false;
	}
	context = context || document;

	var parsed = rsingleTag.exec( data ),
		scripts = !keepScripts && [];

	// Single tag
	if ( parsed ) {
		return [ context.createElement( parsed[1] ) ];
	}

	parsed = jQuery.buildFragment( [ data ], context, scripts );

	if ( scripts && scripts.length ) {
		jQuery( scripts ).remove();
	}

	return jQuery.merge( [], parsed.childNodes );
};


// Keep a copy of the old load method
var _load = jQuery.fn.load;

/**
 * Load a url into a page
 */
jQuery.fn.load = function( url, params, callback ) {
	if ( typeof url !== "string" && _load ) {
		return _load.apply( this, arguments );
	}

	var selector, type, response,
		self = this,
		off = url.indexOf(" ");

	if ( off >= 0 ) {
		selector = jQuery.trim( url.slice( off ) );
		url = url.slice( 0, off );
	}

	// If it's a function
	if ( jQuery.isFunction( params ) ) {

		// We assume that it's the callback
		callback = params;
		params = undefined;

	// Otherwise, build a param string
	} else if ( params && typeof params === "object" ) {
		type = "POST";
	}

	// If we have elements to modify, make the request
	if ( self.length > 0 ) {
		jQuery.ajax({
			url: url,

			// if "type" variable is undefined, then "GET" method will be used
			type: type,
			dataType: "html",
			data: params
		}).done(function( responseText ) {

			// Save response for use in complete callback
			response = arguments;

			self.html( selector ?

				// If a selector was specified, locate the right elements in a dummy div
				// Exclude scripts to avoid IE 'Permission Denied' errors
				jQuery("<div>").append( jQuery.parseHTML( responseText ) ).find( selector ) :

				// Otherwise use the full result
				responseText );

		}).complete( callback && function( jqXHR, status ) {
			self.each( callback, response || [ jqXHR.responseText, status, jqXHR ] );
		});
	}

	return this;
};




// Attach a bunch of functions for handling common AJAX events
jQuery.each( [ "ajaxStart", "ajaxStop", "ajaxComplete", "ajaxError", "ajaxSuccess", "ajaxSend" ], function( i, type ) {
	jQuery.fn[ type ] = function( fn ) {
		return this.on( type, fn );
	};
});




jQuery.expr.filters.animated = function( elem ) {
	return jQuery.grep(jQuery.timers, function( fn ) {
		return elem === fn.elem;
	}).length;
};




var docElem = window.document.documentElement;

/**
 * Gets a window from an element
 */
function getWindow( elem ) {
	return jQuery.isWindow( elem ) ? elem : elem.nodeType === 9 && elem.defaultView;
}

jQuery.offset = {
	setOffset: function( elem, options, i ) {
		var curPosition, curLeft, curCSSTop, curTop, curOffset, curCSSLeft, calculatePosition,
			position = jQuery.css( elem, "position" ),
			curElem = jQuery( elem ),
			props = {};

		// Set position first, in-case top/left are set even on static elem
		if ( position === "static" ) {
			elem.style.position = "relative";
		}

		curOffset = curElem.offset();
		curCSSTop = jQuery.css( elem, "top" );
		curCSSLeft = jQuery.css( elem, "left" );
		calculatePosition = ( position === "absolute" || position === "fixed" ) &&
			( curCSSTop + curCSSLeft ).indexOf("auto") > -1;

		// Need to be able to calculate position if either
		// top or left is auto and position is either absolute or fixed
		if ( calculatePosition ) {
			curPosition = curElem.position();
			curTop = curPosition.top;
			curLeft = curPosition.left;

		} else {
			curTop = parseFloat( curCSSTop ) || 0;
			curLeft = parseFloat( curCSSLeft ) || 0;
		}

		if ( jQuery.isFunction( options ) ) {
			options = options.call( elem, i, curOffset );
		}

		if ( options.top != null ) {
			props.top = ( options.top - curOffset.top ) + curTop;
		}
		if ( options.left != null ) {
			props.left = ( options.left - curOffset.left ) + curLeft;
		}

		if ( "using" in options ) {
			options.using.call( elem, props );

		} else {
			curElem.css( props );
		}
	}
};

jQuery.fn.extend({
	offset: function( options ) {
		if ( arguments.length ) {
			return options === undefined ?
				this :
				this.each(function( i ) {
					jQuery.offset.setOffset( this, options, i );
				});
		}

		var docElem, win,
			elem = this[ 0 ],
			box = { top: 0, left: 0 },
			doc = elem && elem.ownerDocument;

		if ( !doc ) {
			return;
		}

		docElem = doc.documentElement;

		// Make sure it's not a disconnected DOM node
		if ( !jQuery.contains( docElem, elem ) ) {
			return box;
		}

		// Support: BlackBerry 5, iOS 3 (original iPhone)
		// If we don't have gBCR, just use 0,0 rather than error
		if ( typeof elem.getBoundingClientRect !== strundefined ) {
			box = elem.getBoundingClientRect();
		}
		win = getWindow( doc );
		return {
			top: box.top + win.pageYOffset - docElem.clientTop,
			left: box.left + win.pageXOffset - docElem.clientLeft
		};
	},

	position: function() {
		if ( !this[ 0 ] ) {
			return;
		}

		var offsetParent, offset,
			elem = this[ 0 ],
			parentOffset = { top: 0, left: 0 };

		// Fixed elements are offset from window (parentOffset = {top:0, left: 0}, because it is its only offset parent
		if ( jQuery.css( elem, "position" ) === "fixed" ) {
			// Assume getBoundingClientRect is there when computed position is fixed
			offset = elem.getBoundingClientRect();

		} else {
			// Get *real* offsetParent
			offsetParent = this.offsetParent();

			// Get correct offsets
			offset = this.offset();
			if ( !jQuery.nodeName( offsetParent[ 0 ], "html" ) ) {
				parentOffset = offsetParent.offset();
			}

			// Add offsetParent borders
			parentOffset.top += jQuery.css( offsetParent[ 0 ], "borderTopWidth", true );
			parentOffset.left += jQuery.css( offsetParent[ 0 ], "borderLeftWidth", true );
		}

		// Subtract parent offsets and element margins
		return {
			top: offset.top - parentOffset.top - jQuery.css( elem, "marginTop", true ),
			left: offset.left - parentOffset.left - jQuery.css( elem, "marginLeft", true )
		};
	},

	offsetParent: function() {
		return this.map(function() {
			var offsetParent = this.offsetParent || docElem;

			while ( offsetParent && ( !jQuery.nodeName( offsetParent, "html" ) && jQuery.css( offsetParent, "position" ) === "static" ) ) {
				offsetParent = offsetParent.offsetParent;
			}

			return offsetParent || docElem;
		});
	}
});

// Create scrollLeft and scrollTop methods
jQuery.each( { scrollLeft: "pageXOffset", scrollTop: "pageYOffset" }, function( method, prop ) {
	var top = "pageYOffset" === prop;

	jQuery.fn[ method ] = function( val ) {
		return access( this, function( elem, method, val ) {
			var win = getWindow( elem );

			if ( val === undefined ) {
				return win ? win[ prop ] : elem[ method ];
			}

			if ( win ) {
				win.scrollTo(
					!top ? val : window.pageXOffset,
					top ? val : window.pageYOffset
				);

			} else {
				elem[ method ] = val;
			}
		}, method, val, arguments.length, null );
	};
});

// Support: Safari<7+, Chrome<37+
// Add the top/left cssHooks using jQuery.fn.position
// Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
// Blink bug: https://code.google.com/p/chromium/issues/detail?id=229280
// getComputedStyle returns percent when specified for top/left/bottom/right;
// rather than make the css module depend on the offset module, just check for it here
jQuery.each( [ "top", "left" ], function( i, prop ) {
	jQuery.cssHooks[ prop ] = addGetHookIf( support.pixelPosition,
		function( elem, computed ) {
			if ( computed ) {
				computed = curCSS( elem, prop );
				// If curCSS returns percentage, fallback to offset
				return rnumnonpx.test( computed ) ?
					jQuery( elem ).position()[ prop ] + "px" :
					computed;
			}
		}
	);
});


// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
	jQuery.each( { padding: "inner" + name, content: type, "": "outer" + name }, function( defaultExtra, funcName ) {
		// Margin is only for outerHeight, outerWidth
		jQuery.fn[ funcName ] = function( margin, value ) {
			var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
				extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

			return access( this, function( elem, type, value ) {
				var doc;

				if ( jQuery.isWindow( elem ) ) {
					// As of 5/8/2012 this will yield incorrect results for Mobile Safari, but there
					// isn't a whole lot we can do. See pull request at this URL for discussion:
					// https://github.com/jquery/jquery/pull/764
					return elem.document.documentElement[ "client" + name ];
				}

				// Get document width or height
				if ( elem.nodeType === 9 ) {
					doc = elem.documentElement;

					// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height],
					// whichever is greatest
					return Math.max(
						elem.body[ "scroll" + name ], doc[ "scroll" + name ],
						elem.body[ "offset" + name ], doc[ "offset" + name ],
						doc[ "client" + name ]
					);
				}

				return value === undefined ?
					// Get width or height on the element, requesting but not forcing parseFloat
					jQuery.css( elem, type, extra ) :

					// Set width or height on the element
					jQuery.style( elem, type, value, extra );
			}, type, chainable ? margin : undefined, chainable, null );
		};
	});
});


// The number of elements contained in the matched element set
jQuery.fn.size = function() {
	return this.length;
};

jQuery.fn.andSelf = jQuery.fn.addBack;




// Register as a named AMD module, since jQuery can be concatenated with other
// files that may use define, but not via a proper concatenation script that
// understands anonymous AMD modules. A named AMD is safest and most robust
// way to register. Lowercase jquery is used because AMD module names are
// derived from file names, and jQuery is normally delivered in a lowercase
// file name. Do this after creating the global so that if an AMD module wants
// to call noConflict to hide this version of jQuery, it will work.

// Note that for maximum portability, libraries that are not jQuery should
// declare themselves as anonymous modules, and avoid setting a global if an
// AMD loader is present. jQuery is a special case. For more information, see
// https://github.com/jrburke/requirejs/wiki/Updating-existing-libraries#wiki-anon

if ( typeof define === "function" && define.amd ) {
	define( "jquery", [], function() {
		return jQuery;
	});
}




var
	// Map over jQuery in case of overwrite
	_jQuery = window.jQuery,

	// Map over the $ in case of overwrite
	_$ = window.$;

jQuery.noConflict = function( deep ) {
	if ( window.$ === jQuery ) {
		window.$ = _$;
	}

	if ( deep && window.jQuery === jQuery ) {
		window.jQuery = _jQuery;
	}

	return jQuery;
};

// Expose jQuery and $ identifiers, even in AMD
// (#7102#comment:10, https://github.com/jquery/jquery/pull/557)
// and CommonJS for browser emulators (#13566)
if ( typeof noGlobal === strundefined ) {
	window.jQuery = window.$ = jQuery;
}




return jQuery;

}));

},{}],11:[function(require,module,exports){
//IMPORTS
var GA = require("./GA");
var Converter = require("./Converter");
var ABCJS = require("ABCJS");
var Player = require("./Player");
var $ = require("jquery");
var PubSub = require("./lib/PubSub");
var Templates = require("./Templates");
var Timer = require("./Timer");
var Config = require("./Config");

//VARIABLES
var population = null;
var current = null;
var _elKeys = ["individuals", "abc-content", "play", "stop", "generate", "config"];
var $els = {};

function applySubscriptions() {
	PubSub.subscribe("render", render);
	PubSub.subscribe("rebind", rebind);
}

function init() {
	Timer.start("(Cache DOM elements) Timing");
	_cacheEls();
	Timer.end();
	
	
	//Config.init($els["config"]);
	applySubscriptions();
	PubSub.publish("rebind");
}

function generatePopulation( config ) {
	Timer.start("(Generate Population) Timing");
	population = GA.run(config);

	population = population.map(function(item) {
		item.abc = Converter.convert(item.content());
		return item;
	});

	Timer.end();
	PubSub.publish("render");
	PubSub.publish("rebind");
}

function _cacheEls() {
	_elKeys.forEach(function( item ) {
		var $el = $("[data-id='" + item + "']");
		
		if ( !$el || $el.length === 0 ) {
			return;
		}
		
		$els[item] = $el;
	});
}

function render() {
	
	var dom = [];
	
	population.forEach(function( item, index ) {
		var data = {
			index: index,
			fitness: item.fitness()
		};
		var $html = Templates["individual"](data);
		dom.push($html);
	});
	
	$els["individuals"].empty();
	$els["individuals"].append(dom);
	
}

function rebind() {
	var callbackBindings = $("[data-type='callback']");
	
	$els["individuals"].off("click").on("click", function() {
		callbackBindings.removeClass("active");
	});
	
	$els["play"].off("click").on("click", function() {
		play();
	});
	
	$els["stop"].off("click").on("click", function() {
		stop();
	});
	
	$els["generate"].off("click").on("click", function() {
		generatePopulation(/*Config.collect()*/);
	});
	
	callbackBindings.off('click').on('click', function(e) {
		var $this = $(this);
		
		var callback = $this.data("callback");
		
				
		switch( callback ) {
			case "select":
				e.stopPropagation();
				var id = $this.data("id");

				if ( id === null || id === undefined ) {
					return;
				}
				
				callbackBindings.removeClass("active");
				$this.addClass("active");
				select(id);
				abc();
				break;
		}
	});
}

function abc() {
	if ( !current ) {
		return false;
	}
	
	renderScores(current.abc);
}

function play() {
	Player.stop();
	if ( !current ) {
		return false;
	}
	console.log("play");
	Player.play(current.content());
}

function stop() {
	console.log("stopped");
	Player.stop();
}

function renderScores( abcScores ) {
	var $el = $els["abc-content"];
	$el.empty();
	console.log(abcScores);
	ABCJS.renderAbc($el.get(0), abcScores, null, {
		scale: 0.7
	});
}

function select( id ) {
	if ( !population[id] ) {
		throw new TypeError("id should be index in array: " + id + " not found.");
	}
	
	current = population[id];
	current.id = id;
}

module.exports = {
	init: init,
	play: play,
	stop: stop,
	select: select
};

},{"./Config":12,"./Converter":13,"./GA":14,"./Player":17,"./Templates":21,"./Timer":22,"./lib/PubSub":23,"ABCJS":24,"jquery":10}],12:[function(require,module,exports){
var PubSub = require("./lib/PubSub");
var Templates = require("./Templates");
var validate = require("./validate");
var $ = require("jquery");
var utils = require("./utils");


var localConfig = {
	items: [
		{
			"field": "maxIterations",
			"description": "Max count of iterations in GA",
			"type": "number",
			"additionalAttributes": "max=1000 min=0"
		},
		{
			"field": "deathLimit",
			"description": "Threshold for selection",
			"type": "number",
			"additionalAttributes": "max=1 min=0"
		},
		{
			"field": "count",
			"description": "Count of individual in population",
			"type": "number",
			"additionalAttributes": "max=1000 min=0"
		},
		{
			"field": "threshold",
			"description": "Threshold for Algorithm",
			"type": "number",
			"additionalAttributes": "max=1 min=0"
		}
	]
};


var $host = null;

function generateHTML() {
	return Templates["config"](localConfig);
}

function collect() {
	var result = {};
	$host.find("[data-config-field]").each(function( index, element ) {
		var field, info, value, $element;
		
		$element = $(element);
		field = $element.data("config-field");
		info = utils.array.findObjectByKey(localConfig.items, "field", field);
		
		if ( !info ) {
			return void(0);
		}
		
		value = $element.val();
		
		switch( info.type ) {
			case "number":
				value = +value;
				break;
			case "boolean":
				value = !!value;
				break;
			case "string":
				value = "" + value;
				break;
		}

		//value = validate(value, info.validation);
		
		result[field] = value;
	});
	
	return result;
}

var Config = {
	init: function( $el ) {
		$host = $el;
		$host.empty();
		$host.append(generateHTML());
		PubSub.publish("Config/inited");
	},
	
	collect: collect
};


module.exports = Config;
},{"./Templates":21,"./lib/PubSub":23,"./utils":28,"./validate":29,"jquery":10}],13:[function(require,module,exports){
/*
!assumptations 
1/8 as a default length
c maj as a default key
*/


var n = "\n";
var defaultHeader =  "X:1" + n +
	"T:" + " Abc" +n +
	"M:4/4" + n + 
	"C:GA" + n +
	"K:D" + n + 
	"L:1/8" + n;

var referenceTable = {
	0: "Z",
	1: "C",
	2: "D",
	3: "E",
	4: "F",
	5: "G",
	6: "A",
	7: "B",
	8: "c",
	9: "d",
	10: "e",
	11: "f",
	12: "g",
	13: "a",
	14: "b"
}; 

function createNote( noteIndex, size ) {
	if ( noteIndex == null ) {
		return "";
	}
	return referenceTable[noteIndex] + size;
}

function convert( source ) {
	
	var answer = defaultHeader;
	
	var previousNote = null;
	var size = 1;
	
	for ( var i = 0, l = source.length; i < l; i++ ) {
		var item = source[i];
		
		if ( item === -1 ) {
			size++;
		} else {
			answer += createNote(previousNote, size);
			previousNote = item;
			size = 1;
		}
		
		//last note
		if ( i === source.length - 1 ) {
			answer += createNote(previousNote, size);
		}
		
		if ( i &&  i%8 === 0 ) {
			answer += "|";
		}
	}
	return answer;
} 

module.exports = {
    convert: convert
};
},{}],14:[function(require,module,exports){
var IndividualFactory = require('./IndividualFactory');
var Reporter = require('./Reporter');
var REFERENCE_INDIVIDUAL = require('./REFERENCE_INDIVIDUAL');
var $ = require("jquery");

var GA = (function( IndividualFactory, Reporter, referenceIndividual ) {

    var options = {
        deathLimit: 0.3,
        count: 20,
		threshold: 0.8,
        maxIterations: 100
    };

    var population = [];
    var bestGuys = [];



    //-----------------------------
    //  1. Initial Population
    //-----------------------------
    function _createInitialPopulation() {
        population = [];

        for ( var i = 0; i < options.count; i++ ) {
            population.push(IndividualFactory.create(referenceIndividual));    
        }
    }



    //-----------------------------
    //  2. Mutate/Crossover
    //-----------------------------
    function _crossover() {
        population.forEach(function( item, index, array ) {
            var neightbour = (array.length === population.length)? array[0] : array[index + 1];
            item.crossover(neightbour);
        });
    }

    function _mutate() {
        population.forEach(function( item ) {
            item.mutate();
        });
    }



    //-----------------------------
    //  3. Selection
    //-----------------------------
    function _selection() {
        bestGuys = population.filter(function( item ) {
			var itemFitness = item.fitness();
			return itemFitness > options.deathLimit;
        });
    }



    //-----------------------------
    //  4. Create New Population
    //-----------------------------
    function _createNewPopulation() {
        var newPopulation = [];

        for ( var i = 0, l = (options.count - bestGuys.length); i < l; i++ ) {
            newPopulation.push(IndividualFactory.create(referenceIndividual));
        }

        population = bestGuys.concat(newPopulation);
    }



    //-----------------------------
    //  5. Finish!
    //-----------------------------
    function _isDone() {
        return population.some(function( item ) {
			return !item.fitness() && item.fitness() > options.threshold;
        });
    }

    function run( preferences ) {
		options = $.extend({}, options, preferences);
		
        var i = 0;
		
        _createInitialPopulation();

        do {
            _mutate();
            _crossover();
            _selection();
            _createNewPopulation();
			i++;
			
			console.log("iteration: " + i);
			
        } while ( !_isDone() && i < options.maxIterations );
		
		population.unshift(IndividualFactory.create(referenceIndividual));
		
        return population;
    }

    return {
        run: run
    };

}( IndividualFactory, Reporter, REFERENCE_INDIVIDUAL ));

module.exports = GA;
},{"./IndividualFactory":16,"./REFERENCE_INDIVIDUAL":18,"./Reporter":19,"jquery":10}],15:[function(require,module,exports){
var Mutations = require("./mutations/Mutations");
var Utils = require("./utils");

// 1. Init
// 2. Mutate/Crossover      -|
// 3. Selection              |
// 4. Create new population -|
// 5. Is done -> Finish!
var Individual = function( referenceIndividualContent )  {
	
	var _reference = referenceIndividualContent;
	var _content = _reference.slice() || [];

    function mutate() {
		var mutateFunction = Utils.obj.randomElement(Mutations);
		_content = mutateFunction(_content);
    }
    

    function crossover( someone ) {
        var someoneGens = someone.content();
        var myGens = content();
		
        for ( var i = 0, l = _content.length; i < l; i++ ) {
            var item = (Math.random() > 0.5)? myGens[i] : someoneGens[i];
            _content[i] = item; 
        }
    }

    function content() {
        return _content;
    }

    function fitness() {
		/*1) Fitness by reference individual*/
		/* assume check notes or structure ([14,]-1,-1,-1 == [15,]-1,-1,-1 ) */
		var length = _content.length;
		var weight = 0;
		
		for ( var i = 0; i < length; i++ ) {
			weight += +(_content[i] === _reference[i]);
		}
		
		return weight/length;
    }
 
    /* PUBLIC INTERFACE */
    this.crossover = crossover;
    this.mutate = mutate;
    this.content = content;
    this.fitness = fitness;
};

module.exports = Individual;
},{"./mutations/Mutations":25,"./utils":28}],16:[function(require,module,exports){
var Individual = require("./Individual");

module.exports = {
    create: function( params ) {
        return new Individual(params);
    }
};

},{"./Individual":15}],17:[function(require,module,exports){
var Synth = require("./Synth");

var Player = (function(Synth) {

    var INTERVAL = 500;
    var _cursor = 0;
    var _content = [];
    var _stopped = true;
	var _timerId = null;

    var _options = {
        tempo: 128,
        grid: 8,
        scale: "Cmaj",
        octaves: 2
    };

    var _referenceTable = {
        0: false
    };

    function options() {
        switch ( arguments.length ) {
            case 0:
                return;

            case 1:
                if ( typeof arguments[0] === "object" ) {
                    _options = arguments[0];
                } 
                break;

            case 2:
                _options[arguments[0]] = arguments[1];
                break;
        }
        _prepareReferenceTable();
    }

    function _prepareReferenceTable() {
        _referenceTable = {
			"-1": true,
            0: false,
            1: 261.66, //C
            2: 293.66, //D
            3: 329.63, //E
            4: 349.23, //F
            5: 392, //G
            6: 440, //A
            7: 493.88, //B
            8: 523.25, //C2
            9: 587.33, //D
            10: 659.26, //E
            11: 698.46, //F
            12: 783.99,  //G
            13: 880, //A
            14: 987.77, //B
        };
    }

    function _next() {

        if ( _cursor >= _content.length - 1 ) {
            _stopped = true;
        }

        if ( _stopped ) {
            Synth.stopNote();
            return;
        }

        var note = _content[_cursor];
		
		if ( _timerId ) {
			clearTimeout(_timerId);
		}
		
		_timerId = setTimeout(function() {
            _tone(note);
            _next();
        }, INTERVAL);

        _cursor++;
    }

    function _tone(note) {
        switch( note ) {
            case 0:
                Synth.stopNote();
                break;
            case -1:
                break;

            default:
                var frequency = _referenceTable[note];
                console.log(frequency);
                Synth.playNote(frequency);
                break;
        }
    }

    function play( content ) {
        _prepareReferenceTable();
        _stopped = false;
        _content = content;
		_timerId = null;
		_cursor = 0;
        _next();
    }

    function stop() {
        _stopped = true;
    }

    return {
        play: play,
        stop: stop
    };

}(Synth));

module.exports = Player;
},{"./Synth":20}],18:[function(require,module,exports){
/*
grid - 1/8
-1 - previous
0 - pause
1 - C
2 - D
...
*/
var REFERENCE_INDIVIDUAL = [0, 3, 6, 7, 8, -1, -1, 7, 8, 7, 6, 5, 4, -1, -1, -1, 0, 4, 5, 6, 7, -1, -1, 6, 7, 6, 5, 4, 3, -1, -1, -1];

module.exports = REFERENCE_INDIVIDUAL;

},{}],19:[function(require,module,exports){
var Reporter = {
    log: function(what) {
        console.log(what);
    }
};

module.exports = Reporter;

},{}],20:[function(require,module,exports){
var Synth = (function() {

    // Create Web Audio Context.
    var context = new AudioContext(),
        currentOscillator;

    function playNote(frequency) {
        // Create oscillator and gain node.
        var oscillator = context.createOscillator(),
            gainNode = context.createGain();

        // Disconnect existing oscillator if there is one.
        if (currentOscillator) {
            currentOscillator.disconnect();
        }

        // Set the type and frequency of the oscillator.
        oscillator.type = oscillator.SQUARE;
        oscillator.frequency.value = frequency;

        // Set volume of the oscillator.
        gainNode.gain.value = 0.3;

        // Route oscillator through gain node to speakers.
        oscillator.connect(gainNode);
        gainNode.connect(context.destination);

        // Set the current oscillator to the one we've just created.
        currentOscillator = oscillator;

        // Start oscillator playing.
        oscillator.start(0); // This will be replaced by start() soon.
    }

    function stopNote() {
        if (!currentOscillator) {
            return;
        }
        // Stop the current Oscillator from playing then disconnect it.
        currentOscillator.stop(0); // This will be replace by stop() soon.
        currentOscillator.disconnect();
    }

    return {
        playNote: playNote,
        stopNote: stopNote
    };

}());

module.exports = Synth;

},{}],21:[function(require,module,exports){
var individualTemplate = require("../templates/individual");
var configTemplate = require("../templates/config");

var Templates = {
	"individual": individualTemplate,
	"config": configTemplate
};

module.exports = Templates;
},{"../templates/config":30,"../templates/individual":31}],22:[function(require,module,exports){
var _timing = null;
var _started = false;
var _message = "";

function start( message ) {
	if ( message ) {
		_message = message;
	}
	
	if ( _started ) {
		console.warn("Timer already started");
	} 
	
	_started = true;
	_timing = Date.now();
}

function end( message ) {
	if ( message ) {
		_message = message;
	}
	
	console.log(_message + ": "+ (Date.now() - _timing) + " msec");
	
	_timing = null;
	_started = false;
}

module.exports = {
	start: start,
	end: end
};
},{}],23:[function(require,module,exports){
var $ = require("jquery");
var PubSub = $({});

PubSub.subscribe = function() {
	PubSub.on.apply(PubSub, arguments);
};

PubSub.unsubscribe = function() {
	PubSub.off.apply(PubSub, arguments);
};

PubSub.publish = function() {
	PubSub.trigger.apply(PubSub, arguments);
};


module.exports = PubSub;
},{"jquery":10}],24:[function(require,module,exports){
(function (global){
; var __browserify_shim_require__=require;(function browserifyShim(module, exports, require, define, browserify_shim__define__module__export__) {
(function(i){var e="0.4.2",j="hasOwnProperty",b=/[\.\/]/,a="*",g=function(){},f=function(m,l){return m-l},d,h,k={n:{}},c=function(m,C){m=String(m);var v=k,s=h,w=Array.prototype.slice.call(arguments,2),y=c.listeners(m),x=0,u=false,p,o=[],t={},q=[],n=d,A=[];d=m;h=0;for(var r=0,B=y.length;r<B;r++){if("zIndex" in y[r]){o.push(y[r].zIndex);if(y[r].zIndex<0){t[y[r].zIndex]=y[r]}}}o.sort(f);while(o[x]<0){p=t[o[x++]];q.push(p.apply(C,w));if(h){h=s;return q}}for(r=0;r<B;r++){p=y[r];if("zIndex" in p){if(p.zIndex==o[x]){q.push(p.apply(C,w));if(h){break}do{x++;p=t[o[x]];p&&q.push(p.apply(C,w));if(h){break}}while(p)}else{t[p.zIndex]=p}}else{q.push(p.apply(C,w));if(h){break}}}h=s;d=n;return q.length?q:null};c._events=k;c.listeners=function(l){var t=l.split(b),r=k,x,s,m,p,w,o,q,u,v=[r],n=[];for(p=0,w=t.length;p<w;p++){u=[];for(o=0,q=v.length;o<q;o++){r=v[o].n;s=[r[t[p]],r[a]];m=2;while(m--){x=s[m];if(x){u.push(x);n=n.concat(x.f||[])}}}v=u}return n};c.on=function(l,o){l=String(l);if(typeof o!="function"){return function(){}}var q=l.split(b),p=k;for(var m=0,n=q.length;m<n;m++){p=p.n;p=p.hasOwnProperty(q[m])&&p[q[m]]||(p[q[m]]={n:{}})}p.f=p.f||[];for(m=0,n=p.f.length;m<n;m++){if(p.f[m]==o){return g}}p.f.push(o);return function(r){if(+r==+r){o.zIndex=+r}}};c.f=function(m){var l=[].slice.call(arguments,1);return function(){c.apply(null,[m,null].concat(l).concat([].slice.call(arguments,0)))}};c.stop=function(){h=1};c.nt=function(l){if(l){return new RegExp("(?:\\.|\\/|^)"+l+"(?:\\.|\\/|$)").test(d)}return d};c.nts=function(){return d.split(b)};c.off=c.unbind=function(m,r){if(!m){c._events=k={n:{}};return}var t=m.split(b),s,v,n,p,w,o,q,u=[k];for(p=0,w=t.length;p<w;p++){for(o=0;o<u.length;o+=n.length-2){n=[o,1];s=u[o].n;if(t[p]!=a){if(s[t[p]]){n.push(s[t[p]])}}else{for(v in s){if(s[j](v)){n.push(s[v])}}}u.splice.apply(u,n)}}for(p=0,w=u.length;p<w;p++){s=u[p];while(s.n){if(r){if(s.f){for(o=0,q=s.f.length;o<q;o++){if(s.f[o]==r){s.f.splice(o,1);break}}!s.f.length&&delete s.f}for(v in s.n){if(s.n[j](v)&&s.n[v].f){var l=s.n[v].f;for(o=0,q=l.length;o<q;o++){if(l[o]==r){l.splice(o,1);break}}!l.length&&delete s.n[v].f}}}else{delete s.f;for(v in s.n){if(s.n[j](v)&&s.n[v].f){delete s.n[v].f}}}s=s.n}}};c.once=function(l,m){var n=function(){c.unbind(l,n);return m.apply(this,arguments)};return c.on(l,n)};c.version=e;c.toString=function(){return"You are running Eve "+e};(typeof module!="undefined"&&module.exports)?(module.exports=c):(typeof define!="undefined"?(define("eve",[],function(){return c})):(i.eve=c))})(this);(function(b,a){if(typeof define==="function"&&define.amd){define(["eve"],function(c){return a(b,c)})}else{a(b,b.eve)}}(this,function(aT,bc){function bi(g){if(bi.is(g,"function")){return K?g():bc.on("raphael.DOMload",g)}else{if(bi.is(g,u)){return bi._engine.create[bs](bi,g.splice(0,3+bi.is(g[0],bj))).add(g)}else{var b=Array.prototype.slice.call(arguments,0);if(bi.is(b[b.length-1],"function")){var d=b.pop();return K?d.call(bi._engine.create[bs](bi,b)):bc.on("raphael.DOMload",function(){d.call(bi._engine.create[bs](bi,b))})}else{return bi._engine.create[bs](bi,arguments)}}}}bi.version="2.1.2";bi.eve=bc;var K,bv=/[, ]+/,au={circle:1,rect:1,path:1,ellipse:1,text:1,image:1},W=/\{(\d+)\}/g,bz="prototype",bw="hasOwnProperty",a5={doc:document,win:aT},aE={was:Object.prototype[bw].call(a5.win,"Raphael"),is:a5.win.Raphael},bJ=function(){this.ca=this.customAttributes={}},ao,bA="appendChild",bs="apply",av="concat",O=("ontouchstart" in a5.win)||a5.win.DocumentTouch&&a5.doc instanceof DocumentTouch,bn="",bh=" ",k=String,l="split",bB="click dblclick mousedown mousemove mouseout mouseover mouseup touchstart touchmove touchend touchcancel"[l](bh),bp={mousedown:"touchstart",mousemove:"touchmove",mouseup:"touchend"},aj=k.prototype.toLowerCase,aI=Math,bI=aI.max,ai=aI.min,ak=aI.abs,aS=aI.pow,ag=aI.PI,bj="number",a="string",u="array",s="toString",A="fill",aM=Object.prototype.toString,bC={},r="push",aa=bi._ISURL=/^url\(['"]?([^\)]+?)['"]?\)$/i,Z=/^\s*((#[a-f\d]{6})|(#[a-f\d]{3})|rgba?\(\s*([\d\.]+%?\s*,\s*[\d\.]+%?\s*,\s*[\d\.]+%?(?:\s*,\s*[\d\.]+%?)?)\s*\)|hsba?\(\s*([\d\.]+(?:deg|\xb0|%)?\s*,\s*[\d\.]+%?\s*,\s*[\d\.]+(?:%?\s*,\s*[\d\.]+)?)%?\s*\)|hsla?\(\s*([\d\.]+(?:deg|\xb0|%)?\s*,\s*[\d\.]+%?\s*,\s*[\d\.]+(?:%?\s*,\s*[\d\.]+)?)%?\s*\))\s*$/i,B={"NaN":1,"Infinity":1,"-Infinity":1},an=/^(?:cubic-)?bezier\(([^,]+),([^,]+),([^,]+),([^\)]+)\)/,C=aI.round,P="setAttribute",bM=parseFloat,bK=parseInt,aU=k.prototype.toUpperCase,bq=bi._availableAttrs={"arrow-end":"none","arrow-start":"none",blur:0,"clip-rect":"0 0 1e9 1e9",cursor:"default",cx:0,cy:0,fill:"#fff","fill-opacity":1,font:'10px "Arial"',"font-family":'"Arial"',"font-size":"10","font-style":"normal","font-weight":400,gradient:0,height:0,href:"http://raphaeljs.com/","letter-spacing":0,opacity:1,path:"M0,0",r:0,rx:0,ry:0,src:"",stroke:"#000","stroke-dasharray":"","stroke-linecap":"butt","stroke-linejoin":"butt","stroke-miterlimit":0,"stroke-opacity":1,"stroke-width":1,target:"_blank","text-anchor":"middle",title:"Raphael",transform:"",width:0,x:0,y:0},bo=bi._availableAnimAttrs={blur:bj,"clip-rect":"csv",cx:bj,cy:bj,fill:"colour","fill-opacity":bj,"font-size":bj,height:bj,opacity:bj,path:"path",r:bj,rx:bj,ry:bj,stroke:"colour","stroke-opacity":bj,"stroke-width":bj,transform:"transform",width:bj,x:bj,y:bj},bt=/[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]/g,bf=/[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*,[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*/,ax={hs:1,rg:1},aN=/,?([achlmqrstvxz]),?/gi,bg=/([achlmrqstvz])[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029,]*((-?\d*\.?\d*(?:e[\-+]?\d+)?[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*,?[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*)+)/ig,ac=/([rstm])[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029,]*((-?\d*\.?\d*(?:e[\-+]?\d+)?[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*,?[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*)+)/ig,ap=/(-?\d*\.?\d*(?:e[\-+]?\d+)?)[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*,?[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*/ig,a2=bi._radial_gradient=/^r(?:\(([^,]+?)[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*,[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*([^\)]+?)\))?/,M={},x=function(g,d){return g.key-d.key
},bu=function(g,d){return bM(g)-bM(d)},ad=function(){},aw=function(b){return b},q=bi._rectPath=function(b,E,d,g,i){if(i){return[["M",b+i,E],["l",d-i*2,0],["a",i,i,0,0,1,i,i],["l",0,g-i*2],["a",i,i,0,0,1,-i,i],["l",i*2-d,0],["a",i,i,0,0,1,-i,-i],["l",0,i*2-g],["a",i,i,0,0,1,i,-i],["z"]]}return[["M",b,E],["l",d,0],["l",0,g],["l",-d,0],["z"]]},U=function(b,i,g,d){if(d==null){d=g}return[["M",b,i],["m",0,-d],["a",g,d,0,1,1,0,2*d],["a",g,d,0,1,1,0,-2*d],["z"]]},af=bi._getPath={path:function(b){return b.attr("path")},circle:function(d){var b=d.attrs;return U(b.cx,b.cy,b.r)},ellipse:function(d){var b=d.attrs;return U(b.cx,b.cy,b.rx,b.ry)},rect:function(d){var b=d.attrs;return q(b.x,b.y,b.width,b.height,b.r)},image:function(d){var b=d.attrs;return q(b.x,b.y,b.width,b.height)},text:function(b){var d=b._getBBox();return q(d.x,d.y,d.width,d.height)},set:function(b){var d=b._getBBox();return q(d.x,d.y,d.width,d.height)}},Q=bi.mapPath=function(bQ,S){if(!S){return bQ}var bO,R,g,b,bP,E,d;bQ=bk(bQ);for(g=0,bP=bQ.length;g<bP;g++){d=bQ[g];for(b=1,E=d.length;b<E;b+=2){bO=S.x(d[b],d[b+1]);R=S.y(d[b],d[b+1]);d[b]=bO;d[b+1]=R}}return bQ};bi._g=a5;bi.type=(a5.win.SVGAngle||a5.doc.implementation.hasFeature("http://www.w3.org/TR/SVG11/feature#BasicStructure","1.1")?"SVG":"VML");if(bi.type=="VML"){var a7=a5.doc.createElement("div"),a8;a7.innerHTML='<v:shape adj="1"/>';a8=a7.firstChild;a8.style.behavior="url(#default#VML)";if(!(a8&&typeof a8.adj=="object")){return(bi.type=bn)}a7=null}bi.svg=!(bi.vml=bi.type=="VML");bi._Paper=bJ;bi.fn=ao=bJ.prototype=bi.prototype;bi._id=0;bi._oid=0;bi.is=function(d,b){b=aj.call(b);if(b=="finite"){return !B[bw](+d)}if(b=="array"){return d instanceof Array}return(b=="null"&&d===null)||(b==typeof d&&d!==null)||(b=="object"&&d===Object(d))||(b=="array"&&Array.isArray&&Array.isArray(d))||aM.call(d).slice(8,-1).toLowerCase()==b};function bl(g){if(typeof g=="function"||Object(g)!==g){return g}var d=new g.constructor;for(var b in g){if(g[bw](b)){d[b]=bl(g[b])}}return d}bi.angle=function(E,S,g,R,d,i){if(d==null){var b=E-g,bO=S-R;if(!b&&!bO){return 0}return(180+aI.atan2(-bO,-b)*180/ag+360)%360}else{return bi.angle(E,S,d,i)-bi.angle(g,R,d,i)}};bi.rad=function(b){return b%360*ag/180};bi.deg=function(b){return b*180/ag%360};bi.snapTo=function(d,E,b){b=bi.is(b,"finite")?b:10;if(bi.is(d,u)){var g=d.length;while(g--){if(ak(d[g]-E)<=b){return d[g]}}}else{d=+d;var R=E%d;if(R<b){return E-R}if(R>d-b){return E-R+d}}return E};var aQ=bi.createUUID=(function(b,d){return function(){return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(b,d).toUpperCase()}})(/[xy]/g,function(g){var d=aI.random()*16|0,b=g=="x"?d:(d&3|8);return b.toString(16)});bi.setWindow=function(b){bc("raphael.setWindow",bi,a5.win,b);a5.win=b;a5.doc=a5.win.document;if(bi._engine.initWin){bi._engine.initWin(a5.win)}};var J=function(g){if(bi.vml){var b=/^\s+|\s+$/g;var R;try{var S=new ActiveXObject("htmlfile");S.write("<body>");S.close();R=S.body}catch(bO){R=createPopup().document.body}var d=R.createTextRange();J=H(function(i){try{R.style.color=k(i).replace(b,bn);var bP=d.queryCommandValue("ForeColor");bP=((bP&255)<<16)|(bP&65280)|((bP&16711680)>>>16);return"#"+("000000"+bP.toString(16)).slice(-6)}catch(bQ){return"none"}})}else{var E=a5.doc.createElement("i");E.title="Rapha\xebl Colour Picker";E.style.display="none";a5.doc.body.appendChild(E);J=H(function(i){E.style.color=i;return a5.doc.defaultView.getComputedStyle(E,bn).getPropertyValue("color")})}return J(g)},az=function(){return"hsb("+[this.h,this.s,this.b]+")"},bm=function(){return"hsl("+[this.h,this.s,this.l]+")"},w=function(){return this.hex},G=function(R,E,d){if(E==null&&bi.is(R,"object")&&"r" in R&&"g" in R&&"b" in R){d=R.b;E=R.g;R=R.r}if(E==null&&bi.is(R,a)){var i=bi.getRGB(R);R=i.r;E=i.g;d=i.b}if(R>1||E>1||d>1){R/=255;E/=255;d/=255}return[R,E,d]},N=function(R,E,d,S){R*=255;E*=255;d*=255;var i={r:R,g:E,b:d,hex:bi.rgb(R,E,d),toString:w};bi.is(S,"finite")&&(i.opacity=S);return i};bi.color=function(b){var d;if(bi.is(b,"object")&&"h" in b&&"s" in b&&"b" in b){d=bi.hsb2rgb(b);b.r=d.r;b.g=d.g;b.b=d.b;b.hex=d.hex}else{if(bi.is(b,"object")&&"h" in b&&"s" in b&&"l" in b){d=bi.hsl2rgb(b);b.r=d.r;b.g=d.g;b.b=d.b;b.hex=d.hex}else{if(bi.is(b,"string")){b=bi.getRGB(b)}if(bi.is(b,"object")&&"r" in b&&"g" in b&&"b" in b){d=bi.rgb2hsl(b);b.h=d.h;b.s=d.s;b.l=d.l;d=bi.rgb2hsb(b);b.v=d.b}else{b={hex:"none"};b.r=b.g=b.b=b.h=b.s=b.v=b.l=-1}}}b.toString=w;return b};bi.hsb2rgb=function(S,bQ,bO,i){if(this.is(S,"object")&&"h" in S&&"s" in S&&"b" in S){bO=S.b;bQ=S.s;S=S.h;i=S.o}S*=360;var E,bP,d,g,b;S=(S%360)/60;b=bO*bQ;g=b*(1-ak(S%2-1));E=bP=d=bO-b;S=~~S;E+=[b,g,0,0,g,b][S];bP+=[g,b,b,g,0,0][S];d+=[0,0,g,b,b,g][S];return N(E,bP,d,i)};bi.hsl2rgb=function(bO,bQ,E,i){if(this.is(bO,"object")&&"h" in bO&&"s" in bO&&"l" in bO){E=bO.l;bQ=bO.s;bO=bO.h}if(bO>1||bQ>1||E>1){bO/=360;bQ/=100;E/=100}bO*=360;var S,bP,d,g,b;bO=(bO%360)/60;b=2*bQ*(E<0.5?E:1-E);g=b*(1-ak(bO%2-1));S=bP=d=E-b/2;bO=~~bO;S+=[b,g,0,0,g,b][bO];bP+=[g,b,b,g,0,0][bO];d+=[0,0,g,b,b,g][bO];return N(S,bP,d,i)};bi.rgb2hsb=function(bP,bO,d){d=G(bP,bO,d);bP=d[0];bO=d[1];d=d[2];var R,E,i,bQ;i=bI(bP,bO,d);bQ=i-ai(bP,bO,d);R=(bQ==0?null:i==bP?(bO-d)/bQ:i==bO?(d-bP)/bQ+2:(bP-bO)/bQ+4);R=((R+360)%6)*60/360;E=bQ==0?0:bQ/i;return{h:R,s:E,b:i,toString:az}};bi.rgb2hsl=function(d,bO,bR){bR=G(d,bO,bR);d=bR[0];bO=bR[1];bR=bR[2];var bS,R,bQ,bP,E,i;bP=bI(d,bO,bR);E=ai(d,bO,bR);i=bP-E;bS=(i==0?null:bP==d?(bO-bR)/i:bP==bO?(bR-d)/i+2:(d-bO)/i+4);bS=((bS+360)%6)*60/360;bQ=(bP+E)/2;R=(i==0?0:bQ<0.5?i/(2*bQ):i/(2-2*bQ));return{h:bS,s:R,l:bQ,toString:bm}};bi._path2string=function(){return this.join(",").replace(aN,"$1")};function c(E,g){for(var b=0,d=E.length;b<d;b++){if(E[b]===g){return E.push(E.splice(b,1)[0])}}}function H(i,d,b){function g(){var E=Array.prototype.slice.call(arguments,0),S=E.join("\u2400"),R=g.cache=g.cache||{},bO=g.count=g.count||[];if(R[bw](S)){c(bO,S);return b?b(R[S]):R[S]}bO.length>=1000&&delete R[bO.shift()];bO.push(S);R[S]=i[bs](d,E);return b?b(R[S]):R[S]}return g}var D=bi._preload=function(g,d){var b=a5.doc.createElement("img");b.style.cssText="position:absolute;left:-9999em;top:-9999em";b.onload=function(){d.call(this);this.onload=null;a5.doc.body.removeChild(this)};b.onerror=function(){a5.doc.body.removeChild(this)};a5.doc.body.appendChild(b);b.src=g};function h(){return this.hex}bi.getRGB=H(function(b){if(!b||!!((b=k(b)).indexOf("-")+1)){return{r:-1,g:-1,b:-1,hex:"none",error:1,toString:h}}if(b=="none"){return{r:-1,g:-1,b:-1,hex:"none",toString:h}}!(ax[bw](b.toLowerCase().substring(0,2))||b.charAt()=="#")&&(b=J(b));var E,d,g,S,i,bP,bO,R=b.match(Z);if(R){if(R[2]){S=bK(R[2].substring(5),16);g=bK(R[2].substring(3,5),16);d=bK(R[2].substring(1,3),16)}if(R[3]){S=bK((bP=R[3].charAt(3))+bP,16);g=bK((bP=R[3].charAt(2))+bP,16);d=bK((bP=R[3].charAt(1))+bP,16)}if(R[4]){bO=R[4][l](bf);d=bM(bO[0]);bO[0].slice(-1)=="%"&&(d*=2.55);g=bM(bO[1]);bO[1].slice(-1)=="%"&&(g*=2.55);S=bM(bO[2]);bO[2].slice(-1)=="%"&&(S*=2.55);R[1].toLowerCase().slice(0,4)=="rgba"&&(i=bM(bO[3]));
bO[3]&&bO[3].slice(-1)=="%"&&(i/=100)}if(R[5]){bO=R[5][l](bf);d=bM(bO[0]);bO[0].slice(-1)=="%"&&(d*=2.55);g=bM(bO[1]);bO[1].slice(-1)=="%"&&(g*=2.55);S=bM(bO[2]);bO[2].slice(-1)=="%"&&(S*=2.55);(bO[0].slice(-3)=="deg"||bO[0].slice(-1)=="\xb0")&&(d/=360);R[1].toLowerCase().slice(0,4)=="hsba"&&(i=bM(bO[3]));bO[3]&&bO[3].slice(-1)=="%"&&(i/=100);return bi.hsb2rgb(d,g,S,i)}if(R[6]){bO=R[6][l](bf);d=bM(bO[0]);bO[0].slice(-1)=="%"&&(d*=2.55);g=bM(bO[1]);bO[1].slice(-1)=="%"&&(g*=2.55);S=bM(bO[2]);bO[2].slice(-1)=="%"&&(S*=2.55);(bO[0].slice(-3)=="deg"||bO[0].slice(-1)=="\xb0")&&(d/=360);R[1].toLowerCase().slice(0,4)=="hsla"&&(i=bM(bO[3]));bO[3]&&bO[3].slice(-1)=="%"&&(i/=100);return bi.hsl2rgb(d,g,S,i)}R={r:d,g:g,b:S,toString:h};R.hex="#"+(16777216|S|(g<<8)|(d<<16)).toString(16).slice(1);bi.is(i,"finite")&&(R.opacity=i);return R}return{r:-1,g:-1,b:-1,hex:"none",error:1,toString:h}},bi);bi.hsb=H(function(i,g,d){return bi.hsb2rgb(i,g,d).hex});bi.hsl=H(function(g,d,b){return bi.hsl2rgb(g,d,b).hex});bi.rgb=H(function(E,i,d){return"#"+(16777216|d|(i<<8)|(E<<16)).toString(16).slice(1)});bi.getColor=function(d){var g=this.getColor.start=this.getColor.start||{h:0,s:1,b:d||0.75},b=this.hsb2rgb(g.h,g.s,g.b);g.h+=0.075;if(g.h>1){g.h=0;g.s-=0.2;g.s<=0&&(this.getColor.start={h:0,s:1,b:g.b})}return b.hex};bi.getColor.reset=function(){delete this.start};function am(E,bO){var S=[];for(var g=0,b=E.length;b-2*!bO>g;g+=2){var R=[{x:+E[g-2],y:+E[g-1]},{x:+E[g],y:+E[g+1]},{x:+E[g+2],y:+E[g+3]},{x:+E[g+4],y:+E[g+5]}];if(bO){if(!g){R[0]={x:+E[b-2],y:+E[b-1]}}else{if(b-4==g){R[3]={x:+E[0],y:+E[1]}}else{if(b-2==g){R[2]={x:+E[0],y:+E[1]};R[3]={x:+E[2],y:+E[3]}}}}}else{if(b-4==g){R[3]=R[2]}else{if(!g){R[0]={x:+E[g],y:+E[g+1]}}}}S.push(["C",(-R[0].x+6*R[1].x+R[2].x)/6,(-R[0].y+6*R[1].y+R[2].y)/6,(R[1].x+6*R[2].x-R[3].x)/6,(R[1].y+6*R[2].y-R[3].y)/6,R[2].x,R[2].y])}return S}bi.parsePathString=function(b){if(!b){return null}var g=aR(b);if(g.arr){return aY(g.arr)}var i={a:7,c:6,h:1,l:2,m:2,r:4,q:4,s:4,t:2,v:1,z:0},d=[];if(bi.is(b,u)&&bi.is(b[0],u)){d=aY(b)}if(!d.length){k(b).replace(bg,function(R,E,bP){var bO=[],S=E.toLowerCase();bP.replace(ap,function(bR,bQ){bQ&&bO.push(+bQ)});if(S=="m"&&bO.length>2){d.push([E][av](bO.splice(0,2)));S="l";E=E=="m"?"l":"L"}if(S=="r"){d.push([E][av](bO))}else{while(bO.length>=i[S]){d.push([E][av](bO.splice(0,i[S])));if(!i[S]){break}}}})}d.toString=bi._path2string;g.arr=aY(d);return d};bi.parseTransformString=H(function(d){if(!d){return null}var g={r:3,s:4,t:2,m:6},b=[];if(bi.is(d,u)&&bi.is(d[0],u)){b=aY(d)}if(!b.length){k(d).replace(ac,function(E,i,bO){var S=[],R=aj.call(i);bO.replace(ap,function(bQ,bP){bP&&S.push(+bP)});b.push([i][av](S))})}b.toString=bi._path2string;return b});var aR=function(d){var b=aR.ps=aR.ps||{};if(b[d]){b[d].sleep=100}else{b[d]={sleep:100}}setTimeout(function(){for(var g in b){if(b[bw](g)&&g!=d){b[g].sleep--;!b[g].sleep&&delete b[g]}}});return b[d]};bi.findDotsAtSegment=function(d,b,b5,b3,S,E,bQ,bO,bY){var bV=1-bY,b0=aS(bV,3),b1=aS(bV,2),bS=bY*bY,bP=bS*bY,bU=b0*d+b1*3*bY*b5+bV*3*bY*bY*S+bP*bQ,bR=b0*b+b1*3*bY*b3+bV*3*bY*bY*E+bP*bO,bZ=d+2*bY*(b5-d)+bS*(S-2*b5+d),bX=b+2*bY*(b3-b)+bS*(E-2*b3+b),b4=b5+2*bY*(S-b5)+bS*(bQ-2*S+b5),b2=b3+2*bY*(E-b3)+bS*(bO-2*E+b3),bW=bV*d+bY*b5,bT=bV*b+bY*b3,i=bV*S+bY*bQ,g=bV*E+bY*bO,R=(90-aI.atan2(bZ-b4,bX-b2)*180/ag);(bZ>b4||bX<b2)&&(R+=180);return{x:bU,y:bR,m:{x:bZ,y:bX},n:{x:b4,y:b2},start:{x:bW,y:bT},end:{x:i,y:g},alpha:R}};bi.bezierBBox=function(d,b,i,g,bP,S,R,E){if(!bi.is(d,"array")){d=[d,b,i,g,bP,S,R,E]}var bO=aX.apply(null,d);return{x:bO.min.x,y:bO.min.y,x2:bO.max.x,y2:bO.max.y,width:bO.max.x-bO.min.x,height:bO.max.y-bO.min.y}};bi.isPointInsideBBox=function(d,b,g){return b>=d.x&&b<=d.x2&&g>=d.y&&g<=d.y2};bi.isBBoxIntersect=function(g,d){var b=bi.isPointInsideBBox;return b(d,g.x,g.y)||b(d,g.x2,g.y)||b(d,g.x,g.y2)||b(d,g.x2,g.y2)||b(g,d.x,d.y)||b(g,d.x2,d.y)||b(g,d.x,d.y2)||b(g,d.x2,d.y2)||(g.x<d.x2&&g.x>d.x||d.x<g.x2&&d.x>g.x)&&(g.y<d.y2&&g.y>d.y||d.y<g.y2&&d.y>g.y)};function aC(b,S,R,E,i){var g=-3*S+9*R-9*E+3*i,d=b*g+6*S-12*R+6*E;return b*d-3*S+3*R}function bb(bZ,R,bY,g,bX,d,bU,b,bR){if(bR==null){bR=1}bR=bR>1?1:bR<0?0:bR;var bS=bR/2,bT=12,bO=[-0.1252,0.1252,-0.3678,0.3678,-0.5873,0.5873,-0.7699,0.7699,-0.9041,0.9041,-0.9816,0.9816],bW=[0.2491,0.2491,0.2335,0.2335,0.2032,0.2032,0.1601,0.1601,0.1069,0.1069,0.0472,0.0472],E=0;for(var bV=0;bV<bT;bV++){var bP=bS*bO[bV]+bS,bQ=aC(bP,bZ,bY,bX,bU),b0=aC(bP,R,g,d,b),S=bQ*bQ+b0*b0;E+=bW[bV]*aI.sqrt(S)}return bS*E}function aK(g,bS,d,bR,b,bP,bU,bO,bQ){if(bQ<0||bb(g,bS,d,bR,b,bP,bU,bO)<bQ){return}var bT=1,i=bT/2,R=bT-i,E,S=0.01;E=bb(g,bS,d,bR,b,bP,bU,bO,R);while(ak(E-bQ)>S){i/=2;R+=(E<bQ?1:-1)*i;E=bb(g,bS,d,bR,b,bP,bU,bO,R)}return R}function a4(i,bT,g,bR,b,bQ,bV,bP){if(bI(i,g)<ai(b,bV)||ai(i,g)>bI(b,bV)||bI(bT,bR)<ai(bQ,bP)||ai(bT,bR)>bI(bQ,bP)){return}var bO=(i*bR-bT*g)*(b-bV)-(i-g)*(b*bP-bQ*bV),S=(i*bR-bT*g)*(bQ-bP)-(bT-bR)*(b*bP-bQ*bV),E=(i-g)*(bQ-bP)-(bT-bR)*(b-bV);if(!E){return}var bU=bO/E,bS=S/E,R=+bU.toFixed(2),d=+bS.toFixed(2);if(R<+ai(i,g).toFixed(2)||R>+bI(i,g).toFixed(2)||R<+ai(b,bV).toFixed(2)||R>+bI(b,bV).toFixed(2)||d<+ai(bT,bR).toFixed(2)||d>+bI(bT,bR).toFixed(2)||d<+ai(bQ,bP).toFixed(2)||d>+bI(bQ,bP).toFixed(2)){return}return{x:bU,y:bS}}function aV(d,b){return aP(d,b)}function aL(d,b){return aP(d,b,1)}function aP(b5,b4,b3){var E=bi.bezierBBox(b5),d=bi.bezierBBox(b4);if(!bi.isBBoxIntersect(E,d)){return b3?0:[]}var bY=bb.apply(0,b5),bX=bb.apply(0,b4),bP=bI(~~(bY/5),1),bO=bI(~~(bX/5),1),bV=[],bU=[],g={},b6=b3?0:[];for(var b0=0;b0<bP+1;b0++){var bW=bi.findDotsAtSegment.apply(bi,b5.concat(b0/bP));bV.push({x:bW.x,y:bW.y,t:b0/bP})}for(b0=0;b0<bO+1;b0++){bW=bi.findDotsAtSegment.apply(bi,b4.concat(b0/bO));bU.push({x:bW.x,y:bW.y,t:b0/bO})}for(b0=0;b0<bP;b0++){for(var bZ=0;bZ<bO;bZ++){var b2=bV[b0],b=bV[b0+1],b1=bU[bZ],S=bU[bZ+1],bT=ak(b.x-b2.x)<0.001?"y":"x",bS=ak(S.x-b1.x)<0.001?"y":"x",R=a4(b2.x,b2.y,b.x,b.y,b1.x,b1.y,S.x,S.y);if(R){if(g[R.x.toFixed(4)]==R.y.toFixed(4)){continue}g[R.x.toFixed(4)]=R.y.toFixed(4);var bR=b2.t+ak((R[bT]-b2[bT])/(b[bT]-b2[bT]))*(b.t-b2.t),bQ=b1.t+ak((R[bS]-b1[bS])/(S[bS]-b1[bS]))*(S.t-b1.t);if(bR>=0&&bR<=1.001&&bQ>=0&&bQ<=1.001){if(b3){b6++}else{b6.push({x:R.x,y:R.y,t1:ai(bR,1),t2:ai(bQ,1)})}}}}}return b6}bi.pathIntersection=function(d,b){return bE(d,b)};bi.pathIntersectionNumber=function(d,b){return bE(d,b,1)};function bE(g,b,bZ){g=bi._path2curve(g);b=bi._path2curve(b);var bX,S,bW,E,bU,bO,d,bR,b3,b2,b4=bZ?0:[];for(var bV=0,bP=g.length;bV<bP;bV++){var b1=g[bV];if(b1[0]=="M"){bX=bU=b1[1];S=bO=b1[2]}else{if(b1[0]=="C"){b3=[bX,S].concat(b1.slice(1));bX=b3[6];S=b3[7]}else{b3=[bX,S,bX,S,bU,bO,bU,bO];bX=bU;S=bO}for(var bT=0,bY=b.length;bT<bY;bT++){var b0=b[bT];if(b0[0]=="M"){bW=d=b0[1];E=bR=b0[2]}else{if(b0[0]=="C"){b2=[bW,E].concat(b0.slice(1));bW=b2[6];E=b2[7]}else{b2=[bW,E,bW,E,d,bR,d,bR];bW=d;E=bR}var bQ=aP(b3,b2,bZ);if(bZ){b4+=bQ}else{for(var bS=0,R=bQ.length;bS<R;bS++){bQ[bS].segment1=bV;bQ[bS].segment2=bT;bQ[bS].bez1=b3;bQ[bS].bez2=b2}b4=b4.concat(bQ)
}}}}}return b4}bi.isPointInsidePath=function(d,b,i){var g=bi.pathBBox(d);return bi.isPointInsideBBox(g,b,i)&&bE(d,[["M",b,i],["H",g.x2+10]],1)%2==1};bi._removedFactory=function(b){return function(){bc("raphael.log",null,"Rapha\xebl: you are calling to method \u201c"+b+"\u201d of removed object",b)}};var I=bi.pathBBox=function(bY){var bR=aR(bY);if(bR.bbox){return bl(bR.bbox)}if(!bY){return{x:0,y:0,width:0,height:0,x2:0,y2:0}}bY=bk(bY);var bU=0,bT=0,S=[],g=[],E;for(var bP=0,bX=bY.length;bP<bX;bP++){E=bY[bP];if(E[0]=="M"){bU=E[1];bT=E[2];S.push(bU);g.push(bT)}else{var bQ=aX(bU,bT,E[1],E[2],E[3],E[4],E[5],E[6]);S=S[av](bQ.min.x,bQ.max.x);g=g[av](bQ.min.y,bQ.max.y);bU=E[5];bT=E[6]}}var b=ai[bs](0,S),bV=ai[bs](0,g),bO=bI[bs](0,S),R=bI[bs](0,g),d=bO-b,bW=R-bV,bS={x:b,y:bV,x2:bO,y2:R,width:d,height:bW,cx:b+d/2,cy:bV+bW/2};bR.bbox=bl(bS);return bS},aY=function(d){var b=bl(d);b.toString=bi._path2string;return b},j=bi._pathToRelative=function(E){var bP=aR(E);if(bP.rel){return aY(bP.rel)}if(!bi.is(E,u)||!bi.is(E&&E[0],u)){E=bi.parsePathString(E)}var bS=[],bU=0,bT=0,bX=0,bW=0,g=0;if(E[0][0]=="M"){bU=E[0][1];bT=E[0][2];bX=bU;bW=bT;g++;bS.push(["M",bU,bT])}for(var bO=g,bY=E.length;bO<bY;bO++){var b=bS[bO]=[],bV=E[bO];if(bV[0]!=aj.call(bV[0])){b[0]=aj.call(bV[0]);switch(b[0]){case"a":b[1]=bV[1];b[2]=bV[2];b[3]=bV[3];b[4]=bV[4];b[5]=bV[5];b[6]=+(bV[6]-bU).toFixed(3);b[7]=+(bV[7]-bT).toFixed(3);break;case"v":b[1]=+(bV[1]-bT).toFixed(3);break;case"m":bX=bV[1];bW=bV[2];default:for(var S=1,bQ=bV.length;S<bQ;S++){b[S]=+(bV[S]-((S%2)?bU:bT)).toFixed(3)}}}else{b=bS[bO]=[];if(bV[0]=="m"){bX=bV[1]+bU;bW=bV[2]+bT}for(var R=0,d=bV.length;R<d;R++){bS[bO][R]=bV[R]}}var bR=bS[bO].length;switch(bS[bO][0]){case"z":bU=bX;bT=bW;break;case"h":bU+=+bS[bO][bR-1];break;case"v":bT+=+bS[bO][bR-1];break;default:bU+=+bS[bO][bR-2];bT+=+bS[bO][bR-1]}}bS.toString=bi._path2string;bP.rel=aY(bS);return bS},p=bi._pathToAbsolute=function(bT){var g=aR(bT);if(g.abs){return aY(g.abs)}if(!bi.is(bT,u)||!bi.is(bT&&bT[0],u)){bT=bi.parsePathString(bT)}if(!bT||!bT.length){return[["M",0,0]]}var bZ=[],bO=0,S=0,bR=0,bQ=0,E=0;if(bT[0][0]=="M"){bO=+bT[0][1];S=+bT[0][2];bR=bO;bQ=S;E++;bZ[0]=["M",bO,S]}var bY=bT.length==3&&bT[0][0]=="M"&&bT[1][0].toUpperCase()=="R"&&bT[2][0].toUpperCase()=="Z";for(var bS,b,bW=E,bP=bT.length;bW<bP;bW++){bZ.push(bS=[]);b=bT[bW];if(b[0]!=aU.call(b[0])){bS[0]=aU.call(b[0]);switch(bS[0]){case"A":bS[1]=b[1];bS[2]=b[2];bS[3]=b[3];bS[4]=b[4];bS[5]=b[5];bS[6]=+(b[6]+bO);bS[7]=+(b[7]+S);break;case"V":bS[1]=+b[1]+S;break;case"H":bS[1]=+b[1]+bO;break;case"R":var R=[bO,S][av](b.slice(1));for(var bV=2,bX=R.length;bV<bX;bV++){R[bV]=+R[bV]+bO;R[++bV]=+R[bV]+S}bZ.pop();bZ=bZ[av](am(R,bY));break;case"M":bR=+b[1]+bO;bQ=+b[2]+S;default:for(bV=1,bX=b.length;bV<bX;bV++){bS[bV]=+b[bV]+((bV%2)?bO:S)}}}else{if(b[0]=="R"){R=[bO,S][av](b.slice(1));bZ.pop();bZ=bZ[av](am(R,bY));bS=["R"][av](b.slice(-2))}else{for(var bU=0,d=b.length;bU<d;bU++){bS[bU]=b[bU]}}}switch(bS[0]){case"Z":bO=bR;S=bQ;break;case"H":bO=bS[1];break;case"V":S=bS[1];break;case"M":bR=bS[bS.length-2];bQ=bS[bS.length-1];default:bO=bS[bS.length-2];S=bS[bS.length-1]}}bZ.toString=bi._path2string;g.abs=aY(bZ);return bZ},aW=function(d,i,b,g){return[d,i,b,g,b,g]},z=function(d,i,S,E,b,g){var R=1/3,bO=2/3;return[R*d+bO*S,R*i+bO*E,R*b+bO*S,R*g+bO*E,b,g]},ab=function(bV,cq,b4,b2,bW,bQ,E,bU,cp,bX){var b1=ag*120/180,b=ag/180*(+bW||0),b8=[],b5,cm=H(function(cr,cu,i){var ct=cr*aI.cos(i)-cu*aI.sin(i),cs=cr*aI.sin(i)+cu*aI.cos(i);return{x:ct,y:cs}});if(!bX){b5=cm(bV,cq,-b);bV=b5.x;cq=b5.y;b5=cm(bU,cp,-b);bU=b5.x;cp=b5.y;var d=aI.cos(ag/180*bW),bS=aI.sin(ag/180*bW),ca=(bV-bU)/2,b9=(cq-cp)/2;var ck=(ca*ca)/(b4*b4)+(b9*b9)/(b2*b2);if(ck>1){ck=aI.sqrt(ck);b4=ck*b4;b2=ck*b2}var g=b4*b4,cd=b2*b2,cf=(bQ==E?-1:1)*aI.sqrt(ak((g*cd-g*b9*b9-cd*ca*ca)/(g*b9*b9+cd*ca*ca))),bZ=cf*b4*b9/b2+(bV+bU)/2,bY=cf*-b2*ca/b4+(cq+cp)/2,bP=aI.asin(((cq-bY)/b2).toFixed(9)),bO=aI.asin(((cp-bY)/b2).toFixed(9));bP=bV<bZ?ag-bP:bP;bO=bU<bZ?ag-bO:bO;bP<0&&(bP=ag*2+bP);bO<0&&(bO=ag*2+bO);if(E&&bP>bO){bP=bP-ag*2}if(!E&&bO>bP){bO=bO-ag*2}}else{bP=bX[0];bO=bX[1];bZ=bX[2];bY=bX[3]}var bT=bO-bP;if(ak(bT)>b1){var b0=bO,b3=bU,bR=cp;bO=bP+b1*(E&&bO>bP?1:-1);bU=bZ+b4*aI.cos(bO);cp=bY+b2*aI.sin(bO);b8=ab(bU,cp,b4,b2,bW,0,E,b3,bR,[bO,b0,bZ,bY])}bT=bO-bP;var S=aI.cos(bP),co=aI.sin(bP),R=aI.cos(bO),cn=aI.sin(bO),cb=aI.tan(bT/4),ce=4/3*b4*cb,cc=4/3*b2*cb,cl=[bV,cq],cj=[bV+ce*co,cq-cc*S],ci=[bU+ce*cn,cp-cc*R],cg=[bU,cp];cj[0]=2*cl[0]-cj[0];cj[1]=2*cl[1]-cj[1];if(bX){return[cj,ci,cg][av](b8)}else{b8=[cj,ci,cg][av](b8).join()[l](",");var b6=[];for(var ch=0,b7=b8.length;ch<b7;ch++){b6[ch]=ch%2?cm(b8[ch-1],b8[ch],b).y:cm(b8[ch],b8[ch+1],b).x}return b6}},bL=function(d,b,i,g,bP,bO,S,R,bQ){var E=1-bQ;return{x:aS(E,3)*d+aS(E,2)*3*bQ*i+E*3*bQ*bQ*bP+aS(bQ,3)*S,y:aS(E,3)*b+aS(E,2)*3*bQ*g+E*3*bQ*bQ*bO+aS(bQ,3)*R}},aX=H(function(i,d,R,E,bX,bW,bT,bQ){var bV=(bX-2*R+i)-(bT-2*bX+R),bS=2*(R-i)-2*(bX-R),bP=i-R,bO=(-bS+aI.sqrt(bS*bS-4*bV*bP))/2/bV,S=(-bS-aI.sqrt(bS*bS-4*bV*bP))/2/bV,bR=[d,bQ],bU=[i,bT],g;ak(bO)>"1e12"&&(bO=0.5);ak(S)>"1e12"&&(S=0.5);if(bO>0&&bO<1){g=bL(i,d,R,E,bX,bW,bT,bQ,bO);bU.push(g.x);bR.push(g.y)}if(S>0&&S<1){g=bL(i,d,R,E,bX,bW,bT,bQ,S);bU.push(g.x);bR.push(g.y)}bV=(bW-2*E+d)-(bQ-2*bW+E);bS=2*(E-d)-2*(bW-E);bP=d-E;bO=(-bS+aI.sqrt(bS*bS-4*bV*bP))/2/bV;S=(-bS-aI.sqrt(bS*bS-4*bV*bP))/2/bV;ak(bO)>"1e12"&&(bO=0.5);ak(S)>"1e12"&&(S=0.5);if(bO>0&&bO<1){g=bL(i,d,R,E,bX,bW,bT,bQ,bO);bU.push(g.x);bR.push(g.y)}if(S>0&&S<1){g=bL(i,d,R,E,bX,bW,bT,bQ,S);bU.push(g.x);bR.push(g.y)}return{min:{x:ai[bs](0,bU),y:ai[bs](0,bR)},max:{x:bI[bs](0,bU),y:bI[bs](0,bR)}}}),bk=bi._path2curve=H(function(bX,bS){var bQ=!bS&&aR(bX);if(!bS&&bQ.curve){return aY(bQ.curve)}var E=p(bX),bT=bS&&p(bS),bU={x:0,y:0,bx:0,by:0,X:0,Y:0,qx:null,qy:null},d={x:0,y:0,bx:0,by:0,X:0,Y:0,qx:null,qy:null},S=function(bZ,b0,bY){var i,b1;if(!bZ){return["C",b0.x,b0.y,b0.x,b0.y,b0.x,b0.y]}!(bZ[0] in {T:1,Q:1})&&(b0.qx=b0.qy=null);switch(bZ[0]){case"M":b0.X=bZ[1];b0.Y=bZ[2];break;case"A":bZ=["C"][av](ab[bs](0,[b0.x,b0.y][av](bZ.slice(1))));break;case"S":if(bY=="C"||bY=="S"){i=b0.x*2-b0.bx;b1=b0.y*2-b0.by}else{i=b0.x;b1=b0.y}bZ=["C",i,b1][av](bZ.slice(1));break;case"T":if(bY=="Q"||bY=="T"){b0.qx=b0.x*2-b0.qx;b0.qy=b0.y*2-b0.qy}else{b0.qx=b0.x;b0.qy=b0.y}bZ=["C"][av](z(b0.x,b0.y,b0.qx,b0.qy,bZ[1],bZ[2]));break;case"Q":b0.qx=bZ[1];b0.qy=bZ[2];bZ=["C"][av](z(b0.x,b0.y,bZ[1],bZ[2],bZ[3],bZ[4]));break;case"L":bZ=["C"][av](aW(b0.x,b0.y,bZ[1],bZ[2]));break;case"H":bZ=["C"][av](aW(b0.x,b0.y,bZ[1],b0.y));break;case"V":bZ=["C"][av](aW(b0.x,b0.y,b0.x,bZ[1]));break;case"Z":bZ=["C"][av](aW(b0.x,b0.y,b0.X,b0.Y));break}return bZ},b=function(bY,bZ){if(bY[bZ].length>7){bY[bZ].shift();var b0=bY[bZ];while(b0.length){bY.splice(bZ++,0,["C"][av](b0.splice(0,6)))}bY.splice(bZ,1);bV=bI(E.length,bT&&bT.length||0)}},g=function(b2,b1,bZ,bY,b0){if(b2&&b1&&b2[b0][0]=="M"&&b1[b0][0]!="M"){b1.splice(b0,0,["M",bY.x,bY.y]);bZ.bx=0;bZ.by=0;bZ.x=b2[b0][1];bZ.y=b2[b0][2];bV=bI(E.length,bT&&bT.length||0)}};for(var bP=0,bV=bI(E.length,bT&&bT.length||0);
bP<bV;bP++){E[bP]=S(E[bP],bU);b(E,bP);bT&&(bT[bP]=S(bT[bP],d));bT&&b(bT,bP);g(E,bT,bU,d,bP);g(bT,E,d,bU,bP);var bO=E[bP],bW=bT&&bT[bP],R=bO.length,bR=bT&&bW.length;bU.x=bO[R-2];bU.y=bO[R-1];bU.bx=bM(bO[R-4])||bU.x;bU.by=bM(bO[R-3])||bU.y;d.bx=bT&&(bM(bW[bR-4])||d.x);d.by=bT&&(bM(bW[bR-3])||d.y);d.x=bT&&bW[bR-2];d.y=bT&&bW[bR-1]}if(!bT){bQ.curve=aY(E)}return bT?[E,bT]:E},null,aY),ba=bi._parseDots=H(function(bR){var bQ=[];for(var S=0,bS=bR.length;S<bS;S++){var b={},bP=bR[S].match(/^([^:]*):?([\d\.]*)/);b.color=bi.getRGB(bP[1]);if(b.color.error){return null}b.color=b.color.hex;bP[2]&&(b.offset=bP[2]+"%");bQ.push(b)}for(S=1,bS=bQ.length-1;S<bS;S++){if(!bQ[S].offset){var g=bM(bQ[S-1].offset||0),E=0;for(var R=S+1;R<bS;R++){if(bQ[R].offset){E=bQ[R].offset;break}}if(!E){E=100;R=bS}E=bM(E);var bO=(E-g)/(R-S+1);for(;S<R;S++){g+=bO;bQ[S].offset=g+"%"}}}return bQ}),aH=bi._tear=function(b,d){b==d.top&&(d.top=b.prev);b==d.bottom&&(d.bottom=b.next);b.next&&(b.next.prev=b.prev);b.prev&&(b.prev.next=b.next)},L=bi._tofront=function(b,d){if(d.top===b){return}aH(b,d);b.next=null;b.prev=d.top;d.top.next=b;d.top=b},y=bi._toback=function(b,d){if(d.bottom===b){return}aH(b,d);b.next=d.bottom;b.prev=null;d.bottom.prev=b;d.bottom=b},ar=bi._insertafter=function(d,b,g){aH(d,g);b==g.top&&(g.top=d);b.next&&(b.next.prev=d);d.next=b.next;d.prev=b;b.next=d},m=bi._insertbefore=function(d,b,g){aH(d,g);b==g.bottom&&(g.bottom=d);b.prev&&(b.prev.next=d);d.prev=b.prev;b.prev=d;d.next=b},t=bi.toMatrix=function(g,b){var i=I(g),d={_:{transform:bn},getBBox:function(){return i}};Y(d,b);return d.matrix},ay=bi.transformPath=function(d,b){return Q(d,t(d,b))},Y=bi._extractTransform=function(d,b2){if(b2==null){return d._.transform}b2=k(b2).replace(/\.{3}|\u2026/g,d._.transform||bn);var bU=bi.parseTransformString(b2),bS=0,bQ=0,bP=0,bW=1,bV=1,b3=d._,bX=new a9;b3.transform=bU||[];if(bU){for(var bY=0,bR=bU.length;bY<bR;bY++){var bT=bU[bY],b=bT.length,R=k(bT[0]).toLowerCase(),b1=bT[0]!=R,bO=b1?bX.invert():0,b0,E,bZ,g,S;if(R=="t"&&b==3){if(b1){b0=bO.x(0,0);E=bO.y(0,0);bZ=bO.x(bT[1],bT[2]);g=bO.y(bT[1],bT[2]);bX.translate(bZ-b0,g-E)}else{bX.translate(bT[1],bT[2])}}else{if(R=="r"){if(b==2){S=S||d.getBBox(1);bX.rotate(bT[1],S.x+S.width/2,S.y+S.height/2);bS+=bT[1]}else{if(b==4){if(b1){bZ=bO.x(bT[2],bT[3]);g=bO.y(bT[2],bT[3]);bX.rotate(bT[1],bZ,g)}else{bX.rotate(bT[1],bT[2],bT[3])}bS+=bT[1]}}}else{if(R=="s"){if(b==2||b==3){S=S||d.getBBox(1);bX.scale(bT[1],bT[b-1],S.x+S.width/2,S.y+S.height/2);bW*=bT[1];bV*=bT[b-1]}else{if(b==5){if(b1){bZ=bO.x(bT[3],bT[4]);g=bO.y(bT[3],bT[4]);bX.scale(bT[1],bT[2],bZ,g)}else{bX.scale(bT[1],bT[2],bT[3],bT[4])}bW*=bT[1];bV*=bT[2]}}}else{if(R=="m"&&b==7){bX.add(bT[1],bT[2],bT[3],bT[4],bT[5],bT[6])}}}}b3.dirtyT=1;d.matrix=bX}}d.matrix=bX;b3.sx=bW;b3.sy=bV;b3.deg=bS;b3.dx=bQ=bX.e;b3.dy=bP=bX.f;if(bW==1&&bV==1&&!bS&&b3.bbox){b3.bbox.x+=+bQ;b3.bbox.y+=+bP}else{b3.dirtyT=1}},o=function(d){var b=d[0];switch(b.toLowerCase()){case"t":return[b,0,0];case"m":return[b,1,0,0,1,0,0];case"r":if(d.length==4){return[b,0,d[2],d[3]]}else{return[b,0]}case"s":if(d.length==5){return[b,1,1,d[3],d[4]]}else{if(d.length==3){return[b,1,1]}else{return[b,1]}}}},bd=bi._equaliseTransform=function(R,E){E=k(E).replace(/\.{3}|\u2026/g,R);R=bi.parseTransformString(R)||[];E=bi.parseTransformString(E)||[];var b=bI(R.length,E.length),bQ=[],bR=[],g=0,d,S,bP,bO;for(;g<b;g++){bP=R[g]||o(E[g]);bO=E[g]||o(bP);if((bP[0]!=bO[0])||(bP[0].toLowerCase()=="r"&&(bP[2]!=bO[2]||bP[3]!=bO[3]))||(bP[0].toLowerCase()=="s"&&(bP[3]!=bO[3]||bP[4]!=bO[4]))){return}bQ[g]=[];bR[g]=[];for(d=0,S=bI(bP.length,bO.length);d<S;d++){d in bP&&(bQ[g][d]=bP[d]);d in bO&&(bR[g][d]=bO[d])}}return{from:bQ,to:bR}};bi._getContainer=function(b,E,g,i){var d;d=i==null&&!bi.is(b,"object")?a5.doc.getElementById(b):b;if(d==null){return}if(d.tagName){if(E==null){return{container:d,width:d.style.pixelWidth||d.offsetWidth,height:d.style.pixelHeight||d.offsetHeight}}else{return{container:d,width:E,height:g}}}return{container:1,x:b,y:E,width:g,height:i}};bi.pathToRelative=j;bi._engine={};bi.path2curve=bk;bi.matrix=function(i,g,bO,S,R,E){return new a9(i,g,bO,S,R,E)};function a9(i,g,bO,S,R,E){if(i!=null){this.a=+i;this.b=+g;this.c=+bO;this.d=+S;this.e=+R;this.f=+E}else{this.a=1;this.b=0;this.c=0;this.d=1;this.e=0;this.f=0}}(function(g){g.add=function(bW,bT,bR,bP,S,R){var E=[[],[],[]],i=[[this.a,this.c,this.e],[this.b,this.d,this.f],[0,0,1]],bV=[[bW,bR,S],[bT,bP,R],[0,0,1]],bU,bS,bQ,bO;if(bW&&bW instanceof a9){bV=[[bW.a,bW.c,bW.e],[bW.b,bW.d,bW.f],[0,0,1]]}for(bU=0;bU<3;bU++){for(bS=0;bS<3;bS++){bO=0;for(bQ=0;bQ<3;bQ++){bO+=i[bU][bQ]*bV[bQ][bS]}E[bU][bS]=bO}}this.a=E[0][0];this.b=E[1][0];this.c=E[0][1];this.d=E[1][1];this.e=E[0][2];this.f=E[1][2]};g.invert=function(){var E=this,i=E.a*E.d-E.b*E.c;return new a9(E.d/i,-E.b/i,-E.c/i,E.a/i,(E.c*E.f-E.d*E.e)/i,(E.b*E.e-E.a*E.f)/i)};g.clone=function(){return new a9(this.a,this.b,this.c,this.d,this.e,this.f)};g.translate=function(i,E){this.add(1,0,0,1,i,E)};g.scale=function(E,S,i,R){S==null&&(S=E);(i||R)&&this.add(1,0,0,1,i,R);this.add(E,0,0,S,0,0);(i||R)&&this.add(1,0,0,1,-i,-R)};g.rotate=function(E,i,bO){E=bi.rad(E);i=i||0;bO=bO||0;var S=+aI.cos(E).toFixed(9),R=+aI.sin(E).toFixed(9);this.add(S,R,-R,S,i,bO);this.add(1,0,0,1,-i,-bO)};g.x=function(i,E){return i*this.a+E*this.c+this.e};g.y=function(i,E){return i*this.b+E*this.d+this.f};g.get=function(E){return +this[k.fromCharCode(97+E)].toFixed(4)};g.toString=function(){return bi.svg?"matrix("+[this.get(0),this.get(1),this.get(2),this.get(3),this.get(4),this.get(5)].join()+")":[this.get(0),this.get(2),this.get(1),this.get(3),0,0].join()};g.toFilter=function(){return"progid:DXImageTransform.Microsoft.Matrix(M11="+this.get(0)+", M12="+this.get(2)+", M21="+this.get(1)+", M22="+this.get(3)+", Dx="+this.get(4)+", Dy="+this.get(5)+", sizingmethod='auto expand')"};g.offset=function(){return[this.e.toFixed(4),this.f.toFixed(4)]};function d(i){return i[0]*i[0]+i[1]*i[1]}function b(i){var E=aI.sqrt(d(i));i[0]&&(i[0]/=E);i[1]&&(i[1]/=E)}g.split=function(){var E={};E.dx=this.e;E.dy=this.f;var S=[[this.a,this.c],[this.b,this.d]];E.scalex=aI.sqrt(d(S[0]));b(S[0]);E.shear=S[0][0]*S[1][0]+S[0][1]*S[1][1];S[1]=[S[1][0]-S[0][0]*E.shear,S[1][1]-S[0][1]*E.shear];E.scaley=aI.sqrt(d(S[1]));b(S[1]);E.shear/=E.scaley;var i=-S[0][1],R=S[1][1];if(R<0){E.rotate=bi.deg(aI.acos(R));if(i<0){E.rotate=360-E.rotate}}else{E.rotate=bi.deg(aI.asin(i))}E.isSimple=!+E.shear.toFixed(9)&&(E.scalex.toFixed(9)==E.scaley.toFixed(9)||!E.rotate);E.isSuperSimple=!+E.shear.toFixed(9)&&E.scalex.toFixed(9)==E.scaley.toFixed(9)&&!E.rotate;E.noRotation=!+E.shear.toFixed(9)&&!E.rotate;return E};g.toTransformString=function(i){var E=i||this[l]();if(E.isSimple){E.scalex=+E.scalex.toFixed(4);E.scaley=+E.scaley.toFixed(4);E.rotate=+E.rotate.toFixed(4);return(E.dx||E.dy?"t"+[E.dx,E.dy]:bn)+(E.scalex!=1||E.scaley!=1?"s"+[E.scalex,E.scaley,0,0]:bn)+(E.rotate?"r"+[E.rotate,0,0]:bn)}else{return"m"+[this.get(0),this.get(1),this.get(2),this.get(3),this.get(4),this.get(5)]
}}})(a9.prototype);var al=navigator.userAgent.match(/Version\/(.*?)\s/)||navigator.userAgent.match(/Chrome\/(\d+)/);if((navigator.vendor=="Apple Computer, Inc.")&&(al&&al[1]<4||navigator.platform.slice(0,2)=="iP")||(navigator.vendor=="Google Inc."&&al&&al[1]<8)){ao.safari=function(){var b=this.rect(-99,-99,this.width+99,this.height+99).attr({stroke:"none"});setTimeout(function(){b.remove()})}}else{ao.safari=ad}var bD=function(){this.returnValue=false},n=function(){return this.originalEvent.preventDefault()},aJ=function(){this.cancelBubble=true},V=function(){return this.originalEvent.stopPropagation()},ae=function(d){var b=a5.doc.documentElement.scrollTop||a5.doc.body.scrollTop,g=a5.doc.documentElement.scrollLeft||a5.doc.body.scrollLeft;return{x:d.clientX+g,y:d.clientY+b}},F=(function(){if(a5.doc.addEventListener){return function(E,g,d,b){var i=function(S){var bO=ae(S);return d.call(b,S,bO.x,bO.y)};E.addEventListener(g,i,false);if(O&&bp[g]){var R=function(bQ){var bR=ae(bQ),bO=bQ;for(var S=0,bP=bQ.targetTouches&&bQ.targetTouches.length;S<bP;S++){if(bQ.targetTouches[S].target==E){bQ=bQ.targetTouches[S];bQ.originalEvent=bO;bQ.preventDefault=n;bQ.stopPropagation=V;break}}return d.call(b,bQ,bR.x,bR.y)};E.addEventListener(bp[g],R,false)}return function(){E.removeEventListener(g,i,false);if(O&&bp[g]){E.removeEventListener(bp[g],i,false)}return true}}}else{if(a5.doc.attachEvent){return function(R,i,g,d){var E=function(bP){bP=bP||a5.win.event;var bO=a5.doc.documentElement.scrollTop||a5.doc.body.scrollTop,bQ=a5.doc.documentElement.scrollLeft||a5.doc.body.scrollLeft,S=bP.clientX+bQ,bR=bP.clientY+bO;bP.preventDefault=bP.preventDefault||bD;bP.stopPropagation=bP.stopPropagation||aJ;return g.call(d,bP,S,bR)};R.attachEvent("on"+i,E);var b=function(){R.detachEvent("on"+i,E);return true};return b}}}})(),aA=[],br=function(bP){var bS=bP.clientX,bR=bP.clientY,bU=a5.doc.documentElement.scrollTop||a5.doc.body.scrollTop,bV=a5.doc.documentElement.scrollLeft||a5.doc.body.scrollLeft,g,E=aA.length;while(E--){g=aA[E];if(O&&bP.touches){var S=bP.touches.length,R;while(S--){R=bP.touches[S];if(R.identifier==g.el._drag.id){bS=R.clientX;bR=R.clientY;(bP.originalEvent?bP.originalEvent:bP).preventDefault();break}}}else{bP.preventDefault()}var d=g.el.node,b,bO=d.nextSibling,bT=d.parentNode,bQ=d.style.display;a5.win.opera&&bT.removeChild(d);d.style.display="none";b=g.el.paper.getElementByPoint(bS,bR);d.style.display=bQ;a5.win.opera&&(bO?bT.insertBefore(d,bO):bT.appendChild(d));b&&bc("raphael.drag.over."+g.el.id,g.el,b);bS+=bV;bR+=bU;bc("raphael.drag.move."+g.el.id,g.move_scope||g.el,bS-g.el._drag.x,bR-g.el._drag.y,bS,bR,bP)}},e=function(g){bi.unmousemove(br).unmouseup(e);var d=aA.length,b;while(d--){b=aA[d];b.el._drag={};bc("raphael.drag.end."+b.el.id,b.end_scope||b.start_scope||b.move_scope||b.el,g)}aA=[]},aq=bi.el={};for(var a3=bB.length;a3--;){(function(b){bi[b]=aq[b]=function(g,d){if(bi.is(g,"function")){this.events=this.events||[];this.events.push({name:b,f:g,unbind:F(this.shape||this.node||a5.doc,b,g,d||this)})}return this};bi["un"+b]=aq["un"+b]=function(i){var g=this.events||[],d=g.length;while(d--){if(g[d].name==b&&(bi.is(i,"undefined")||g[d].f==i)){g[d].unbind();g.splice(d,1);!g.length&&delete this.events}}return this}})(bB[a3])}aq.data=function(d,E){var g=M[this.id]=M[this.id]||{};if(arguments.length==0){return g}if(arguments.length==1){if(bi.is(d,"object")){for(var b in d){if(d[bw](b)){this.data(b,d[b])}}return this}bc("raphael.data.get."+this.id,this,g[d],d);return g[d]}g[d]=E;bc("raphael.data.set."+this.id,this,E,d);return this};aq.removeData=function(b){if(b==null){M[this.id]={}}else{M[this.id]&&delete M[this.id][b]}return this};aq.getData=function(){return bl(M[this.id]||{})};aq.hover=function(i,b,g,d){return this.mouseover(i,g).mouseout(b,d||g)};aq.unhover=function(d,b){return this.unmouseover(d).unmouseout(b)};var ah=[];aq.drag=function(d,R,E,b,g,i){function S(bR){(bR.originalEvent||bR).preventDefault();var bO=bR.clientX,bU=bR.clientY,bQ=a5.doc.documentElement.scrollTop||a5.doc.body.scrollTop,bS=a5.doc.documentElement.scrollLeft||a5.doc.body.scrollLeft;this._drag.id=bR.identifier;if(O&&bR.touches){var bP=bR.touches.length,bT;while(bP--){bT=bR.touches[bP];this._drag.id=bT.identifier;if(bT.identifier==this._drag.id){bO=bT.clientX;bU=bT.clientY;break}}}this._drag.x=bO+bS;this._drag.y=bU+bQ;!aA.length&&bi.mousemove(br).mouseup(e);aA.push({el:this,move_scope:b,start_scope:g,end_scope:i});R&&bc.on("raphael.drag.start."+this.id,R);d&&bc.on("raphael.drag.move."+this.id,d);E&&bc.on("raphael.drag.end."+this.id,E);bc("raphael.drag.start."+this.id,g||b||this,bR.clientX+bS,bR.clientY+bQ,bR)}this._drag={};ah.push({el:this,start:S});this.mousedown(S);return this};aq.onDragOver=function(b){b?bc.on("raphael.drag.over."+this.id,b):bc.unbind("raphael.drag.over."+this.id)};aq.undrag=function(){var b=ah.length;while(b--){if(ah[b].el==this){this.unmousedown(ah[b].start);ah.splice(b,1);bc.unbind("raphael.drag.*."+this.id)}}!ah.length&&bi.unmousemove(br).unmouseup(e);aA=[]};ao.circle=function(b,i,g){var d=bi._engine.circle(this,b||0,i||0,g||0);this.__set__&&this.__set__.push(d);return d};ao.rect=function(b,R,d,i,E){var g=bi._engine.rect(this,b||0,R||0,d||0,i||0,E||0);this.__set__&&this.__set__.push(g);return g};ao.ellipse=function(b,E,i,g){var d=bi._engine.ellipse(this,b||0,E||0,i||0,g||0);this.__set__&&this.__set__.push(d);return d};ao.path=function(b){b&&!bi.is(b,a)&&!bi.is(b[0],u)&&(b+=bn);var d=bi._engine.path(bi.format[bs](bi,arguments),this);this.__set__&&this.__set__.push(d);return d};ao.image=function(E,b,R,d,i){var g=bi._engine.image(this,E||"about:blank",b||0,R||0,d||0,i||0);this.__set__&&this.__set__.push(g);return g};ao.text=function(b,i,g){var d=bi._engine.text(this,b||0,i||0,k(g));this.__set__&&this.__set__.push(d);return d};ao.set=function(d){!bi.is(d,"array")&&(d=Array.prototype.splice.call(arguments,0,arguments.length));var b=new X(d);this.__set__&&this.__set__.push(b);b.paper=this;b.type="set";return b};ao.setStart=function(b){this.__set__=b||this.set()};ao.setFinish=function(d){var b=this.__set__;delete this.__set__;return b};ao.setSize=function(d,b){return bi._engine.setSize.call(this,d,b)};ao.setViewBox=function(b,E,d,i,g){return bi._engine.setViewBox.call(this,b,E,d,i,g)};ao.top=ao.bottom=null;ao.raphael=bi;var bN=function(g){var E=g.getBoundingClientRect(),bP=g.ownerDocument,R=bP.body,b=bP.documentElement,i=b.clientTop||R.clientTop||0,S=b.clientLeft||R.clientLeft||0,bO=E.top+(a5.win.pageYOffset||b.scrollTop||R.scrollTop)-i,d=E.left+(a5.win.pageXOffset||b.scrollLeft||R.scrollLeft)-S;return{y:bO,x:d}};ao.getElementByPoint=function(d,bO){var S=this,g=S.canvas,R=a5.doc.elementFromPoint(d,bO);if(a5.win.opera&&R.tagName=="svg"){var E=bN(g),i=g.createSVGRect();i.x=d-E.x;i.y=bO-E.y;i.width=i.height=1;var b=g.getIntersectionList(i,null);if(b.length){R=b[b.length-1]}}if(!R){return null}while(R.parentNode&&R!=g.parentNode&&!R.raphael){R=R.parentNode}R==S.canvas.parentNode&&(R=g);R=R&&R.raphael?S.getById(R.raphaelid):null;
return R};ao.getElementsByBBox=function(b){var d=this.set();this.forEach(function(g){if(bi.isBBoxIntersect(g.getBBox(),b)){d.push(g)}});return d};ao.getById=function(d){var b=this.bottom;while(b){if(b.id==d){return b}b=b.next}return null};ao.forEach=function(g,b){var d=this.bottom;while(d){if(g.call(b,d)===false){return this}d=d.next}return this};ao.getElementsByPoint=function(b,g){var d=this.set();this.forEach(function(i){if(i.isPointInside(b,g)){d.push(i)}});return d};function bx(){return this.x+bh+this.y}function a6(){return this.x+bh+this.y+bh+this.width+" \xd7 "+this.height}aq.isPointInside=function(b,g){var d=this.realPath=af[this.type](this);if(this.attr("transform")&&this.attr("transform").length){d=bi.transformPath(d,this.attr("transform"))}return bi.isPointInsidePath(d,b,g)};aq.getBBox=function(d){if(this.removed){return{}}var b=this._;if(d){if(b.dirty||!b.bboxwt){this.realPath=af[this.type](this);b.bboxwt=I(this.realPath);b.bboxwt.toString=a6;b.dirty=0}return b.bboxwt}if(b.dirty||b.dirtyT||!b.bbox){if(b.dirty||!this.realPath){b.bboxwt=0;this.realPath=af[this.type](this)}b.bbox=I(Q(this.realPath,this.matrix));b.bbox.toString=a6;b.dirty=b.dirtyT=0}return b.bbox};aq.clone=function(){if(this.removed){return null}var b=this.paper[this.type]().attr(this.attr());this.__set__&&this.__set__.push(b);return b};aq.glow=function(bO){if(this.type=="text"){return null}bO=bO||{};var g={width:(bO.width||10)+(+this.attr("stroke-width")||1),fill:bO.fill||false,opacity:bO.opacity||0.5,offsetx:bO.offsetx||0,offsety:bO.offsety||0,color:bO.color||"#000"},S=g.width/2,E=this.paper,b=E.set(),R=this.realPath||af[this.type](this);R=this.matrix?Q(R,this.matrix):R;for(var d=1;d<S+1;d++){b.push(E.path(R).attr({stroke:g.color,fill:g.fill?g.color:"none","stroke-linejoin":"round","stroke-linecap":"round","stroke-width":+(g.width/S*d).toFixed(3),opacity:+(g.opacity/S).toFixed(3)}))}return b.insertBefore(this).translate(g.offsetx,g.offsety)};var aZ={},aO=function(d,b,E,i,bP,bO,S,R,g){if(g==null){return bb(d,b,E,i,bP,bO,S,R)}else{return bi.findDotsAtSegment(d,b,E,i,bP,bO,S,R,aK(d,b,E,i,bP,bO,S,R,g))}},aD=function(b,d){return function(bW,R,S){bW=bk(bW);var bS,bR,g,bO,E="",bV={},bT,bQ=0;for(var bP=0,bU=bW.length;bP<bU;bP++){g=bW[bP];if(g[0]=="M"){bS=+g[1];bR=+g[2]}else{bO=aO(bS,bR,g[1],g[2],g[3],g[4],g[5],g[6]);if(bQ+bO>R){if(d&&!bV.start){bT=aO(bS,bR,g[1],g[2],g[3],g[4],g[5],g[6],R-bQ);E+=["C"+bT.start.x,bT.start.y,bT.m.x,bT.m.y,bT.x,bT.y];if(S){return E}bV.start=E;E=["M"+bT.x,bT.y+"C"+bT.n.x,bT.n.y,bT.end.x,bT.end.y,g[5],g[6]].join();bQ+=bO;bS=+g[5];bR=+g[6];continue}if(!b&&!d){bT=aO(bS,bR,g[1],g[2],g[3],g[4],g[5],g[6],R-bQ);return{x:bT.x,y:bT.y,alpha:bT.alpha}}}bQ+=bO;bS=+g[5];bR=+g[6]}E+=g.shift()+g}bV.end=E;bT=b?bQ:d?bV:bi.findDotsAtSegment(bS,bR,g[0],g[1],g[2],g[3],g[4],g[5],1);bT.alpha&&(bT={x:bT.x,y:bT.y,alpha:bT.alpha});return bT}};var bG=aD(1),by=aD(),aB=aD(0,1);bi.getTotalLength=bG;bi.getPointAtLength=by;bi.getSubpath=function(d,i,g){if(this.getTotalLength(d)-g<0.000001){return aB(d,i).end}var b=aB(d,g,1);return i?aB(b,i).end:b};aq.getTotalLength=function(){var b=this.getPath();if(!b){return}if(this.node.getTotalLength){return this.node.getTotalLength()}return bG(b)};aq.getPointAtLength=function(b){var d=this.getPath();if(!d){return}return by(d,b)};aq.getPath=function(){var d,b=bi._getPath[this.type];if(this.type=="text"||this.type=="set"){return}if(b){d=b(this)}return d};aq.getSubpath=function(g,d){var b=this.getPath();if(!b){return}return bi.getSubpath(b,g,d)};var aG=bi.easing_formulas={linear:function(b){return b},"<":function(b){return aS(b,1.7)},">":function(b){return aS(b,0.48)},"<>":function(bO){var i=0.48-bO/1.04,g=aI.sqrt(0.1734+i*i),b=g-i,S=aS(ak(b),1/3)*(b<0?-1:1),R=-g-i,E=aS(ak(R),1/3)*(R<0?-1:1),d=S+E+0.5;return(1-d)*3*d*d+d*d*d},backIn:function(d){var b=1.70158;return d*d*((b+1)*d-b)},backOut:function(d){d=d-1;var b=1.70158;return d*d*((b+1)*d+b)+1},elastic:function(b){if(b==!!b){return b}return aS(2,-10*b)*aI.sin((b-0.075)*(2*ag)/0.3)+1},bounce:function(i){var d=7.5625,g=2.75,b;if(i<(1/g)){b=d*i*i}else{if(i<(2/g)){i-=(1.5/g);b=d*i*i+0.75}else{if(i<(2.5/g)){i-=(2.25/g);b=d*i*i+0.9375}else{i-=(2.625/g);b=d*i*i+0.984375}}}return b}};aG.easeIn=aG["ease-in"]=aG["<"];aG.easeOut=aG["ease-out"]=aG[">"];aG.easeInOut=aG["ease-in-out"]=aG["<>"];aG["back-in"]=aG.backIn;aG["back-out"]=aG.backOut;var bF=[],bH=aT.requestAnimationFrame||aT.webkitRequestAnimationFrame||aT.mozRequestAnimationFrame||aT.oRequestAnimationFrame||aT.msRequestAnimationFrame||function(b){setTimeout(b,16)},at=function(){var bO=+new Date,bW=0;for(;bW<bF.length;bW++){var b2=bF[bW];if(b2.el.removed||b2.paused){continue}var E=bO-b2.start,bU=b2.ms,bT=b2.easing,bX=b2.from,bR=b2.diff,d=b2.to,bQ=b2.t,S=b2.el,bS={},b,b0={},b4;if(b2.initstatus){E=(b2.initstatus*b2.anim.top-b2.prev)/(b2.percent-b2.prev)*bU;b2.status=b2.initstatus;delete b2.initstatus;b2.stop&&bF.splice(bW--,1)}else{b2.status=(b2.prev+(b2.percent-b2.prev)*(E/bU))/b2.anim.top}if(E<0){continue}if(E<bU){var g=bT(E/bU);for(var bV in bX){if(bX[bw](bV)){switch(bo[bV]){case bj:b=+bX[bV]+g*bU*bR[bV];break;case"colour":b="rgb("+[a1(C(bX[bV].r+g*bU*bR[bV].r)),a1(C(bX[bV].g+g*bU*bR[bV].g)),a1(C(bX[bV].b+g*bU*bR[bV].b))].join(",")+")";break;case"path":b=[];for(var bZ=0,bP=bX[bV].length;bZ<bP;bZ++){b[bZ]=[bX[bV][bZ][0]];for(var bY=1,b1=bX[bV][bZ].length;bY<b1;bY++){b[bZ][bY]=+bX[bV][bZ][bY]+g*bU*bR[bV][bZ][bY]}b[bZ]=b[bZ].join(bh)}b=b.join(bh);break;case"transform":if(bR[bV].real){b=[];for(bZ=0,bP=bX[bV].length;bZ<bP;bZ++){b[bZ]=[bX[bV][bZ][0]];for(bY=1,b1=bX[bV][bZ].length;bY<b1;bY++){b[bZ][bY]=bX[bV][bZ][bY]+g*bU*bR[bV][bZ][bY]}}}else{var b3=function(b5){return +bX[bV][b5]+g*bU*bR[bV][b5]};b=[["m",b3(0),b3(1),b3(2),b3(3),b3(4),b3(5)]]}break;case"csv":if(bV=="clip-rect"){b=[];bZ=4;while(bZ--){b[bZ]=+bX[bV][bZ]+g*bU*bR[bV][bZ]}}break;default:var R=[][av](bX[bV]);b=[];bZ=S.paper.customAttributes[bV].length;while(bZ--){b[bZ]=+R[bZ]+g*bU*bR[bV][bZ]}break}bS[bV]=b}}S.attr(bS);(function(b6,i,b5){setTimeout(function(){bc("raphael.anim.frame."+b6,i,b5)})})(S.id,S,b2.anim)}else{(function(b6,b5,i){setTimeout(function(){bc("raphael.anim.frame."+b5.id,b5,i);bc("raphael.anim.finish."+b5.id,b5,i);bi.is(b6,"function")&&b6.call(b5)})})(b2.callback,S,b2.anim);S.attr(d);bF.splice(bW--,1);if(b2.repeat>1&&!b2.next){for(b4 in d){if(d[bw](b4)){b0[b4]=b2.totalOrigin[b4]}}b2.el.attr(b0);T(b2.anim,b2.el,b2.anim.percents[0],null,b2.totalOrigin,b2.repeat-1)}if(b2.next&&!b2.stop){T(b2.anim,b2.el,b2.next,null,b2.totalOrigin,b2.repeat)}}}bi.svg&&S&&S.paper&&S.paper.safari();bF.length&&bH(at)},a1=function(b){return b>255?255:b<0?0:b};aq.animateWith=function(d,E,g,b,bO,bT){var S=this;if(S.removed){bT&&bT.call(S);return S}var bR=g instanceof f?g:bi.animation(g,b,bO,bT),bQ,bP;T(bR,S,bR.percents[0],null,S.attr());for(var R=0,bS=bF.length;R<bS;R++){if(bF[R].anim==E&&bF[R].el==d){bF[bS-1].start=bF[R].start;break}}return S};function a0(bU,i,d,bT,bS,bO){var bP=3*i,bR=3*(bT-i)-bP,b=1-bP-bR,S=3*d,bQ=3*(bS-d)-S,bV=1-S-bQ;
function R(bW){return((b*bW+bR)*bW+bP)*bW}function g(bW,bY){var bX=E(bW,bY);return((bV*bX+bQ)*bX+S)*bX}function E(bW,b3){var b2,b1,bZ,bX,b0,bY;for(bZ=bW,bY=0;bY<8;bY++){bX=R(bZ)-bW;if(ak(bX)<b3){return bZ}b0=(3*b*bZ+2*bR)*bZ+bP;if(ak(b0)<0.000001){break}bZ=bZ-bX/b0}b2=0;b1=1;bZ=bW;if(bZ<b2){return b2}if(bZ>b1){return b1}while(b2<b1){bX=R(bZ);if(ak(bX-bW)<b3){return bZ}if(bW>bX){b2=bZ}else{b1=bZ}bZ=(b1-b2)/2+b2}return bZ}return g(bU,1/(200*bO))}aq.onAnimation=function(b){b?bc.on("raphael.anim.frame."+this.id,b):bc.unbind("raphael.anim.frame."+this.id);return this};function f(E,g){var d=[],i={};this.ms=g;this.times=1;if(E){for(var b in E){if(E[bw](b)){i[bM(b)]=E[b];d.push(bM(b))}}d.sort(bu)}this.anim=i;this.top=d[d.length-1];this.percents=d}f.prototype.delay=function(d){var b=new f(this.anim,this.ms);b.times=this.times;b.del=+d||0;return b};f.prototype.repeat=function(d){var b=new f(this.anim,this.ms);b.del=this.del;b.times=aI.floor(bI(d,0))||1;return b};function T(b6,g,b,b4,bO,bS){b=bM(b);var cd,S,bR,ce=[],bY,bX,R,b0=b6.ms,b5={},E={},bU={};if(b4){for(b9=0,bT=bF.length;b9<bT;b9++){var cb=bF[b9];if(cb.el.id==g.id&&cb.anim==b6){if(cb.percent!=b){bF.splice(b9,1);bR=1}else{S=cb}g.attr(cb.totalOrigin);break}}}else{b4=+E}for(var b9=0,bT=b6.percents.length;b9<bT;b9++){if(b6.percents[b9]==b||b6.percents[b9]>b4*b6.top){b=b6.percents[b9];bX=b6.percents[b9-1]||0;b0=b0/b6.top*(b-bX);bY=b6.percents[b9+1];cd=b6.anim[b];break}else{if(b4){g.attr(b6.anim[b6.percents[b9]])}}}if(!cd){return}if(!S){for(var b2 in cd){if(cd[bw](b2)){if(bo[bw](b2)||g.paper.customAttributes[bw](b2)){b5[b2]=g.attr(b2);(b5[b2]==null)&&(b5[b2]=bq[b2]);E[b2]=cd[b2];switch(bo[b2]){case bj:bU[b2]=(E[b2]-b5[b2])/b0;break;case"colour":b5[b2]=bi.getRGB(b5[b2]);var b3=bi.getRGB(E[b2]);bU[b2]={r:(b3.r-b5[b2].r)/b0,g:(b3.g-b5[b2].g)/b0,b:(b3.b-b5[b2].b)/b0};break;case"path":var bP=bk(b5[b2],E[b2]),bW=bP[1];b5[b2]=bP[0];bU[b2]=[];for(b9=0,bT=b5[b2].length;b9<bT;b9++){bU[b2][b9]=[0];for(var b8=1,ca=b5[b2][b9].length;b8<ca;b8++){bU[b2][b9][b8]=(bW[b9][b8]-b5[b2][b9][b8])/b0}}break;case"transform":var cg=g._,cf=bd(cg[b2],E[b2]);if(cf){b5[b2]=cf.from;E[b2]=cf.to;bU[b2]=[];bU[b2].real=true;for(b9=0,bT=b5[b2].length;b9<bT;b9++){bU[b2][b9]=[b5[b2][b9][0]];for(b8=1,ca=b5[b2][b9].length;b8<ca;b8++){bU[b2][b9][b8]=(E[b2][b9][b8]-b5[b2][b9][b8])/b0}}}else{var b1=(g.matrix||new a9),cc={_:{transform:cg.transform},getBBox:function(){return g.getBBox(1)}};b5[b2]=[b1.a,b1.b,b1.c,b1.d,b1.e,b1.f];Y(cc,E[b2]);E[b2]=cc._.transform;bU[b2]=[(cc.matrix.a-b1.a)/b0,(cc.matrix.b-b1.b)/b0,(cc.matrix.c-b1.c)/b0,(cc.matrix.d-b1.d)/b0,(cc.matrix.e-b1.e)/b0,(cc.matrix.f-b1.f)/b0]}break;case"csv":var d=k(cd[b2])[l](bv),bQ=k(b5[b2])[l](bv);if(b2=="clip-rect"){b5[b2]=bQ;bU[b2]=[];b9=bQ.length;while(b9--){bU[b2][b9]=(d[b9]-b5[b2][b9])/b0}}E[b2]=d;break;default:d=[][av](cd[b2]);bQ=[][av](b5[b2]);bU[b2]=[];b9=g.paper.customAttributes[b2].length;while(b9--){bU[b2][b9]=((d[b9]||0)-(bQ[b9]||0))/b0}break}}}}var bZ=cd.easing,b7=bi.easing_formulas[bZ];if(!b7){b7=k(bZ).match(an);if(b7&&b7.length==5){var bV=b7;b7=function(i){return a0(i,+bV[1],+bV[2],+bV[3],+bV[4],b0)}}else{b7=aw}}R=cd.start||b6.start||+new Date;cb={anim:b6,percent:b,timestamp:R,start:R+(b6.del||0),status:0,initstatus:b4||0,stop:false,ms:b0,easing:b7,from:b5,diff:bU,to:E,el:g,callback:cd.callback,prev:bX,next:bY,repeat:bS||b6.times,origin:g.attr(),totalOrigin:bO};bF.push(cb);if(b4&&!S&&!bR){cb.stop=true;cb.start=new Date-b0*b4;if(bF.length==1){return at()}}if(bR){cb.start=new Date-cb.ms*b4}bF.length==1&&bH(at)}else{S.initstatus=b4;S.start=new Date-S.ms*b4}bc("raphael.anim.start."+g.id,g,b6)}bi.animation=function(E,d,S,R){if(E instanceof f){return E}if(bi.is(S,"function")||!S){R=R||S||null;S=null}E=Object(E);d=+d||0;var i={},g,b;for(b in E){if(E[bw](b)&&bM(b)!=b&&bM(b)+"%"!=b){g=true;i[b]=E[b]}}if(!g){return new f(E,d)}else{S&&(i.easing=S);R&&(i.callback=R);return new f({100:i},d)}};aq.animate=function(i,b,R,E){var d=this;if(d.removed){E&&E.call(d);return d}var g=i instanceof f?i:bi.animation(i,b,R,E);T(g,d,g.percents[0],null,d.attr());return d};aq.setTime=function(d,b){if(d&&b!=null){this.status(d,ai(b,d.ms)/d.ms)}return this};aq.status=function(R,E){var d=[],g=0,b,S;if(E!=null){T(R,this,-1,ai(E,1));return this}else{b=bF.length;for(;g<b;g++){S=bF[g];if(S.el.id==this.id&&(!R||S.anim==R)){if(R){return S.status}d.push({anim:S.anim,status:S.status})}}if(R){return 0}return d}};aq.pause=function(d){for(var b=0;b<bF.length;b++){if(bF[b].el.id==this.id&&(!d||bF[b].anim==d)){if(bc("raphael.anim.pause."+this.id,this,bF[b].anim)!==false){bF[b].paused=true}}}return this};aq.resume=function(d){for(var b=0;b<bF.length;b++){if(bF[b].el.id==this.id&&(!d||bF[b].anim==d)){var g=bF[b];if(bc("raphael.anim.resume."+this.id,this,g.anim)!==false){delete g.paused;this.status(g.anim,g.status)}}}return this};aq.stop=function(d){for(var b=0;b<bF.length;b++){if(bF[b].el.id==this.id&&(!d||bF[b].anim==d)){if(bc("raphael.anim.stop."+this.id,this,bF[b].anim)!==false){bF.splice(b--,1)}}}return this};function be(d){for(var b=0;b<bF.length;b++){if(bF[b].el.paper==d){bF.splice(b--,1)}}}bc.on("raphael.remove",be);bc.on("raphael.clear",be);aq.toString=function(){return"Rapha\xebl\u2019s object"};var X=function(b){this.items=[];this.length=0;this.type="set";if(b){for(var d=0,g=b.length;d<g;d++){if(b[d]&&(b[d].constructor==aq.constructor||b[d].constructor==X)){this[this.items.length]=this.items[this.items.length]=b[d];this.length++}}}},v=X.prototype;v.push=function(){var E,b;for(var d=0,g=arguments.length;d<g;d++){E=arguments[d];if(E&&(E.constructor==aq.constructor||E.constructor==X)){b=this.items.length;this[b]=this.items[b]=E;this.length++}}return this};v.pop=function(){this.length&&delete this[this.length--];return this.items.pop()};v.forEach=function(E,b){for(var d=0,g=this.items.length;d<g;d++){if(E.call(b,this.items[d],d)===false){return this}}return this};for(var aF in aq){if(aq[bw](aF)){v[aF]=(function(b){return function(){var d=arguments;return this.forEach(function(g){g[b][bs](g,d)})}})(aF)}}v.attr=function(d,S){if(d&&bi.is(d,u)&&bi.is(d[0],"object")){for(var b=0,R=d.length;b<R;b++){this.items[b].attr(d[b])}}else{for(var g=0,E=this.items.length;g<E;g++){this.items[g].attr(d,S)}}return this};v.clear=function(){while(this.length){this.pop()}};v.splice=function(E,bO,bP){E=E<0?bI(this.length+E,0):E;bO=bI(0,ai(this.length-E,bO));var g=[],b=[],d=[],R;for(R=2;R<arguments.length;R++){d.push(arguments[R])}for(R=0;R<bO;R++){b.push(this[E+R])}for(;R<this.length-E;R++){g.push(this[E+R])}var S=d.length;for(R=0;R<S+g.length;R++){this.items[E+R]=this[E+R]=R<S?d[R]:g[R-S]}R=this.items.length=this.length-=bO-S;while(this[R]){delete this[R++]}return new X(b)};v.exclude=function(g){for(var b=0,d=this.length;b<d;b++){if(this[b]==g){this.splice(b,1);return true}}};v.animate=function(g,b,bO,bQ){(bi.is(bO,"function")||!bO)&&(bQ=bO||null);var S=this.items.length,E=S,bR,bP=this,R;if(!S){return this}bQ&&(R=function(){!--S&&bQ.call(bP)});bO=bi.is(bO,a)?bO:R;
var d=bi.animation(g,b,bO,R);bR=this.items[--E].animate(d);while(E--){this.items[E]&&!this.items[E].removed&&this.items[E].animateWith(bR,d,d);(this.items[E]&&!this.items[E].removed)||S--}return this};v.insertAfter=function(d){var b=this.items.length;while(b--){this.items[b].insertAfter(d)}return this};v.getBBox=function(){var b=[],S=[],d=[],E=[];for(var g=this.items.length;g--;){if(!this.items[g].removed){var R=this.items[g].getBBox();b.push(R.x);S.push(R.y);d.push(R.x+R.width);E.push(R.y+R.height)}}b=ai[bs](0,b);S=ai[bs](0,S);d=bI[bs](0,d);E=bI[bs](0,E);return{x:b,y:S,x2:d,y2:E,width:d-b,height:E-S}};v.clone=function(g){g=this.paper.set();for(var b=0,d=this.items.length;b<d;b++){g.push(this.items[b].clone())}return g};v.toString=function(){return"Rapha\xebl\u2018s set"};v.glow=function(d){var b=this.paper.set();this.forEach(function(i,E){var R=i.glow(d);if(R!=null){R.forEach(function(g,S){b.push(g)})}});return b};v.isPointInside=function(b,g){var d=false;this.forEach(function(i){if(i.isPointInside(b,g)){console.log("runned");d=true;return false}});return d};bi.registerFont=function(d){if(!d.face){return d}this.fonts=this.fonts||{};var i={w:d.w,face:{},glyphs:{}},g=d.face["font-family"];for(var S in d.face){if(d.face[bw](S)){i.face[S]=d.face[S]}}if(this.fonts[g]){this.fonts[g].push(i)}else{this.fonts[g]=[i]}if(!d.svg){i.face["units-per-em"]=bK(d.face["units-per-em"],10);for(var E in d.glyphs){if(d.glyphs[bw](E)){var R=d.glyphs[E];i.glyphs[E]={w:R.w,k:{},d:R.d&&"M"+R.d.replace(/[mlcxtrv]/g,function(bO){return{l:"L",c:"C",x:"z",t:"m",r:"l",v:"c"}[bO]||"M"})+"z"};if(R.k){for(var b in R.k){if(R[bw](b)){i.glyphs[E].k[b]=R.k[b]}}}}}}return d};ao.getFont=function(bP,bQ,d,E){E=E||"normal";d=d||"normal";bQ=+bQ||{normal:400,bold:700,lighter:300,bolder:800}[bQ]||400;if(!bi.fonts){return}var R=bi.fonts[bP];if(!R){var g=new RegExp("(^|\\s)"+bP.replace(/[^\w\d\s+!~.:_-]/g,bn)+"(\\s|$)","i");for(var b in bi.fonts){if(bi.fonts[bw](b)){if(g.test(b)){R=bi.fonts[b];break}}}}var S;if(R){for(var bO=0,bR=R.length;bO<bR;bO++){S=R[bO];if(S.face["font-weight"]==bQ&&(S.face["font-style"]==d||!S.face["font-style"])&&S.face["font-stretch"]==E){break}}}return S};ao.print=function(bP,bO,b,bS,bU,b2,g,d){b2=b2||"middle";g=bI(ai(g||0,1),-1);d=bI(ai(d||1,3),1);var b1=k(b)[l](bn),bY=0,b0=0,bW=bn,b3;bi.is(bS,"string")&&(bS=this.getFont(bS));if(bS){b3=(bU||16)/bS.face["units-per-em"];var R=bS.face.bbox[l](bv),bR=+R[0],E=R[3]-R[1],S=0,bT=+R[1]+(b2=="baseline"?E+(+bS.face.descent):E/2);for(var bX=0,bQ=b1.length;bX<bQ;bX++){if(b1[bX]=="\n"){bY=0;bZ=0;b0=0;S+=E*d}else{var bV=b0&&bS.glyphs[b1[bX-1]]||{},bZ=bS.glyphs[b1[bX]];bY+=b0?(bV.w||bS.w)+(bV.k&&bV.k[b1[bX]]||0)+(bS.w*g):0;b0=1}if(bZ&&bZ.d){bW+=bi.transformPath(bZ.d,["t",bY*b3,S*b3,"s",b3,b3,bR,bT,"t",(bP-bR)/b3,(bO-bT)/b3])}}}return this.path(bW).attr({fill:"#000",stroke:"none"})};ao.add=function(E){if(bi.is(E,"array")){var g=this.set(),d=0,R=E.length,b;for(;d<R;d++){b=E[d]||{};au[bw](b.type)&&g.push(this[b.type]().attr(b))}}return g};bi.format=function(d,g){var b=bi.is(g,u)?[0][av](g):arguments;d&&bi.is(d,a)&&b.length-1&&(d=d.replace(W,function(R,E){return b[++E]==null?bn:b[E]}));return d||bn};bi.fullfill=(function(){var g=/\{([^\}]+)\}/g,b=/(?:(?:^|\.)(.+?)(?=\[|\.|$|\()|\[('|")(.+?)\2\])(\(\))?/g,d=function(R,E,S){var i=S;E.replace(b,function(bQ,bP,bO,bS,bR){bP=bP||bS;if(i){if(bP in i){i=i[bP]}typeof i=="function"&&bR&&(i=i())}});i=(i==null||i==S?R:i)+"";return i};return function(E,i){return String(E).replace(g,function(S,R){return d(S,R,i)})}})();bi.ninja=function(){aE.was?(a5.win.Raphael=aE.is):delete Raphael;return bi};bi.st=v;(function(i,d,g){if(i.readyState==null&&i.addEventListener){i.addEventListener(d,g=function(){i.removeEventListener(d,g,false);i.readyState="complete"},false);i.readyState="loading"}function b(){(/in/).test(i.readyState)?setTimeout(b,9):bi.eve("raphael.DOMload")}b()})(document,"DOMContentLoaded");bc.on("raphael.DOMload",function(){K=true});(function(){if(!bi.svg){return}var i="hasOwnProperty",b9=String,bV=parseFloat,bY=parseInt,bO=Math,ca=bO.max,b0=bO.abs,bQ=bO.pow,bP=/[, ]+/,b7=bi.eve,bZ="",bS=" ";var bW="http://www.w3.org/1999/xlink",b6={block:"M5,0 0,2.5 5,5z",classic:"M5,0 0,2.5 5,5 3.5,3 3.5,2z",diamond:"M2.5,0 5,2.5 2.5,5 0,2.5z",open:"M6,1 1,3.5 6,6",oval:"M2.5,0A2.5,2.5,0,0,1,2.5,5 2.5,2.5,0,0,1,2.5,0z"},b2={};bi.toString=function(){return"Your browser supports SVG.\nYou are running Rapha\xebl "+this.version};var bR=function(cb,E){if(E){if(typeof cb=="string"){cb=bR(cb)}for(var S in E){if(E[i](S)){if(S.substring(0,6)=="xlink:"){cb.setAttributeNS(bW,S.substring(6),b9(E[S]))}else{cb.setAttribute(S,b9(E[S]))}}}}else{cb=bi._g.doc.createElementNS("http://www.w3.org/2000/svg",cb);cb.style&&(cb.style.webkitTapHighlightColor="rgba(0,0,0,0)")}return cb},b=function(ci,cm){var ck="linear",S=ci.id+cm,cg=0.5,ce=0.5,cc=ci.node,E=ci.paper,co=cc.style,cb=bi._g.doc.getElementById(S);if(!cb){cm=b9(cm).replace(bi._radial_gradient,function(cr,cp,cs){ck="radial";if(cp&&cs){cg=bV(cp);ce=bV(cs);var cq=((ce>0.5)*2-1);bQ(cg-0.5,2)+bQ(ce-0.5,2)>0.25&&(ce=bO.sqrt(0.25-bQ(cg-0.5,2))*cq+0.5)&&ce!=0.5&&(ce=ce.toFixed(5)-0.00001*cq)}return bZ});cm=cm.split(/\s*\-\s*/);if(ck=="linear"){var cf=cm.shift();cf=-bV(cf);if(isNaN(cf)){return null}var cd=[0,0,bO.cos(bi.rad(cf)),bO.sin(bi.rad(cf))],cl=1/(ca(b0(cd[2]),b0(cd[3]))||1);cd[2]*=cl;cd[3]*=cl;if(cd[2]<0){cd[0]=-cd[2];cd[2]=0}if(cd[3]<0){cd[1]=-cd[3];cd[3]=0}}var cj=bi._parseDots(cm);if(!cj){return null}S=S.replace(/[\(\)\s,\xb0#]/g,"_");if(ci.gradient&&S!=ci.gradient.id){E.defs.removeChild(ci.gradient);delete ci.gradient}if(!ci.gradient){cb=bR(ck+"Gradient",{id:S});ci.gradient=cb;bR(cb,ck=="radial"?{fx:cg,fy:ce}:{x1:cd[0],y1:cd[1],x2:cd[2],y2:cd[3],gradientTransform:ci.matrix.invert()});E.defs.appendChild(cb);for(var ch=0,cn=cj.length;ch<cn;ch++){cb.appendChild(bR("stop",{offset:cj[ch].offset?cj[ch].offset:ch?"100%":"0%","stop-color":cj[ch].color||"#fff"}))}}}bR(cc,{fill:"url(#"+S+")",opacity:1,"fill-opacity":1});co.fill=bZ;co.opacity=1;co.fillOpacity=1;return 1},d=function(S){var E=S.getBBox(1);bR(S.pattern,{patternTransform:S.matrix.invert()+" translate("+E.x+","+E.y+")"})},g=function(ck,cm,cf){if(ck.type=="path"){var E=b9(cm).toLowerCase().split("-"),cj=ck.paper,cx=cf?"end":"start",co=ck.node,cl=ck.attrs,ce=cl["stroke-width"],cs=E.length,cc="classic",cr,cb,ch,cp,cn,cg=3,ct=3,ci=5;while(cs--){switch(E[cs]){case"block":case"classic":case"oval":case"diamond":case"open":case"none":cc=E[cs];break;case"wide":ct=5;break;case"narrow":ct=2;break;case"long":cg=5;break;case"short":cg=2;break}}if(cc=="open"){cg+=2;ct+=2;ci+=2;ch=1;cp=cf?4:1;cn={fill:"none",stroke:cl.stroke}}else{cp=ch=cg/2;cn={fill:cl.stroke,stroke:"none"}}if(ck._.arrows){if(cf){ck._.arrows.endPath&&b2[ck._.arrows.endPath]--;ck._.arrows.endMarker&&b2[ck._.arrows.endMarker]--}else{ck._.arrows.startPath&&b2[ck._.arrows.startPath]--;ck._.arrows.startMarker&&b2[ck._.arrows.startMarker]--}}else{ck._.arrows={}}if(cc!="none"){var S="raphael-marker-"+cc,cw="raphael-marker-"+cx+cc+cg+ct;
if(!bi._g.doc.getElementById(S)){cj.defs.appendChild(bR(bR("path"),{"stroke-linecap":"round",d:b6[cc],id:S}));b2[S]=1}else{b2[S]++}var cd=bi._g.doc.getElementById(cw),cq;if(!cd){cd=bR(bR("marker"),{id:cw,markerHeight:ct,markerWidth:cg,orient:"auto",refX:cp,refY:ct/2});cq=bR(bR("use"),{"xlink:href":"#"+S,transform:(cf?"rotate(180 "+cg/2+" "+ct/2+") ":bZ)+"scale("+cg/ci+","+ct/ci+")","stroke-width":(1/((cg/ci+ct/ci)/2)).toFixed(4)});cd.appendChild(cq);cj.defs.appendChild(cd);b2[cw]=1}else{b2[cw]++;cq=cd.getElementsByTagName("use")[0]}bR(cq,cn);var cv=ch*(cc!="diamond"&&cc!="oval");if(cf){cr=ck._.arrows.startdx*ce||0;cb=bi.getTotalLength(cl.path)-cv*ce}else{cr=cv*ce;cb=bi.getTotalLength(cl.path)-(ck._.arrows.enddx*ce||0)}cn={};cn["marker-"+cx]="url(#"+cw+")";if(cb||cr){cn.d=bi.getSubpath(cl.path,cr,cb)}bR(co,cn);ck._.arrows[cx+"Path"]=S;ck._.arrows[cx+"Marker"]=cw;ck._.arrows[cx+"dx"]=cv;ck._.arrows[cx+"Type"]=cc;ck._.arrows[cx+"String"]=cm}else{if(cf){cr=ck._.arrows.startdx*ce||0;cb=bi.getTotalLength(cl.path)-cr}else{cr=0;cb=bi.getTotalLength(cl.path)-(ck._.arrows.enddx*ce||0)}ck._.arrows[cx+"Path"]&&bR(co,{d:bi.getSubpath(cl.path,cr,cb)});delete ck._.arrows[cx+"Path"];delete ck._.arrows[cx+"Marker"];delete ck._.arrows[cx+"dx"];delete ck._.arrows[cx+"Type"];delete ck._.arrows[cx+"String"]}for(cn in b2){if(b2[i](cn)&&!b2[cn]){var cu=bi._g.doc.getElementById(cn);cu&&cu.parentNode.removeChild(cu)}}}},b3={"":[0],none:[0],"-":[3,1],".":[1,1],"-.":[3,1,1,1],"-..":[3,1,1,1,1,1],". ":[1,3],"- ":[4,3],"--":[8,3],"- .":[4,3,1,3],"--.":[8,3,1,3],"--..":[8,3,1,3,1,3]},bT=function(cf,cd,ce){cd=b3[b9(cd).toLowerCase()];if(cd){var cb=cf.attrs["stroke-width"]||"1",E={round:cb,square:cb,butt:0}[cf.attrs["stroke-linecap"]||ce["stroke-linecap"]]||0,cc=[],S=cd.length;while(S--){cc[S]=cd[S]*cb+((S%2)?1:-1)*E}bR(cf.node,{"stroke-dasharray":cc.join(",")})}},b4=function(ck,cs){var co=ck.node,cl=ck.attrs,ci=co.style.visibility;co.style.visibility="hidden";for(var cn in cs){if(cs[i](cn)){if(!bi._availableAttrs[i](cn)){continue}var cm=cs[cn];cl[cn]=cm;switch(cn){case"blur":ck.blur(cm);break;case"href":case"title":var cd=bR("title");var ct=bi._g.doc.createTextNode(cm);cd.appendChild(ct);co.appendChild(cd);break;case"target":var cq=co.parentNode;if(cq.tagName.toLowerCase()!="a"){var cd=bR("a");cq.insertBefore(cd,co);cd.appendChild(co);cq=cd}if(cn=="target"){cq.setAttributeNS(bW,"show",cm=="blank"?"new":cm)}else{cq.setAttributeNS(bW,cn,cm)}break;case"cursor":co.style.cursor=cm;break;case"transform":ck.transform(cm);break;case"arrow-start":g(ck,cm);break;case"arrow-end":g(ck,cm,1);break;case"clip-rect":var S=b9(cm).split(bP);if(S.length==4){ck.clip&&ck.clip.parentNode.parentNode.removeChild(ck.clip.parentNode);var cb=bR("clipPath"),cp=bR("rect");cb.id=bi.createUUID();bR(cp,{x:S[0],y:S[1],width:S[2],height:S[3]});cb.appendChild(cp);ck.paper.defs.appendChild(cb);bR(co,{"clip-path":"url(#"+cb.id+")"});ck.clip=cp}if(!cm){var cj=co.getAttribute("clip-path");if(cj){var cr=bi._g.doc.getElementById(cj.replace(/(^url\(#|\)$)/g,bZ));cr&&cr.parentNode.removeChild(cr);bR(co,{"clip-path":bZ});delete ck.clip}}break;case"path":if(ck.type=="path"){bR(co,{d:cm?cl.path=bi._pathToAbsolute(cm):"M0,0"});ck._.dirty=1;if(ck._.arrows){"startString" in ck._.arrows&&g(ck,ck._.arrows.startString);"endString" in ck._.arrows&&g(ck,ck._.arrows.endString,1)}}break;case"width":co.setAttribute(cn,cm);ck._.dirty=1;if(cl.fx){cn="x";cm=cl.x}else{break}case"x":if(cl.fx){cm=-cl.x-(cl.width||0)}case"rx":if(cn=="rx"&&ck.type=="rect"){break}case"cx":co.setAttribute(cn,cm);ck.pattern&&d(ck);ck._.dirty=1;break;case"height":co.setAttribute(cn,cm);ck._.dirty=1;if(cl.fy){cn="y";cm=cl.y}else{break}case"y":if(cl.fy){cm=-cl.y-(cl.height||0)}case"ry":if(cn=="ry"&&ck.type=="rect"){break}case"cy":co.setAttribute(cn,cm);ck.pattern&&d(ck);ck._.dirty=1;break;case"r":if(ck.type=="rect"){bR(co,{rx:cm,ry:cm})}else{co.setAttribute(cn,cm)}ck._.dirty=1;break;case"src":if(ck.type=="image"){co.setAttributeNS(bW,"href",cm)}break;case"stroke-width":if(ck._.sx!=1||ck._.sy!=1){cm/=ca(b0(ck._.sx),b0(ck._.sy))||1}if(ck.paper._vbSize){cm*=ck.paper._vbSize}co.setAttribute(cn,cm);if(cl["stroke-dasharray"]){bT(ck,cl["stroke-dasharray"],cs)}if(ck._.arrows){"startString" in ck._.arrows&&g(ck,ck._.arrows.startString);"endString" in ck._.arrows&&g(ck,ck._.arrows.endString,1)}break;case"stroke-dasharray":bT(ck,cm,cs);break;case"fill":var ce=b9(cm).match(bi._ISURL);if(ce){cb=bR("pattern");var ch=bR("image");cb.id=bi.createUUID();bR(cb,{x:0,y:0,patternUnits:"userSpaceOnUse",height:1,width:1});bR(ch,{x:0,y:0,"xlink:href":ce[1]});cb.appendChild(ch);(function(cu){bi._preload(ce[1],function(){var cv=this.offsetWidth,cw=this.offsetHeight;bR(cu,{width:cv,height:cw});bR(ch,{width:cv,height:cw});ck.paper.safari()})})(cb);ck.paper.defs.appendChild(cb);bR(co,{fill:"url(#"+cb.id+")"});ck.pattern=cb;ck.pattern&&d(ck);break}var cc=bi.getRGB(cm);if(!cc.error){delete cs.gradient;delete cl.gradient;!bi.is(cl.opacity,"undefined")&&bi.is(cs.opacity,"undefined")&&bR(co,{opacity:cl.opacity});!bi.is(cl["fill-opacity"],"undefined")&&bi.is(cs["fill-opacity"],"undefined")&&bR(co,{"fill-opacity":cl["fill-opacity"]})}else{if((ck.type=="circle"||ck.type=="ellipse"||b9(cm).charAt()!="r")&&b(ck,cm)){if("opacity" in cl||"fill-opacity" in cl){var E=bi._g.doc.getElementById(co.getAttribute("fill").replace(/^url\(#|\)$/g,bZ));if(E){var cf=E.getElementsByTagName("stop");bR(cf[cf.length-1],{"stop-opacity":("opacity" in cl?cl.opacity:1)*("fill-opacity" in cl?cl["fill-opacity"]:1)})}}cl.gradient=cm;cl.fill="none";break}}cc[i]("opacity")&&bR(co,{"fill-opacity":cc.opacity>1?cc.opacity/100:cc.opacity});case"stroke":cc=bi.getRGB(cm);co.setAttribute(cn,cc.hex);cn=="stroke"&&cc[i]("opacity")&&bR(co,{"stroke-opacity":cc.opacity>1?cc.opacity/100:cc.opacity});if(cn=="stroke"&&ck._.arrows){"startString" in ck._.arrows&&g(ck,ck._.arrows.startString);"endString" in ck._.arrows&&g(ck,ck._.arrows.endString,1)}break;case"gradient":(ck.type=="circle"||ck.type=="ellipse"||b9(cm).charAt()!="r")&&b(ck,cm);break;case"opacity":if(cl.gradient&&!cl[i]("stroke-opacity")){bR(co,{"stroke-opacity":cm>1?cm/100:cm})}case"fill-opacity":if(cl.gradient){E=bi._g.doc.getElementById(co.getAttribute("fill").replace(/^url\(#|\)$/g,bZ));if(E){cf=E.getElementsByTagName("stop");bR(cf[cf.length-1],{"stop-opacity":cm})}break}default:cn=="font-size"&&(cm=bY(cm,10)+"px");var cg=cn.replace(/(\-.)/g,function(cu){return cu.substring(1).toUpperCase()});co.style[cg]=cm;ck._.dirty=1;co.setAttribute(cn,cm);break}}}bX(ck,cs);co.style.visibility=ci},b8=1.2,bX=function(E,cd){if(E.type!="text"||!(cd[i]("text")||cd[i]("font")||cd[i]("font-size")||cd[i]("x")||cd[i]("y"))){return}var ci=E.attrs,cb=E.node,ck=cb.firstChild?bY(bi._g.doc.defaultView.getComputedStyle(cb.firstChild,bZ).getPropertyValue("font-size"),10):10;if(cd[i]("text")){ci.text=cd.text;while(cb.firstChild){cb.removeChild(cb.firstChild)}var cc=b9(cd.text).split("\n"),S=[],cg;for(var ce=0,cj=cc.length;ce<cj;ce++){cg=bR("tspan");
ce&&bR(cg,{dy:ck*b8,x:ci.x});cg.appendChild(bi._g.doc.createTextNode(cc[ce]));cb.appendChild(cg);S[ce]=cg}}else{S=cb.getElementsByTagName("tspan");for(ce=0,cj=S.length;ce<cj;ce++){if(ce){bR(S[ce],{dy:ck*b8,x:ci.x})}else{bR(S[0],{dy:0})}}}bR(cb,{x:ci.x,y:ci.y});E._.dirty=1;var cf=E._getBBox(),ch=ci.y-(cf.y+cf.height/2);ch&&bi.is(ch,"finite")&&bR(S[0],{dy:ch})},b1=function(S,E){var cc=0,cb=0;this[0]=this.node=S;S.raphael=true;this.id=bi._oid++;S.raphaelid=this.id;this.matrix=bi.matrix();this.realPath=null;this.paper=E;this.attrs=this.attrs||{};this._={transform:[],sx:1,sy:1,deg:0,dx:0,dy:0,dirty:1};!E.bottom&&(E.bottom=this);this.prev=E.top;E.top&&(E.top.next=this);E.top=this;this.next=null},bU=bi.el;b1.prototype=bU;bU.constructor=b1;bi._engine.path=function(E,cc){var S=bR("path");cc.canvas&&cc.canvas.appendChild(S);var cb=new b1(S,cc);cb.type="path";b4(cb,{fill:"none",stroke:"#000",path:E});return cb};bU.rotate=function(S,E,cc){if(this.removed){return this}S=b9(S).split(bP);if(S.length-1){E=bV(S[1]);cc=bV(S[2])}S=bV(S[0]);(cc==null)&&(E=cc);if(E==null||cc==null){var cb=this.getBBox(1);E=cb.x+cb.width/2;cc=cb.y+cb.height/2}this.transform(this._.transform.concat([["r",S,E,cc]]));return this};bU.scale=function(cd,cb,E,cc){if(this.removed){return this}cd=b9(cd).split(bP);if(cd.length-1){cb=bV(cd[1]);E=bV(cd[2]);cc=bV(cd[3])}cd=bV(cd[0]);(cb==null)&&(cb=cd);(cc==null)&&(E=cc);if(E==null||cc==null){var S=this.getBBox(1)}E=E==null?S.x+S.width/2:E;cc=cc==null?S.y+S.height/2:cc;this.transform(this._.transform.concat([["s",cd,cb,E,cc]]));return this};bU.translate=function(S,E){if(this.removed){return this}S=b9(S).split(bP);if(S.length-1){E=bV(S[1])}S=bV(S[0])||0;E=+E||0;this.transform(this._.transform.concat([["t",S,E]]));return this};bU.transform=function(S){var cb=this._;if(S==null){return cb.transform}bi._extractTransform(this,S);this.clip&&bR(this.clip,{transform:this.matrix.invert()});this.pattern&&d(this);this.node&&bR(this.node,{transform:this.matrix});if(cb.sx!=1||cb.sy!=1){var E=this.attrs[i]("stroke-width")?this.attrs["stroke-width"]:1;this.attr({"stroke-width":E})}return this};bU.hide=function(){!this.removed&&this.paper.safari(this.node.style.display="none");return this};bU.show=function(){!this.removed&&this.paper.safari(this.node.style.display="");return this};bU.remove=function(){if(this.removed||!this.node.parentNode){return}var S=this.paper;S.__set__&&S.__set__.exclude(this);b7.unbind("raphael.*.*."+this.id);if(this.gradient){S.defs.removeChild(this.gradient)}bi._tear(this,S);if(this.node.parentNode.tagName.toLowerCase()=="a"){this.node.parentNode.parentNode.removeChild(this.node.parentNode)}else{this.node.parentNode.removeChild(this.node)}for(var E in this){this[E]=typeof this[E]=="function"?bi._removedFactory(E):null}this.removed=true};bU._getBBox=function(){if(this.node.style.display=="none"){this.show();var E=true}var cb={};try{cb=this.node.getBBox()}catch(S){}finally{cb=cb||{}}E&&this.hide();return cb};bU.attr=function(E,ci){if(this.removed){return this}if(E==null){var cf={};for(var ch in this.attrs){if(this.attrs[i](ch)){cf[ch]=this.attrs[ch]}}cf.gradient&&cf.fill=="none"&&(cf.fill=cf.gradient)&&delete cf.gradient;cf.transform=this._.transform;return cf}if(ci==null&&bi.is(E,"string")){if(E=="fill"&&this.attrs.fill=="none"&&this.attrs.gradient){return this.attrs.gradient}if(E=="transform"){return this._.transform}var cg=E.split(bP),cc={};for(var cd=0,ck=cg.length;cd<ck;cd++){E=cg[cd];if(E in this.attrs){cc[E]=this.attrs[E]}else{if(bi.is(this.paper.customAttributes[E],"function")){cc[E]=this.paper.customAttributes[E].def}else{cc[E]=bi._availableAttrs[E]}}}return ck-1?cc:cc[cg[0]]}if(ci==null&&bi.is(E,"array")){cc={};for(cd=0,ck=E.length;cd<ck;cd++){cc[E[cd]]=this.attr(E[cd])}return cc}if(ci!=null){var S={};S[E]=ci}else{if(E!=null&&bi.is(E,"object")){S=E}}for(var cj in S){b7("raphael.attr."+cj+"."+this.id,this,S[cj])}for(cj in this.paper.customAttributes){if(this.paper.customAttributes[i](cj)&&S[i](cj)&&bi.is(this.paper.customAttributes[cj],"function")){var ce=this.paper.customAttributes[cj].apply(this,[].concat(S[cj]));this.attrs[cj]=S[cj];for(var cb in ce){if(ce[i](cb)){S[cb]=ce[cb]}}}}b4(this,S);return this};bU.toFront=function(){if(this.removed){return this}if(this.node.parentNode.tagName.toLowerCase()=="a"){this.node.parentNode.parentNode.appendChild(this.node.parentNode)}else{this.node.parentNode.appendChild(this.node)}var E=this.paper;E.top!=this&&bi._tofront(this,E);return this};bU.toBack=function(){if(this.removed){return this}var S=this.node.parentNode;if(S.tagName.toLowerCase()=="a"){S.parentNode.insertBefore(this.node.parentNode,this.node.parentNode.parentNode.firstChild)}else{if(S.firstChild!=this.node){S.insertBefore(this.node,this.node.parentNode.firstChild)}}bi._toback(this,this.paper);var E=this.paper;return this};bU.insertAfter=function(E){if(this.removed){return this}var S=E.node||E[E.length-1].node;if(S.nextSibling){S.parentNode.insertBefore(this.node,S.nextSibling)}else{S.parentNode.appendChild(this.node)}bi._insertafter(this,E,this.paper);return this};bU.insertBefore=function(E){if(this.removed){return this}var S=E.node||E[0].node;S.parentNode.insertBefore(this.node,S);bi._insertbefore(this,E,this.paper);return this};bU.blur=function(S){var E=this;if(+S!==0){var cb=bR("filter"),cc=bR("feGaussianBlur");E.attrs.blur=S;cb.id=bi.createUUID();bR(cc,{stdDeviation:+S||1.5});cb.appendChild(cc);E.paper.defs.appendChild(cb);E._blur=cb;bR(E.node,{filter:"url(#"+cb.id+")"})}else{if(E._blur){E._blur.parentNode.removeChild(E._blur);delete E._blur;delete E.attrs.blur}E.node.removeAttribute("filter")}return E};bi._engine.circle=function(S,E,ce,cd){var cc=bR("circle");S.canvas&&S.canvas.appendChild(cc);var cb=new b1(cc,S);cb.attrs={cx:E,cy:ce,r:cd,fill:"none",stroke:"#000"};cb.type="circle";bR(cc,cb.attrs);return cb};bi._engine.rect=function(cb,E,cg,S,ce,cf){var cd=bR("rect");cb.canvas&&cb.canvas.appendChild(cd);var cc=new b1(cd,cb);cc.attrs={x:E,y:cg,width:S,height:ce,r:cf||0,rx:cf||0,ry:cf||0,fill:"none",stroke:"#000"};cc.type="rect";bR(cd,cc.attrs);return cc};bi._engine.ellipse=function(S,E,cf,ce,cd){var cc=bR("ellipse");S.canvas&&S.canvas.appendChild(cc);var cb=new b1(cc,S);cb.attrs={cx:E,cy:cf,rx:ce,ry:cd,fill:"none",stroke:"#000"};cb.type="ellipse";bR(cc,cb.attrs);return cb};bi._engine.image=function(cb,cf,E,cg,S,ce){var cd=bR("image");bR(cd,{x:E,y:cg,width:S,height:ce,preserveAspectRatio:"none"});cd.setAttributeNS(bW,"href",cf);cb.canvas&&cb.canvas.appendChild(cd);var cc=new b1(cd,cb);cc.attrs={x:E,y:cg,width:S,height:ce,src:cf};cc.type="image";return cc};bi._engine.text=function(S,E,ce,cd){var cc=bR("text");S.canvas&&S.canvas.appendChild(cc);var cb=new b1(cc,S);cb.attrs={x:E,y:ce,"text-anchor":"middle",text:cd,font:bi._availableAttrs.font,stroke:"none",fill:"#000"};cb.type="text";b4(cb,cb.attrs);return cb};bi._engine.setSize=function(S,E){this.width=S||this.width;this.height=E||this.height;this.canvas.setAttribute("width",this.width);this.canvas.setAttribute("height",this.height);
if(this._viewBox){this.setViewBox.apply(this,this._viewBox)}return this};bi._engine.create=function(){var cc=bi._getContainer.apply(0,arguments),S=cc&&cc.container,cg=cc.x,cf=cc.y,cb=cc.width,ch=cc.height;if(!S){throw new Error("SVG container not found.")}var E=bR("svg"),ce="overflow:hidden;",cd;cg=cg||0;cf=cf||0;cb=cb||512;ch=ch||342;bR(E,{height:ch,version:1.1,width:cb,xmlns:"http://www.w3.org/2000/svg"});if(S==1){E.style.cssText=ce+"position:absolute;left:"+cg+"px;top:"+cf+"px";bi._g.doc.body.appendChild(E);cd=1}else{E.style.cssText=ce+"position:relative";if(S.firstChild){S.insertBefore(E,S.firstChild)}else{S.appendChild(E)}}S=new bi._Paper;S.width=cb;S.height=ch;S.canvas=E;S.clear();S._left=S._top=0;cd&&(S.renderfix=function(){});S.renderfix();return S};bi._engine.setViewBox=function(ce,cc,cg,E,S){b7("raphael.setViewBox",this,this._viewBox,[ce,cc,cg,E,S]);var ci=ca(cg/this.width,E/this.height),cd=this.top,ch=S?"meet":"xMinYMin",cb,cf;if(ce==null){if(this._vbSize){ci=1}delete this._vbSize;cb="0 0 "+this.width+bS+this.height}else{this._vbSize=ci;cb=ce+bS+cc+bS+cg+bS+E}bR(this.canvas,{viewBox:cb,preserveAspectRatio:ch});while(ci&&cd){cf="stroke-width" in cd.attrs?cd.attrs["stroke-width"]:1;cd.attr({"stroke-width":cf});cd._.dirty=1;cd._.dirtyT=1;cd=cd.prev}this._viewBox=[ce,cc,cg,E,!!S];return this};bi.prototype.renderfix=function(){var ce=this.canvas,E=ce.style,cd;try{cd=ce.getScreenCTM()||ce.createSVGMatrix()}catch(cc){cd=ce.createSVGMatrix()}var cb=-cd.e%1,S=-cd.f%1;if(cb||S){if(cb){this._left=(this._left+cb)%1;E.left=this._left+"px"}if(S){this._top=(this._top+S)%1;E.top=this._top+"px"}}};bi.prototype.clear=function(){bi.eve("raphael.clear",this);var E=this.canvas;while(E.firstChild){E.removeChild(E.firstChild)}this.bottom=this.top=null;(this.desc=bR("desc")).appendChild(bi._g.doc.createTextNode("Created with Rapha\xebl "+bi.version));E.appendChild(this.desc);E.appendChild(this.defs=bR("defs"))};bi.prototype.remove=function(){b7("raphael.remove",this);this.canvas.parentNode&&this.canvas.parentNode.removeChild(this.canvas);for(var E in this){this[E]=typeof this[E]=="function"?bi._removedFactory(E):null}};var b5=bi.st;for(var R in bU){if(bU[i](R)&&!b5[i](R)){b5[R]=(function(E){return function(){var S=arguments;return this.forEach(function(cb){cb[E].apply(cb,S)})}})(R)}}})();(function(){if(!bi.vml){return}var R="hasOwnProperty",cc=String,bV=parseFloat,bQ=Math,b9=bQ.round,cf=bQ.max,ca=bQ.min,b0=bQ.abs,b3="fill",bR=/[, ]+/,b8=bi.eve,b4=" progid:DXImageTransform.Microsoft",bT=" ",bY="",cb={M:"m",L:"l",C:"c",Z:"x",m:"t",l:"r",c:"v",z:"x"},bS=/([clmz]),?([^clmz]*)/gi,b1=/ progid:\S+Blur\([^\)]+\)/g,ce=/-?[^,\s-]+/g,i="position:absolute;left:0;top:0;width:1px;height:1px",d=21600,b7={path:1,rect:1,image:1},bZ={circle:1,ellipse:1},bO=function(co){var cl=/[ahqstv]/ig,cg=bi._pathToAbsolute;cc(co).match(cl)&&(cg=bi._path2curve);cl=/[clmz]/g;if(cg==bi._pathToAbsolute&&!cc(co).match(cl)){var ck=cc(co).replace(bS,function(cs,cu,cq){var ct=[],cp=cu.toLowerCase()=="m",cr=cb[cu];cq.replace(ce,function(cv){if(cp&&ct.length==2){cr+=ct+cb[cu=="m"?"l":"L"];ct=[]}ct.push(b9(cv*d))});return cr+ct});return ck}var cm=cg(co),S,E;ck=[];for(var ci=0,cn=cm.length;ci<cn;ci++){S=cm[ci];E=cm[ci][0].toLowerCase();E=="z"&&(E="x");for(var ch=1,cj=S.length;ch<cj;ch++){E+=b9(S[ch]*d)+(ch!=cj-1?",":bY)}ck.push(E)}return ck.join(bT)},bW=function(ch,cg,S){var E=bi.matrix();E.rotate(-ch,0.5,0.5);return{dx:E.x(cg,S),dy:E.y(cg,S)}},bX=function(cn,cm,cl,ci,ch,cj){var cv=cn._,cp=cn.matrix,E=cv.fillpos,co=cn.node,ck=co.style,cg=1,S="",cr,ct=d/cm,cs=d/cl;ck.visibility="hidden";if(!cm||!cl){return}co.coordsize=b0(ct)+bT+b0(cs);ck.rotation=cj*(cm*cl<0?-1:1);if(cj){var cu=bW(cj,ci,ch);ci=cu.dx;ch=cu.dy}cm<0&&(S+="x");cl<0&&(S+=" y")&&(cg=-1);ck.flip=S;co.coordorigin=(ci*-ct)+bT+(ch*-cs);if(E||cv.fillsize){var cq=co.getElementsByTagName(b3);cq=cq&&cq[0];co.removeChild(cq);if(E){cu=bW(cj,cp.x(E[0],E[1]),cp.y(E[0],E[1]));cq.position=cu.dx*cg+bT+cu.dy*cg}if(cv.fillsize){cq.size=cv.fillsize[0]*b0(cm)+bT+cv.fillsize[1]*b0(cl)}co.appendChild(cq)}ck.visibility="visible"};bi.toString=function(){return"Your browser doesn\u2019t support SVG. Falling down to VML.\nYou are running Rapha\xebl "+this.version};var g=function(E,ck,S){var cm=cc(ck).toLowerCase().split("-"),ci=S?"end":"start",cg=cm.length,cj="classic",cl="medium",ch="medium";while(cg--){switch(cm[cg]){case"block":case"classic":case"oval":case"diamond":case"open":case"none":cj=cm[cg];break;case"wide":case"narrow":ch=cm[cg];break;case"long":case"short":cl=cm[cg];break}}var cn=E.node.getElementsByTagName("stroke")[0];cn[ci+"arrow"]=cj;cn[ci+"arrowlength"]=cl;cn[ci+"arrowwidth"]=ch},b5=function(cv,cH){cv.attrs=cv.attrs||{};var cC=cv.node,cL=cv.attrs,cr=cC.style,cn,cF=b7[cv.type]&&(cH.x!=cL.x||cH.y!=cL.y||cH.width!=cL.width||cH.height!=cL.height||cH.cx!=cL.cx||cH.cy!=cL.cy||cH.rx!=cL.rx||cH.ry!=cL.ry||cH.r!=cL.r),cu=bZ[cv.type]&&(cL.cx!=cH.cx||cL.cy!=cH.cy||cL.r!=cH.r||cL.rx!=cH.rx||cL.ry!=cH.ry),cO=cv;for(var cs in cH){if(cH[R](cs)){cL[cs]=cH[cs]}}if(cF){cL.path=bi._getPath[cv.type](cv);cv._.dirty=1}cH.href&&(cC.href=cH.href);cH.title&&(cC.title=cH.title);cH.target&&(cC.target=cH.target);cH.cursor&&(cr.cursor=cH.cursor);"blur" in cH&&cv.blur(cH.blur);if(cH.path&&cv.type=="path"||cF){cC.path=bO(~cc(cL.path).toLowerCase().indexOf("r")?bi._pathToAbsolute(cL.path):cL.path);if(cv.type=="image"){cv._.fillpos=[cL.x,cL.y];cv._.fillsize=[cL.width,cL.height];bX(cv,1,1,0,0,0)}}"transform" in cH&&cv.transform(cH.transform);if(cu){var ci=+cL.cx,cg=+cL.cy,cm=+cL.rx||+cL.r||0,cl=+cL.ry||+cL.r||0;cC.path=bi.format("ar{0},{1},{2},{3},{4},{1},{4},{1}x",b9((ci-cm)*d),b9((cg-cl)*d),b9((ci+cm)*d),b9((cg+cl)*d),b9(ci*d));cv._.dirty=1}if("clip-rect" in cH){var S=cc(cH["clip-rect"]).split(bR);if(S.length==4){S[2]=+S[2]+(+S[0]);S[3]=+S[3]+(+S[1]);var ct=cC.clipRect||bi._g.doc.createElement("div"),cN=ct.style;cN.clip=bi.format("rect({1}px {2}px {3}px {0}px)",S);if(!cC.clipRect){cN.position="absolute";cN.top=0;cN.left=0;cN.width=cv.paper.width+"px";cN.height=cv.paper.height+"px";cC.parentNode.insertBefore(ct,cC);ct.appendChild(cC);cC.clipRect=ct}}if(!cH["clip-rect"]){cC.clipRect&&(cC.clipRect.style.clip="auto")}}if(cv.textpath){var cJ=cv.textpath.style;cH.font&&(cJ.font=cH.font);cH["font-family"]&&(cJ.fontFamily='"'+cH["font-family"].split(",")[0].replace(/^['"]+|['"]+$/g,bY)+'"');cH["font-size"]&&(cJ.fontSize=cH["font-size"]);cH["font-weight"]&&(cJ.fontWeight=cH["font-weight"]);cH["font-style"]&&(cJ.fontStyle=cH["font-style"])}if("arrow-start" in cH){g(cO,cH["arrow-start"])}if("arrow-end" in cH){g(cO,cH["arrow-end"],1)}if(cH.opacity!=null||cH["stroke-width"]!=null||cH.fill!=null||cH.src!=null||cH.stroke!=null||cH["stroke-width"]!=null||cH["stroke-opacity"]!=null||cH["fill-opacity"]!=null||cH["stroke-dasharray"]!=null||cH["stroke-miterlimit"]!=null||cH["stroke-linejoin"]!=null||cH["stroke-linecap"]!=null){var cD=cC.getElementsByTagName(b3),cK=false;cD=cD&&cD[0];!cD&&(cK=cD=cd(b3));if(cv.type=="image"&&cH.src){cD.src=cH.src
}cH.fill&&(cD.on=true);if(cD.on==null||cH.fill=="none"||cH.fill===null){cD.on=false}if(cD.on&&cH.fill){var ck=cc(cH.fill).match(bi._ISURL);if(ck){cD.parentNode==cC&&cC.removeChild(cD);cD.rotate=true;cD.src=ck[1];cD.type="tile";var E=cv.getBBox(1);cD.position=E.x+bT+E.y;cv._.fillpos=[E.x,E.y];bi._preload(ck[1],function(){cv._.fillsize=[this.offsetWidth,this.offsetHeight]})}else{cD.color=bi.getRGB(cH.fill).hex;cD.src=bY;cD.type="solid";if(bi.getRGB(cH.fill).error&&(cO.type in {circle:1,ellipse:1}||cc(cH.fill).charAt()!="r")&&b(cO,cH.fill,cD)){cL.fill="none";cL.gradient=cH.fill;cD.rotate=false}}}if("fill-opacity" in cH||"opacity" in cH){var cj=((+cL["fill-opacity"]+1||2)-1)*((+cL.opacity+1||2)-1)*((+bi.getRGB(cH.fill).o+1||2)-1);cj=ca(cf(cj,0),1);cD.opacity=cj;if(cD.src){cD.color="none"}}cC.appendChild(cD);var co=(cC.getElementsByTagName("stroke")&&cC.getElementsByTagName("stroke")[0]),cM=false;!co&&(cM=co=cd("stroke"));if((cH.stroke&&cH.stroke!="none")||cH["stroke-width"]||cH["stroke-opacity"]!=null||cH["stroke-dasharray"]||cH["stroke-miterlimit"]||cH["stroke-linejoin"]||cH["stroke-linecap"]){co.on=true}(cH.stroke=="none"||cH.stroke===null||co.on==null||cH.stroke==0||cH["stroke-width"]==0)&&(co.on=false);var cB=bi.getRGB(cH.stroke);co.on&&cH.stroke&&(co.color=cB.hex);cj=((+cL["stroke-opacity"]+1||2)-1)*((+cL.opacity+1||2)-1)*((+cB.o+1||2)-1);var cw=(bV(cH["stroke-width"])||1)*0.75;cj=ca(cf(cj,0),1);cH["stroke-width"]==null&&(cw=cL["stroke-width"]);cH["stroke-width"]&&(co.weight=cw);cw&&cw<1&&(cj*=cw)&&(co.weight=1);co.opacity=cj;cH["stroke-linejoin"]&&(co.joinstyle=cH["stroke-linejoin"]||"miter");co.miterlimit=cH["stroke-miterlimit"]||8;cH["stroke-linecap"]&&(co.endcap=cH["stroke-linecap"]=="butt"?"flat":cH["stroke-linecap"]=="square"?"square":"round");if(cH["stroke-dasharray"]){var cA={"-":"shortdash",".":"shortdot","-.":"shortdashdot","-..":"shortdashdotdot",". ":"dot","- ":"dash","--":"longdash","- .":"dashdot","--.":"longdashdot","--..":"longdashdotdot"};co.dashstyle=cA[R](cH["stroke-dasharray"])?cA[cH["stroke-dasharray"]]:bY}cM&&cC.appendChild(co)}if(cO.type=="text"){cO.paper.canvas.style.display=bY;var cE=cO.paper.span,cz=100,ch=cL.font&&cL.font.match(/\d+(?:\.\d*)?(?=px)/);cr=cE.style;cL.font&&(cr.font=cL.font);cL["font-family"]&&(cr.fontFamily=cL["font-family"]);cL["font-weight"]&&(cr.fontWeight=cL["font-weight"]);cL["font-style"]&&(cr.fontStyle=cL["font-style"]);ch=bV(cL["font-size"]||ch&&ch[0])||10;cr.fontSize=ch*cz+"px";cO.textpath.string&&(cE.innerHTML=cc(cO.textpath.string).replace(/</g,"&#60;").replace(/&/g,"&#38;").replace(/\n/g,"<br>"));var cq=cE.getBoundingClientRect();cO.W=cL.w=(cq.right-cq.left)/cz;cO.H=cL.h=(cq.bottom-cq.top)/cz;cO.X=cL.x;cO.Y=cL.y+cO.H/2;("x" in cH||"y" in cH)&&(cO.path.v=bi.format("m{0},{1}l{2},{1}",b9(cL.x*d),b9(cL.y*d),b9(cL.x*d)+1));var cp=["x","y","text","font","font-family","font-weight","font-style","font-size"];for(var cG=0,cI=cp.length;cG<cI;cG++){if(cp[cG] in cH){cO._.dirty=1;break}}switch(cL["text-anchor"]){case"start":cO.textpath.style["v-text-align"]="left";cO.bbx=cO.W/2;break;case"end":cO.textpath.style["v-text-align"]="right";cO.bbx=-cO.W/2;break;default:cO.textpath.style["v-text-align"]="center";cO.bbx=0;break}cO.textpath.style["v-text-kern"]=true}},b=function(E,cn,cq){E.attrs=E.attrs||{};var co=E.attrs,ch=Math.pow,ci,cj,cl="linear",cm=".5 .5";E.attrs.gradient=cn;cn=cc(cn).replace(bi._radial_gradient,function(ct,cu,cs){cl="radial";if(cu&&cs){cu=bV(cu);cs=bV(cs);ch(cu-0.5,2)+ch(cs-0.5,2)>0.25&&(cs=bQ.sqrt(0.25-ch(cu-0.5,2))*((cs>0.5)*2-1)+0.5);cm=cu+bT+cs}return bY});cn=cn.split(/\s*\-\s*/);if(cl=="linear"){var S=cn.shift();S=-bV(S);if(isNaN(S)){return null}}var ck=bi._parseDots(cn);if(!ck){return null}E=E.shape||E.node;if(ck.length){E.removeChild(cq);cq.on=true;cq.method="none";cq.color=ck[0].color;cq.color2=ck[ck.length-1].color;var cr=[];for(var cg=0,cp=ck.length;cg<cp;cg++){ck[cg].offset&&cr.push(ck[cg].offset+bT+ck[cg].color)}cq.colors=cr.length?cr.join():"0% "+cq.color;if(cl=="radial"){cq.type="gradientTitle";cq.focus="100%";cq.focussize="0 0";cq.focusposition=cm;cq.angle=0}else{cq.type="gradient";cq.angle=(270-S)%360}E.appendChild(cq)}return 1},b2=function(S,E){this[0]=this.node=S;S.raphael=true;this.id=bi._oid++;S.raphaelid=this.id;this.X=0;this.Y=0;this.attrs={};this.paper=E;this.matrix=bi.matrix();this._={transform:[],sx:1,sy:1,dx:0,dy:0,deg:0,dirty:1,dirtyT:1};!E.bottom&&(E.bottom=this);this.prev=E.top;E.top&&(E.top.next=this);E.top=this;this.next=null};var bU=bi.el;b2.prototype=bU;bU.constructor=b2;bU.transform=function(ci){if(ci==null){return this._.transform}var ck=this.paper._viewBoxShift,cj=ck?"s"+[ck.scale,ck.scale]+"-1-1t"+[ck.dx,ck.dy]:bY,cn;if(ck){cn=ci=cc(ci).replace(/\.{3}|\u2026/g,this._.transform||bY)}bi._extractTransform(this,cj+ci);var co=this.matrix.clone(),cq=this.skew,cg=this.node,cm,ch=~cc(this.attrs.fill).indexOf("-"),E=!cc(this.attrs.fill).indexOf("url(");co.translate(1,1);if(E||ch||this.type=="image"){cq.matrix="1 0 0 1";cq.offset="0 0";cm=co.split();if((ch&&cm.noRotation)||!cm.isSimple){cg.style.filter=co.toFilter();var cl=this.getBBox(),S=this.getBBox(1),cr=cl.x-S.x,cp=cl.y-S.y;cg.coordorigin=(cr*-d)+bT+(cp*-d);bX(this,1,1,cr,cp,0)}else{cg.style.filter=bY;bX(this,cm.scalex,cm.scaley,cm.dx,cm.dy,cm.rotate)}}else{cg.style.filter=bY;cq.matrix=cc(co);cq.offset=co.offset()}cn&&(this._.transform=cn);return this};bU.rotate=function(S,E,ch){if(this.removed){return this}if(S==null){return}S=cc(S).split(bR);if(S.length-1){E=bV(S[1]);ch=bV(S[2])}S=bV(S[0]);(ch==null)&&(E=ch);if(E==null||ch==null){var cg=this.getBBox(1);E=cg.x+cg.width/2;ch=cg.y+cg.height/2}this._.dirtyT=1;this.transform(this._.transform.concat([["r",S,E,ch]]));return this};bU.translate=function(S,E){if(this.removed){return this}S=cc(S).split(bR);if(S.length-1){E=bV(S[1])}S=bV(S[0])||0;E=+E||0;if(this._.bbox){this._.bbox.x+=S;this._.bbox.y+=E}this.transform(this._.transform.concat([["t",S,E]]));return this};bU.scale=function(ci,cg,E,ch){if(this.removed){return this}ci=cc(ci).split(bR);if(ci.length-1){cg=bV(ci[1]);E=bV(ci[2]);ch=bV(ci[3]);isNaN(E)&&(E=null);isNaN(ch)&&(ch=null)}ci=bV(ci[0]);(cg==null)&&(cg=ci);(ch==null)&&(E=ch);if(E==null||ch==null){var S=this.getBBox(1)}E=E==null?S.x+S.width/2:E;ch=ch==null?S.y+S.height/2:ch;this.transform(this._.transform.concat([["s",ci,cg,E,ch]]));this._.dirtyT=1;return this};bU.hide=function(){!this.removed&&(this.node.style.display="none");return this};bU.show=function(){!this.removed&&(this.node.style.display=bY);return this};bU._getBBox=function(){if(this.removed){return{}}return{x:this.X+(this.bbx||0)-this.W/2,y:this.Y-this.H,width:this.W,height:this.H}};bU.remove=function(){if(this.removed||!this.node.parentNode){return}this.paper.__set__&&this.paper.__set__.exclude(this);bi.eve.unbind("raphael.*.*."+this.id);bi._tear(this,this.paper);this.node.parentNode.removeChild(this.node);this.shape&&this.shape.parentNode.removeChild(this.shape);for(var E in this){this[E]=typeof this[E]=="function"?bi._removedFactory(E):null
}this.removed=true};bU.attr=function(E,cn){if(this.removed){return this}if(E==null){var ck={};for(var cm in this.attrs){if(this.attrs[R](cm)){ck[cm]=this.attrs[cm]}}ck.gradient&&ck.fill=="none"&&(ck.fill=ck.gradient)&&delete ck.gradient;ck.transform=this._.transform;return ck}if(cn==null&&bi.is(E,"string")){if(E==b3&&this.attrs.fill=="none"&&this.attrs.gradient){return this.attrs.gradient}var cl=E.split(bR),ch={};for(var ci=0,cp=cl.length;ci<cp;ci++){E=cl[ci];if(E in this.attrs){ch[E]=this.attrs[E]}else{if(bi.is(this.paper.customAttributes[E],"function")){ch[E]=this.paper.customAttributes[E].def}else{ch[E]=bi._availableAttrs[E]}}}return cp-1?ch:ch[cl[0]]}if(this.attrs&&cn==null&&bi.is(E,"array")){ch={};for(ci=0,cp=E.length;ci<cp;ci++){ch[E[ci]]=this.attr(E[ci])}return ch}var S;if(cn!=null){S={};S[E]=cn}cn==null&&bi.is(E,"object")&&(S=E);for(var co in S){b8("raphael.attr."+co+"."+this.id,this,S[co])}if(S){for(co in this.paper.customAttributes){if(this.paper.customAttributes[R](co)&&S[R](co)&&bi.is(this.paper.customAttributes[co],"function")){var cj=this.paper.customAttributes[co].apply(this,[].concat(S[co]));this.attrs[co]=S[co];for(var cg in cj){if(cj[R](cg)){S[cg]=cj[cg]}}}}if(S.text&&this.type=="text"){this.textpath.string=S.text}b5(this,S)}return this};bU.toFront=function(){!this.removed&&this.node.parentNode.appendChild(this.node);this.paper&&this.paper.top!=this&&bi._tofront(this,this.paper);return this};bU.toBack=function(){if(this.removed){return this}if(this.node.parentNode.firstChild!=this.node){this.node.parentNode.insertBefore(this.node,this.node.parentNode.firstChild);bi._toback(this,this.paper)}return this};bU.insertAfter=function(E){if(this.removed){return this}if(E.constructor==bi.st.constructor){E=E[E.length-1]}if(E.node.nextSibling){E.node.parentNode.insertBefore(this.node,E.node.nextSibling)}else{E.node.parentNode.appendChild(this.node)}bi._insertafter(this,E,this.paper);return this};bU.insertBefore=function(E){if(this.removed){return this}if(E.constructor==bi.st.constructor){E=E[0]}E.node.parentNode.insertBefore(this.node,E.node);bi._insertbefore(this,E,this.paper);return this};bU.blur=function(E){var S=this.node.runtimeStyle,cg=S.filter;cg=cg.replace(b1,bY);if(+E!==0){this.attrs.blur=E;S.filter=cg+bT+b4+".Blur(pixelradius="+(+E||1.5)+")";S.margin=bi.format("-{0}px 0 0 -{0}px",b9(+E||1.5))}else{S.filter=cg;S.margin=0;delete this.attrs.blur}return this};bi._engine.path=function(ch,S){var ci=cd("shape");ci.style.cssText=i;ci.coordsize=d+bT+d;ci.coordorigin=S.coordorigin;var cj=new b2(ci,S),E={fill:"none",stroke:"#000"};ch&&(E.path=ch);cj.type="path";cj.path=[];cj.Path=bY;b5(cj,E);S.canvas.appendChild(ci);var cg=cd("skew");cg.on=true;ci.appendChild(cg);cj.skew=cg;cj.transform(bY);return cj};bi._engine.rect=function(S,ck,ci,cl,cg,E){var cm=bi._rectPath(ck,ci,cl,cg,E),ch=S.path(cm),cj=ch.attrs;ch.X=cj.x=ck;ch.Y=cj.y=ci;ch.W=cj.width=cl;ch.H=cj.height=cg;cj.r=E;cj.path=cm;ch.type="rect";return ch};bi._engine.ellipse=function(S,E,ck,cj,ci){var ch=S.path(),cg=ch.attrs;ch.X=E-cj;ch.Y=ck-ci;ch.W=cj*2;ch.H=ci*2;ch.type="ellipse";b5(ch,{cx:E,cy:ck,rx:cj,ry:ci});return ch};bi._engine.circle=function(S,E,cj,ci){var ch=S.path(),cg=ch.attrs;ch.X=E-ci;ch.Y=cj-ci;ch.W=ch.H=ci*2;ch.type="circle";b5(ch,{cx:E,cy:cj,r:ci});return ch};bi._engine.image=function(S,E,cl,cj,cm,ch){var co=bi._rectPath(cl,cj,cm,ch),ci=S.path(co).attr({stroke:"none"}),ck=ci.attrs,cg=ci.node,cn=cg.getElementsByTagName(b3)[0];ck.src=E;ci.X=ck.x=cl;ci.Y=ck.y=cj;ci.W=ck.width=cm;ci.H=ck.height=ch;ck.path=co;ci.type="image";cn.parentNode==cg&&cg.removeChild(cn);cn.rotate=true;cn.src=E;cn.type="tile";ci._.fillpos=[cl,cj];ci._.fillsize=[cm,ch];cg.appendChild(cn);bX(ci,1,1,0,0,0);return ci};bi._engine.text=function(E,ck,cj,cl){var ch=cd("shape"),cn=cd("path"),cg=cd("textpath");ck=ck||0;cj=cj||0;cl=cl||"";cn.v=bi.format("m{0},{1}l{2},{1}",b9(ck*d),b9(cj*d),b9(ck*d)+1);cn.textpathok=true;cg.string=cc(cl);cg.on=true;ch.style.cssText=i;ch.coordsize=d+bT+d;ch.coordorigin="0 0";var S=new b2(ch,E),ci={fill:"#000",stroke:"none",font:bi._availableAttrs.font,text:cl};S.shape=ch;S.path=cn;S.textpath=cg;S.type="text";S.attrs.text=cc(cl);S.attrs.x=ck;S.attrs.y=cj;S.attrs.w=1;S.attrs.h=1;b5(S,ci);ch.appendChild(cg);ch.appendChild(cn);E.canvas.appendChild(ch);var cm=cd("skew");cm.on=true;ch.appendChild(cm);S.skew=cm;S.transform(bY);return S};bi._engine.setSize=function(cg,E){var S=this.canvas.style;this.width=cg;this.height=E;cg==+cg&&(cg+="px");E==+E&&(E+="px");S.width=cg;S.height=E;S.clip="rect(0 "+cg+" "+E+" 0)";if(this._viewBox){bi._engine.setViewBox.apply(this,this._viewBox)}return this};bi._engine.setViewBox=function(cj,ci,ck,cg,ch){bi.eve("raphael.setViewBox",this,this._viewBox,[cj,ci,ck,cg,ch]);var E=this.width,cm=this.height,cn=1/cf(ck/E,cg/cm),cl,S;if(ch){cl=cm/cg;S=E/ck;if(ck*cl<E){cj-=(E-ck*cl)/2/cl}if(cg*S<cm){ci-=(cm-cg*S)/2/S}}this._viewBox=[cj,ci,ck,cg,!!ch];this._viewBoxShift={dx:-cj,dy:-ci,scale:cn};this.forEach(function(co){co.transform("...")});return this};var cd;bi._engine.initWin=function(cg){var S=cg.document;S.createStyleSheet().addRule(".rvml","behavior:url(#default#VML)");try{!S.namespaces.rvml&&S.namespaces.add("rvml","urn:schemas-microsoft-com:vml");cd=function(ch){return S.createElement("<rvml:"+ch+' class="rvml">')}}catch(E){cd=function(ch){return S.createElement("<"+ch+' xmlns="urn:schemas-microsoft.com:vml" class="rvml">')}}};bi._engine.initWin(bi._g.win);bi._engine.create=function(){var cg=bi._getContainer.apply(0,arguments),E=cg.container,cm=cg.height,cn,S=cg.width,cl=cg.x,ck=cg.y;if(!E){throw new Error("VML container not found.")}var ci=new bi._Paper,cj=ci.canvas=bi._g.doc.createElement("div"),ch=cj.style;cl=cl||0;ck=ck||0;S=S||512;cm=cm||342;ci.width=S;ci.height=cm;S==+S&&(S+="px");cm==+cm&&(cm+="px");ci.coordsize=d*1000+bT+d*1000;ci.coordorigin="0 0";ci.span=bi._g.doc.createElement("span");ci.span.style.cssText="position:absolute;left:-9999em;top:-9999em;padding:0;margin:0;line-height:1;";cj.appendChild(ci.span);ch.cssText=bi.format("top:0;left:0;width:{0};height:{1};display:inline-block;position:relative;clip:rect(0 {0} {1} 0);overflow:hidden",S,cm);if(E==1){bi._g.doc.body.appendChild(cj);ch.left=cl+"px";ch.top=ck+"px";ch.position="absolute"}else{if(E.firstChild){E.insertBefore(cj,E.firstChild)}else{E.appendChild(cj)}}ci.renderfix=function(){};return ci};bi.prototype.clear=function(){bi.eve("raphael.clear",this);this.canvas.innerHTML=bY;this.span=bi._g.doc.createElement("span");this.span.style.cssText="position:absolute;left:-9999em;top:-9999em;padding:0;margin:0;line-height:1;display:inline;";this.canvas.appendChild(this.span);this.bottom=this.top=null};bi.prototype.remove=function(){bi.eve("raphael.remove",this);this.canvas.parentNode.removeChild(this.canvas);for(var E in this){this[E]=typeof this[E]=="function"?bi._removedFactory(E):null}return true};var b6=bi.st;for(var bP in bU){if(bU[R](bP)&&!b6[R](bP)){b6[bP]=(function(E){return function(){var S=arguments;return this.forEach(function(cg){cg[E].apply(cg,S)
})}})(bP)}}})();aE.was?(a5.win.Raphael=bi):(Raphael=bi);return bi}));if(!window.ABCJS){window.ABCJS={}}(function(){function a(g,f){var j=g.getAttribute("class");var i=/[\t\r\n\f]/g;var h=" "+f+" ";return(g.nodeType===1&&(" "+j+" ").replace(i," ").indexOf(h)>=0)}function e(l,g,f){var k=l.getElementsByClassName(g);var h=[];for(var j=0;j<k.length;j++){if(a(k[j],f)){h.push(k[j])}}return h}function b(g,f){var h;if(f.bpm){h=f.bpm}else{if(g&&g.metaText&&g.metaText.tempo&&g.metaText.tempo.bpm){h=g.metaText.tempo.bpm}else{h=120}}return h}var d=false;var c;ABCJS.startAnimation=function(h,j,q){if(h.getElementsByClassName===undefined){console.error("ABCJS.startAnimation: The first parameter must be a regular DOM element. (Did you pass a jQuery object or an ID?)");return}if(j.getBeatLength===undefined){console.error("ABCJS.startAnimation: The second parameter must be a single tune. (Did you pass the entire array of tunes?)");return}if(q.showCursor){c=$('<div class="cursor" style="position: absolute;"></div>');$(h).append(c)}d=false;var r=b(j,q);var p=r/60000;var m=j.getBeatLength();var g;function f(w,s){var u=e(h,"l"+w,"m"+s);if(u.length>0){for(var t=0;t<u.length;t++){var v=u[t];if(!a(v,"bar")){v.style.display="none"}}}}function o(u){var s=[];for(var t in u){if(u.hasOwnProperty(t)){s.push(u[t])}}s=s.sort(function(w,v){return w.time-v.time});return s}var k=[];function i(O){var y={};var x=0;var w=false;for(var C=0;C<O.staffgroups.length;C++){var B=O.staffgroups[C];var z=B.voices;var H=B.y;var I=B.height;var F=0;for(var E=0;E<z.length;E++){var L=x;var G=z[E].children;for(var K=0;K<G.length;K++){var t=G[K];if(t.duration>0){var N=t.startTie;if(w){if(!N){w=false}}else{y["event"+L]={type:"event",time:L,top:H,height:I,left:t.x,width:t.w};if(N){w=true}}L+=t.duration}if(t.type==="bar"){if(k.length===0||k[k.length-1]!=="bar"){if(t.elemset&&t.elemset.length>0&&t.elemset[0].attrs){var D=t.elemset[0].attrs["class"];var s=D.split(" ");var M;var u;for(var J=0;J<s.length;J++){var A=/m(\d+)/.exec(s[J]);if(A){u=A[1]}A=/l(\d+)/.exec(s[J]);if(A){M=A[1]}}y["bar"+L]={type:"bar",time:L,lineNum:M,measureNum:u}}}}}F=Math.max(F,L)}x=F}k=o(y)}i(j.engraver);function l(){var s=k.shift();if(!s){d=true;return 0}if(s.type==="bar"){if(q.hideFinishedMeasures){f(s.lineNum,s.measureNum)}return l()}if(q.showCursor){c.css({left:s.left+"px",top:s.top+"px",width:s.width+"px",height:s.height+"px"})}if(k.length>0){return k[0].time/m}d=true;return 0}function n(){if(d){ABCJS.stopAnimation();return}var t=l();var v=t/p;var u=new Date();u=u.getTime();var s=g+v-u;if(s<=0){n()}else{setTimeout(n,s)}}g=new Date();g=g.getTime();n()};ABCJS.stopAnimation=function(){d=true;if(c){c.remove();c=null}}})();if(!window.ABCJS){window.ABCJS={}}(function(){ABCJS.numberOfTunes=function(d){var b=d.split("\nX:");var c=b.length;if(c===0){c=1}return c};ABCJS.TuneBook=function(d){var h=this;var g="";d=window.ABCJS.parse.strip(d);var b=d.split("\nX:");for(var f=1;f<b.length;f++){b[f]="X:"+b[f]}var j=0;h.tunes=[];window.ABCJS.parse.each(b,function(i){h.tunes.push({abc:i,startPos:j});j+=i.length});if(h.tunes.length>1&&!window.ABCJS.parse.startsWith(h.tunes[0].abc,"X:")){var c=h.tunes.shift();var e=c.abc.split("\n");window.ABCJS.parse.each(e,function(i){if(window.ABCJS.parse.startsWith(i,"%%")){g+=i+"\n"}})}h.header=g;window.ABCJS.parse.each(h.tunes,function(k){var i=k.abc.indexOf("\n\n");if(i>0){k.abc=k.abc.substring(0,i)}k.pure=k.abc;k.abc=g+k.abc;var l=k.pure.split("T:");if(l.length>1){l=l[1].split("\n");k.title=l[0].replace(/^\s+|\s+$/g,"")}else{k.title=""}var m=k.pure.substring(2,k.pure.indexOf("\n"));k.id=m.replace(/^\s+|\s+$/g,"")})};ABCJS.TuneBook.prototype.getTuneById=function(c){for(var b=0;b<this.tunes.length;b++){if(this.tunes[b].id===c){return this.tunes[b]}}return null};ABCJS.TuneBook.prototype.getTuneByTitle=function(c){for(var b=0;b<this.tunes.length;b++){if(this.tunes[b].title===c){return this.tunes[b]}}return null};function a(o,e,n,l,d){var m=[];var k=function(i){return i&&!(i.propertyIsEnumerable("length"))&&typeof i==="object"&&typeof i.length==="number"};if(e===undefined||n===undefined){return}if(!k(e)){e=[e]}if(l===undefined){l={}}if(d===undefined){d={}}var g=d.startingTune?d.startingTune:0;var f=new ABCJS.TuneBook(n);var c=new window.ABCJS.parse.Parse();for(var h=0;h<e.length;h++){var b=e[h];if(typeof(b)==="string"){b=document.getElementById(b)}if(b){b.innerHTML="";if(g<f.tunes.length){c.parse(f.tunes[g].abc,l);var j=c.getTune();m.push(j);o(b,j)}}g++}return m}ABCJS.renderAbc=function(c,e,b,d,f){function g(l,i){var h=f?f.width?f.width:800:800;var k=Raphael(l,h,400);if(d===undefined){d={}}var j=new ABCJS.write.Printer(k,d);j.printABC(i);i.engraver=j}return a(g,c,e,b,f)};ABCJS.renderMidi=function(c,d,b,f,e){function g(j,h){if(f===undefined){f={}}var i=new ABCJS.midi.MidiWriter(j,f);i.writeABC(h)}return a(g,c,d,b,e)}})();if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.data){window.ABCJS.data={}}window.ABCJS.data.Tune=function(){this.getBeatLength=function(){for(var c=0;c<this.lines.length;c++){if(this.lines[c].staff){for(var b=0;b<this.lines[c].staff.length;b++){if(this.lines[c].staff[b].meter){var d=this.lines[c].staff[b].meter;if(d.type==="specified"){if(d.value.length>0){var a=parseInt(d.value[0].num,10);var e=parseInt(d.value[0].den,10);if(a===6&&e===8){return 3/8}if(a===9&&e===8){return 3/8}if(a===12&&e===8){return 3/8}return 1/e}else{return null}}else{if(d.type==="cut_time"){return 1/2}else{return 1/4}}}}}}return null};this.reset=function(){this.version="1.0.1";this.media="screen";this.metaText={};this.formatting={};this.lines=[];this.staffNum=0;this.voiceNum=0;this.lineNum=0};this.cleanUp=function(f,p,y,q){this.closeLine();var b=false;var x,o,k;for(x=0;x<this.lines.length;x++){if(this.lines[x].staff!==undefined){var m=false;for(o=0;o<this.lines[x].staff.length;o++){if(this.lines[x].staff[o]===undefined){b=true;this.lines[x].staff[o]=null}else{for(k=0;k<this.lines[x].staff[o].voices.length;k++){if(this.lines[x].staff[o].voices[k]===undefined){this.lines[x].staff[o].voices[k]=[]}else{if(this.containsNotes(this.lines[x].staff[o].voices[k])){m=true}}}}}if(!m){this.lines[x]=null;b=true}}}if(b){this.lines=window.ABCJS.parse.compact(this.lines);window.ABCJS.parse.each(this.lines,function(i){if(i.staff){i.staff=window.ABCJS.parse.compact(i.staff)}})}if(y){for(x=0;x<this.lines.length;x++){if(this.lines[x].staff!==undefined){for(o=0;o<this.lines[x].staff.length;o++){for(k=0;k<this.lines[x].staff[o].voices.length;k++){var d=0;for(var t=0;t<this.lines[x].staff[o].voices[k].length;t++){if(this.lines[x].staff[o].voices[k][t].el_type==="bar"){d++;if(d>=y){if(t<this.lines[x].staff[o].voices[k].length-1){if(x===this.lines.length-1){var g=JSON.parse(JSON.stringify(this.lines[x]));this.lines.push(window.ABCJS.parse.clone(g));for(var u=0;u<this.lines[x+1].staff.length;u++){for(var r=0;r<this.lines[x+1].staff[u].voices.length;r++){this.lines[x+1].staff[u].voices[r]=[]}}}var a=t+1;var h=this.lines[x].staff[o].voices[k].slice(a);this.lines[x].staff[o].voices[k]=this.lines[x].staff[o].voices[k].slice(0,a);
this.lines[x+1].staff[o].voices[k]=h.concat(this.lines[x+1].staff[o].voices[k])}}}}}}}}}if(y){b=false;for(x=0;x<this.lines.length;x++){if(this.lines[x].staff!==undefined){for(o=0;o<this.lines[x].staff.length;o++){var c=false;for(k=0;k<this.lines[x].staff[o].voices.length;k++){if(this.containsNotesStrict(this.lines[x].staff[o].voices[k])){c=true}}if(!c){b=true;this.lines[x].staff[o]=null}}}}if(b){window.ABCJS.parse.each(this.lines,function(i){if(i.staff){i.staff=window.ABCJS.parse.compact(i.staff)}})}}for(x=0;x<this.lines.length;x++){if(this.lines[x].staff){for(o=0;o<this.lines[x].staff.length;o++){delete this.lines[x].staff[o].workingClef}}}function l(K){var J=[];var H;var I=function(N,j,P){if(J[P]===undefined){for(H=0;H<J.length;H++){if(J[H]!==undefined){P=H;break}}if(J[P]===undefined){var O=P*100;window.ABCJS.parse.each(N.endSlur,function(i){if(O===i){--O}});J[P]=[O]}}var M;for(var L=0;L<j;L++){M=J[P].pop();N.endSlur.push(M)}if(J[P].length===0){delete J[P]}return M};var C=function(N,j,O,M){N.startSlur=[];if(J[O]===undefined){J[O]=[]}var P=O*100+1;for(var L=0;L<j;L++){if(M){window.ABCJS.parse.each(M,function(i){if(P===i){++P}});window.ABCJS.parse.each(M,function(i){if(P===i){++P}});window.ABCJS.parse.each(M,function(i){if(P===i){++P}})}window.ABCJS.parse.each(J[O],function(i){if(P===i){++P}});window.ABCJS.parse.each(J[O],function(i){if(P===i){++P}});J[O].push(P);N.startSlur.push({label:P});P++}};for(var D=0;D<K.length;D++){var v=K[D];if(v.el_type==="note"){if(v.gracenotes){for(var E=0;E<v.gracenotes.length;E++){if(v.gracenotes[E].endSlur){var F=v.gracenotes[E].endSlur;v.gracenotes[E].endSlur=[];for(var n=0;n<F;n++){I(v.gracenotes[E],1,20)}}if(v.gracenotes[E].startSlur){H=v.gracenotes[E].startSlur;C(v.gracenotes[E],H,20)}}}if(v.endSlur){H=v.endSlur;v.endSlur=[];I(v,H,0)}if(v.startSlur){H=v.startSlur;C(v,H,0)}if(v.pitches){var G=[];for(var s=0;s<v.pitches.length;s++){if(v.pitches[s].endSlur){var A=v.pitches[s].endSlur;v.pitches[s].endSlur=[];for(var B=0;B<A;B++){var z=I(v.pitches[s],1,s+1);G.push(z)}}}for(s=0;s<v.pitches.length;s++){if(v.pitches[s].startSlur){H=v.pitches[s].startSlur;C(v.pitches[s],H,s+1,G)}}if(v.gracenotes&&v.pitches[0].endSlur&&v.pitches[0].endSlur[0]===100&&v.pitches[0].startSlur){if(v.gracenotes[0].endSlur){v.gracenotes[0].endSlur.push(v.pitches[0].startSlur[0].label)}else{v.gracenotes[0].endSlur=[v.pitches[0].startSlur[0].label]}if(v.pitches[0].endSlur.length===1){delete v.pitches[0].endSlur}else{if(v.pitches[0].endSlur[0]===100){v.pitches[0].endSlur.shift()}else{if(v.pitches[0].endSlur[v.pitches[0].endSlur.length-1]===100){v.pitches[0].endSlur.pop()}}}if(J[1].length===1){delete J[1]}else{J[1].pop()}}}}}}function e(i){window.ABCJS.parse.parseKeyVoice.fixClef(i)}for(this.lineNum=0;this.lineNum<this.lines.length;this.lineNum++){if(this.lines[this.lineNum].staff){for(this.staffNum=0;this.staffNum<this.lines[this.lineNum].staff.length;this.staffNum++){if(this.lines[this.lineNum].staff[this.staffNum].clef){e(this.lines[this.lineNum].staff[this.staffNum].clef)}for(this.voiceNum=0;this.voiceNum<this.lines[this.lineNum].staff[this.staffNum].voices.length;this.voiceNum++){l(this.lines[this.lineNum].staff[this.staffNum].voices[this.voiceNum]);for(var w=0;w<this.lines[this.lineNum].staff[this.staffNum].voices[this.voiceNum].length;w++){if(this.lines[this.lineNum].staff[this.staffNum].voices[this.voiceNum][w].el_type==="clef"){e(this.lines[this.lineNum].staff[this.staffNum].voices[this.voiceNum][w])}}}}}}if(!this.formatting.pagewidth){this.formatting.pagewidth=f}if(!this.formatting.pageheight){this.formatting.pageheight=p}delete this.staffNum;delete this.voiceNum;delete this.lineNum;delete this.potentialStartBeam;delete this.potentialEndBeam;delete this.vskipPending};this.reset();this.getLastNote=function(){if(this.lines[this.lineNum]&&this.lines[this.lineNum].staff&&this.lines[this.lineNum].staff[this.staffNum]&&this.lines[this.lineNum].staff[this.staffNum].voices[this.voiceNum]){for(var a=this.lines[this.lineNum].staff[this.staffNum].voices[this.voiceNum].length-1;a>=0;a--){var b=this.lines[this.lineNum].staff[this.staffNum].voices[this.voiceNum][a];if(b.el_type==="note"){return b}}}return null};this.addTieToLastNote=function(){var a=this.getLastNote();if(a&&a.pitches&&a.pitches.length>0){a.pitches[0].startTie={};return true}return false};this.getDuration=function(a){if(a.duration){return a.duration}return 0};this.closeLine=function(){if(this.potentialStartBeam&&this.potentialEndBeam){this.potentialStartBeam.startBeam=true;this.potentialEndBeam.endBeam=true}delete this.potentialStartBeam;delete this.potentialEndBeam};this.appendElement=function(h,i,e,a){var c=this;var g=function(l){if(l.pitches!==undefined){var j=c.lines[c.lineNum].staff[c.staffNum].workingClef.verticalPos;window.ABCJS.parse.each(l.pitches,function(m){m.verticalPos=m.pitch-j})}if(l.gracenotes!==undefined){var k=c.lines[c.lineNum].staff[c.staffNum].workingClef.verticalPos;window.ABCJS.parse.each(l.gracenotes,function(m){m.verticalPos=m.pitch-k})}c.lines[c.lineNum].staff[c.staffNum].voices[c.voiceNum].push(l)};a.el_type=h;if(i!==null){a.startChar=i}if(e!==null){a.endChar=e}var d=function(){c.potentialStartBeam.startBeam=true;a.endBeam=true;delete c.potentialStartBeam;delete c.potentialEndBeam};var f=function(){if(c.potentialStartBeam!==undefined&&c.potentialEndBeam!==undefined){c.potentialStartBeam.startBeam=true;c.potentialEndBeam.endBeam=true}delete c.potentialStartBeam;delete c.potentialEndBeam};if(h==="note"){var b=c.getDuration(a);if(b>=0.25){f()}else{if(a.force_end_beam_last&&c.potentialStartBeam!==undefined){f()}else{if(a.end_beam&&c.potentialStartBeam!==undefined){if(a.rest===undefined){d()}else{f()}}else{if(a.rest===undefined){if(c.potentialStartBeam===undefined){if(!a.end_beam){c.potentialStartBeam=a;delete c.potentialEndBeam}}else{c.potentialEndBeam=a}}}}}}else{f()}delete a.end_beam;delete a.force_end_beam_last;g(a)};this.appendStartingElement=function(f,a,h,c){this.closeLine();var e;if(f==="key"){e=c.impliedNaturals;delete c.impliedNaturals}var b=window.ABCJS.parse.clone(c);if(f==="clef"){this.lines[this.lineNum].staff[this.staffNum].workingClef=b}if(this.lines[this.lineNum].staff.length<=this.staffNum){this.lines[this.lineNum].staff[this.staffNum]={};this.lines[this.lineNum].staff[this.staffNum].clef=window.ABCJS.parse.clone(this.lines[this.lineNum].staff[0].clef);this.lines[this.lineNum].staff[this.staffNum].key=window.ABCJS.parse.clone(this.lines[this.lineNum].staff[0].key);this.lines[this.lineNum].staff[this.staffNum].meter=window.ABCJS.parse.clone(this.lines[this.lineNum].staff[0].meter);this.lines[this.lineNum].staff[this.staffNum].workingClef=window.ABCJS.parse.clone(this.lines[this.lineNum].staff[0].workingClef);this.lines[this.lineNum].staff[this.staffNum].voices=[[]]}var g=this.lines[this.lineNum].staff[this.staffNum].voices[this.voiceNum];for(var d=0;d<g.length;d++){if(g[d].el_type==="note"||g[d].el_type==="bar"){b.el_type=f;b.startChar=a;b.endChar=h;if(e){b.accidentals=e.concat(b.accidentals)
}g.push(b);return}if(g[d].el_type===f){b.el_type=f;b.startChar=a;b.endChar=h;if(e){b.accidentals=e.concat(b.accidentals)}g[d]=b;return}}this.lines[this.lineNum].staff[this.staffNum][f]=c};this.getNumLines=function(){return this.lines.length};this.pushLine=function(a){if(this.vskipPending){a.vskip=this.vskipPending;delete this.vskipPending}this.lines.push(a)};this.addSubtitle=function(a){this.pushLine({subtitle:a})};this.addSpacing=function(a){this.vskipPending=a};this.addNewPage=function(a){this.pushLine({newpage:a})};this.addSeparator=function(c,b,a){this.pushLine({separator:{spaceAbove:c,spaceBelow:b,lineLength:a}})};this.addText=function(a){this.pushLine({text:a})};this.addCentered=function(a){this.pushLine({text:[{text:a,center:true}]})};this.containsNotes=function(b){for(var a=0;a<b.length;a++){if(b[a].el_type==="note"||b[a].el_type==="bar"){return true}}return false};this.containsNotesStrict=function(b){for(var a=0;a<b.length;a++){if(b[a].el_type==="note"&&b[a].rest===undefined){return true}}return false};this.startNewLine=function(e){var d=this;this.closeLine();var c=function(j){d.lines[d.lineNum].staff[d.staffNum].voices[d.voiceNum]=[];if(d.isFirstLine(d.lineNum)){if(j.name){if(!d.lines[d.lineNum].staff[d.staffNum].title){d.lines[d.lineNum].staff[d.staffNum].title=[]}d.lines[d.lineNum].staff[d.staffNum].title[d.voiceNum]=j.name}}else{if(j.subname){if(!d.lines[d.lineNum].staff[d.staffNum].title){d.lines[d.lineNum].staff[d.staffNum].title=[]}d.lines[d.lineNum].staff[d.staffNum].title[d.voiceNum]=j.subname}}if(j.style){d.appendElement("style",null,null,{head:j.style})}if(j.stem){d.appendElement("stem",null,null,{direction:j.stem})}else{if(d.voiceNum>0){if(d.lines[d.lineNum].staff[d.staffNum].voices[0]!==undefined){var g=false;for(var f=0;f<d.lines[d.lineNum].staff[d.staffNum].voices[0].length;f++){if(d.lines[d.lineNum].staff[d.staffNum].voices[0].el_type==="stem"){g=true}}if(!g){var h={el_type:"stem",direction:"up"};d.lines[d.lineNum].staff[d.staffNum].voices[0].splice(0,0,h)}}d.appendElement("stem",null,null,{direction:"down"})}}if(j.scale){d.appendElement("scale",null,null,{size:j.scale})}};var a=function(f){d.lines[d.lineNum].staff[d.staffNum]={voices:[],clef:f.clef,key:f.key,workingClef:f.clef};if(f.vocalfont){d.lines[d.lineNum].staff[d.staffNum].vocalfont=f.vocalfont}if(f.bracket){d.lines[d.lineNum].staff[d.staffNum].bracket=f.bracket}if(f.brace){d.lines[d.lineNum].staff[d.staffNum].brace=f.brace}if(f.connectBarLines){d.lines[d.lineNum].staff[d.staffNum].connectBarLines=f.connectBarLines}c(f);if(f.part){d.appendElement("part",f.startChar,f.endChar,{title:f.part})}if(f.meter!==undefined){d.lines[d.lineNum].staff[d.staffNum].meter=f.meter}};var b=function(f){d.lines[d.lineNum]={staff:[]};a(f)};if(this.lines[this.lineNum]===undefined){b(e)}else{if(this.lines[this.lineNum].staff===undefined){this.lineNum++;this.startNewLine(e)}else{if(this.lines[this.lineNum].staff[this.staffNum]===undefined){a(e)}else{if(this.lines[this.lineNum].staff[this.staffNum].voices[this.voiceNum]===undefined){c(e)}else{if(!this.containsNotes(this.lines[this.lineNum].staff[this.staffNum].voices[this.voiceNum])){return}else{this.lineNum++;this.startNewLine(e)}}}}}};this.hasBeginMusic=function(){return this.lines.length>0};this.isFirstLine=function(a){for(var b=a-1;b>=0;b--){if(this.lines[b].staff!==undefined){return false}}return true};this.getCurrentVoice=function(){if(this.lines[this.lineNum]!==undefined&&this.lines[this.lineNum].staff[this.staffNum]!==undefined&&this.lines[this.lineNum].staff[this.staffNum].voices[this.voiceNum]!==undefined){return this.lines[this.lineNum].staff[this.staffNum].voices[this.voiceNum]}else{return null}};this.setCurrentVoice=function(c,b){this.staffNum=c;this.voiceNum=b;for(var a=0;a<this.lines.length;a++){if(this.lines[a].staff){if(this.lines[a].staff[c]===undefined||this.lines[a].staff[c].voices[b]===undefined||!this.containsNotes(this.lines[a].staff[c].voices[b])){this.lineNum=a;return}}}this.lineNum=a};this.addMetaText=function(a,b){if(this.metaText[a]===undefined){this.metaText[a]=b}else{this.metaText[a]+="\n"+b}};this.addMetaTextArray=function(a,b){if(this.metaText[a]===undefined){this.metaText[a]=[b]}else{this.metaText[a].push(b)}};this.addMetaTextObj=function(a,b){this.metaText[a]=b}};if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.midi){window.ABCJS.midi={}}(function(){function a(j,i){for(var h in i){if(i.hasOwnProperty(h)){j.setAttribute(h,i[h])}}return j}function g(h,i){this.javamidi=h;this.qtmidi=i}g.prototype.setTempo=function(h){this.javamidi.setTempo(h);this.qtmidi.setTempo(h)};g.prototype.startTrack=function(){this.javamidi.startTrack();this.qtmidi.startTrack()};g.prototype.endTrack=function(){this.javamidi.endTrack();this.qtmidi.endTrack()};g.prototype.setInstrument=function(h){this.javamidi.setInstrument(h);this.qtmidi.setInstrument(h)};g.prototype.startNote=function(j,h,i){this.javamidi.startNote(j,h,i);this.qtmidi.startNote(j,h,i)};g.prototype.endNote=function(i,h){this.javamidi.endNote(i,h);this.qtmidi.endNote(i,h)};g.prototype.addRest=function(h){this.javamidi.addRest(h);this.qtmidi.addRest(h)};g.prototype.embed=function(h){this.javamidi.embed(h);this.qtmidi.embed(h,true)};function b(h){this.playlist=[];this.trackcount=0;this.timecount=0;this.tempo=60;this.midiapi=MIDIPlugin;this.midiwriter=h;this.noteOnAndChannel="%90"}b.prototype.setTempo=function(h){this.tempo=h};b.prototype.startTrack=function(){this.silencelength=0;this.trackcount++;this.timecount=0;this.playlistpos=0;this.first=true;if(this.instrument){this.setInstrument(this.instrument)}if(this.channel){this.setChannel(this.channel)}};b.prototype.endTrack=function(){};b.prototype.setInstrument=function(h){this.instrument=h;this.midiapi.setInstrument(h)};b.prototype.setChannel=function(h){this.channel=h;this.midiapi.setChannel(h)};b.prototype.updatePos=function(){while(this.playlist[this.playlistpos]&&this.playlist[this.playlistpos].time<this.timecount){this.playlistpos++}};b.prototype.startNote=function(k,i,j){this.timecount+=this.silencelength;this.silencelength=0;if(this.first){}this.updatePos();var h=this;this.playlist.splice(this.playlistpos,0,{time:this.timecount,funct:function(){h.midiapi.playNote(k);h.midiwriter.notifySelect(j)}})};b.prototype.endNote=function(j,i){this.timecount+=i;this.updatePos();var h=this;this.playlist.splice(this.playlistpos,0,{time:this.timecount,funct:function(){h.midiapi.stopNote(j)}})};b.prototype.addRest=function(h){this.silencelength+=h};b.prototype.embed=function(i){this.playlink=a(document.createElement("a"),{style:"border:1px solid black; margin:3px;"});this.playlink.innerHTML="play";var h=this;this.playlink.onmousedown=function(){if(h.playing){this.innerHTML="play";h.pausePlay()}else{this.innerHTML="pause";h.startPlay()}};i.appendChild(this.playlink);var j=a(document.createElement("a"),{style:"border:1px solid black; margin:3px;"});j.innerHTML="stop";j.onmousedown=function(){h.stopPlay()};i.appendChild(j);this.i=0;this.currenttime=0;this.playing=false
};b.prototype.stopPlay=function(){this.i=0;this.currenttime=0;this.pausePlay();this.playlink.innerHTML="play"};b.prototype.startPlay=function(){this.playing=true;var h=this;this.ticksperinterval=480/4;this.doPlay();this.playinterval=window.setInterval(function(){h.doPlay()},(60000/(this.tempo*4)))};b.prototype.pausePlay=function(){this.playing=false;window.clearInterval(this.playinterval);this.midiapi.stopAllNotes()};b.prototype.doPlay=function(){while(this.playlist[this.i]&&this.playlist[this.i].time<=this.currenttime){this.playlist[this.i].funct();this.i++}if(this.playlist[this.i]){this.currenttime+=this.ticksperinterval}else{this.stopPlay()}};function d(){this.trackstrings="";this.trackcount=0;this.noteOnAndChannel="%90"}d.prototype.setTempo=function(h){if(this.trackcount===0){this.startTrack();this.track+="%00%FF%51%03"+c(Math.round(60000000/h),6);this.endTrack()}};d.prototype.startTrack=function(){this.track="";this.silencelength=0;this.trackcount++;this.first=true;if(this.instrument){this.setInstrument(this.instrument)}};d.prototype.endTrack=function(){var h=c(this.track.length/3+4,8);this.track="MTrk"+h+this.track+"%00%FF%2F%00";this.trackstrings+=this.track};d.prototype.setInstrument=function(h){if(this.track){this.track="%00%C0"+c(h,2)+this.track}else{this.track="%00%C0"+c(h,2)}this.instrument=h};d.prototype.setChannel=function(h){this.channel=h-1;this.noteOnAndChannel="%9"+this.channel.toString(16)};d.prototype.startNote=function(i,h){this.track+=e(this.silencelength);this.silencelength=0;if(this.first){this.first=false;this.track+=this.noteOnAndChannel}this.track+="%"+i.toString(16)+"%"+h};d.prototype.endNote=function(i,h){this.track+=e(h);this.track+="%"+i.toString(16)+"%00"};d.prototype.addRest=function(h){this.silencelength+=h};d.prototype.embed=function(i,h){var k="data:audio/midi,MThd%00%00%00%06%00%01"+c(this.trackcount,4)+"%01%e0"+this.trackstrings;var j=a(document.createElement("a"),{href:k});j.innerHTML="download midi";i.insertBefore(j,i.firstChild);if(h){return}var l=a(document.createElement("embed"),{src:k,type:"video/quicktime",controller:"true",autoplay:"false",loop:"false",enablejavascript:"true",style:"display:block; height: 20px;"});i.insertBefore(l,i.firstChild)};function f(k){var h="";for(var j=0;j<k.length;j+=2){h+="%";h+=k.substr(j,2)}return h}function c(j,i){var h=j.toString(16);while(h.length<i){h="0"+h}return f(h)}function e(o){var k=0;var h=[];while(o!==0){h.push(o&127);o=o>>7}for(var j=h.length-1;j>=0;j--){k=k<<8;var l=h[j];if(j!==0){l=l|128}k=k|l}var m=k.toString(16).length;m+=m%2;return c(k,m)}ABCJS.midi.MidiWriter=function(i,h){h=h||{};this.parent=i;this.scale=[0,2,4,5,7,9,11];this.restart={line:0,staff:0,voice:0,pos:0};this.visited={};this.multiplier=1;this.next=null;this.qpm=h.qpm||180;this.program=h.program||2;this.noteOnAndChannel="%90";this.javamidi=h.type==="java"||false;this.listeners=[];this.transpose=0;if(this.javamidi){MIDIPlugin=document.MIDIPlugin;setTimeout(function(){try{MIDIPlugin.openPlugin()}catch(k){var j=document.createElement("a");j.href="http://java.sun.com/products/java-media/sound/soundbanks.html";j.target="_blank";j.appendChild(document.createTextNode("Download Soundbank"));i.appendChild(j)}},0)}};ABCJS.midi.MidiWriter.prototype.addListener=function(h){this.listeners.push(h)};ABCJS.midi.MidiWriter.prototype.notifySelect=function(j){for(var h=0;h<this.listeners.length;h++){this.listeners[h].notifySelect(j.abselem)}};ABCJS.midi.MidiWriter.prototype.getMark=function(){return{line:this.line,staff:this.staff,voice:this.voice,pos:this.pos}};ABCJS.midi.MidiWriter.prototype.getMarkString=function(h){h=h||this;return"line"+h.line+"staff"+h.staff+"voice"+h.voice+"pos"+h.pos};ABCJS.midi.MidiWriter.prototype.goToMark=function(h){this.line=h.line;this.staff=h.staff;this.voice=h.voice;this.pos=h.pos};ABCJS.midi.MidiWriter.prototype.markVisited=function(){this.lastmark=this.getMarkString();this.visited[this.lastmark]=true};ABCJS.midi.MidiWriter.prototype.isVisited=function(){if(this.visited[this.getMarkString()]){return true}return false};ABCJS.midi.MidiWriter.prototype.setJumpMark=function(h){this.visited[this.lastmark]=h};ABCJS.midi.MidiWriter.prototype.getJumpMark=function(){return this.visited[this.getMarkString()]};ABCJS.midi.MidiWriter.prototype.getLine=function(){return this.abctune.lines[this.line]};ABCJS.midi.MidiWriter.prototype.getStaff=function(){try{return this.getLine().staff[this.staff]}catch(h){}};ABCJS.midi.MidiWriter.prototype.getVoice=function(){return this.getStaff().voices[this.voice]};ABCJS.midi.MidiWriter.prototype.getElem=function(){return this.getVoice()[this.pos]};ABCJS.midi.MidiWriter.prototype.writeABC=function(l){try{this.midi=(this.javamidi)?new g(new b(this),new d()):new d();this.baraccidentals=[];this.abctune=l;this.baseduration=480*4;if(l.formatting.midi&&l.formatting.midi.transpose){this.transpose=l.formatting.midi.transpose}if(l.formatting.midi&&l.formatting.midi.program&&l.formatting.midi.program.program){this.midi.setInstrument(l.formatting.midi.program.program)}else{this.midi.setInstrument(this.program)}if(l.formatting.midi&&l.formatting.midi.channel){this.midi.setChannel(l.formatting.midi.channel)}if(l.metaText.tempo){var k=1/4;if(l.metaText.tempo.duration){k=l.metaText.tempo.duration[0]}var j=60;if(l.metaText.tempo.bpm){j=l.metaText.tempo.bpm}this.qpm=j*k*4}this.midi.setTempo(this.qpm);this.staffcount=1;for(this.staff=0;this.staff<this.staffcount;this.staff++){this.voicecount=1;for(this.voice=0;this.voice<this.voicecount;this.voice++){this.midi.startTrack();this.restart={line:0,staff:this.staff,voice:this.voice,pos:0};this.next=null;for(this.line=0;this.line<l.lines.length;this.line++){var h=l.lines[this.line];if(this.getLine().staff){this.writeABCLine()}}this.midi.endTrack()}}this.midi.embed(this.parent)}catch(i){this.parent.innerHTML="Couldn't write midi: "+i}};ABCJS.midi.MidiWriter.prototype.writeABCLine=function(){this.staffcount=this.getLine().staff.length;this.voicecount=this.getStaff().voices.length;this.setKeySignature(this.getStaff().key);this.writeABCVoiceLine()};ABCJS.midi.MidiWriter.prototype.writeABCVoiceLine=function(){this.pos=0;while(this.pos<this.getVoice().length){this.writeABCElement(this.getElem());if(this.next){this.goToMark(this.next);this.next=null;if(!this.getLine().staff){return}}else{this.pos++}}};ABCJS.midi.MidiWriter.prototype.writeABCElement=function(h){var i;switch(h.el_type){case"note":this.writeNote(h);break;case"key":this.setKeySignature(h);break;case"bar":this.handleBar(h);break;case"meter":case"clef":break;default:}};ABCJS.midi.MidiWriter.prototype.writeNote=function(m){if(m.startTriplet){if(m.startTriplet===2){this.multiplier=3/2}else{this.multiplier=(m.startTriplet-1)/m.startTriplet}}var h=m.duration*this.baseduration*this.multiplier;if(m.pitches){var l=[];for(var j=0;j<m.pitches.length;j++){var k=m.pitches[j];var n=k.pitch;if(k.accidental){switch(k.accidental){case"sharp":this.baraccidentals[n]=1;break;case"flat":this.baraccidentals[n]=-1;break;
case"natural":this.baraccidentals[n]=0;break;case"dblsharp":this.baraccidentals[n]=2;break;case"dblflat":this.baraccidentals[n]=-2;break}}l[j]=60+12*this.extractOctave(n)+this.scale[this.extractNote(n)];if(this.baraccidentals[n]!==undefined){l[j]+=this.baraccidentals[n]}else{l[j]+=this.accidentals[this.extractNote(n)]}l[j]+=this.transpose;this.midi.startNote(l[j],64,m);if(k.startTie){this.tieduration=h}}for(j=0;j<m.pitches.length;j++){var k=m.pitches[j];var n=k.pitch+this.transpose;if(k.startTie){continue}if(k.endTie){this.midi.endNote(l[j],h+this.tieduration)}else{this.midi.endNote(l[j],h)}h=0;this.tieduration=0}}else{if(m.rest&&m.rest.type!=="spacer"){this.midi.addRest(h)}}if(m.endTriplet){this.multiplier=1}};ABCJS.midi.MidiWriter.prototype.handleBar=function(l){this.baraccidentals=[];var m=(l.type==="bar_right_repeat"||l.type==="bar_dbl_repeat");var k=(l.startEnding)?true:false;var h=(m||k);var j=(l.type==="bar_left_repeat"||l.type==="bar_dbl_repeat"||l.type==="bar_thick_thin"||l.type==="bar_thin_thick"||l.type==="bar_thin_thin"||l.type==="bar_right_repeat");var i=null;if(this.isVisited()){i=this.getJumpMark()}else{if(k||m){if(this.visited[this.lastmark]===true){this.setJumpMark(this.getMark())}}if(h){this.markVisited()}if(m){i=this.restart;this.setJumpMark(this.getMark())}}if(j){this.restart=this.getMark()}if(i&&this.getMarkString(i)!==this.getMarkString()){this.next=i}};ABCJS.midi.MidiWriter.prototype.setKeySignature=function(h){this.accidentals=[0,0,0,0,0,0,0];if(this.abctune.formatting.bagpipes){h.accidentals=[{acc:"natural",note:"g"},{acc:"sharp",note:"f"},{acc:"sharp",note:"c"}]}if(!h.accidentals){return}window.ABCJS.parse.each(h.accidentals,function(k){var l=(k.acc==="sharp")?1:(k.acc==="natural")?0:-1;var j=k.note.toLowerCase();var i=this.extractNote(j.charCodeAt(0)-"c".charCodeAt(0));this.accidentals[i]+=l},this)};ABCJS.midi.MidiWriter.prototype.extractNote=function(h){h=h%7;if(h<0){h+=7}return h};ABCJS.midi.MidiWriter.prototype.extractOctave=function(h){return Math.floor(h/7)}})();if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.parse){window.ABCJS.parse={}}window.ABCJS.parse.clone=function(c){var a={};for(var b in c){if(c.hasOwnProperty(b)){a[b]=c[b]}}return a};window.ABCJS.parse.gsub=function(c,b,a){return c.split(b).join(a)};window.ABCJS.parse.strip=function(a){return a.replace(/^\s+/,"").replace(/\s+$/,"")};window.ABCJS.parse.startsWith=function(b,a){return b.indexOf(a)===0};window.ABCJS.parse.endsWith=function(c,a){var b=c.length-a.length;return b>=0&&c.lastIndexOf(a)===b};window.ABCJS.parse.each=function(a,d,c){for(var b=0,e=a.length;b<e;b++){d.apply(c,[a[b],b])}};window.ABCJS.parse.last=function(a){if(a.length===0){return null}return a[a.length-1]};window.ABCJS.parse.compact=function(a){var b=[];for(var c=0;c<a.length;c++){if(a[c]){b.push(a[c])}}return b};window.ABCJS.parse.detect=function(a,c){for(var b=0;b<a.length;b++){if(c(a[b])){return true}}return false};if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.parse){window.ABCJS.parse={}}window.ABCJS.parse.Parse=function(){var f=new window.ABCJS.data.Tune();var o=new window.ABCJS.parse.tokenizer();this.getTune=function(){return f};var z={reset:function(){for(var B in this){if(this.hasOwnProperty(B)&&typeof this[B]!=="function"){delete this[B]}}this.iChar=0;this.key={accidentals:[],root:"none",acc:"",mode:""};this.meter={type:"specified",value:[{num:"4",den:"4"}]};this.origMeter={type:"specified",value:[{num:"4",den:"4"}]};this.hasMainTitle=false;this.default_length=0.125;this.clef={type:"treble",verticalPos:0};this.next_note_duration=0;this.start_new_line=true;this.is_in_header=true;this.is_in_history=false;this.partForNextLine="";this.havent_set_length=true;this.voices={};this.staves=[];this.macros={};this.currBarNumber=1;this.inTextBlock=false;this.inPsBlock=false;this.ignoredDecorations=[];this.textBlock="";this.score_is_present=false;this.inEnding=false;this.inTie=false;this.inTieChord={}}};var A=function(B){if(!z.warnings){z.warnings=[]}z.warnings.push(B)};var c=function(C){var B=window.ABCJS.parse.gsub(C,"\x12"," ");B=window.ABCJS.parse.gsub(B,"&","&amp;");B=window.ABCJS.parse.gsub(B,"<","&lt;");return window.ABCJS.parse.gsub(B,">","&gt;")};var y=function(F,B,E){var D=B.charAt(E);if(D===" "){D="SPACE"}var C=c(B.substring(0,E))+'<span style="text-decoration:underline;font-size:1.3em;font-weight:bold;">'+D+"</span>"+c(B.substring(E+1));A("Music Line:"+f.getNumLines()+":"+(E+1)+": "+F+":  "+C)};var v=new window.ABCJS.parse.ParseHeader(o,y,z,f);this.getWarnings=function(){return z.warnings};var u=function(D,E){if(D.charAt(E)==='"'){var F=o.getBrackettedSubstring(D,E,5);if(!F[2]){y("Missing the closing quote while parsing the chord symbol",D,E)}if(F[0]>0&&F[1].length>0&&F[1].charAt(0)==="^"){F[1]=F[1].substring(1);F[2]="above"}else{if(F[0]>0&&F[1].length>0&&F[1].charAt(0)==="_"){F[1]=F[1].substring(1);F[2]="below"}else{if(F[0]>0&&F[1].length>0&&F[1].charAt(0)==="<"){F[1]=F[1].substring(1);F[2]="left"}else{if(F[0]>0&&F[1].length>0&&F[1].charAt(0)===">"){F[1]=F[1].substring(1);F[2]="right"}else{if(F[0]>0&&F[1].length>0&&F[1].charAt(0)==="@"){F[1]=F[1].substring(1);var B=o.getFloat(F[1]);if(B.digits===0){y("Missing first position in absolutely positioned annotation.",D,E)}F[1]=F[1].substring(B.digits);if(F[1][0]!==","){y("Missing comma absolutely positioned annotation.",D,E)}F[1]=F[1].substring(1);var G=o.getFloat(F[1]);if(G.digits===0){y("Missing second position in absolutely positioned annotation.",D,E)}F[1]=F[1].substring(G.digits);var C=o.skipWhiteSpace(F[1]);F[1]=F[1].substring(C);F[2]=null;F[3]={x:B.value,y:G.value}}else{F[1]=F[1].replace(/([ABCDEFG])b/g,"$1♭");F[1]=F[1].replace(/([ABCDEFG])#/g,"$1♯");F[2]="default"}}}}}return F}return[0,""]};var q=["trill","lowermordent","uppermordent","mordent","pralltriller","accent","fermata","invertedfermata","tenuto","0","1","2","3","4","5","+","wedge","open","thumb","snap","turn","roll","breath","shortphrase","mediumphrase","longphrase","segno","coda","D.S.","D.C.","fine","crescendo(","crescendo)","diminuendo(","diminuendo)","p","pp","f","ff","mf","mp","ppp","pppp","fff","ffff","sfz","repeatbar","repeatbar2","slide","upbow","downbow","/","//","///","////","trem1","trem2","trem3","trem4","turnx","invertedturn","invertedturnx","trill(","trill)","arpeggio","xstem","mark","umarcato","style=normal","style=harmonic","style=rhythm","style=x"];var t=[["<","accent"],[">","accent"],["tr","trill"],["<(","crescendo("],["<)","crescendo)"],[">(","diminuendo("],[">)","diminuendo)"],["plus","+"],["emphasis","accent"]];var i=function(B,D){var E=z.macros[B.charAt(D)];if(E!==undefined){if(E.charAt(0)==="!"||E.charAt(0)==="+"){E=E.substring(1)}if(E.charAt(E.length-1)==="!"||E.charAt(E.length-1)==="+"){E=E.substring(0,E.length-1)}if(window.ABCJS.parse.detect(q,function(F){return(E===F)})){return[1,E]}else{if(!window.ABCJS.parse.detect(z.ignoredDecorations,function(F){return(E===F)})){y("Unknown macro: "+E,B,D)}return[1,""]}}switch(B.charAt(D)){case".":return[1,"staccato"];
case"u":return[1,"upbow"];case"v":return[1,"downbow"];case"~":return[1,"irishroll"];case"!":case"+":var C=o.getBrackettedSubstring(B,D,5);if(C[1].length>0&&(C[1].charAt(0)==="^"||C[1].charAt(0)==="_")){C[1]=C[1].substring(1)}if(window.ABCJS.parse.detect(q,function(F){return(C[1]===F)})){return C}if(window.ABCJS.parse.detect(t,function(F){if(C[1]===F[0]){C[1]=F[1];return true}else{return false}})){return C}if(B.charAt(D)==="!"&&(C[0]===1||B.charAt(D+C[0]-1)!=="!")){return[1,null]}y("Unknown decoration: "+C[1],B,D);C[1]="";return C;case"H":return[1,"fermata"];case"J":return[1,"slide"];case"L":return[1,"accent"];case"M":return[1,"mordent"];case"O":return[1,"coda"];case"P":return[1,"pralltriller"];case"R":return[1,"roll"];case"S":return[1,"segno"];case"T":return[1,"trill"]}return[0,0]};var e=function(B,C){var D=C;while(o.isWhiteSpace(B.charAt(C))){C++}return[C-D]};var s=function(D,G){var E=o.getBarLine(D,G);if(E.len===0){return[0,""]}if(E.warn){y(E.warn,D,G);return[E.len,""]}for(var C=0;C<D.length;C++){if(D.charAt(G+E.len+C)!==" "){break}}var H=E.len;if(D.charAt(G+E.len+C)==="["){E.len+=C+1}if(D.charAt(G+E.len)==='"'&&D.charAt(G+E.len-1)==="["){var B=o.getBrackettedSubstring(D,G+E.len,5);return[E.len+B[0],E.token,B[1]]}var F=o.getTokenOf(D.substring(G+E.len),"1234567890-,");if(F.len===0||F.token[0]==="-"){return[H,E.token]}return[E.len+F.len,E.token,F.token]};var p=function(B,D){var C={};var E=D;while(B.charAt(D)==="("||o.isWhiteSpace(B.charAt(D))){if(B.charAt(D)==="("){if(D+1<B.length&&(B.charAt(D+1)>="2"&&B.charAt(D+1)<="9")){if(C.triplet!==undefined){y("Can't nest triplets",B,D)}else{C.triplet=B.charAt(D+1)-"0";if(D+2<B.length&&B.charAt(D+2)===":"){if(D+3<B.length&&B.charAt(D+3)===":"){if(D+4<B.length&&(B.charAt(D+4)>="1"&&B.charAt(D+4)<="9")){C.num_notes=B.charAt(D+4)-"0";D+=3}else{y("expected number after the two colons after the triplet to mark the duration",B,D)}}else{if(D+3<B.length&&(B.charAt(D+3)>="1"&&B.charAt(D+3)<="9")){if(D+4<B.length&&B.charAt(D+4)===":"){if(D+5<B.length&&(B.charAt(D+5)>="1"&&B.charAt(D+5)<="9")){C.num_notes=B.charAt(D+5)-"0";D+=4}}else{C.num_notes=C.triplet;D+=3}}else{y("expected number after the triplet to mark the duration",B,D)}}}}D++}else{if(C.startSlur===undefined){C.startSlur=1}else{C.startSlur++}}}D++}C.consumed=D-E;return C};var n=function(C,I){if(!C){y("Can't add words before the first line of mulsic",C,0);return}I=window.ABCJS.parse.strip(I);if(I.charAt(I.length-1)!=="-"){I=I+" "}var H=[];var G=0;var E=false;var B=function(J){var K=window.ABCJS.parse.strip(I.substring(G,J));G=J+1;if(K.length>0){if(E){K=window.ABCJS.parse.gsub(K,"~"," ")}var L=I.charAt(J);if(L!=="_"&&L!=="-"){L=" "}H.push({syllable:o.translateString(K),divider:L});E=false;return true}return false};for(var D=0;D<I.length;D++){switch(I.charAt(D)){case" ":case"\x12":B(D);break;case"-":if(!B(D)&&H.length>0){window.ABCJS.parse.last(H).divider="-";H.push({skip:true,to:"next"})}break;case"_":B(D);H.push({skip:true,to:"slur"});break;case"*":B(D);H.push({skip:true,to:"next"});break;case"|":B(D);H.push({skip:true,to:"bar"});break;case"~":E=true;break}}var F=false;window.ABCJS.parse.each(C,function(K){if(H.length!==0){if(H[0].skip){switch(H[0].to){case"next":if(K.el_type==="note"&&K.pitches!==null&&!F){H.shift()}break;case"slur":if(K.el_type==="note"&&K.pitches!==null){H.shift()}break;case"bar":if(K.el_type==="bar"){H.shift()}break}}else{if(K.el_type==="note"&&K.rest===undefined&&!F){var J=H.shift();if(K.lyric===undefined){K.lyric=[J]}else{K.lyric.push(J)}}}}})};var d=function(C,I){if(!C){y("Can't add symbols before the first line of mulsic",C,0);return}I=window.ABCJS.parse.strip(I);if(I.charAt(I.length-1)!=="-"){I=I+" "}var H=[];var G=0;var E=false;var B=function(J){var K=window.ABCJS.parse.strip(I.substring(G,J));G=J+1;if(K.length>0){if(E){K=window.ABCJS.parse.gsub(K,"~"," ")}var L=I.charAt(J);if(L!=="_"&&L!=="-"){L=" "}H.push({syllable:o.translateString(K),divider:L});E=false;return true}return false};for(var D=0;D<I.length;D++){switch(I.charAt(D)){case" ":case"\x12":B(D);break;case"-":if(!B(D)&&H.length>0){window.ABCJS.parse.last(H).divider="-";H.push({skip:true,to:"next"})}break;case"_":B(D);H.push({skip:true,to:"slur"});break;case"*":B(D);H.push({skip:true,to:"next"});break;case"|":B(D);H.push({skip:true,to:"bar"});break;case"~":E=true;break}}var F=false;window.ABCJS.parse.each(C,function(K){if(H.length!==0){if(H[0].skip){switch(H[0].to){case"next":if(K.el_type==="note"&&K.pitches!==null&&!F){H.shift()}break;case"slur":if(K.el_type==="note"&&K.pitches!==null){H.shift()}break;case"bar":if(K.el_type==="bar"){H.shift()}break}}else{if(K.el_type==="note"&&K.rest===undefined&&!F){var J=H.shift();if(K.lyric===undefined){K.lyric=[J]}else{K.lyric.push(J)}}}}})};var b=function(B,C){switch(B.charAt(C)){case">":if(C<B.length-1&&B.charAt(C+1)===">"){return[2,1.75,0.25]}else{return[1,1.5,0.5]}break;case"<":if(C<B.length-1&&B.charAt(C+1)==="<"){return[2,0.25,1.75]}else{return[1,0.5,1.5]}break}return null};var g=function(B){if(B.duration!==undefined&&B.duration<0.25){B.end_beam=true}return B};var k={A:5,B:6,C:0,D:1,E:2,F:3,G:4,a:12,b:13,c:7,d:8,e:9,f:10,g:11};var a={x:"invisible",y:"spacer",z:"rest",Z:"multimeasure"};var j=function(K,H,D,B){var I=function(L){return(L==="octave"||L==="duration"||L==="Zduration"||L==="broken_rhythm"||L==="end_slur")};var C="startSlur";var E=false;while(1){switch(K.charAt(H)){case"(":if(C==="startSlur"){if(D.startSlur===undefined){D.startSlur=1}else{D.startSlur++}}else{if(I(C)){D.endChar=H;return D}else{return null}}break;case")":if(I(C)){if(D.endSlur===undefined){D.endSlur=1}else{D.endSlur++}}else{return null}break;case"^":if(C==="startSlur"){D.accidental="sharp";C="sharp2"}else{if(C==="sharp2"){D.accidental="dblsharp";C="pitch"}else{if(I(C)){D.endChar=H;return D}else{return null}}}break;case"_":if(C==="startSlur"){D.accidental="flat";C="flat2"}else{if(C==="flat2"){D.accidental="dblflat";C="pitch"}else{if(I(C)){D.endChar=H;return D}else{return null}}}break;case"=":if(C==="startSlur"){D.accidental="natural";C="pitch"}else{if(I(C)){D.endChar=H;return D}else{return null}}break;case"A":case"B":case"C":case"D":case"E":case"F":case"G":case"a":case"b":case"c":case"d":case"e":case"f":case"g":if(C==="startSlur"||C==="sharp2"||C==="flat2"||C==="pitch"){D.pitch=k[K.charAt(H)];C="octave";if(B&&z.next_note_duration!==0){D.duration=z.next_note_duration;z.next_note_duration=0;E=true}else{D.duration=z.default_length}}else{if(I(C)){D.endChar=H;return D}else{return null}}break;case",":if(C==="octave"){D.pitch-=7}else{if(I(C)){D.endChar=H;return D}else{return null}}break;case"'":if(C==="octave"){D.pitch+=7}else{if(I(C)){D.endChar=H;return D}else{return null}}break;case"x":case"y":case"z":case"Z":if(C==="startSlur"){D.rest={type:a[K.charAt(H)]};delete D.accidental;delete D.startSlur;delete D.startTie;delete D.endSlur;delete D.endTie;delete D.end_beam;delete D.grace_notes;if(D.rest.type==="multimeasure"){D.duration=1;C="Zduration"}else{if(B&&z.next_note_duration!==0){D.duration=z.next_note_duration;
z.next_note_duration=0;E=true}else{D.duration=z.default_length}C="duration"}}else{if(I(C)){D.endChar=H;return D}else{return null}}break;case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":case"9":case"0":case"/":if(C==="octave"||C==="duration"){var J=o.getFraction(K,H);if(!E){D.duration=D.duration*J.value}D.endChar=J.index;while(J.index<K.length&&(o.isWhiteSpace(K.charAt(J.index))||K.charAt(J.index)==="-")){if(K.charAt(J.index)==="-"){D.startTie={}}else{D=g(D)}J.index++}H=J.index-1;C="broken_rhythm"}else{if(C==="sharp2"){D.accidental="quartersharp";C="pitch"}else{if(C==="flat2"){D.accidental="quarterflat";C="pitch"}else{if(C==="Zduration"){var G=o.getNumber(K,H);D.duration=G.num;D.endChar=G.index;return D}else{return null}}}}break;case"-":if(C==="startSlur"){f.addTieToLastNote();D.endTie=true}else{if(C==="octave"||C==="duration"||C==="end_slur"){D.startTie={};if(!E&&B){C="broken_rhythm"}else{if(o.isWhiteSpace(K.charAt(H+1))){g(D)}D.endChar=H+1;return D}}else{if(C==="broken_rhythm"){D.endChar=H;return D}else{return null}}}break;case" ":case"\t":if(I(C)){D.end_beam=true;do{if(K.charAt(H)==="-"){D.startTie={}}H++}while(H<K.length&&(o.isWhiteSpace(K.charAt(H))||K.charAt(H)==="-"));D.endChar=H;if(!E&&B&&(K.charAt(H)==="<"||K.charAt(H)===">")){H--;C="broken_rhythm"}else{return D}}else{return null}break;case">":case"<":if(I(C)){if(B){var F=b(K,H);H+=F[0]-1;z.next_note_duration=F[2]*D.duration;D.duration=F[1]*D.duration;C="end_slur"}else{D.endChar=H;return D}}else{return null}break;default:if(I(C)){D.endChar=H;return D}return null}H++;if(H===K.length){if(I(C)){D.endChar=H;return D}else{return null}}}return null};function w(){var C={startChar:-1,endChar:-1};if(z.partForNextLine.length){C.part=z.partForNextLine}C.clef=z.currentVoice&&z.staves[z.currentVoice.staffNum].clef!==undefined?window.ABCJS.parse.clone(z.staves[z.currentVoice.staffNum].clef):window.ABCJS.parse.clone(z.clef);C.key=window.ABCJS.parse.parseKeyVoice.deepCopyKey(z.key);window.ABCJS.parse.parseKeyVoice.addPosToKey(C.clef,C.key);if(z.meter!==null){if(z.currentVoice){window.ABCJS.parse.each(z.staves,function(D){D.meter=z.meter});C.meter=z.staves[z.currentVoice.staffNum].meter;z.staves[z.currentVoice.staffNum].meter=null}else{C.meter=z.meter}z.meter=null}else{if(z.currentVoice&&z.staves[z.currentVoice.staffNum].meter){C.meter=z.staves[z.currentVoice.staffNum].meter;z.staves[z.currentVoice.staffNum].meter=null}}if(z.currentVoice&&z.currentVoice.name){C.name=z.currentVoice.name}if(z.vocalfont){C.vocalfont=z.vocalfont}if(z.style){C.style=z.style}if(z.currentVoice){var B=z.staves[z.currentVoice.staffNum];if(B.brace){C.brace=B.brace}if(B.bracket){C.bracket=B.bracket}if(B.connectBarLines){C.connectBarLines=B.connectBarLines}if(B.name){C.name=B.name[z.currentVoice.index]}if(B.subname){C.subname=B.subname[z.currentVoice.index]}if(z.currentVoice.stem){C.stem=z.currentVoice.stem}if(z.currentVoice.scale){C.scale=z.currentVoice.scale}if(z.currentVoice.style){C.style=z.currentVoice.style}}f.startNewLine(C);z.partForNextLine="";if(z.currentVoice===undefined||(z.currentVoice.staffNum===z.staves.length-1&&z.staves[z.currentVoice.staffNum].numVoices-1===z.currentVoice.index)){if(z.barNumbers===0){z.barNumOnNextNote=z.currBarNumber}}}var x=function(C,E){if(C.charAt(E)==="{"){var D=o.getBrackettedSubstring(C,E,1,"}");if(!D[2]){y("Missing the closing '}' while parsing grace note",C,E)}if(C[E+D[0]]===")"){D[0]++;D[1]+=")"}var B=[];var G=0;var H=false;while(G<D[1].length){var I=false;if(D[1].charAt(G)==="/"){I=true;G++}var F=j(D[1],G,{},false);if(F!==null){if(I){F.acciaccatura=true}B.push(F);if(H){F.endTie=true;H=false}if(F.startTie){H=true}G=F.endChar;delete F.endChar}else{if(D[1].charAt(G)===" "){if(B.length>0){B[B.length-1].end_beam=true}}else{y("Unknown character '"+D[1].charAt(G)+"' while parsing grace note",C,E)}G++}}if(B.length){return[D[0],B]}}return[0]};function h(B){var C=B.origMeter;if(!C||C.type!=="specified"){return 1}if(!C.value||C.value.length===0){return 1}return parseInt(C.value[0].num,10)/parseInt(C.value[0].den,10)}var r="ABCDEFGabcdefgxyzZ[]|^_{";var m=function(L){v.resolveTempo();z.is_in_header=false;var S=0;var R=z.iChar;while(o.isWhiteSpace(L.charAt(S))&&S<L.length){S++}if(S===L.length||L.charAt(S)==="%"){return}var V=z.start_new_line;if(z.continueall===undefined){z.start_new_line=true}else{z.start_new_line=false}var I=0;var O=v.letter_to_body_header(L,S);if(O[0]>0){S+=O[0]}var D={};while(S<L.length){var E=S;if(L.charAt(S)==="%"){break}var C=v.letter_to_inline_header(L,S);if(C[0]>0){S+=C[0]}else{if(V){w();V=false}var X;while(1){X=o.eatWhiteSpace(L,S);if(X>0){S+=X}if(S>0&&L.charAt(S-1)==="\x12"){X=v.letter_to_body_header(L,S);if(X[0]>0){S=X[0];z.start_new_line=false}}X=e(L,S);if(X[0]>0){S+=X[0]}X=u(L,S);if(X[0]>0){if(!D.chord){D.chord=[]}var H=o.translateString(X[1]);H=H.replace(/;/g,"\n");var G=false;for(var M=0;M<D.chord.length;M++){if(D.chord[M].position===X[2]){G=true;D.chord[M].name+="\n"+H}}if(G===false){if(X[2]===null&&X[3]){D.chord.push({name:H,rel_position:X[3]})}else{D.chord.push({name:H,position:X[2]})}}S+=X[0];var N=o.skipWhiteSpace(L.substring(S));if(N>0){D.force_end_beam_last=true}S+=N}else{if(r.indexOf(L.charAt(S))===-1){X=i(L,S)}else{X=[0]}if(X[0]>0){if(X[1]===null){if(S+1<L.length){w()}}else{if(X[1].length>0){if(D.decoration===undefined){D.decoration=[]}D.decoration.push(X[1])}}S+=X[0]}else{X=x(L,S);if(X[0]>0){D.gracenotes=X[1];S+=X[0]}else{break}}}}X=s(L,S);if(X[0]>0){if(D.gracenotes!==undefined){D.rest={type:"spacer"};D.duration=0.125;f.appendElement("note",R+S,R+S+X[0],D);z.measureNotEmpty=true;D={}}var U={type:X[1]};if(U.type.length===0){y("Unknown bar type",L,S)}else{if(z.inEnding&&U.type!=="bar_thin"){U.endEnding=true;z.inEnding=false}if(X[2]){U.startEnding=X[2];if(z.inEnding){U.endEnding=true}z.inEnding=true}if(D.decoration!==undefined){U.decoration=D.decoration}if(D.chord!==undefined){U.chord=D.chord}if(U.startEnding&&z.barFirstEndingNum===undefined){z.barFirstEndingNum=z.currBarNumber}else{if(U.startEnding&&U.endEnding&&z.barFirstEndingNum){z.currBarNumber=z.barFirstEndingNum}else{if(U.endEnding){z.barFirstEndingNum=undefined}}}if(U.type!=="bar_invisible"&&z.measureNotEmpty){z.currBarNumber++;if(z.barNumbers&&z.currBarNumber%z.barNumbers===0){z.barNumOnNextNote=z.currBarNumber}}f.appendElement("bar",R+S,R+S+X[0],U);z.measureNotEmpty=false;D={}}S+=X[0]}else{if(L[S]==="&"){y("Overlay not yet supported",L,S);S++}else{X=p(L,S);if(X.consumed>0){if(X.startSlur!==undefined){D.startSlur=X.startSlur}if(X.triplet!==undefined){if(I>0){y("Can't nest triplets",L,S)}else{D.startTriplet=X.triplet;I=X.num_notes===undefined?X.triplet:X.num_notes}}S+=X.consumed}if(L.charAt(S)==="["){S++;var B=null;var Q=false;while(!Q){var K=j(L,S,{},false);if(K!==null){if(K.end_beam){D.end_beam=true;delete K.end_beam}if(D.pitches===undefined){D.duration=K.duration;D.pitches=[K]}else{D.pitches.push(K)}delete K.duration;if(z.inTieChord[D.pitches.length]){K.endTie=true;z.inTieChord[D.pitches.length]=undefined}if(K.startTie){z.inTieChord[D.pitches.length]=true
}S=K.endChar;delete K.endChar}else{if(L.charAt(S)===" "){y("Spaces are not allowed in chords",L,S);S++}else{if(S<L.length&&L.charAt(S)==="]"){S++;if(z.next_note_duration!==0){D.duration=D.duration*z.next_note_duration;z.next_note_duration=0}if(z.inTie){window.ABCJS.parse.each(D.pitches,function(Y){Y.endTie=true});z.inTie=false}if(I>0){I--;if(I===0){D.endTriplet=true}}var J=false;while(S<L.length&&!J){switch(L.charAt(S)){case" ":case"\t":g(D);break;case")":if(D.endSlur===undefined){D.endSlur=1}else{D.endSlur++}break;case"-":window.ABCJS.parse.each(D.pitches,function(Y){Y.startTie={}});z.inTie=true;break;case">":case"<":var W=b(L,S);S+=W[0]-1;z.next_note_duration=W[2];B=W[1];break;case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":case"9":case"/":var F=o.getFraction(L,S);B=F.value;S=F.index;if(L.charAt(S)==="-"||L.charAt(S)===")"){S--}else{J=true}break;default:J=true;break}if(!J){S++}}}else{y("Expected ']' to end the chords",L,S)}if(D.pitches!==undefined){if(B!==null){D.duration=D.duration*B}if(z.barNumOnNextNote){D.barNumber=z.barNumOnNextNote;z.barNumOnNextNote=null}f.appendElement("note",R+S,R+S,D);z.measureNotEmpty=true;D={}}Q=true}}}}else{var P={};var T=j(L,S,P,true);if(P.endTie!==undefined){z.inTie=true}if(T!==null){if(T.pitch!==undefined){D.pitches=[{}];if(T.accidental!==undefined){D.pitches[0].accidental=T.accidental}D.pitches[0].pitch=T.pitch;if(T.endSlur!==undefined){D.pitches[0].endSlur=T.endSlur}if(T.endTie!==undefined){D.pitches[0].endTie=T.endTie}if(T.startSlur!==undefined){D.pitches[0].startSlur=T.startSlur}if(D.startSlur!==undefined){D.pitches[0].startSlur=D.startSlur}if(T.startTie!==undefined){D.pitches[0].startTie=T.startTie}if(D.startTie!==undefined){D.pitches[0].startTie=D.startTie}}else{D.rest=T.rest;if(T.endSlur!==undefined){D.endSlur=T.endSlur}if(T.endTie!==undefined){D.rest.endTie=T.endTie}if(T.startSlur!==undefined){D.startSlur=T.startSlur}if(T.startTie!==undefined){D.rest.startTie=T.startTie}if(D.startTie!==undefined){D.rest.startTie=D.startTie}}if(T.chord!==undefined){D.chord=T.chord}if(T.duration!==undefined){D.duration=T.duration}if(T.decoration!==undefined){D.decoration=T.decoration}if(T.graceNotes!==undefined){D.graceNotes=T.graceNotes}delete D.startSlur;if(z.inTie){if(D.pitches!==undefined){D.pitches[0].endTie=true}else{D.rest.endTie=true}z.inTie=false}if(T.startTie||D.startTie){z.inTie=true}S=T.endChar;if(I>0){I--;if(I===0){D.endTriplet=true}}if(T.end_beam){g(D)}if(D.rest&&D.rest.type==="rest"&&D.duration===1){D.rest.type="whole";D.duration=h(z)}if(z.barNumOnNextNote){D.barNumber=z.barNumOnNextNote;z.barNumOnNextNote=null}f.appendElement("note",R+E,R+S,D);z.measureNotEmpty=true;D={}}}if(S===E){if(L.charAt(S)!==" "&&L.charAt(S)!=="`"){y("Unknown character ignored",L,S)}S++}}}}}};var l=function(B){var C=v.parseHeader(B);if(C.regular){m(C.str)}if(C.newline&&z.continueall===undefined){w()}if(C.words){n(f.getCurrentVoice(),B.substring(2))}if(C.symbols){d(f.getCurrentVoice(),B.substring(2))}if(C.recurse){l(C.str)}};this.parse=function(H,F){f.reset();if(F&&F.print){f.media="print"}z.reset();v.reset(o,y,z,f);H=window.ABCJS.parse.gsub(H,"\r\n","\n");H=window.ABCJS.parse.gsub(H,"\r","\n");H+="\n";H=H.replace(/\n\\.*\n/g,"\n");var D=function(K,M,N){var J="                                                                                                                                                                                                     ";var L=N?J.substring(0,N.length):"";return M+" \x12"+L};H=H.replace(/\\([ \t]*)(%.*)*\n/g,D);var C=H.split("\n");if(window.ABCJS.parse.last(C).length===0){C.pop()}try{window.ABCJS.parse.each(C,function(J){if(F){if(F.header_only&&z.is_in_header===false){throw"normal_abort"}if(F.stop_on_warning&&z.warnings){throw"normal_abort"}}if(z.is_in_history){if(J.charAt(1)===":"){z.is_in_history=false;l(J)}else{f.addMetaText("history",o.translateString(o.stripComment(J)))}}else{if(z.inTextBlock){if(window.ABCJS.parse.startsWith(J,"%%endtext")){f.addText(z.textBlock);z.inTextBlock=false}else{if(window.ABCJS.parse.startsWith(J,"%%")){z.textBlock+=" "+J.substring(2)}else{z.textBlock+=" "+J}}}else{if(z.inPsBlock){if(window.ABCJS.parse.startsWith(J,"%%endps")){z.inPsBlock=false}else{z.textBlock+=" "+J}}else{l(J)}}}z.iChar+=J.length+1});var I=11*72;var E=8.5*72;switch(z.papersize){case"legal":I=14*72;E=8.5*72;break;case"A4":I=11.7*72;E=8.3*72;break}if(z.landscape){var B=I;I=E;E=B}f.cleanUp(E,I,z.barsperstaff,z.staffnonote)}catch(G){if(G!=="normal_abort"){throw G}}}};if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.parse){window.ABCJS.parse={}}window.ABCJS.parse.parseDirective={};(function(){var b;var d;var a;var c;window.ABCJS.parse.parseDirective.initialize=function(h,f,g,e){b=h;d=f;a=g;c=e};window.ABCJS.parse.parseDirective.parseFontChangeLine=function(g){var e=g.split("$");if(e.length>1&&a.setfont){var h=[{text:e[0]}];for(var f=1;f<e.length;f++){if(e[f].charAt(0)==="0"){h.push({text:e[f].substring(1)})}else{if(e[f].charAt(0)==="1"&&a.setfont[1]){h.push({font:a.setfont[1],text:e[f].substring(1)})}else{if(e[f].charAt(0)==="2"&&a.setfont[2]){h.push({font:a.setfont[2],text:e[f].substring(1)})}else{if(e[f].charAt(0)==="3"&&a.setfont[3]){h.push({font:a.setfont[3],text:e[f].substring(1)})}else{if(e[f].charAt(0)==="4"&&a.setfont[4]){h.push({font:a.setfont[4],text:e[f].substring(1)})}else{h[h.length-1].text+="$"+e[f]}}}}}}if(h.length>1){return h}}return g};window.ABCJS.parse.parseDirective.addDirective=function(O){var X=function(t,ai){var p=b.getMeasurement(ai);if(p.used===0||ai.length!==0){return{error:'Directive "'+t+'" requires a measurement as a parameter.'}}return p.value};var T=function(t,ai){var p=b.getMeasurement(ai);if(p.used===0||ai.length!==0){return'Directive "'+t+'" requires a measurement as a parameter.'}c.formatting[t]=p.value;return null};var D=function(aj){var p={};var t=window.ABCJS.parse.last(aj);if(t.type==="number"){p.size=parseInt(t.token);aj.pop()}if(aj.length>0){var ai="";window.ABCJS.parse.each(aj,function(ak){if(ak.token!=="-"){if(ai.length>0){ai+=" "}ai+=ak.token}});p.font=ai}return p};var k=function(p,t){if(t.length===0){return'Directive "'+p+'" requires a font as a parameter.'}a[p]=D(t);return null};var r=function(p,t){if(t.length===0){return'Directive "'+p+'" requires a font as a parameter.'}c.formatting[p]=D(t);return null};var g=function(aj,ak,al,ai,p){if(al.length!==1||al[0].type!=="number"){return'Directive "'+ak+'" requires a number as a parameter.'}var t=al[0].intt;if(ai!==undefined&&t<ai){return'Directive "'+ak+'" requires a number greater than or equal to '+ai+" as a parameter."}if(p!==undefined&&t>p){return'Directive "'+ak+'" requires a number less than or equal to '+p+" as a parameter."}a[aj]=t;return null};var G=function(p,t,ai){var aj=g(p,t,ai,0,1);if(aj!==null){return aj}a[p]=(a[p]===1);return null};var M=b.tokenize(O,0,O.length);if(M.length===0||M[0].type!=="alpha"){return null}var f=O.substring(O.indexOf(M[0].token)+M[0].token.length);f=b.stripComment(f);var ab=M.shift().token.toLowerCase();
var ae;var j="";switch(ab){case"bagpipes":c.formatting.bagpipes=true;break;case"landscape":a.landscape=true;break;case"papersize":a.papersize=f;break;case"slurgraces":c.formatting.slurgraces=true;break;case"stretchlast":c.formatting.stretchlast=true;break;case"titlecaps":a.titlecaps=true;break;case"titleleft":c.formatting.titleleft=true;break;case"measurebox":c.formatting.measurebox=true;break;case"botmargin":case"botspace":case"composerspace":case"indent":case"leftmargin":case"linesep":case"musicspace":case"partsspace":case"pageheight":case"pagewidth":case"rightmargin":case"staffsep":case"staffwidth":case"subtitlespace":case"sysstaffsep":case"systemsep":case"textspace":case"titlespace":case"topmargin":case"topspace":case"vocalspace":case"wordsspace":return T(ab,M);case"vskip":var i=X(ab,M);if(i.error){return i.error}c.addSpacing(i);return null;case"scale":j="";window.ABCJS.parse.each(M,function(p){j+=p.token});ae=parseFloat(j);if(isNaN(ae)||ae===0){return'Directive "'+ab+'" requires a number as a parameter.'}c.formatting.scale=ae;break;case"sep":if(M.length===0){c.addSeparator()}else{var S=b.getMeasurement(M);if(S.used===0){return'Directive "'+ab+'" requires 3 numbers: space above, space below, length of line'}var L=S.value;S=b.getMeasurement(M);if(S.used===0){return'Directive "'+ab+'" requires 3 numbers: space above, space below, length of line'}var ah=S.value;S=b.getMeasurement(M);if(S.used===0||M.length!==0){return'Directive "'+ab+'" requires 3 numbers: space above, space below, length of line'}var C=S.value;c.addSeparator(L,ah,C)}break;case"barsperstaff":j=g("barsperstaff",ab,M);if(j!==null){return j}break;case"staffnonote":j=G("staffnonote",ab,M);if(j!==null){return j}break;case"printtempo":j=G("printTempo",ab,M);if(j!==null){return j}break;case"measurenb":case"barnumbers":j=g("barNumbers",ab,M);if(j!==null){return j}break;case"begintext":a.inTextBlock=true;break;case"continueall":a.continueall=true;break;case"beginps":a.inPsBlock=true;d("Postscript ignored",O,0);break;case"deco":if(f.length>0){a.ignoredDecorations.push(f.substring(0,f.indexOf(" ")))}d("Decoration redefinition ignored",O,0);break;case"text":var Y=b.translateString(f);c.addText(window.ABCJS.parse.parseDirective.parseFontChangeLine(Y));break;case"center":var e=b.translateString(f);c.addCentered(window.ABCJS.parse.parseDirective.parseFontChangeLine(e));break;case"font":break;case"setfont":var z=b.tokenize(f,0,f.length);var I=false;if(z.length>=4){if(z[0].token==="-"&&z[1].type==="number"){var h=parseInt(z[1].token);if(h>=1&&h<=4){if(!a.setfont){a.setfont=[]}var F=z.pop();if(F.type==="number"){F=parseInt(F.token);var v="";for(var x=2;x<z.length;x++){v+=z[x].token}a.setfont[h]={font:v,size:F};I=true}}}}if(!I){return"Bad parameters: "+ab}break;case"gchordfont":case"partsfont":case"vocalfont":case"textfont":return k(ab,M);case"barlabelfont":case"barnumberfont":case"composerfont":case"subtitlefont":case"tempofont":case"titlefont":case"voicefont":return r(ab,M);case"barnumfont":return r("barnumberfont",M);case"staves":case"score":a.score_is_present=true;var ag=function(al,ai,ak,aj,t){if(ai||a.staves.length===0){a.staves.push({index:a.staves.length,numVoices:0})}var p=window.ABCJS.parse.last(a.staves);if(ak!==undefined){p.bracket=ak}if(aj!==undefined){p.brace=aj}if(t){p.connectBarLines="end"}if(a.voices[al]===undefined){a.voices[al]={staffNum:p.index,index:p.numVoices};p.numVoices++}};var Q=false;var aa=false;var o=false;var R=false;var m=false;var q=false;var n=false;var u;var af=function(){n=true;if(u){var p="start";if(u.staffNum>0){if(a.staves[u.staffNum-1].connectBarLines==="start"||a.staves[u.staffNum-1].connectBarLines==="continue"){p="continue"}}a.staves[u.staffNum].connectBarLines=p}};while(M.length){var V=M.shift();switch(V.token){case"(":if(Q){d("Can't nest parenthesis in %%score",O,V.start)}else{Q=true;R=true}break;case")":if(!Q||R){d("Unexpected close parenthesis in %%score",O,V.start)}else{Q=false}break;case"[":if(aa){d("Can't nest brackets in %%score",O,V.start)}else{aa=true;m=true}break;case"]":if(!aa||m){d("Unexpected close bracket in %%score",O,V.start)}else{aa=false;a.staves[u.staffNum].bracket="end"}break;case"{":if(o){d("Can't nest braces in %%score",O,V.start)}else{o=true;q=true}break;case"}":if(!o||q){d("Unexpected close brace in %%score",O,V.start)}else{o=false;a.staves[u.staffNum].brace="end"}break;case"|":af();break;default:var E="";while(V.type==="alpha"||V.type==="number"){E+=V.token;if(V.continueId){V=M.shift()}else{break}}var K=!Q||R;var N=m?"start":aa?"continue":undefined;var B=q?"start":o?"continue":undefined;ag(E,K,N,B,n);R=false;m=false;q=false;n=false;u=a.voices[E];if(ab==="staves"){af()}break}}break;case"newpage":var w=b.getInt(f);c.addNewPage(w.digits===0?-1:w.value);break;case"abc":var A=f.split(" ");switch(A[0]){case"-copyright":case"-creator":case"-edited-by":case"-version":case"-charset":var l=A.shift();c.addMetaText(ab+l,A.join(" "));break;default:return"Unknown directive: "+ab+A[0]}break;case"header":case"footer":var U=b.getMeat(f,0,f.length);U=f.substring(U.start,U.end);if(U.charAt(0)==='"'&&U.charAt(U.length-1)==='"'){U=U.substring(1,U.length-2)}var H=U.split("\t");var s={};if(H.length===1){s={left:"",center:H[0],right:""}}else{if(H.length===2){s={left:H[0],center:H[1],right:""}}else{s={left:H[0],center:H[1],right:H[2]}}}if(H.length>3){d("Too many tabs in "+ab+": "+H.length+" found.",f,0)}c.addMetaTextObj(ab,s);break;case"midi":var Z=b.tokenize(f,0,f.length);if(Z.length>0&&Z[0].token==="="){Z.shift()}if(Z.length===0){d("Expected midi command",f,0)}else{var y=function(ai){if(ai.length>0){var aj=ai.shift();var ak=aj.token;if(aj.type==="number"){ak=aj.intt}return ak}else{return null}};if(c.formatting[ab]===undefined){c.formatting[ab]={}}var J=Z.shift().token;var P=true;if(J==="program"){var ad=y(Z);if(ad){var ac=y(Z);if(ac){P={channel:ad,program:ac}}else{P={program:ad}}}}else{var W=y(Z);if(W!==null){P=W}}c.formatting[ab][J]=P}break;case"playtempo":case"auquality":case"continuous":case"nobarcheck":c.formatting[ab]=f;break;default:return"Unknown directive: "+ab}return null}})();if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.parse){window.ABCJS.parse={}}window.ABCJS.parse.ParseHeader=function(c,e,a,d){this.reset=function(g,i,f,h){window.ABCJS.parse.parseKeyVoice.initialize(g,i,f,h);window.ABCJS.parse.parseDirective.initialize(g,i,f,h)};this.reset(c,e,a,d);this.setTitle=function(f){if(a.hasMainTitle){d.addSubtitle(c.translateString(c.stripComment(f)))}else{d.addMetaText("title",c.translateString(c.theReverser(c.stripComment(f))));a.hasMainTitle=true}};this.setMeter=function(n){n=c.stripComment(n);if(n==="C"){if(a.havent_set_length===true){a.default_length=0.125}return{type:"common_time"}}else{if(n==="C|"){if(a.havent_set_length===true){a.default_length=0.125}return{type:"cut_time"}}else{if(n==="o"){if(a.havent_set_length===true){a.default_length=0.125}return{type:"tempus_perfectum"}}else{if(n==="c"){if(a.havent_set_length===true){a.default_length=0.125}return{type:"tempus_imperfectum"}
}else{if(n==="o."){if(a.havent_set_length===true){a.default_length=0.125}return{type:"tempus_perfectum_prolatio"}}else{if(n==="c."){if(a.havent_set_length===true){a.default_length=0.125}return{type:"tempus_imperfectum_prolatio"}}else{if(n.length===0||n.toLowerCase()==="none"){if(a.havent_set_length===true){a.default_length=0.125}return null}else{var k=c.tokenize(n,0,n.length);try{var j=function(){var p={value:0,num:""};var o=k.shift();if(o.token==="("){o=k.shift()}while(1){if(o.type!=="number"){throw"Expected top number of meter"}p.value+=parseInt(o.token);p.num+=o.token;if(k.length===0||k[0].token==="/"){return p}o=k.shift();if(o.token===")"){if(k.length===0||k[0].token==="/"){return p}throw"Unexpected paren in meter"}if(o.token!=="."&&o.token!=="+"){throw"Expected top number of meter"}p.num+=o.token;if(k.length===0){throw"Expected top number of meter"}o=k.shift()}return p};var f=function(){var p=j();if(k.length===0){return p}var o=k.shift();if(o.token!=="/"){throw"Expected slash in meter"}o=k.shift();if(o.type!=="number"){throw"Expected bottom number of meter"}p.den=o.token;p.value=p.value/parseInt(p.den);return p};if(k.length===0){throw"Expected meter definition in M: line"}var g={type:"specified",value:[]};var l=0;while(1){var i=f();l+=i.value;var m={num:i.num};if(i.den!==undefined){m.den=i.den}g.value.push(m);if(k.length===0){break}}if(a.havent_set_length===true){a.default_length=l<0.75?0.0625:0.125}return g}catch(h){e(h,n,0)}}}}}}}}return null};this.calcTempo=function(f){var h=1/4;if(a.meter&&a.meter.type==="specified"){h=1/parseInt(a.meter.value[0].den)}else{if(a.origMeter&&a.origMeter.type==="specified"){h=1/parseInt(a.origMeter.value[0].den)}}for(var g=0;g<f.duration;g++){f.duration[g]=h*f.duration[g]}return f};this.resolveTempo=function(){if(a.tempo){this.calcTempo(a.tempo);d.metaText.tempo=a.tempo;delete a.tempo}};this.addUserDefinition=function(g,l,f){var h=g.indexOf("=",l);if(h===-1){e("Need an = in a macro definition",g,l);return}var j=window.ABCJS.parse.strip(g.substring(l,h));var k=window.ABCJS.parse.strip(g.substring(h+1));if(j.length!==1){e("Macro definitions can only be one character",g,l);return}var i="HIJKLMNOPQRSTUVWXYhijklmnopqrstuvw~";if(i.indexOf(j)===-1){e("Macro definitions must be H-Y, h-w, or tilde",g,l);return}if(k.length===0){e("Missing macro definition",g,l);return}if(a.macros===undefined){a.macros={}}a.macros[j]=k};this.setDefaultLength=function(h,l,g){var f=window.ABCJS.parse.gsub(h.substring(l,g)," ","");var k=f.split("/");if(k.length===2){var j=parseInt(k[0]);var i=parseInt(k[1]);if(i>0){a.default_length=j/i;a.havent_set_length=false}}};this.setTempo=function(o,f,i){try{var l=c.tokenize(o,f,i);if(l.length===0){throw"Missing parameter in Q: field"}var j={};var n=true;var h=l.shift();if(h.type==="quote"){j.preString=h.token;h=l.shift();if(l.length===0){return{type:"immediate",tempo:j}}}if(h.type==="alpha"&&h.token==="C"){if(l.length===0){throw"Missing tempo after C in Q: field"}h=l.shift();if(h.type==="punct"&&h.token==="="){if(l.length===0){throw"Missing tempo after = in Q: field"}h=l.shift();if(h.type!=="number"){throw"Expected number after = in Q: field"}j.duration=[1];j.bpm=parseInt(h.token)}else{if(h.type==="number"){j.duration=[parseInt(h.token)];if(l.length===0){throw"Missing = after duration in Q: field"}h=l.shift();if(h.type!=="punct"||h.token!=="="){throw"Expected = after duration in Q: field"}if(l.length===0){throw"Missing tempo after = in Q: field"}h=l.shift();if(h.type!=="number"){throw"Expected number after = in Q: field"}j.bpm=parseInt(h.token)}else{throw"Expected number or equal after C in Q: field"}}}else{if(h.type==="number"){var k=parseInt(h.token);if(l.length===0||l[0].type==="quote"){j.duration=[1];j.bpm=k}else{n=false;h=l.shift();if(h.type!=="punct"&&h.token!=="/"){throw"Expected fraction in Q: field"}h=l.shift();if(h.type!=="number"){throw"Expected fraction in Q: field"}var m=parseInt(h.token);j.duration=[k/m];while(l.length>0&&l[0].token!=="="&&l[0].type!=="quote"){h=l.shift();if(h.type!=="number"){throw"Expected fraction in Q: field"}k=parseInt(h.token);h=l.shift();if(h.type!=="punct"&&h.token!=="/"){throw"Expected fraction in Q: field"}h=l.shift();if(h.type!=="number"){throw"Expected fraction in Q: field"}m=parseInt(h.token);j.duration.push(k/m)}h=l.shift();if(h.type!=="punct"&&h.token!=="="){throw"Expected = in Q: field"}h=l.shift();if(h.type!=="number"){throw"Expected tempo in Q: field"}j.bpm=parseInt(h.token)}}else{throw"Unknown value in Q: field"}}if(l.length!==0){h=l.shift();if(h.type==="quote"){j.postString=h.token;h=l.shift()}if(l.length!==0){throw"Unexpected string at end of Q: field"}}if(a.printTempo===false){j.suppress=true}return{type:n?"delaySet":"immediate",tempo:j}}catch(g){e(g,o,f);return{type:"none"}}};this.letter_to_inline_header=function(h,k){var g=c.eatWhiteSpace(h,k);k+=g;if(h.length>=k+5&&h.charAt(k)==="["&&h.charAt(k+2)===":"){var n=h.indexOf("]",k);switch(h.substring(k,k+3)){case"[I:":var l=window.ABCJS.parse.parseDirective.addDirective(h.substring(k+3,n));if(l){e(l,h,k)}return[n-k+1+g];case"[M:":var m=this.setMeter(h.substring(k+3,n));if(d.hasBeginMusic()&&m){d.appendStartingElement("meter",-1,-1,m)}else{a.meter=m}return[n-k+1+g];case"[K:":var f=window.ABCJS.parse.parseKeyVoice.parseKey(h.substring(k+3,n));if(f.foundClef&&d.hasBeginMusic()){d.appendStartingElement("clef",-1,-1,a.clef)}if(f.foundKey&&d.hasBeginMusic()){d.appendStartingElement("key",-1,-1,window.ABCJS.parse.parseKeyVoice.fixKey(a.clef,a.key))}return[n-k+1+g];case"[P:":d.appendElement("part",-1,-1,{title:h.substring(k+3,n)});return[n-k+1+g];case"[L:":this.setDefaultLength(h,k+3,n);return[n-k+1+g];case"[Q:":if(n>0){var j=this.setTempo(h,k+3,n);if(j.type==="delaySet"){d.appendElement("tempo",-1,-1,this.calcTempo(j.tempo))}else{if(j.type==="immediate"){d.appendElement("tempo",-1,-1,j.tempo)}}return[n-k+1+g,h.charAt(k+1),h.substring(k+3,n)]}break;case"[V:":if(n>0){window.ABCJS.parse.parseKeyVoice.parseVoice(h,k+3,n);return[n-k+1+g,h.charAt(k+1),h.substring(k+3,n)]}break;default:}}return[0]};this.letter_to_body_header=function(g,j){if(g.length>=j+3){switch(g.substring(j,j+2)){case"I:":var k=window.ABCJS.parse.parseDirective.addDirective(g.substring(j+2));if(k){e(k,g,j)}return[g.length];case"M:":var l=this.setMeter(g.substring(j+2));if(d.hasBeginMusic()&&l){d.appendStartingElement("meter",-1,-1,l)}return[g.length];case"K:":var f=window.ABCJS.parse.parseKeyVoice.parseKey(g.substring(j+2));if(f.foundClef&&d.hasBeginMusic()){d.appendStartingElement("clef",-1,-1,a.clef)}if(f.foundKey&&d.hasBeginMusic()){d.appendStartingElement("key",-1,-1,window.ABCJS.parse.parseKeyVoice.fixKey(a.clef,a.key))}return[g.length];case"P:":if(d.hasBeginMusic()){d.appendElement("part",-1,-1,{title:g.substring(j+2)})}return[g.length];case"L:":this.setDefaultLength(g,j+2,g.length);return[g.length];case"Q:":var m=g.indexOf("\x12",j+2);if(m===-1){m=g.length}var h=this.setTempo(g,j+2,m);if(h.type==="delaySet"){d.appendElement("tempo",-1,-1,this.calcTempo(h.tempo))
}else{if(h.type==="immediate"){d.appendElement("tempo",-1,-1,h.tempo)}}return[m,g.charAt(j),window.ABCJS.parse.strip(g.substring(j+2))];case"V:":window.ABCJS.parse.parseKeyVoice.parseVoice(g,2,g.length);return[g.length,g.charAt(j),window.ABCJS.parse(g.substring(j+2))];default:}}return[0]};var b={A:"author",B:"book",C:"composer",D:"discography",F:"url",G:"group",I:"instruction",N:"notes",O:"origin",R:"rhythm",S:"source",W:"unalignedWords",Z:"transcription"};this.parseHeader=function(g){if(window.ABCJS.parse.startsWith(g,"%%")){var l=window.ABCJS.parse.parseDirective.addDirective(g.substring(2));if(l){e(l,g,2)}return{}}var j=g.indexOf("%");if(j>=0){g=g.substring(0,j)}g=g.replace(/\s+$/,"");if(g.length===0){return{}}if(g.length>=2){if(g.charAt(1)===":"){var k="";if(g.indexOf("\x12")>=0&&g.charAt(0)!=="w"){k=g.substring(g.indexOf("\x12")+1);g=g.substring(0,g.indexOf("\x12"))}var m=b[g.charAt(0)];if(m!==undefined){if(m==="unalignedWords"){d.addMetaTextArray(m,window.ABCJS.parse.parseDirective.parseFontChangeLine(c.translateString(c.stripComment(g.substring(2)))))}else{d.addMetaText(m,c.translateString(c.stripComment(g.substring(2))))}return{}}else{switch(g.charAt(0)){case"H":d.addMetaText("history",c.translateString(c.stripComment(g.substring(2))));a.is_in_history=true;break;case"K":this.resolveTempo();var f=window.ABCJS.parse.parseKeyVoice.parseKey(g.substring(2));if(!a.is_in_header&&d.hasBeginMusic()){if(f.foundClef){d.appendStartingElement("clef",-1,-1,a.clef)}if(f.foundKey){d.appendStartingElement("key",-1,-1,window.ABCJS.parse.parseKeyVoice.fixKey(a.clef,a.key))}}a.is_in_header=false;break;case"L":this.setDefaultLength(g,2,g.length);break;case"M":a.origMeter=a.meter=this.setMeter(g.substring(2));break;case"P":if(a.is_in_header){d.addMetaText("partOrder",c.translateString(c.stripComment(g.substring(2))))}else{a.partForNextLine=c.translateString(c.stripComment(g.substring(2)))}break;case"Q":var h=this.setTempo(g,2,g.length);if(h.type==="delaySet"){a.tempo=h.tempo}else{if(h.type==="immediate"){d.metaText.tempo=h.tempo}}break;case"T":this.setTitle(g.substring(2));break;case"U":this.addUserDefinition(g,2,g.length);break;case"V":window.ABCJS.parse.parseKeyVoice.parseVoice(g,2,g.length);if(!a.is_in_header){return{newline:true}}break;case"s":return{symbols:true};case"w":return{words:true};case"X":break;case"E":case"m":e("Ignored header",g,0);break;default:if(k.length){k="\x12"+k}return{regular:true,str:g+k}}}if(k.length>0){return{recurse:true,str:k}}return{}}}return{regular:true,str:g}}};if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.parse){window.ABCJS.parse={}}window.ABCJS.parse.parseKeyVoice={};(function(){var i;var f;var b;var e;window.ABCJS.parse.parseKeyVoice.initialize=function(n,l,m,k){i=n;f=l;b=m;e=k};window.ABCJS.parse.parseKeyVoice.standardKey=function(x){var n={acc:"sharp",note:"f"};var s={acc:"sharp",note:"c"};var w={acc:"sharp",note:"g"};var l={acc:"sharp",note:"d"};var q={acc:"sharp",note:"A"};var v={acc:"sharp",note:"e"};var z={acc:"sharp",note:"B"};var u={acc:"flat",note:"B"};var t={acc:"flat",note:"e"};var r={acc:"flat",note:"A"};var p={acc:"flat",note:"d"};var o={acc:"flat",note:"G"};var m={acc:"flat",note:"c"};var k={acc:"flat",note:"F"};var y={"C#":[n,s,w,l,q,v,z],"A#m":[n,s,w,l,q,v,z],"G#Mix":[n,s,w,l,q,v,z],"D#Dor":[n,s,w,l,q,v,z],"E#Phr":[n,s,w,l,q,v,z],"F#Lyd":[n,s,w,l,q,v,z],"B#Loc":[n,s,w,l,q,v,z],"F#":[n,s,w,l,q,v],"D#m":[n,s,w,l,q,v],"C#Mix":[n,s,w,l,q,v],"G#Dor":[n,s,w,l,q,v],"A#Phr":[n,s,w,l,q,v],BLyd:[n,s,w,l,q,v],"E#Loc":[n,s,w,l,q,v],B:[n,s,w,l,q],"G#m":[n,s,w,l,q],"F#Mix":[n,s,w,l,q],"C#Dor":[n,s,w,l,q],"D#Phr":[n,s,w,l,q],ELyd:[n,s,w,l,q],"A#Loc":[n,s,w,l,q],E:[n,s,w,l],"C#m":[n,s,w,l],BMix:[n,s,w,l],"F#Dor":[n,s,w,l],"G#Phr":[n,s,w,l],ALyd:[n,s,w,l],"D#Loc":[n,s,w,l],A:[n,s,w],"F#m":[n,s,w],EMix:[n,s,w],BDor:[n,s,w],"C#Phr":[n,s,w],DLyd:[n,s,w],"G#Loc":[n,s,w],D:[n,s],Bm:[n,s],AMix:[n,s],EDor:[n,s],"F#Phr":[n,s],GLyd:[n,s],"C#Loc":[n,s],G:[n],Em:[n],DMix:[n],ADor:[n],BPhr:[n],CLyd:[n],"F#Loc":[n],C:[],Am:[],GMix:[],DDor:[],EPhr:[],FLyd:[],BLoc:[],F:[u],Dm:[u],CMix:[u],GDor:[u],APhr:[u],BbLyd:[u],ELoc:[u],Bb:[u,t],Gm:[u,t],FMix:[u,t],CDor:[u,t],DPhr:[u,t],EbLyd:[u,t],ALoc:[u,t],Eb:[u,t,r],Cm:[u,t,r],BbMix:[u,t,r],FDor:[u,t,r],GPhr:[u,t,r],AbLyd:[u,t,r],DLoc:[u,t,r],Ab:[u,t,r,p],Fm:[u,t,r,p],EbMix:[u,t,r,p],BbDor:[u,t,r,p],CPhr:[u,t,r,p],DbLyd:[u,t,r,p],GLoc:[u,t,r,p],Db:[u,t,r,p,o],Bbm:[u,t,r,p,o],AbMix:[u,t,r,p,o],EbDor:[u,t,r,p,o],FPhr:[u,t,r,p,o],GbLyd:[u,t,r,p,o],CLoc:[u,t,r,p,o],Gb:[u,t,r,p,o,m],Ebm:[u,t,r,p,o,m],DbMix:[u,t,r,p,o,m],AbDor:[u,t,r,p,o,m],BbPhr:[u,t,r,p,o,m],CbLyd:[u,t,r,p,o,m],FLoc:[u,t,r,p,o,m],Cb:[u,t,r,p,o,m,k],Abm:[u,t,r,p,o,m,k],GbMix:[u,t,r,p,o,m,k],DbDor:[u,t,r,p,o,m,k],EbPhr:[u,t,r,p,o,m,k],FbLyd:[u,t,r,p,o,m,k],BbLoc:[u,t,r,p,o,m,k],"A#":[u,t],"B#":[],"D#":[u,t,r],"E#":[u],"G#":[u,t,r,p],Gbm:[n,s,w,l,q,v,z]};return y[x]};var c={treble:{clef:"treble",pitch:4,mid:0},"treble+8":{clef:"treble+8",pitch:4,mid:0},"treble-8":{clef:"treble-8",pitch:4,mid:0},treble1:{clef:"treble",pitch:2,mid:2},treble2:{clef:"treble",pitch:4,mid:0},treble3:{clef:"treble",pitch:6,mid:-2},treble4:{clef:"treble",pitch:8,mid:-4},treble5:{clef:"treble",pitch:10,mid:-6},perc:{clef:"perc",pitch:6,mid:0},none:{clef:"none",mid:0},bass:{clef:"bass",pitch:8,mid:-12},"bass+8":{clef:"bass+8",pitch:8,mid:-12},"bass-8":{clef:"bass-8",pitch:8,mid:-12},"bass+16":{clef:"bass",pitch:8,mid:-12},"bass-16":{clef:"bass",pitch:8,mid:-12},bass1:{clef:"bass",pitch:2,mid:-6},bass2:{clef:"bass",pitch:4,mid:-8},bass3:{clef:"bass",pitch:6,mid:-10},bass4:{clef:"bass",pitch:8,mid:-12},bass5:{clef:"bass",pitch:10,mid:-14},tenor:{clef:"alto",pitch:8,mid:-8},tenor1:{clef:"alto",pitch:2,mid:-2},tenor2:{clef:"alto",pitch:4,mid:-4},tenor3:{clef:"alto",pitch:6,mid:-6},tenor4:{clef:"alto",pitch:8,mid:-8},tenor5:{clef:"alto",pitch:10,mid:-10},alto:{clef:"alto",pitch:6,mid:-6},alto1:{clef:"alto",pitch:2,mid:-2},alto2:{clef:"alto",pitch:4,mid:-4},alto3:{clef:"alto",pitch:6,mid:-6},alto4:{clef:"alto",pitch:8,mid:-8},alto5:{clef:"alto",pitch:10,mid:-10},"alto+8":{clef:"alto+8",pitch:6,mid:-6},"alto-8":{clef:"alto-8",pitch:6,mid:-6}};var j=function(n,k){var m=c[n];var l=m?m.mid:0;return l+k};window.ABCJS.parse.parseKeyVoice.fixClef=function(l){var k=c[l.type];if(k){l.clefPos=k.pitch;l.type=k.clef}};window.ABCJS.parse.parseKeyVoice.deepCopyKey=function(l){var k={accidentals:[],root:l.root,acc:l.acc,mode:l.mode};window.ABCJS.parse.each(l.accidentals,function(m){k.accidentals.push(window.ABCJS.parse.clone(m))});return k};var d={A:5,B:6,C:0,D:1,E:2,F:3,G:4,a:12,b:13,c:7,d:8,e:9,f:10,g:11};window.ABCJS.parse.parseKeyVoice.addPosToKey=function(m,l){var k=m.verticalPos;window.ABCJS.parse.each(l.accidentals,function(n){var o=d[n.note];o=o-k;n.verticalPos=o});if(l.impliedNaturals){window.ABCJS.parse.each(l.impliedNaturals,function(n){var o=d[n.note];o=o-k;n.verticalPos=o})}if(k<-10){window.ABCJS.parse.each(l.accidentals,function(n){n.verticalPos-=7;if(n.verticalPos>=11||(n.verticalPos===10&&n.acc==="flat")){n.verticalPos-=7
}if(n.note==="A"&&n.acc==="sharp"){n.verticalPos-=7}if((n.note==="G"||n.note==="F")&&n.acc==="flat"){n.verticalPos-=7}});if(l.impliedNaturals){window.ABCJS.parse.each(l.impliedNaturals,function(n){n.verticalPos-=7;if(n.verticalPos>=11||(n.verticalPos===10&&n.acc==="flat")){n.verticalPos-=7}if(n.note==="A"&&n.acc==="sharp"){n.verticalPos-=7}if((n.note==="G"||n.note==="F")&&n.acc==="flat"){n.verticalPos-=7}})}}else{if(k<-4){window.ABCJS.parse.each(l.accidentals,function(n){n.verticalPos-=7;if(k===-8&&(n.note==="f"||n.note==="g")&&n.acc==="sharp"){n.verticalPos-=7}});if(l.impliedNaturals){window.ABCJS.parse.each(l.impliedNaturals,function(n){n.verticalPos-=7;if(k===-8&&(n.note==="f"||n.note==="g")&&n.acc==="sharp"){n.verticalPos-=7}})}}else{if(k>=7){window.ABCJS.parse.each(l.accidentals,function(n){n.verticalPos+=7});if(l.impliedNaturals){window.ABCJS.parse.each(l.impliedNaturals,function(n){n.verticalPos+=7})}}}}};window.ABCJS.parse.parseKeyVoice.fixKey=function(m,k){var l=window.ABCJS.parse.clone(k);window.ABCJS.parse.parseKeyVoice.addPosToKey(m,l);return l};var a=function(m){var k=d[m.charAt(0)];for(var l=1;l<m.length;l++){if(m.charAt(l)===","){k-=7}else{if(m.charAt(l)===","){k+=7}else{break}}}return{mid:k-6,str:m.substring(l)}};var h=function(k){for(var l=0;l<k.length;l++){if(k[l].note==="b"){k[l].note="B"}else{if(k[l].note==="a"){k[l].note="A"}else{if(k[l].note==="F"){k[l].note="f"}else{if(k[l].note==="E"){k[l].note="e"}else{if(k[l].note==="D"){k[l].note="d"}else{if(k[l].note==="C"){k[l].note="c"}else{if(k[l].note==="G"&&k[l].acc==="sharp"){k[l].note="g"}else{if(k[l].note==="g"&&k[l].acc==="flat"){k[l].note="G"}}}}}}}}}};window.ABCJS.parse.parseKeyVoice.parseKey=function(x){if(x.length===0){x="none"}var w=i.tokenize(x,0,x.length);var D={};switch(w[0].token){case"HP":window.ABCJS.parse.parseDirective.addDirective("bagpipes");b.key={root:"HP",accidentals:[],acc:"",mode:""};D.foundKey=true;w.shift();break;case"Hp":window.ABCJS.parse.parseDirective.addDirective("bagpipes");b.key={root:"Hp",accidentals:[{acc:"natural",note:"g"},{acc:"sharp",note:"f"},{acc:"sharp",note:"c"}],acc:"",mode:""};D.foundKey=true;w.shift();break;case"none":b.key={root:"none",accidentals:[],acc:"",mode:""};D.foundKey=true;w.shift();break;default:var p=i.getKeyPitch(w[0].token);if(p.len>0){D.foundKey=true;var n="";var v="";if(w[0].token.length>1){w[0].token=w[0].token.substring(1)}else{w.shift()}var E=p.token;if(w.length>0){var l=i.getSharpFlat(w[0].token);if(l.len>0){if(w[0].token.length>1){w[0].token=w[0].token.substring(1)}else{w.shift()}E+=l.token;n=l.token}if(w.length>0){var C=i.getMode(w[0].token);if(C.len>0){w.shift();E+=C.token;v=C.token}}}var s=window.ABCJS.parse.parseKeyVoice.deepCopyKey(b.key);b.key=window.ABCJS.parse.parseKeyVoice.deepCopyKey({accidentals:window.ABCJS.parse.parseKeyVoice.standardKey(E)});b.key.root=p.token;b.key.acc=n;b.key.mode=v;if(s){var m;for(var z=0;z<b.key.accidentals.length;z++){for(m=0;m<s.accidentals.length;m++){if(s.accidentals[m].note&&b.key.accidentals[z].note.toLowerCase()===s.accidentals[m].note.toLowerCase()){s.accidentals[m].note=null}}}for(m=0;m<s.accidentals.length;m++){if(s.accidentals[m].note){if(!b.key.impliedNaturals){b.key.impliedNaturals=[]}b.key.impliedNaturals.push({acc:"natural",note:s.accidentals[m].note})}}}}break}if(w.length===0){return D}if(w[0].token==="exp"){w.shift()}if(w.length===0){return D}if(w[0].token==="oct"){w.shift()}if(w.length===0){return D}var t=i.getKeyAccidentals2(w);if(t.warn){f(t.warn,x,0)}if(t.accs){if(!D.foundKey){D.foundKey=true;b.key={root:"none",acc:"",mode:"",accidentals:[]}}h(t.accs);for(var B=0;B<t.accs.length;B++){var u=false;for(var A=0;A<b.key.accidentals.length&&!u;A++){if(b.key.accidentals[A].note===t.accs[B].note){u=true;b.key.accidentals[A].acc=t.accs[B].acc}}if(!u){b.key.accidentals.push(t.accs[B]);if(b.key.impliedNaturals){for(var q=0;q<b.key.impliedNaturals.length;q++){if(b.key.impliedNaturals[q].note===t.accs[B].note){b.key.impliedNaturals.splice(q,1)}}}}}}var o;while(w.length>0){switch(w[0].token){case"m":case"middle":w.shift();if(w.length===0){f("Expected = after middle",x,0);return D}o=w.shift();if(o.token!=="="){f("Expected = after middle",x,o.start);break}if(w.length===0){f("Expected parameter after middle=",x,0);return D}var r=i.getPitchFromTokens(w);if(r.warn){f(r.warn,x,0)}if(r.position){b.clef.verticalPos=r.position-6}break;case"transpose":w.shift();if(w.length===0){f("Expected = after transpose",x,0);return D}o=w.shift();if(o.token!=="="){f("Expected = after transpose",x,o.start);break}if(w.length===0){f("Expected parameter after transpose=",x,0);return D}if(w[0].type!=="number"){f("Expected number after transpose",x,w[0].start);break}b.clef.transpose=w[0].intt;w.shift();break;case"stafflines":w.shift();if(w.length===0){f("Expected = after stafflines",x,0);return D}o=w.shift();if(o.token!=="="){f("Expected = after stafflines",x,o.start);break}if(w.length===0){f("Expected parameter after stafflines=",x,0);return D}if(w[0].type!=="number"){f("Expected number after stafflines",x,w[0].start);break}b.clef.stafflines=w[0].intt;w.shift();break;case"staffscale":w.shift();if(w.length===0){f("Expected = after staffscale",x,0);return D}o=w.shift();if(o.token!=="="){f("Expected = after staffscale",x,o.start);break}if(w.length===0){f("Expected parameter after staffscale=",x,0);return D}if(w[0].type!=="number"){f("Expected number after staffscale",x,w[0].start);break}b.clef.staffscale=w[0].floatt;w.shift();break;case"style":w.shift();if(w.length===0){f("Expected = after style",x,0);return D}o=w.shift();if(o.token!=="="){f("Expected = after style",x,o.start);break}if(w.length===0){f("Expected parameter after style=",x,0);return D}switch(w[0].token){case"normal":case"harmonic":case"rhythm":case"x":b.style=w[0].token;w.shift();break;default:f("error parsing style element: "+w[0].token,x,w[0].start);break}break;case"clef":w.shift();if(w.length===0){f("Expected = after clef",x,0);return D}o=w.shift();if(o.token!=="="){f("Expected = after clef",x,o.start);break}if(w.length===0){f("Expected parameter after clef=",x,0);return D}case"treble":case"bass":case"alto":case"tenor":case"perc":var y=w.shift();switch(y.token){case"treble":case"tenor":case"alto":case"bass":case"perc":case"none":break;case"C":y.token="alto";break;case"F":y.token="bass";break;case"G":y.token="treble";break;case"c":y.token="alto";break;case"f":y.token="bass";break;case"g":y.token="treble";break;default:f("Expected clef name. Found "+y.token,x,y.start);break}if(w.length>0&&w[0].type==="number"){y.token+=w[0].token;w.shift()}if(w.length>1&&(w[0].token==="-"||w[0].token==="+")&&w[1].token==="8"){y.token+=w[0].token+w[1].token;w.shift();w.shift()}b.clef={type:y.token,verticalPos:j(y.token,0)};D.foundClef=true;break;default:f("Unknown parameter: "+w[0].token,x,w[0].start);w.shift()}}return D};var g=function(k){b.currentVoice=b.voices[k];e.setCurrentVoice(b.currentVoice.staffNum,b.currentVoice.index)};window.ABCJS.parse.parseKeyVoice.parseVoice=function(n,x,y){var C=i.getMeat(n,x,y);
var l=C.start;var k=C.end;var r=i.getToken(n,l,k);if(r.length===0){f("Expected a voice id",n,l);return}var A=false;if(b.voices[r]===undefined){b.voices[r]={};A=true;if(b.score_is_present){f("Can't have an unknown V: id when the %score directive is present",n,l)}}l+=r.length;l+=i.eatWhiteSpace(n,l);var p={startStaff:A};var D=function(v){var s=i.getVoiceToken(n,l,k);if(s.warn!==undefined){f("Expected value for "+v+" in voice: "+s.warn,n,l)}else{if(s.token.length===0&&n.charAt(l)!=='"'){f("Expected value for "+v+" in voice",n,l)}else{p[v]=s.token}}l+=s.len};var z=function(F,v,E){var s=i.getVoiceToken(n,l,k);if(s.warn!==undefined){f("Expected value for "+v+" in voice: "+s.warn,n,l)}else{if(s.token.length===0&&n.charAt(l)!=='"'){f("Expected value for "+v+" in voice",n,l)}else{if(E==="number"){s.token=parseFloat(s.token)}b.voices[F][v]=s.token}}l+=s.len};while(l<k){var m=i.getVoiceToken(n,l,k);l+=m.len;if(m.warn){f("Error parsing voice: "+m.warn,n,l)}else{var u=null;switch(m.token){case"clef":case"cl":D("clef");var t=0;if(p.clef!==undefined){p.clef=p.clef.replace(/[',]/g,"");if(p.clef.indexOf("+16")!==-1){t+=14;p.clef=p.clef.replace("+16","")}p.verticalPos=j(p.clef,t)}break;case"treble":case"bass":case"tenor":case"alto":case"none":case"treble'":case"bass'":case"tenor'":case"alto'":case"none'":case"treble''":case"bass''":case"tenor''":case"alto''":case"none''":case"treble,":case"bass,":case"tenor,":case"alto,":case"none,":case"treble,,":case"bass,,":case"tenor,,":case"alto,,":case"none,,":var w=0;p.clef=m.token.replace(/[',]/g,"");p.verticalPos=j(p.clef,w);break;case"staves":case"stave":case"stv":D("staves");break;case"brace":case"brc":D("brace");break;case"bracket":case"brk":D("bracket");break;case"name":case"nm":D("name");break;case"subname":case"sname":case"snm":D("subname");break;case"merge":p.startStaff=false;break;case"stems":u=i.getVoiceToken(n,l,k);if(u.warn!==undefined){f("Expected value for stems in voice: "+u.warn,n,l)}else{if(u.token==="up"||u.token==="down"){b.voices[r].stem=u.token}else{f("Expected up or down for voice stem",n,l)}}l+=u.len;break;case"up":case"down":b.voices[r].stem=m.token;break;case"middle":case"m":D("verticalPos");p.verticalPos=a(p.verticalPos).mid;break;case"gchords":case"gch":b.voices[r].suppressChords=true;break;case"space":case"spc":D("spacing");break;case"scale":z(r,"scale","number");break;case"transpose":z(r,"transpose","number");break}}l+=i.eatWhiteSpace(n,l)}if(p.startStaff||b.staves.length===0){b.staves.push({index:b.staves.length,meter:b.origMeter});if(!b.score_is_present){b.staves[b.staves.length-1].numVoices=0}}if(b.voices[r].staffNum===undefined){b.voices[r].staffNum=b.staves.length-1;var B=0;for(var o in b.voices){if(b.voices.hasOwnProperty(o)){if(b.voices[o].staffNum===b.voices[r].staffNum){B++}}}b.voices[r].index=B-1}var q=b.staves[b.voices[r].staffNum];if(!b.score_is_present){q.numVoices++}if(p.clef){q.clef={type:p.clef,verticalPos:p.verticalPos}}if(p.spacing){q.spacing_below_offset=p.spacing}if(p.verticalPos){q.verticalPos=p.verticalPos}if(p.name){if(q.name){q.name.push(p.name)}else{q.name=[p.name]}}if(p.subname){if(q.subname){q.subname.push(p.subname)}else{q.subname=[p.subname]}}g(r)}})();if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.parse){window.ABCJS.parse={}}window.ABCJS.parse.tokenizer=function(){this.skipWhiteSpace=function(j){for(var h=0;h<j.length;h++){if(!this.isWhiteSpace(j.charAt(h))){return h}}return j.length};var g=function(j,h){return h>=j.length};this.eatWhiteSpace=function(h,j){for(var k=j;k<h.length;k++){if(!this.isWhiteSpace(h.charAt(k))){return k-j}}return k-j};this.getKeyPitch=function(j){var h=this.skipWhiteSpace(j);if(g(j,h)){return{len:0}}switch(j.charAt(h)){case"A":return{len:h+1,token:"A"};case"B":return{len:h+1,token:"B"};case"C":return{len:h+1,token:"C"};case"D":return{len:h+1,token:"D"};case"E":return{len:h+1,token:"E"};case"F":return{len:h+1,token:"F"};case"G":return{len:h+1,token:"G"}}return{len:0}};this.getSharpFlat=function(h){if(h==="bass"){return{len:0}}switch(h.charAt(0)){case"#":return{len:1,token:"#"};case"b":return{len:1,token:"b"}}return{len:0}};this.getMode=function(l){var k=function(i,m){while(m<i.length&&((i.charAt(m)>="a"&&i.charAt(m)<="z")||(i.charAt(m)>="A"&&i.charAt(m)<="Z"))){m++}return m};var j=this.skipWhiteSpace(l);if(g(l,j)){return{len:0}}var h=l.substring(j,j+3).toLowerCase();if(h.length>1&&h.charAt(1)===" "||h.charAt(1)==="^"||h.charAt(1)==="_"||h.charAt(1)==="="){h=h.charAt(0)}switch(h){case"mix":return{len:k(l,j),token:"Mix"};case"dor":return{len:k(l,j),token:"Dor"};case"phr":return{len:k(l,j),token:"Phr"};case"lyd":return{len:k(l,j),token:"Lyd"};case"loc":return{len:k(l,j),token:"Loc"};case"aeo":return{len:k(l,j),token:"m"};case"maj":return{len:k(l,j),token:""};case"ion":return{len:k(l,j),token:""};case"min":return{len:k(l,j),token:"m"};case"m":return{len:k(l,j),token:"m"}}return{len:0}};this.getClef=function(o,n){var h=o;var m=this.skipWhiteSpace(o);if(g(o,m)){return{len:0}}var q=false;var p=o.substring(m);if(window.ABCJS.parse.startsWith(p,"clef=")){q=true;p=p.substring(5);m+=5}if(p.length===0&&q){return{len:m+5,warn:"No clef specified: "+h}}var l=this.skipWhiteSpace(p);if(g(p,l)){return{len:0}}if(l>0){m+=l;p=p.substring(l)}var k=null;if(window.ABCJS.parse.startsWith(p,"treble")){k="treble"}else{if(window.ABCJS.parse.startsWith(p,"bass3")){k="bass3"}else{if(window.ABCJS.parse.startsWith(p,"bass")){k="bass"}else{if(window.ABCJS.parse.startsWith(p,"tenor")){k="tenor"}else{if(window.ABCJS.parse.startsWith(p,"alto2")){k="alto2"}else{if(window.ABCJS.parse.startsWith(p,"alto1")){k="alto1"}else{if(window.ABCJS.parse.startsWith(p,"alto")){k="alto"}else{if(!n&&(q&&window.ABCJS.parse.startsWith(p,"none"))){k="none"}else{if(window.ABCJS.parse.startsWith(p,"perc")){k="perc"}else{if(!n&&(q&&window.ABCJS.parse.startsWith(p,"C"))){k="tenor"}else{if(!n&&(q&&window.ABCJS.parse.startsWith(p,"F"))){k="bass"}else{if(!n&&(q&&window.ABCJS.parse.startsWith(p,"G"))){k="treble"}else{return{len:m+5,warn:"Unknown clef specified: "+h}}}}}}}}}}}}}p=p.substring(k.length);l=this.isMatch(p,"+8");if(l>0){k+="+8"}else{l=this.isMatch(p,"-8");if(l>0){k+="-8"}}return{len:m+k.length,token:k,explicit:q}};this.getBarLine=function(h,k){switch(h.charAt(k)){case"]":++k;switch(h.charAt(k)){case"|":return{len:2,token:"bar_thick_thin"};case"[":++k;if((h.charAt(k)>="1"&&h.charAt(k)<="9")||h.charAt(k)==='"'){return{len:2,token:"bar_invisible"}}return{len:1,warn:"Unknown bar symbol"};default:return{len:1,token:"bar_invisible"}}break;case":":++k;switch(h.charAt(k)){case":":return{len:2,token:"bar_dbl_repeat"};case"|":++k;switch(h.charAt(k)){case"]":++k;switch(h.charAt(k)){case"|":++k;if(h.charAt(k)===":"){return{len:5,token:"bar_dbl_repeat"}}return{len:3,token:"bar_right_repeat"};default:return{len:3,token:"bar_right_repeat"}}break;case"|":++k;if(h.charAt(k)===":"){return{len:4,token:"bar_dbl_repeat"}}return{len:3,token:"bar_right_repeat"};default:return{len:2,token:"bar_right_repeat"}}break;default:return{len:1,warn:"Unknown bar symbol"}
}break;case"[":++k;if(h.charAt(k)==="|"){++k;switch(h.charAt(k)){case":":return{len:3,token:"bar_left_repeat"};case"]":return{len:3,token:"bar_invisible"};default:return{len:2,token:"bar_thick_thin"}}}else{if((h.charAt(k)>="1"&&h.charAt(k)<="9")||h.charAt(k)==='"'){return{len:1,token:"bar_invisible"}}return{len:0}}break;case"|":++k;switch(h.charAt(k)){case"]":return{len:2,token:"bar_thin_thick"};case"|":++k;if(h.charAt(k)===":"){return{len:3,token:"bar_left_repeat"}}return{len:2,token:"bar_thin_thin"};case":":var j=0;while(h.charAt(k+j)===":"){j++}return{len:1+j,token:"bar_left_repeat"};default:return{len:1,token:"bar_thin"}}break}return{len:0}};this.getTokenOf=function(k,j){for(var h=0;h<k.length;h++){if(j.indexOf(k.charAt(h))<0){return{len:h,token:k.substring(0,h)}}}return{len:h,token:k}};this.getToken=function(k,l,h){var j=l;while(j<h&&!this.isWhiteSpace(k.charAt(j))){j++}return k.substring(l,j)};this.isMatch=function(k,h){var j=this.skipWhiteSpace(k);if(g(k,j)){return 0}if(window.ABCJS.parse.startsWith(k.substring(j),h)){return j+h.length}return 0};this.getPitchFromTokens=function(j){var h={};var i={A:5,B:6,C:0,D:1,E:2,F:3,G:4,a:12,b:13,c:7,d:8,e:9,f:10,g:11};h.position=i[j[0].token];if(h.position===undefined){return{warn:"Pitch expected. Found: "+j[0].token}}j.shift();while(j.length){switch(j[0].token){case",":h.position-=7;j.shift();break;case"'":h.position+=7;j.shift();break;default:return h}}return h};this.getKeyAccidentals2=function(j){var h;while(j.length>0){var i;if(j[0].token==="^"){i="sharp";j.shift();if(j.length===0){return{accs:h,warn:"Expected note name after "+i}}switch(j[0].token){case"^":i="dblsharp";j.shift();break;case"/":i="quartersharp";j.shift();break}}else{if(j[0].token==="="){i="natural";j.shift()}else{if(j[0].token==="_"){i="flat";j.shift();if(j.length===0){return{accs:h,warn:"Expected note name after "+i}}switch(j[0].token){case"_":i="dblflat";j.shift();break;case"/":i="quarterflat";j.shift();break}}else{return{accs:h}}}}if(j.length===0){return{accs:h,warn:"Expected note name after "+i}}switch(j[0].token.charAt(0)){case"a":case"b":case"c":case"d":case"e":case"f":case"g":case"A":case"B":case"C":case"D":case"E":case"F":case"G":if(h===undefined){h=[]}h.push({acc:i,note:j[0].token.charAt(0)});if(j[0].token.length===1){j.shift()}else{j[0].token=j[0].token.substring(1)}break;default:return{accs:h,warn:"Expected note name after "+i+" Found: "+j[0].token}}}return{accs:h}};this.getKeyAccidental=function(l){var k={"^":"sharp","^^":"dblsharp","=":"natural",_:"flat",__:"dblflat","_/":"quarterflat","^/":"quartersharp"};var h=this.skipWhiteSpace(l);if(g(l,h)){return{len:0}}var j=null;switch(l.charAt(h)){case"^":case"_":case"=":j=l.charAt(h);break;default:return{len:0}}h++;if(g(l,h)){return{len:1,warn:"Expected note name after accidental"}}switch(l.charAt(h)){case"a":case"b":case"c":case"d":case"e":case"f":case"g":case"A":case"B":case"C":case"D":case"E":case"F":case"G":return{len:h+1,token:{acc:k[j],note:l.charAt(h)}};case"^":case"_":case"/":j+=l.charAt(h);h++;if(g(l,h)){return{len:2,warn:"Expected note name after accidental"}}switch(l.charAt(h)){case"a":case"b":case"c":case"d":case"e":case"f":case"g":case"A":case"B":case"C":case"D":case"E":case"F":case"G":return{len:h+1,token:{acc:k[j],note:l.charAt(h)}};default:return{len:2,warn:"Expected note name after accidental"}}break;default:return{len:1,warn:"Expected note name after accidental"}}};this.isWhiteSpace=function(h){return h===" "||h==="\t"||h==="\x12"};this.getMeat=function(i,k,h){var j=i.indexOf("%",k);if(j>=0&&j<h){h=j}while(k<h&&(i.charAt(k)===" "||i.charAt(k)==="\t"||i.charAt(k)==="\x12")){k++}while(k<h&&(i.charAt(h-1)===" "||i.charAt(h-1)==="\t"||i.charAt(h-1)==="\x12")){h--}return{start:k,end:h}};var d=function(h){return(h>="A"&&h<="Z")||(h>="a"&&h<="z")};var c=function(h){return(h>="0"&&h<="9")};this.tokenize=function(r,j,k){var n=this.getMeat(r,j,k);j=n.start;k=n.end;var p=[];var l;while(j<k){if(r.charAt(j)==='"'){l=j+1;while(l<k&&r.charAt(l)!=='"'){l++}p.push({type:"quote",token:r.substring(j+1,l),start:j+1,end:l});l++}else{if(d(r.charAt(j))){l=j+1;while(l<k&&d(r.charAt(l))){l++}p.push({type:"alpha",token:r.substring(j,l),continueId:c(r.charAt(l)),start:j,end:l});j=l+1}else{if(r.charAt(j)==="."&&c(r.charAt(l+1))){l=j+1;var q=null;var m=null;while(l<k&&c(r.charAt(l))){l++}m=parseFloat(r.substring(j,l));p.push({type:"number",token:r.substring(j,l),intt:q,floatt:m,continueId:d(r.charAt(l)),start:j,end:l});j=l+1}else{if(c(r.charAt(j))||(r.charAt(j)==="-"&&c(r.charAt(l+1)))){l=j+1;var h=null;var o=null;while(l<k&&c(r.charAt(l))){l++}if(r.charAt(l)==="."&&c(r.charAt(l+1))){l++;while(l<k&&c(r.charAt(l))){l++}}else{h=parseInt(r.substring(j,l))}o=parseFloat(r.substring(j,l));p.push({type:"number",token:r.substring(j,l),intt:h,floatt:o,continueId:d(r.charAt(l)),start:j,end:l});j=l+1}else{if(r.charAt(j)===" "||r.charAt(j)==="\t"){l=j+1}else{p.push({type:"punct",token:r.charAt(j),start:j,end:j+1});l=j+1}}}}}j=l}return p};this.getVoiceToken=function(j,n,h){var k=n;while(k<h&&this.isWhiteSpace(j.charAt(k))||j.charAt(k)==="="){k++}if(j.charAt(k)==='"'){var m=j.indexOf('"',k+1);if(m===-1||m>=h){return{len:1,err:"Missing close quote"}}return{len:m-n+1,token:this.translateString(j.substring(k+1,m))}}else{var l=k;while(l<h&&!this.isWhiteSpace(j.charAt(l))&&j.charAt(l)!=="="){l++}return{len:l-n+1,token:j.substring(k,l)}}};var f={"`a":"à","'a":"á","^a":"â","~a":"ã",'"a':"ä",oa:"å","=a":"ā",ua:"ă",";a":"ą","`e":"è","'e":"é","^e":"ê",'"e':"ë","=e":"ē",ue:"ĕ",";e":"ę",".e":"ė","`i":"ì","'i":"í","^i":"î",'"i':"ï","=i":"ī",ui:"ĭ",";i":"į","`o":"ò","'o":"ó","^o":"ô","~o":"õ",'"o':"ö","=o":"ō",uo:"ŏ","/o":"ø","`u":"ù","'u":"ú","^u":"û","~u":"ũ",'"u':"ü",ou:"ů","=u":"ū",uu:"ŭ",";u":"ų","`A":"À","'A":"Á","^A":"Â","~A":"Ã",'"A':"Ä",oA:"Å","=A":"Ā",uA:"Ă",";A":"Ą","`E":"È","'E":"É","^E":"Ê",'"E':"Ë","=E":"Ē",uE:"Ĕ",";E":"Ę",".E":"Ė","`I":"Ì","'I":"Í","^I":"Î","~I":"Ĩ",'"I':"Ï","=I":"Ī",uI:"Ĭ",";I":"Į",".I":"İ","`O":"Ò","'O":"Ó","^O":"Ô","~O":"Õ",'"O':"Ö","=O":"Ō",uO:"Ŏ","/O":"Ø","`U":"Ù","'U":"Ú","^U":"Û","~U":"Ũ",'"U':"Ü",oU:"Ů","=U":"Ū",uU:"Ŭ",";U":"Ų",ae:"æ",AE:"Æ",oe:"œ",OE:"Œ",ss:"ß","'c":"ć","^c":"ĉ",uc:"č",cc:"ç",".c":"ċ",cC:"Ç","'C":"Ć","^C":"Ĉ",uC:"Č",".C":"Ċ","~n":"ñ","=s":"š",vs:"š",vz:"ž"};var e={"#":"♯",b:"♭","=":"♮"};var b={"201":"♯","202":"♭","203":"♮","241":"¡","242":"¢","252":"a","262":"2","272":"o","302":"Â","312":"Ê","322":"Ò","332":"Ú","342":"â","352":"ê","362":"ò","372":"ú","243":"£","253":"«","263":"3","273":"»","303":"Ã","313":"Ë","323":"Ó","333":"Û","343":"ã","353":"ë","363":"ó","373":"û","244":"¤","254":"¬","264":"  ́","274":"1⁄4","304":"Ä","314":"Ì","324":"Ô","334":"Ü","344":"ä","354":"ì","364":"ô","374":"ü","245":"¥","255":"-","265":"μ","275":"1⁄2","305":"Å","315":"Í","325":"Õ","335":"Ý","345":"å","355":"í","365":"õ","375":"ý","246":"¦","256":"®","266":"¶","276":"3⁄4","306":"Æ","316":"Î","326":"Ö","336":"Þ","346":"æ","356":"î","366":"ö","376":"þ","247":"§","257":" ̄","267":"·","277":"¿","307":"Ç","317":"Ï","327":"×","337":"ß","347":"ç","357":"ï","367":"÷","377":"ÿ","250":" ̈","260":"°","270":" ̧","300":"À","310":"È","320":"Ð","330":"Ø","340":"à","350":"è","360":"ð","370":"ø","251":"©","261":"±","271":"1","301":"Á","311":"É","321":"Ñ","331":"Ù","341":"á","351":"é","361":"ñ","371":"ù"};
this.translateString=function(j){var h=j.split("\\");if(h.length===1){return j}var i=null;window.ABCJS.parse.each(h,function(k){if(i===null){i=k}else{var l=f[k.substring(0,2)];if(l!==undefined){i+=l+k.substring(2)}else{l=b[k.substring(0,3)];if(l!==undefined){i+=l+k.substring(3)}else{l=e[k.substring(0,1)];if(l!==undefined){i+=l+k.substring(1)}else{i+="\\"+k}}}}});return i};this.getNumber=function(h,j){var i=0;while(j<h.length){switch(h.charAt(j)){case"0":i=i*10;j++;break;case"1":i=i*10+1;j++;break;case"2":i=i*10+2;j++;break;case"3":i=i*10+3;j++;break;case"4":i=i*10+4;j++;break;case"5":i=i*10+5;j++;break;case"6":i=i*10+6;j++;break;case"7":i=i*10+7;j++;break;case"8":i=i*10+8;j++;break;case"9":i=i*10+9;j++;break;default:return{num:i,index:j}}}return{num:i,index:j}};this.getFraction=function(h,k){var j=1;var o=1;if(h.charAt(k)!=="/"){var i=this.getNumber(h,k);j=i.num;k=i.index}if(h.charAt(k)==="/"){k++;if(h.charAt(k)==="/"){var n=0.5;while(h.charAt(k++)==="/"){n=n/2}return{value:j*n,index:k-1}}else{var l=k;var m=this.getNumber(h,k);if(m.num===0&&l===k){m.num=2}if(m.num!==0){o=m.num}k=m.index}}return{value:j/o,index:k}};this.theReverser=function(h){if(window.ABCJS.parse.endsWith(h,", The")){return"The "+h.substring(0,h.length-5)}if(window.ABCJS.parse.endsWith(h,", A")){return"A "+h.substring(0,h.length-3)}return h};this.stripComment=function(j){var h=j.indexOf("%");if(h>=0){return window.ABCJS.parse.strip(j.substring(0,h))}return window.ABCJS.parse.strip(j)};this.getInt=function(l){var h=parseInt(l);if(isNaN(h)){return{digits:0}}var k=""+h;var j=l.indexOf(k);return{value:h,digits:j+k.length}};this.getFloat=function(l){var h=parseFloat(l);if(isNaN(h)){return{digits:0}}var k=""+h;var j=l.indexOf(k);return{value:h,digits:j+k.length}};this.getMeasurement=function(k){if(k.length===0){return{used:0}}var j=1;var i="";if(k[0].token==="-"){k.shift();i="-";j++}else{if(k[0].type!=="number"){return{used:0}}}i+=k.shift().token;if(k.length===0){return{used:1,value:parseInt(i)}}var h=k.shift();if(h.token==="."){j++;if(k.length===0){return{used:j,value:parseInt(i)}}if(k[0].type==="number"){h=k.shift();i=i+"."+h.token;j++;if(k.length===0){return{used:j,value:parseFloat(i)}}}h=k.shift()}switch(h.token){case"pt":return{used:j+1,value:parseFloat(i)};case"cm":return{used:j+1,value:parseFloat(i)/2.54*72};case"in":return{used:j+1,value:parseFloat(i)*72};default:k.unshift(h);return{used:j,value:parseFloat(i)}}return{used:0}};var a=function(h){while(h.indexOf("\\n")!==-1){h=h.replace("\\n","\n")}return h};this.getBrackettedSubstring=function(h,j,n,l){var k=l||h.charAt(j);var m=j+1;while((m<h.length)&&(h.charAt(m)!==k)){++m}if(h.charAt(m)===k){return[m-j+1,a(h.substring(j+1,m)),true]}else{m=j+n;if(m>h.length-1){m=h.length-1}return[m-j+1,a(h.substring(j+1,m)),false]}}};if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.write){window.ABCJS.write={}}ABCJS.write.AbsoluteElement=function(d,c,b,a){this.abcelem=d;this.duration=c;this.minspacing=b||0;this.x=0;this.children=[];this.heads=[];this.extra=[];this.extraw=0;this.w=0;this.right=[];this.invisible=false;this.bottom=7;this.top=7;this.type=a};ABCJS.write.AbsoluteElement.prototype.getMinWidth=function(){return this.w};ABCJS.write.AbsoluteElement.prototype.getExtraWidth=function(){return -this.extraw};ABCJS.write.AbsoluteElement.prototype.addExtra=function(a){if(a.dx<this.extraw){this.extraw=a.dx}this.extra[this.extra.length]=a;this.addChild(a)};ABCJS.write.AbsoluteElement.prototype.addHead=function(a){if(a.dx<this.extraw){this.extraw=a.dx}this.heads[this.heads.length]=a;this.addRight(a)};ABCJS.write.AbsoluteElement.prototype.addRight=function(a){if(a.dx+a.w>this.w){this.w=a.dx+a.w}this.right[this.right.length]=a;this.addChild(a)};ABCJS.write.AbsoluteElement.prototype.addChild=function(a){a.parent=this;this.children[this.children.length]=a;this.pushTop(a.top);this.pushBottom(a.bottom)};ABCJS.write.AbsoluteElement.prototype.pushTop=function(a){this.top=Math.max(a,this.top)};ABCJS.write.AbsoluteElement.prototype.pushBottom=function(a){this.bottom=Math.min(a,this.bottom)};ABCJS.write.AbsoluteElement.prototype.draw=function(e,f){this.elemset=e.paper.set();if(this.invisible){return}e.beginGroup();for(var d=0;d<this.children.length;d++){this.elemset.push(this.children[d].draw(e,this.x,f))}this.elemset.push(e.endGroup(this.type));if(this.klass){this.setClass("mark","","#00ff00")}var c=this;this.elemset.mouseup(function(){e.notifySelect(c)});this.abcelem.abselem=this;var h=ABCJS.write.spacing.STEP*e.scale;var g=function(){this.dy=0},b=function(j,i){i=Math.round(i/h)*h;this.translate(0,-this.dy);this.dy=i;this.translate(0,this.dy)},a=function(){var i=-Math.round(this.dy/h);c.abcelem.pitches[0].pitch+=i;c.abcelem.pitches[0].verticalPos+=i;e.notifyChange()};if(this.abcelem.el_type==="note"&&e.editable){this.elemset.drag(b,g,a)}};ABCJS.write.AbsoluteElement.prototype.isIE=
/*@cc_on!@*/
false;ABCJS.write.AbsoluteElement.prototype.setClass=function(d,e,b){if(b!==null){this.elemset.attr({fill:b})}if(!this.isIE){for(var c=0;c<this.elemset.length;c++){if(this.elemset[c][0].setAttribute){var a=this.elemset[c][0].getAttribute("class");if(!a){a=""}a=a.replace(e,"");a=a.replace(d,"");if(d.length>0){if(a.length>0&&a.charAt(a.length-1)!==" "){a+=" "}a+=d}this.elemset[c][0].setAttribute("class",a)}}}};ABCJS.write.AbsoluteElement.prototype.highlight=function(a,b){if(a===undefined){a="note_selected"}if(b===undefined){b="#ff0000"}this.setClass(a,"",b)};ABCJS.write.AbsoluteElement.prototype.unhighlight=function(a,b){if(a===undefined){a="note_selected"}if(b===undefined){b="#000000"}this.setClass("",a,b)};if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.write){window.ABCJS.write={}}ABCJS.write.BeamElem=function(a,b){this.isflat=(b);this.isgrace=(a&&a==="grace");this.forceup=(a&&a==="up");this.forcedown=(a&&a==="down");this.elems=[];this.total=0;this.dy=(this.asc)?ABCJS.write.spacing.STEP*1.2:-ABCJS.write.spacing.STEP*1.2;if(this.isgrace){this.dy=this.dy*0.4}this.allrests=true};ABCJS.write.BeamElem.prototype.add=function(a){var b=a.abcelem.averagepitch;if(b===undefined){return}this.allrests=this.allrests&&a.abcelem.rest;a.beam=this;this.elems.push(a);this.total+=b;if(!this.min||a.abcelem.minpitch<this.min){this.min=a.abcelem.minpitch}if(!this.max||a.abcelem.maxpitch>this.max){this.max=a.abcelem.maxpitch}};ABCJS.write.BeamElem.prototype.average=function(){try{return this.total/this.elems.length}catch(a){return 0}};ABCJS.write.BeamElem.prototype.draw=function(a){if(this.elems.length===0||this.allrests){return}this.drawBeam(a);this.drawStems(a)};ABCJS.write.BeamElem.prototype.calcDir=function(){var a=this.average();this.asc=(this.forceup||this.isgrace||a<6)&&(!this.forcedown);return this.asc};ABCJS.write.BeamElem.prototype.drawBeam=function(g){var b=this.average();var i=(this.isgrace)?5:7;this.calcDir();var a=this.asc?5:8;this.pos=Math.round(this.asc?Math.max(b+i,this.max+a):Math.min(b-i,this.min-a));var f=this.elems[0].abcelem.averagepitch-this.elems[this.elems.length-1].abcelem.averagepitch;
if(this.isflat){f=0}var e=this.elems.length/2;if(f>e){f=e}if(f<-e){f=-e}this.starty=g.calcY(this.pos+Math.floor(f/2));this.endy=g.calcY(this.pos+Math.floor(-f/2));var d=this.elems[0].heads[(this.asc)?0:this.elems[0].heads.length-1];var h=this.elems[this.elems.length-1].heads[(this.asc)?0:this.elems[this.elems.length-1].heads.length-1];this.startx=d.x;if(this.asc){this.startx+=d.w-0.6}this.endx=h.x;if(this.asc){this.endx+=h.w}if(this.asc&&this.pos<6){this.starty=g.calcY(6);this.endy=g.calcY(6)}else{if(!this.asc&&this.pos>6){this.starty=g.calcY(6);this.endy=g.calcY(6)}}var c="M"+this.startx+" "+this.starty+" L"+this.endx+" "+this.endy+"L"+this.endx+" "+(this.endy+this.dy)+" L"+this.startx+" "+(this.starty+this.dy)+"z";g.printPath({path:c,stroke:"none",fill:"#000000","class":g.addClasses("beam-elem")})};ABCJS.write.BeamElem.prototype.drawStems=function(m){var a=[];m.beginGroup();for(var g=0,r=this.elems.length;g<r;g++){if(this.elems[g].abcelem.rest){continue}var n=this.elems[g].heads[(this.asc)?0:this.elems[g].heads.length-1];var e=(this.isgrace)?1/3:1/5;var b=n.pitch+((this.asc)?e:-e);var p=m.calcY(b);var q=n.x+((this.asc)?n.w:0);var l=this.getBarYAt(q);var s=(this.asc)?-0.6:0.6;m.printStem(q,s,p,l);var o=(this.asc)?1.5*ABCJS.write.spacing.STEP:-1.5*ABCJS.write.spacing.STEP;if(this.isgrace){o=o*2/3}for(var c=ABCJS.write.getDurlog(this.elems[g].abcelem.duration);c<-3;c++){if(a[-4-c]){a[-4-c].single=false}else{a[-4-c]={x:q+((this.asc)?-0.6:0),y:l+o*(-4-c+1),durlog:c,single:true}}}for(var f=a.length-1;f>=0;f--){if(g===r-1||ABCJS.write.getDurlog(this.elems[g+1].abcelem.duration)>(-f-4)){var k=q;var h=l+o*(f+1);if(a[f].single){k=(g===0)?q+5:q-5;h=this.getBarYAt(k)+o*(f+1)}var d="M"+a[f].x+" "+a[f].y+" L"+k+" "+h+"L"+k+" "+(h+this.dy)+" L"+a[f].x+" "+(a[f].y+this.dy)+"z";m.printPath({path:d,stroke:"none",fill:"#000000","class":m.addClasses("beam-elem")});a=a.slice(0,f)}}}m.endGroup("beam-elem")};ABCJS.write.BeamElem.prototype.getBarYAt=function(a){return this.starty+(this.endy-this.starty)/(this.endx-this.startx)*(a-this.startx)};if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.write){window.ABCJS.write={}}ABCJS.write.CrescendoElem=function(c,b,a){this.anchor1=c;this.anchor2=b;this.dir=a};ABCJS.write.CrescendoElem.prototype.draw=function(a){if(this.dir==="<"){this.drawLine(a,0,-4);this.drawLine(a,0,4)}else{this.drawLine(a,-4,0);this.drawLine(a,4,0)}};ABCJS.write.CrescendoElem.prototype.drawLine=function(d,c,b){var e=d.layouter.minY-7;var a=ABCJS.write.sprintf("M %f %f L %f %f",this.anchor1.x,d.calcY(e)+c-4,this.anchor2.x,d.calcY(e)+b-4);d.printPath({path:a,stroke:"#000000","class":d.addClasses("decoration")})};if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.write){window.ABCJS.write={}}ABCJS.write.DynamicDecoration=function(a,b){this.anchor=a;this.dec=b};ABCJS.write.DynamicDecoration.prototype.draw=function(d,f,a){var e=d.layouter.minY-7;var c=1;var b=1;d.printSymbol(this.anchor.x,e,this.dec,c,b,d.addClasses("decoration"))};if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.write){window.ABCJS.write={}}ABCJS.write.EndingElem=function(c,b,a){this.text=c;this.anchor1=b;this.anchor2=a};ABCJS.write.EndingElem.prototype.draw=function(c,d,b){var a;if(this.anchor1){d=this.anchor1.x+this.anchor1.w;a=ABCJS.write.sprintf("M %f %f L %f %f",d,c.y,d,c.y+10);c.printPath({path:a,stroke:"#000000",fill:"#000000","class":c.addClasses("ending")});c.printText(d+5*c.scale,18.5,this.text,"start","ending").attr({"font-size":""+10*c.scale+"px"})}if(this.anchor2){b=this.anchor2.x;a=ABCJS.write.sprintf("M %f %f L %f %f",b,c.y,b,c.y+10);c.printPath({path:a,stroke:"#000000",fill:"#000000","class":c.addClasses("ending")})}a=ABCJS.write.sprintf("M %f %f L %f %f",d,c.y,b,c.y);c.printPath({path:a,stroke:"#000000",fill:"#000000","class":c.addClasses("ending")})};if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.write){window.ABCJS.write={}}ABCJS.write.Glyphs=function(){var a={"rests.whole":{d:[["M",0.06,0.03],["l",0.09,-0.06],["l",5.46,0],["l",5.49,0],["l",0.09,0.06],["l",0.06,0.09],["l",0,2.19],["l",0,2.19],["l",-0.06,0.09],["l",-0.09,0.06],["l",-5.49,0],["l",-5.46,0],["l",-0.09,-0.06],["l",-0.06,-0.09],["l",0,-2.19],["l",0,-2.19],["z"]],w:11.25,h:4.68},"rests.half":{d:[["M",0.06,-4.62],["l",0.09,-0.06],["l",5.46,0],["l",5.49,0],["l",0.09,0.06],["l",0.06,0.09],["l",0,2.19],["l",0,2.19],["l",-0.06,0.09],["l",-0.09,0.06],["l",-5.49,0],["l",-5.46,0],["l",-0.09,-0.06],["l",-0.06,-0.09],["l",0,-2.19],["l",0,-2.19],["z"]],w:11.25,h:4.68},"rests.quarter":{d:[["M",1.89,-11.82],["c",0.12,-0.06,0.24,-0.06,0.36,-0.03],["c",0.09,0.06,4.74,5.58,4.86,5.82],["c",0.21,0.39,0.15,0.78,-0.15,1.26],["c",-0.24,0.33,-0.72,0.81,-1.62,1.56],["c",-0.45,0.36,-0.87,0.75,-0.96,0.84],["c",-0.93,0.99,-1.14,2.49,-0.6,3.63],["c",0.18,0.39,0.27,0.48,1.32,1.68],["c",1.92,2.25,1.83,2.16,1.83,2.34],["c",-0,0.18,-0.18,0.36,-0.36,0.39],["c",-0.15,-0,-0.27,-0.06,-0.48,-0.27],["c",-0.75,-0.75,-2.46,-1.29,-3.39,-1.08],["c",-0.45,0.09,-0.69,0.27,-0.9,0.69],["c",-0.12,0.3,-0.21,0.66,-0.24,1.14],["c",-0.03,0.66,0.09,1.35,0.3,2.01],["c",0.15,0.42,0.24,0.66,0.45,0.96],["c",0.18,0.24,0.18,0.33,0.03,0.42],["c",-0.12,0.06,-0.18,0.03,-0.45,-0.3],["c",-1.08,-1.38,-2.07,-3.36,-2.4,-4.83],["c",-0.27,-1.05,-0.15,-1.77,0.27,-2.07],["c",0.21,-0.12,0.42,-0.15,0.87,-0.15],["c",0.87,0.06,2.1,0.39,3.3,0.9],["l",0.39,0.18],["l",-1.65,-1.95],["c",-2.52,-2.97,-2.61,-3.09,-2.7,-3.27],["c",-0.09,-0.24,-0.12,-0.48,-0.03,-0.75],["c",0.15,-0.48,0.57,-0.96,1.83,-2.01],["c",0.45,-0.36,0.84,-0.72,0.93,-0.78],["c",0.69,-0.75,1.02,-1.8,0.9,-2.79],["c",-0.06,-0.33,-0.21,-0.84,-0.39,-1.11],["c",-0.09,-0.15,-0.45,-0.6,-0.81,-1.05],["c",-0.36,-0.42,-0.69,-0.81,-0.72,-0.87],["c",-0.09,-0.18,-0,-0.42,0.21,-0.51],["z"]],w:7.888,h:21.435},"rests.8th":{d:[["M",1.68,-6.12],["c",0.66,-0.09,1.23,0.09,1.68,0.51],["c",0.27,0.3,0.39,0.54,0.57,1.26],["c",0.09,0.33,0.18,0.66,0.21,0.72],["c",0.12,0.27,0.33,0.45,0.6,0.48],["c",0.12,0,0.18,0,0.33,-0.09],["c",0.39,-0.18,1.32,-1.29,1.68,-1.98],["c",0.09,-0.21,0.24,-0.3,0.39,-0.3],["c",0.12,0,0.27,0.09,0.33,0.18],["c",0.03,0.06,-0.27,1.11,-1.86,6.42],["c",-1.02,3.48,-1.89,6.39,-1.92,6.42],["c",0,0.03,-0.12,0.12,-0.24,0.15],["c",-0.18,0.09,-0.21,0.09,-0.45,0.09],["c",-0.24,0,-0.3,0,-0.48,-0.06],["c",-0.09,-0.06,-0.21,-0.12,-0.21,-0.15],["c",-0.06,-0.03,0.15,-0.57,1.68,-4.92],["c",0.96,-2.67,1.74,-4.89,1.71,-4.89],["l",-0.51,0.15],["c",-1.08,0.36,-1.74,0.48,-2.55,0.48],["c",-0.66,0,-0.84,-0.03,-1.32,-0.27],["c",-1.32,-0.63,-1.77,-2.16,-1.02,-3.3],["c",0.33,-0.45,0.84,-0.81,1.38,-0.9],["z"]],w:7.534,h:13.883},"rests.16th":{d:[["M",3.33,-6.12],["c",0.66,-0.09,1.23,0.09,1.68,0.51],["c",0.27,0.3,0.39,0.54,0.57,1.26],["c",0.09,0.33,0.18,0.66,0.21,0.72],["c",0.15,0.39,0.57,0.57,0.87,0.42],["c",0.39,-0.18,1.2,-1.23,1.62,-2.07],["c",0.06,-0.15,0.24,-0.24,0.36,-0.24],["c",0.12,0,0.27,0.09,0.33,0.18],["c",0.03,0.06,-0.45,1.86,-2.67,10.17],["c",-1.5,5.55,-2.73,10.14,-2.76,10.17],["c",-0.03,0.03,-0.12,0.12,-0.24,0.15],["c",-0.18,0.09,-0.21,0.09,-0.45,0.09],["c",-0.24,0,-0.3,0,-0.48,-0.06],["c",-0.09,-0.06,-0.21,-0.12,-0.21,-0.15],["c",-0.06,-0.03,0.12,-0.57,1.44,-4.92],["c",0.81,-2.67,1.47,-4.86,1.47,-4.89],["c",-0.03,0,-0.27,0.06,-0.54,0.15],["c",-1.08,0.36,-1.77,0.48,-2.58,0.48],["c",-0.66,0,-0.84,-0.03,-1.32,-0.27],["c",-1.32,-0.63,-1.77,-2.16,-1.02,-3.3],["c",0.72,-1.05,2.22,-1.23,3.06,-0.42],["c",0.3,0.33,0.42,0.6,0.6,1.38],["c",0.09,0.45,0.21,0.78,0.33,0.9],["c",0.09,0.09,0.27,0.18,0.45,0.21],["c",0.12,0,0.18,0,0.33,-0.09],["c",0.33,-0.15,1.02,-0.93,1.41,-1.59],["c",0.12,-0.21,0.18,-0.39,0.39,-1.08],["c",0.66,-2.1,1.17,-3.84,1.17,-3.87],["c",0,0,-0.21,0.06,-0.42,0.15],["c",-0.51,0.15,-1.2,0.33,-1.68,0.42],["c",-0.33,0.06,-0.51,0.06,-0.96,0.06],["c",-0.66,0,-0.84,-0.03,-1.32,-0.27],["c",-1.32,-0.63,-1.77,-2.16,-1.02,-3.3],["c",0.33,-0.45,0.84,-0.81,1.38,-0.9],["z"]],w:9.724,h:21.383},"rests.32nd":{d:[["M",4.23,-13.62],["c",0.66,-0.09,1.23,0.09,1.68,0.51],["c",0.27,0.3,0.39,0.54,0.57,1.26],["c",0.09,0.33,0.18,0.66,0.21,0.72],["c",0.12,0.27,0.33,0.45,0.6,0.48],["c",0.12,0,0.18,0,0.27,-0.06],["c",0.33,-0.21,0.99,-1.11,1.44,-1.98],["c",0.09,-0.24,0.21,-0.33,0.39,-0.33],["c",0.12,0,0.27,0.09,0.33,0.18],["c",0.03,0.06,-0.57,2.67,-3.21,13.89],["c",-1.8,7.62,-3.3,13.89,-3.3,13.92],["c",-0.03,0.06,-0.12,0.12,-0.24,0.18],["c",-0.21,0.09,-0.24,0.09,-0.48,0.09],["c",-0.24,-0,-0.3,-0,-0.48,-0.06],["c",-0.09,-0.06,-0.21,-0.12,-0.21,-0.15],["c",-0.06,-0.03,0.09,-0.57,1.23,-4.92],["c",0.69,-2.67,1.26,-4.86,1.29,-4.89],["c",0,-0.03,-0.12,-0.03,-0.48,0.12],["c",-1.17,0.39,-2.22,0.57,-3,0.54],["c",-0.42,-0.03,-0.75,-0.12,-1.11,-0.3],["c",-1.32,-0.63,-1.77,-2.16,-1.02,-3.3],["c",0.72,-1.05,2.22,-1.23,3.06,-0.42],["c",0.3,0.33,0.42,0.6,0.6,1.38],["c",0.09,0.45,0.21,0.78,0.33,0.9],["c",0.12,0.09,0.3,0.18,0.48,0.21],["c",0.12,-0,0.18,-0,0.3,-0.09],["c",0.42,-0.21,1.29,-1.29,1.56,-1.89],["c",0.03,-0.12,1.23,-4.59,1.23,-4.65],["c",0,-0.03,-0.18,0.03,-0.39,0.12],["c",-0.63,0.18,-1.2,0.36,-1.74,0.45],["c",-0.39,0.06,-0.54,0.06,-1.02,0.06],["c",-0.66,-0,-0.84,-0.03,-1.32,-0.27],["c",-1.32,-0.63,-1.77,-2.16,-1.02,-3.3],["c",0.72,-1.05,2.22,-1.23,3.06,-0.42],["c",0.3,0.33,0.42,0.6,0.6,1.38],["c",0.09,0.45,0.21,0.78,0.33,0.9],["c",0.18,0.18,0.51,0.27,0.72,0.15],["c",0.3,-0.12,0.69,-0.57,1.08,-1.17],["c",0.42,-0.6,0.39,-0.51,1.05,-3.03],["c",0.33,-1.26,0.6,-2.31,0.6,-2.34],["c",0,-0,-0.21,0.03,-0.45,0.12],["c",-0.57,0.18,-1.14,0.33,-1.62,0.42],["c",-0.33,0.06,-0.51,0.06,-0.96,0.06],["c",-0.66,-0,-0.84,-0.03,-1.32,-0.27],["c",-1.32,-0.63,-1.77,-2.16,-1.02,-3.3],["c",0.33,-0.45,0.84,-0.81,1.38,-0.9],["z"]],w:11.373,h:28.883},"rests.64th":{d:[["M",5.13,-13.62],["c",0.66,-0.09,1.23,0.09,1.68,0.51],["c",0.27,0.3,0.39,0.54,0.57,1.26],["c",0.15,0.63,0.21,0.81,0.33,0.96],["c",0.18,0.21,0.54,0.3,0.75,0.18],["c",0.24,-0.12,0.63,-0.66,1.08,-1.56],["c",0.33,-0.66,0.39,-0.72,0.6,-0.72],["c",0.12,0,0.27,0.09,0.33,0.18],["c",0.03,0.06,-0.69,3.66,-3.54,17.64],["c",-1.95,9.66,-3.57,17.61,-3.57,17.64],["c",-0.03,0.06,-0.12,0.12,-0.24,0.18],["c",-0.21,0.09,-0.24,0.09,-0.48,0.09],["c",-0.24,0,-0.3,0,-0.48,-0.06],["c",-0.09,-0.06,-0.21,-0.12,-0.21,-0.15],["c",-0.06,-0.03,0.06,-0.57,1.05,-4.95],["c",0.6,-2.7,1.08,-4.89,1.08,-4.92],["c",0,0,-0.24,0.06,-0.51,0.15],["c",-0.66,0.24,-1.2,0.36,-1.77,0.48],["c",-0.42,0.06,-0.57,0.06,-1.05,0.06],["c",-0.69,0,-0.87,-0.03,-1.35,-0.27],["c",-1.32,-0.63,-1.77,-2.16,-1.02,-3.3],["c",0.72,-1.05,2.22,-1.23,3.06,-0.42],["c",0.3,0.33,0.42,0.6,0.6,1.38],["c",0.09,0.45,0.21,0.78,0.33,0.9],["c",0.09,0.09,0.27,0.18,0.45,0.21],["c",0.21,0.03,0.39,-0.09,0.72,-0.42],["c",0.45,-0.45,1.02,-1.26,1.17,-1.65],["c",0.03,-0.09,0.27,-1.14,0.54,-2.34],["c",0.27,-1.2,0.48,-2.19,0.51,-2.22],["c",0,-0.03,-0.09,-0.03,-0.48,0.12],["c",-1.17,0.39,-2.22,0.57,-3,0.54],["c",-0.42,-0.03,-0.75,-0.12,-1.11,-0.3],["c",-1.32,-0.63,-1.77,-2.16,-1.02,-3.3],["c",0.36,-0.54,0.96,-0.87,1.65,-0.93],["c",0.54,-0.03,1.02,0.15,1.41,0.54],["c",0.27,0.3,0.39,0.54,0.57,1.26],["c",0.09,0.33,0.18,0.66,0.21,0.72],["c",0.15,0.39,0.57,0.57,0.9,0.42],["c",0.36,-0.18,1.2,-1.26,1.47,-1.89],["c",0.03,-0.09,0.3,-1.2,0.57,-2.43],["l",0.51,-2.28],["l",-0.54,0.18],["c",-1.11,0.36,-1.8,0.48,-2.61,0.48],["c",-0.66,0,-0.84,-0.03,-1.32,-0.27],["c",-1.32,-0.63,-1.77,-2.16,-1.02,-3.3],["c",0.36,-0.54,0.96,-0.87,1.65,-0.93],["c",0.54,-0.03,1.02,0.15,1.41,0.54],["c",0.27,0.3,0.39,0.54,0.57,1.26],["c",0.15,0.63,0.21,0.81,0.33,0.96],["c",0.21,0.21,0.54,0.3,0.75,0.18],["c",0.36,-0.18,0.93,-0.93,1.29,-1.68],["c",0.12,-0.24,0.18,-0.48,0.63,-2.55],["l",0.51,-2.31],["c",0,-0.03,-0.18,0.03,-0.39,0.12],["c",-1.14,0.36,-2.1,0.54,-2.82,0.51],["c",-0.42,-0.03,-0.75,-0.12,-1.11,-0.3],["c",-1.32,-0.63,-1.77,-2.16,-1.02,-3.3],["c",0.33,-0.45,0.84,-0.81,1.38,-0.9],["z"]],w:12.453,h:36.383},"rests.128th":{d:[["M",6.03,-21.12],["c",0.66,-0.09,1.23,0.09,1.68,0.51],["c",0.27,0.3,0.39,0.54,0.57,1.26],["c",0.09,0.33,0.18,0.66,0.21,0.72],["c",0.12,0.27,0.33,0.45,0.6,0.48],["c",0.21,0,0.33,-0.06,0.54,-0.36],["c",0.15,-0.21,0.54,-0.93,0.78,-1.47],["c",0.15,-0.33,0.18,-0.39,0.3,-0.48],["c",0.18,-0.09,0.45,0,0.51,0.15],["c",0.03,0.09,-7.11,42.75,-7.17,42.84],["c",-0.03,0.03,-0.15,0.09,-0.24,0.15],["c",-0.18,0.06,-0.24,0.06,-0.45,0.06],["c",-0.24,-0,-0.3,-0,-0.48,-0.06],["c",-0.09,-0.06,-0.21,-0.12,-0.21,-0.15],["c",-0.06,-0.03,0.03,-0.57,0.84,-4.98],["c",0.51,-2.7,0.93,-4.92,0.9,-4.92],["c",0,-0,-0.15,0.06,-0.36,0.12],["c",-0.78,0.27,-1.62,0.48,-2.31,0.57],["c",-0.15,0.03,-0.54,0.03,-0.81,0.03],["c",-0.66,-0,-0.84,-0.03,-1.32,-0.27],["c",-1.32,-0.63,-1.77,-2.16,-1.02,-3.3],["c",0.36,-0.54,0.96,-0.87,1.65,-0.93],["c",0.54,-0.03,1.02,0.15,1.41,0.54],["c",0.27,0.3,0.39,0.54,0.57,1.26],["c",0.09,0.33,0.18,0.66,0.21,0.72],["c",0.12,0.27,0.33,0.45,0.63,0.48],["c",0.12,-0,0.18,-0,0.3,-0.09],["c",0.42,-0.21,1.14,-1.11,1.5,-1.83],["c",0.12,-0.27,0.12,-0.27,0.54,-2.52],["c",0.24,-1.23,0.42,-2.25,0.39,-2.25],["c",0,-0,-0.24,0.06,-0.51,0.18],["c",-1.26,0.39,-2.25,0.57,-3.06,0.54],["c",-0.42,-0.03,-0.75,-0.12,-1.11,-0.3],["c",-1.32,-0.63,-1.77,-2.16,-1.02,-3.3],["c",0.36,-0.54,0.96,-0.87,1.65,-0.93],["c",0.54,-0.03,1.02,0.15,1.41,0.54],["c",0.27,0.3,0.39,0.54,0.57,1.26],["c",0.15,0.63,0.21,0.81,0.33,0.96],["c",0.18,0.21,0.51,0.3,0.75,0.18],["c",0.36,-0.15,1.05,-0.99,1.41,-1.77],["l",0.15,-0.3],["l",0.42,-2.25],["c",0.21,-1.26,0.42,-2.28,0.39,-2.28],["l",-0.51,0.15],["c",-1.11,0.39,-1.89,0.51,-2.7,0.51],["c",-0.66,-0,-0.84,-0.03,-1.32,-0.27],["c",-1.32,-0.63,-1.77,-2.16,-1.02,-3.3],["c",0.36,-0.54,0.96,-0.87,1.65,-0.93],["c",0.54,-0.03,1.02,0.15,1.41,0.54],["c",0.27,0.3,0.39,0.54,0.57,1.26],["c",0.15,0.63,0.21,0.81,0.33,0.96],["c",0.18,0.18,0.48,0.27,0.72,0.21],["c",0.33,-0.12,1.14,-1.26,1.41,-1.95],["c",0,-0.09,0.21,-1.11,0.45,-2.34],["c",0.21,-1.2,0.39,-2.22,0.39,-2.28],["c",0.03,-0.03,0,-0.03,-0.45,0.12],["c",-0.57,0.18,-1.2,0.33,-1.71,0.42],["c",-0.3,0.06,-0.51,0.06,-0.93,0.06],["c",-0.66,-0,-0.84,-0.03,-1.32,-0.27],["c",-1.32,-0.63,-1.77,-2.16,-1.02,-3.3],["c",0.36,-0.54,0.96,-0.87,1.65,-0.93],["c",0.54,-0.03,1.02,0.15,1.41,0.54],["c",0.27,0.3,0.39,0.54,0.57,1.26],["c",0.09,0.33,0.18,0.66,0.21,0.72],["c",0.12,0.27,0.33,0.45,0.6,0.48],["c",0.18,-0,0.36,-0.09,0.57,-0.33],["c",0.33,-0.36,0.78,-1.14,0.93,-1.56],["c",0.03,-0.12,0.24,-1.2,0.45,-2.4],["c",0.24,-1.2,0.42,-2.22,0.42,-2.28],["c",0.03,-0.03,0,-0.03,-0.39,0.09],["c",-1.05,0.36,-1.8,0.48,-2.58,0.48],["c",-0.63,-0,-0.84,-0.03,-1.29,-0.27],["c",-1.32,-0.63,-1.77,-2.16,-1.02,-3.3],["c",0.33,-0.45,0.84,-0.81,1.38,-0.9],["z"]],w:12.992,h:43.883},"accidentals.sharp":{d:[["M",5.73,-11.19],["c",0.21,-0.12,0.54,-0.03,0.66,0.24],["c",0.06,0.12,0.06,0.21,0.06,2.31],["c",0,1.23,0,2.22,0.03,2.22],["c",0,-0,0.27,-0.12,0.6,-0.24],["c",0.69,-0.27,0.78,-0.3,0.96,-0.15],["c",0.21,0.15,0.21,0.18,0.21,1.38],["c",0,1.02,0,1.11,-0.06,1.2],["c",-0.03,0.06,-0.09,0.12,-0.12,0.15],["c",-0.06,0.03,-0.42,0.21,-0.84,0.36],["l",-0.75,0.33],["l",-0.03,2.43],["c",0,1.32,0,2.43,0.03,2.43],["c",0,-0,0.27,-0.12,0.6,-0.24],["c",0.69,-0.27,0.78,-0.3,0.96,-0.15],["c",0.21,0.15,0.21,0.18,0.21,1.38],["c",0,1.02,0,1.11,-0.06,1.2],["c",-0.03,0.06,-0.09,0.12,-0.12,0.15],["c",-0.06,0.03,-0.42,0.21,-0.84,0.36],["l",-0.75,0.33],["l",-0.03,2.52],["c",0,2.28,-0.03,2.55,-0.06,2.64],["c",-0.21,0.36,-0.72,0.36,-0.93,-0],["c",-0.03,-0.09,-0.06,-0.33,-0.06,-2.43],["l",0,-2.31],["l",-1.29,0.51],["l",-1.26,0.51],["l",0,2.43],["c",0,2.58,0,2.52,-0.15,2.67],["c",-0.06,0.09,-0.27,0.18,-0.36,0.18],["c",-0.12,-0,-0.33,-0.09,-0.39,-0.18],["c",-0.15,-0.15,-0.15,-0.09,-0.15,-2.43],["c",0,-1.23,0,-2.22,-0.03,-2.22],["c",0,-0,-0.27,0.12,-0.6,0.24],["c",-0.69,0.27,-0.78,0.3,-0.96,0.15],["c",-0.21,-0.15,-0.21,-0.18,-0.21,-1.38],["c",0,-1.02,0,-1.11,0.06,-1.2],["c",0.03,-0.06,0.09,-0.12,0.12,-0.15],["c",0.06,-0.03,0.42,-0.21,0.84,-0.36],["l",0.78,-0.33],["l",0,-2.43],["c",0,-1.32,0,-2.43,-0.03,-2.43],["c",0,-0,-0.27,0.12,-0.6,0.24],["c",-0.69,0.27,-0.78,0.3,-0.96,0.15],["c",-0.21,-0.15,-0.21,-0.18,-0.21,-1.38],["c",0,-1.02,0,-1.11,0.06,-1.2],["c",0.03,-0.06,0.09,-0.12,0.12,-0.15],["c",0.06,-0.03,0.42,-0.21,0.84,-0.36],["l",0.78,-0.33],["l",0,-2.52],["c",0,-2.28,0.03,-2.55,0.06,-2.64],["c",0.21,-0.36,0.72,-0.36,0.93,0],["c",0.03,0.09,0.06,0.33,0.06,2.43],["l",0.03,2.31],["l",1.26,-0.51],["l",1.26,-0.51],["l",0,-2.43],["c",0,-2.28,0,-2.43,0.06,-2.55],["c",0.06,-0.12,0.12,-0.18,0.27,-0.24],["z"],["m",-0.33,10.65],["l",0,-2.43],["l",-1.29,0.51],["l",-1.26,0.51],["l",0,2.46],["l",0,2.43],["l",0.09,-0.03],["c",0.06,-0.03,0.63,-0.27,1.29,-0.51],["l",1.17,-0.48],["l",0,-2.46],["z"]],w:8.25,h:22.462},"accidentals.halfsharp":{d:[["M",2.43,-10.05],["c",0.21,-0.12,0.54,-0.03,0.66,0.24],["c",0.06,0.12,0.06,0.21,0.06,2.01],["c",0,1.05,0,1.89,0.03,1.89],["l",0.72,-0.48],["c",0.69,-0.48,0.69,-0.51,0.87,-0.51],["c",0.15,0,0.18,0.03,0.27,0.09],["c",0.21,0.15,0.21,0.18,0.21,1.41],["c",0,1.11,-0.03,1.14,-0.09,1.23],["c",-0.03,0.03,-0.48,0.39,-1.02,0.75],["l",-0.99,0.66],["l",0,2.37],["c",0,1.32,0,2.37,0.03,2.37],["l",0.72,-0.48],["c",0.69,-0.48,0.69,-0.51,0.87,-0.51],["c",0.15,0,0.18,0.03,0.27,0.09],["c",0.21,0.15,0.21,0.18,0.21,1.41],["c",0,1.11,-0.03,1.14,-0.09,1.23],["c",-0.03,0.03,-0.48,0.39,-1.02,0.75],["l",-0.99,0.66],["l",0,2.25],["c",0,1.95,0,2.28,-0.06,2.37],["c",-0.06,0.12,-0.12,0.21,-0.24,0.27],["c",-0.27,0.12,-0.54,0.03,-0.69,-0.24],["c",-0.06,-0.12,-0.06,-0.21,-0.06,-2.01],["c",0,-1.05,0,-1.89,-0.03,-1.89],["l",-0.72,0.48],["c",-0.69,0.48,-0.69,0.48,-0.87,0.48],["c",-0.15,0,-0.18,0,-0.27,-0.06],["c",-0.21,-0.15,-0.21,-0.18,-0.21,-1.41],["c",0,-1.11,0.03,-1.14,0.09,-1.23],["c",0.03,-0.03,0.48,-0.39,1.02,-0.75],["l",0.99,-0.66],["l",0,-2.37],["c",0,-1.32,0,-2.37,-0.03,-2.37],["l",-0.72,0.48],["c",-0.69,0.48,-0.69,0.48,-0.87,0.48],["c",-0.15,0,-0.18,0,-0.27,-0.06],["c",-0.21,-0.15,-0.21,-0.18,-0.21,-1.41],["c",0,-1.11,0.03,-1.14,0.09,-1.23],["c",0.03,-0.03,0.48,-0.39,1.02,-0.75],["l",0.99,-0.66],["l",0,-2.25],["c",0,-2.13,0,-2.28,0.06,-2.4],["c",0.06,-0.12,0.12,-0.18,0.27,-0.24],["z"]],w:5.25,h:20.174},"accidentals.nat":{d:[["M",0.204,-11.4],["c",0.24,-0.06,0.78,0,0.99,0.15],["c",0.03,0.03,0.03,0.48,0,2.61],["c",-0.03,1.44,-0.03,2.61,-0.03,2.61],["c",0,0.03,0.75,-0.09,1.68,-0.24],["c",0.96,-0.18,1.71,-0.27,1.74,-0.27],["c",0.15,0.03,0.27,0.15,0.36,0.3],["l",0.06,0.12],["l",0.09,8.67],["c",0.09,6.96,0.12,8.67,0.09,8.67],["c",-0.03,0.03,-0.12,0.06,-0.21,0.09],["c",-0.24,0.09,-0.72,0.09,-0.96,0],["c",-0.09,-0.03,-0.18,-0.06,-0.21,-0.09],["c",-0.03,-0.03,-0.03,-0.48,0,-2.61],["c",0.03,-1.44,0.03,-2.61,0.03,-2.61],["c",0,-0.03,-0.75,0.09,-1.68,0.24],["c",-0.96,0.18,-1.71,0.27,-1.74,0.27],["c",-0.15,-0.03,-0.27,-0.15,-0.36,-0.3],["l",-0.06,-0.15],["l",-0.09,-7.53],["c",-0.06,-4.14,-0.09,-8.04,-0.12,-8.67],["l",0,-1.11],["l",0.15,-0.06],["c",0.09,-0.03,0.21,-0.06,0.27,-0.09],["z"],["m",3.75,8.4],["c",0,-0.33,0,-0.42,-0.03,-0.42],["c",-0.12,0,-2.79,0.45,-2.79,0.48],["c",-0.03,0,-0.09,6.3,-0.09,6.33],["c",0.03,0,2.79,-0.45,2.82,-0.48],["c",0,0,0.09,-4.53,0.09,-5.91],["z"]],w:5.411,h:22.8},"accidentals.flat":{d:[["M",-0.36,-14.07],["c",0.33,-0.06,0.87,0,1.08,0.15],["c",0.06,0.03,0.06,0.36,-0.03,5.25],["c",-0.06,2.85,-0.09,5.19,-0.09,5.19],["c",0,0.03,0.12,-0.03,0.24,-0.12],["c",0.63,-0.42,1.41,-0.66,2.19,-0.72],["c",0.81,-0.03,1.47,0.21,2.04,0.78],["c",0.57,0.54,0.87,1.26,0.93,2.04],["c",0.03,0.57,-0.09,1.08,-0.36,1.62],["c",-0.42,0.81,-1.02,1.38,-2.82,2.61],["c",-1.14,0.78,-1.44,1.02,-1.8,1.44],["c",-0.18,0.18,-0.39,0.39,-0.45,0.42],["c",-0.27,0.18,-0.57,0.15,-0.81,-0.06],["c",-0.06,-0.09,-0.12,-0.18,-0.15,-0.27],["c",-0.03,-0.06,-0.09,-3.27,-0.18,-8.34],["c",-0.09,-4.53,-0.15,-8.58,-0.18,-9.03],["l",0,-0.78],["l",0.12,-0.06],["c",0.06,-0.03,0.18,-0.09,0.27,-0.12],["z"],["m",3.18,11.01],["c",-0.21,-0.12,-0.54,-0.15,-0.81,-0.06],["c",-0.54,0.15,-0.99,0.63,-1.17,1.26],["c",-0.06,0.3,-0.12,2.88,-0.06,3.87],["c",0.03,0.42,0.03,0.81,0.06,0.9],["l",0.03,0.12],["l",0.45,-0.39],["c",0.63,-0.54,1.26,-1.17,1.56,-1.59],["c",0.3,-0.42,0.6,-0.99,0.72,-1.41],["c",0.18,-0.69,0.09,-1.47,-0.18,-2.07],["c",-0.15,-0.3,-0.33,-0.51,-0.6,-0.63],["z"]],w:6.75,h:18.801},"accidentals.halfflat":{d:[["M",4.83,-14.07],["c",0.33,-0.06,0.87,0,1.08,0.15],["c",0.06,0.03,0.06,0.6,-0.12,9.06],["c",-0.09,5.55,-0.15,9.06,-0.18,9.12],["c",-0.03,0.09,-0.09,0.18,-0.15,0.27],["c",-0.24,0.21,-0.54,0.24,-0.81,0.06],["c",-0.06,-0.03,-0.27,-0.24,-0.45,-0.42],["c",-0.36,-0.42,-0.66,-0.66,-1.8,-1.44],["c",-1.23,-0.84,-1.83,-1.32,-2.25,-1.77],["c",-0.66,-0.78,-0.96,-1.56,-0.93,-2.46],["c",0.09,-1.41,1.11,-2.58,2.4,-2.79],["c",0.3,-0.06,0.84,-0.03,1.23,0.06],["c",0.54,0.12,1.08,0.33,1.53,0.63],["c",0.12,0.09,0.24,0.15,0.24,0.12],["c",0,0,-0.12,-8.37,-0.18,-9.75],["l",0,-0.66],["l",0.12,-0.06],["c",0.06,-0.03,0.18,-0.09,0.27,-0.12],["z"],["m",-1.65,10.95],["c",-0.6,-0.18,-1.08,0.09,-1.38,0.69],["c",-0.27,0.6,-0.36,1.38,-0.18,2.07],["c",0.12,0.42,0.42,0.99,0.72,1.41],["c",0.3,0.42,0.93,1.05,1.56,1.59],["l",0.48,0.39],["l",0,-0.12],["c",0.03,-0.09,0.03,-0.48,0.06,-0.9],["c",0.03,-0.57,0.03,-1.08,0,-2.22],["c",-0.03,-1.62,-0.03,-1.62,-0.24,-2.07],["c",-0.21,-0.42,-0.6,-0.75,-1.02,-0.84],["z"]],w:6.728,h:18.801},"accidentals.dblflat":{d:[["M",-0.36,-14.07],["c",0.33,-0.06,0.87,0,1.08,0.15],["c",0.06,0.03,0.06,0.33,-0.03,4.89],["c",-0.06,2.67,-0.09,5.01,-0.09,5.22],["l",0,0.36],["l",0.15,-0.15],["c",0.36,-0.3,0.75,-0.51,1.2,-0.63],["c",0.33,-0.09,0.96,-0.09,1.26,-0.03],["c",0.27,0.09,0.63,0.27,0.87,0.45],["l",0.21,0.15],["l",0,-0.27],["c",0,-0.15,-0.03,-2.43,-0.09,-5.1],["c",-0.09,-4.56,-0.09,-4.86,-0.03,-4.89],["c",0.15,-0.12,0.39,-0.15,0.72,-0.15],["c",0.3,0,0.54,0.03,0.69,0.15],["c",0.06,0.03,0.06,0.33,-0.03,4.95],["c",-0.06,2.7,-0.09,5.04,-0.09,5.22],["l",0.03,0.3],["l",0.21,-0.15],["c",0.69,-0.48,1.44,-0.69,2.28,-0.69],["c",0.51,0,0.78,0.03,1.2,0.21],["c",1.32,0.63,2.01,2.28,1.53,3.69],["c",-0.21,0.57,-0.51,1.02,-1.05,1.56],["c",-0.42,0.42,-0.81,0.72,-1.92,1.5],["c",-1.26,0.87,-1.5,1.08,-1.86,1.5],["c",-0.39,0.45,-0.54,0.54,-0.81,0.51],["c",-0.18,0,-0.21,0,-0.33,-0.06],["l",-0.21,-0.21],["l",-0.06,-0.12],["l",-0.03,-0.99],["c",-0.03,-0.54,-0.03,-1.29,-0.06,-1.68],["l",0,-0.69],["l",-0.21,0.24],["c",-0.36,0.42,-0.75,0.75,-1.8,1.62],["c",-1.02,0.84,-1.2,0.99,-1.44,1.38],["c",-0.36,0.51,-0.54,0.6,-0.9,0.51],["c",-0.15,-0.03,-0.39,-0.27,-0.42,-0.42],["c",-0.03,-0.06,-0.09,-3.27,-0.18,-8.34],["c",-0.09,-4.53,-0.15,-8.58,-0.18,-9.03],["l",0,-0.78],["l",0.12,-0.06],["c",0.06,-0.03,0.18,-0.09,0.27,-0.12],["z"],["m",2.52,10.98],["c",-0.18,-0.09,-0.48,-0.12,-0.66,-0.06],["c",-0.39,0.15,-0.69,0.54,-0.84,1.14],["c",-0.06,0.24,-0.06,0.39,-0.09,1.74],["c",-0.03,1.44,0,2.73,0.06,3.18],["l",0.03,0.15],["l",0.27,-0.27],["c",0.93,-0.96,1.5,-1.95,1.74,-3.06],["c",0.06,-0.27,0.06,-0.39,0.06,-0.96],["c",0,-0.54,0,-0.69,-0.06,-0.93],["c",-0.09,-0.51,-0.27,-0.81,-0.51,-0.93],["z"],["m",5.43,0],["c",-0.18,-0.09,-0.51,-0.12,-0.72,-0.06],["c",-0.54,0.12,-0.96,0.63,-1.17,1.26],["c",-0.06,0.3,-0.12,2.88,-0.06,3.9],["c",0.03,0.42,0.03,0.81,0.06,0.9],["l",0.03,0.12],["l",0.36,-0.3],["c",0.42,-0.36,1.02,-0.96,1.29,-1.29],["c",0.36,-0.45,0.66,-0.99,0.81,-1.41],["c",0.42,-1.23,0.15,-2.76,-0.6,-3.12],["z"]],w:11.613,h:18.804},"accidentals.dblsharp":{d:[["M",-0.186,-3.96],["c",0.06,-0.03,0.12,-0.06,0.15,-0.06],["c",0.09,0,2.76,0.27,2.79,0.3],["c",0.12,0.03,0.15,0.12,0.15,0.51],["c",0.06,0.96,0.24,1.59,0.57,2.1],["c",0.06,0.09,0.15,0.21,0.18,0.24],["l",0.09,0.06],["l",0.09,-0.06],["c",0.03,-0.03,0.12,-0.15,0.18,-0.24],["c",0.33,-0.51,0.51,-1.14,0.57,-2.1],["c",0,-0.39,0.03,-0.45,0.12,-0.51],["c",0.03,0,0.66,-0.09,1.44,-0.15],["c",1.47,-0.15,1.5,-0.15,1.56,-0.03],["c",0.03,0.06,0,0.42,-0.09,1.44],["c",-0.09,0.72,-0.15,1.35,-0.15,1.38],["c",0,0.03,-0.03,0.09,-0.06,0.12],["c",-0.06,0.06,-0.12,0.09,-0.51,0.09],["c",-1.08,0.06,-1.8,0.3,-2.28,0.75],["l",-0.12,0.09],["l",0.09,0.09],["c",0.12,0.15,0.39,0.33,0.63,0.45],["c",0.42,0.18,0.96,0.27,1.68,0.33],["c",0.39,-0,0.45,0.03,0.51,0.09],["c",0.03,0.03,0.06,0.09,0.06,0.12],["c",0,0.03,0.06,0.66,0.15,1.38],["c",0.09,1.02,0.12,1.38,0.09,1.44],["c",-0.06,0.12,-0.09,0.12,-1.56,-0.03],["c",-0.78,-0.06,-1.41,-0.15,-1.44,-0.15],["c",-0.09,-0.06,-0.12,-0.12,-0.12,-0.54],["c",-0.06,-0.93,-0.24,-1.56,-0.57,-2.07],["c",-0.06,-0.09,-0.15,-0.21,-0.18,-0.24],["l",-0.09,-0.06],["l",-0.09,0.06],["c",-0.03,0.03,-0.12,0.15,-0.18,0.24],["c",-0.33,0.51,-0.51,1.14,-0.57,2.07],["c",0,0.42,-0.03,0.48,-0.12,0.54],["c",-0.03,0,-0.66,0.09,-1.44,0.15],["c",-1.47,0.15,-1.5,0.15,-1.56,0.03],["c",-0.03,-0.06,0,-0.42,0.09,-1.44],["c",0.09,-0.72,0.15,-1.35,0.15,-1.38],["c",0,-0.03,0.03,-0.09,0.06,-0.12],["c",0.06,-0.06,0.12,-0.09,0.51,-0.09],["c",0.72,-0.06,1.26,-0.15,1.68,-0.33],["c",0.24,-0.12,0.51,-0.3,0.63,-0.45],["l",0.09,-0.09],["l",-0.12,-0.09],["c",-0.48,-0.45,-1.2,-0.69,-2.28,-0.75],["c",-0.39,0,-0.45,-0.03,-0.51,-0.09],["c",-0.03,-0.03,-0.06,-0.09,-0.06,-0.12],["c",0,-0.03,-0.06,-0.63,-0.12,-1.38],["c",-0.09,-0.72,-0.15,-1.35,-0.15,-1.38],["z"]],w:7.961,h:7.977},"dots.dot":{d:[["M",1.32,-1.68],["c",0.09,-0.03,0.27,-0.06,0.39,-0.06],["c",0.96,0,1.74,0.78,1.74,1.71],["c",0,0.96,-0.78,1.74,-1.71,1.74],["c",-0.96,0,-1.74,-0.78,-1.74,-1.71],["c",0,-0.78,0.54,-1.5,1.32,-1.68],["z"]],w:3.45,h:3.45},"noteheads.dbl":{d:[["M",-0.69,-4.02],["c",0.18,-0.09,0.36,-0.09,0.54,0],["c",0.18,0.09,0.24,0.15,0.33,0.3],["c",0.06,0.15,0.06,0.18,0.06,1.41],["l",-0,1.23],["l",0.12,-0.18],["c",0.72,-1.26,2.64,-2.31,4.86,-2.64],["c",0.81,-0.15,1.11,-0.15,2.13,-0.15],["c",0.99,0,1.29,0,2.1,0.15],["c",0.75,0.12,1.38,0.27,2.04,0.54],["c",1.35,0.51,2.34,1.26,2.82,2.1],["l",0.12,0.18],["l",0,-1.23],["c",0,-1.2,0,-1.26,0.06,-1.38],["c",0.09,-0.18,0.15,-0.24,0.33,-0.33],["c",0.18,-0.09,0.36,-0.09,0.54,0],["c",0.18,0.09,0.24,0.15,0.33,0.3],["l",0.06,0.15],["l",0,3.54],["l",0,3.54],["l",-0.06,0.15],["c",-0.09,0.18,-0.15,0.24,-0.33,0.33],["c",-0.18,0.09,-0.36,0.09,-0.54,0],["c",-0.18,-0.09,-0.24,-0.15,-0.33,-0.33],["c",-0.06,-0.12,-0.06,-0.18,-0.06,-1.38],["l",0,-1.23],["l",-0.12,0.18],["c",-0.48,0.84,-1.47,1.59,-2.82,2.1],["c",-0.84,0.33,-1.71,0.54,-2.85,0.66],["c",-0.45,0.06,-2.16,0.06,-2.61,0],["c",-1.14,-0.12,-2.01,-0.33,-2.85,-0.66],["c",-1.35,-0.51,-2.34,-1.26,-2.82,-2.1],["l",-0.12,-0.18],["l",0,1.23],["c",0,1.23,0,1.26,-0.06,1.38],["c",-0.09,0.18,-0.15,0.24,-0.33,0.33],["c",-0.18,0.09,-0.36,0.09,-0.54,0],["c",-0.18,-0.09,-0.24,-0.15,-0.33,-0.33],["l",-0.06,-0.15],["l",0,-3.54],["c",0,-3.48,0,-3.54,0.06,-3.66],["c",0.09,-0.18,0.15,-0.24,0.33,-0.33],["z"],["m",7.71,0.63],["c",-0.36,-0.06,-0.9,-0.06,-1.14,0],["c",-0.3,0.03,-0.66,0.24,-0.87,0.42],["c",-0.6,0.54,-0.9,1.62,-0.75,2.82],["c",0.12,0.93,0.51,1.68,1.11,2.31],["c",0.75,0.72,1.83,1.2,2.85,1.26],["c",1.05,0.06,1.83,-0.54,2.1,-1.65],["c",0.21,-0.9,0.12,-1.95,-0.24,-2.82],["c",-0.36,-0.81,-1.08,-1.53,-1.95,-1.95],["c",-0.3,-0.15,-0.78,-0.3,-1.11,-0.39],["z"]],w:16.83,h:8.145},"noteheads.whole":{d:[["M",6.51,-4.05],["c",0.51,-0.03,2.01,0,2.52,0.03],["c",1.41,0.18,2.64,0.51,3.72,1.08],["c",1.2,0.63,1.95,1.41,2.19,2.31],["c",0.09,0.33,0.09,0.9,-0,1.23],["c",-0.24,0.9,-0.99,1.68,-2.19,2.31],["c",-1.08,0.57,-2.28,0.9,-3.75,1.08],["c",-0.66,0.06,-2.31,0.06,-2.97,0],["c",-1.47,-0.18,-2.67,-0.51,-3.75,-1.08],["c",-1.2,-0.63,-1.95,-1.41,-2.19,-2.31],["c",-0.09,-0.33,-0.09,-0.9,-0,-1.23],["c",0.24,-0.9,0.99,-1.68,2.19,-2.31],["c",1.2,-0.63,2.61,-0.99,4.23,-1.11],["z"],["m",0.57,0.66],["c",-0.87,-0.15,-1.53,0,-2.04,0.51],["c",-0.15,0.15,-0.24,0.27,-0.33,0.48],["c",-0.24,0.51,-0.36,1.08,-0.33,1.77],["c",0.03,0.69,0.18,1.26,0.42,1.77],["c",0.6,1.17,1.74,1.98,3.18,2.22],["c",1.11,0.21,1.95,-0.15,2.34,-0.99],["c",0.24,-0.51,0.36,-1.08,0.33,-1.8],["c",-0.06,-1.11,-0.45,-2.04,-1.17,-2.76],["c",-0.63,-0.63,-1.47,-1.05,-2.4,-1.2],["z"]],w:14.985,h:8.097},"noteheads.half":{d:[["M",7.44,-4.05],["c",0.06,-0.03,0.27,-0.03,0.48,-0.03],["c",1.05,0,1.71,0.24,2.1,0.81],["c",0.42,0.6,0.45,1.35,0.18,2.4],["c",-0.42,1.59,-1.14,2.73,-2.16,3.39],["c",-1.41,0.93,-3.18,1.44,-5.4,1.53],["c",-1.17,0.03,-1.89,-0.21,-2.28,-0.81],["c",-0.42,-0.6,-0.45,-1.35,-0.18,-2.4],["c",0.42,-1.59,1.14,-2.73,2.16,-3.39],["c",0.63,-0.42,1.23,-0.72,1.98,-0.96],["c",0.9,-0.3,1.65,-0.42,3.12,-0.54],["z"],["m",1.29,0.87],["c",-0.27,-0.09,-0.63,-0.12,-0.9,-0.03],["c",-0.72,0.24,-1.53,0.69,-3.27,1.8],["c",-2.34,1.5,-3.3,2.25,-3.57,2.79],["c",-0.36,0.72,-0.06,1.5,0.66,1.77],["c",0.24,0.12,0.69,0.09,0.99,0],["c",0.84,-0.3,1.92,-0.93,4.14,-2.37],["c",1.62,-1.08,2.37,-1.71,2.61,-2.19],["c",0.36,-0.72,0.06,-1.5,-0.66,-1.77],["z"]],w:10.37,h:8.132},"noteheads.quarter":{d:[["M",6.09,-4.05],["c",0.36,-0.03,1.2,0,1.53,0.06],["c",1.17,0.24,1.89,0.84,2.16,1.83],["c",0.06,0.18,0.06,0.3,0.06,0.66],["c",0,0.45,0,0.63,-0.15,1.08],["c",-0.66,2.04,-3.06,3.93,-5.52,4.38],["c",-0.54,0.09,-1.44,0.09,-1.83,0.03],["c",-1.23,-0.27,-1.98,-0.87,-2.25,-1.86],["c",-0.06,-0.18,-0.06,-0.3,-0.06,-0.66],["c",0,-0.45,0,-0.63,0.15,-1.08],["c",0.24,-0.78,0.75,-1.53,1.44,-2.22],["c",1.2,-1.2,2.85,-2.01,4.47,-2.22],["z"]],w:9.81,h:8.094},"scripts.ufermata":{d:[["M",-0.75,-10.77],["c",0.12,0,0.45,-0.03,0.69,-0.03],["c",2.91,-0.03,5.55,1.53,7.41,4.35],["c",1.17,1.71,1.95,3.72,2.43,6.03],["c",0.12,0.51,0.12,0.57,0.03,0.69],["c",-0.12,0.21,-0.48,0.27,-0.69,0.12],["c",-0.12,-0.09,-0.18,-0.24,-0.27,-0.69],["c",-0.78,-3.63,-3.42,-6.54,-6.78,-7.38],["c",-0.78,-0.21,-1.2,-0.24,-2.07,-0.24],["c",-0.63,-0,-0.84,-0,-1.2,0.06],["c",-1.83,0.27,-3.42,1.08,-4.8,2.37],["c",-1.41,1.35,-2.4,3.21,-2.85,5.19],["c",-0.09,0.45,-0.15,0.6,-0.27,0.69],["c",-0.21,0.15,-0.57,0.09,-0.69,-0.12],["c",-0.09,-0.12,-0.09,-0.18,0.03,-0.69],["c",0.33,-1.62,0.78,-3,1.47,-4.38],["c",1.77,-3.54,4.44,-5.67,7.56,-5.97],["z"],["m",0.33,7.47],["c",1.38,-0.3,2.58,0.9,2.31,2.25],["c",-0.15,0.72,-0.78,1.35,-1.47,1.5],["c",-1.38,0.27,-2.58,-0.93,-2.31,-2.31],["c",0.15,-0.69,0.78,-1.29,1.47,-1.44],["z"]],w:19.748,h:11.289},"scripts.dfermata":{d:[["M",-9.63,-0.42],["c",0.15,-0.09,0.36,-0.06,0.51,0.03],["c",0.12,0.09,0.18,0.24,0.27,0.66],["c",0.78,3.66,3.42,6.57,6.78,7.41],["c",0.78,0.21,1.2,0.24,2.07,0.24],["c",0.63,-0,0.84,-0,1.2,-0.06],["c",1.83,-0.27,3.42,-1.08,4.8,-2.37],["c",1.41,-1.35,2.4,-3.21,2.85,-5.22],["c",0.09,-0.42,0.15,-0.57,0.27,-0.66],["c",0.21,-0.15,0.57,-0.09,0.69,0.12],["c",0.09,0.12,0.09,0.18,-0.03,0.69],["c",-0.33,1.62,-0.78,3,-1.47,4.38],["c",-1.92,3.84,-4.89,6,-8.31,6],["c",-3.42,0,-6.39,-2.16,-8.31,-6],["c",-0.48,-0.96,-0.84,-1.92,-1.14,-2.97],["c",-0.18,-0.69,-0.42,-1.74,-0.42,-1.92],["c",0,-0.12,0.09,-0.27,0.24,-0.33],["z"],["m",9.21,0],["c",1.2,-0.27,2.34,0.63,2.34,1.86],["c",-0,0.9,-0.66,1.68,-1.5,1.89],["c",-1.38,0.27,-2.58,-0.93,-2.31,-2.31],["c",0.15,-0.69,0.78,-1.29,1.47,-1.44],["z"]],w:19.744,h:11.274},"scripts.sforzato":{d:[["M",-6.45,-3.69],["c",0.06,-0.03,0.15,-0.06,0.18,-0.06],["c",0.06,0,2.85,0.72,6.24,1.59],["l",6.33,1.65],["c",0.33,0.06,0.45,0.21,0.45,0.51],["c",0,0.3,-0.12,0.45,-0.45,0.51],["l",-6.33,1.65],["c",-3.39,0.87,-6.18,1.59,-6.21,1.59],["c",-0.21,-0,-0.48,-0.24,-0.51,-0.45],["c",0,-0.15,0.06,-0.36,0.18,-0.45],["c",0.09,-0.06,0.87,-0.27,3.84,-1.05],["c",2.04,-0.54,3.84,-0.99,4.02,-1.02],["c",0.15,-0.06,1.14,-0.24,2.22,-0.42],["c",1.05,-0.18,1.92,-0.36,1.92,-0.36],["c",0,-0,-0.87,-0.18,-1.92,-0.36],["c",-1.08,-0.18,-2.07,-0.36,-2.22,-0.42],["c",-0.18,-0.03,-1.98,-0.48,-4.02,-1.02],["c",-2.97,-0.78,-3.75,-0.99,-3.84,-1.05],["c",-0.12,-0.09,-0.18,-0.3,-0.18,-0.45],["c",0.03,-0.15,0.15,-0.3,0.3,-0.39],["z"]],w:13.5,h:7.5},"scripts.staccato":{d:[["M",-0.36,-1.47],["c",0.93,-0.21,1.86,0.51,1.86,1.47],["c",-0,0.93,-0.87,1.65,-1.8,1.47],["c",-0.54,-0.12,-1.02,-0.57,-1.14,-1.08],["c",-0.21,-0.81,0.27,-1.65,1.08,-1.86],["z"]],w:2.989,h:3.004},"scripts.tenuto":{d:[["M",-4.2,-0.48],["l",0.12,-0.06],["l",4.08,0],["l",4.08,0],["l",0.12,0.06],["c",0.39,0.21,0.39,0.75,0,0.96],["l",-0.12,0.06],["l",-4.08,0],["l",-4.08,0],["l",-0.12,-0.06],["c",-0.39,-0.21,-0.39,-0.75,0,-0.96],["z"]],w:8.985,h:1.08},"scripts.umarcato":{d:[["M",-0.15,-8.19],["c",0.15,-0.12,0.36,-0.03,0.45,0.15],["c",0.21,0.42,3.45,7.65,3.45,7.71],["c",-0,0.12,-0.12,0.27,-0.21,0.3],["c",-0.03,0.03,-0.51,0.03,-1.14,0.03],["c",-1.05,0,-1.08,0,-1.17,-0.06],["c",-0.09,-0.06,-0.24,-0.36,-1.17,-2.4],["c",-0.57,-1.29,-1.05,-2.34,-1.08,-2.34],["c",-0,-0.03,-0.51,1.02,-1.08,2.34],["c",-0.93,2.07,-1.08,2.34,-1.14,2.4],["c",-0.06,0.03,-0.15,0.06,-0.18,0.06],["c",-0.15,0,-0.33,-0.18,-0.33,-0.33],["c",-0,-0.06,3.24,-7.32,3.45,-7.71],["c",0.03,-0.06,0.09,-0.15,0.15,-0.15],["z"]],w:7.5,h:8.245},"scripts.dmarcato":{d:[["M",-3.57,0.03],["c",0.03,0,0.57,-0.03,1.17,-0.03],["c",1.05,0,1.08,0,1.17,0.06],["c",0.09,0.06,0.24,0.36,1.17,2.4],["c",0.57,1.29,1.05,2.34,1.08,2.34],["c",0,0.03,0.51,-1.02,1.08,-2.34],["c",0.93,-2.07,1.08,-2.34,1.14,-2.4],["c",0.06,-0.03,0.15,-0.06,0.18,-0.06],["c",0.15,0,0.33,0.18,0.33,0.33],["c",0,0.09,-3.45,7.74,-3.54,7.83],["c",-0.12,0.12,-0.3,0.12,-0.42,0],["c",-0.09,-0.09,-3.54,-7.74,-3.54,-7.83],["c",0,-0.09,0.12,-0.27,0.18,-0.3],["z"]],w:7.5,h:8.25},"scripts.stopped":{d:[["M",-0.27,-4.08],["c",0.18,-0.09,0.36,-0.09,0.54,0],["c",0.18,0.09,0.24,0.15,0.33,0.3],["l",0.06,0.15],["l",-0,1.5],["l",-0,1.47],["l",1.47,0],["l",1.5,0],["l",0.15,0.06],["c",0.15,0.09,0.21,0.15,0.3,0.33],["c",0.09,0.18,0.09,0.36,-0,0.54],["c",-0.09,0.18,-0.15,0.24,-0.33,0.33],["c",-0.12,0.06,-0.18,0.06,-1.62,0.06],["l",-1.47,0],["l",-0,1.47],["l",-0,1.47],["l",-0.06,0.15],["c",-0.09,0.18,-0.15,0.24,-0.33,0.33],["c",-0.18,0.09,-0.36,0.09,-0.54,0],["c",-0.18,-0.09,-0.24,-0.15,-0.33,-0.33],["l",-0.06,-0.15],["l",-0,-1.47],["l",-0,-1.47],["l",-1.47,0],["c",-1.44,0,-1.5,0,-1.62,-0.06],["c",-0.18,-0.09,-0.24,-0.15,-0.33,-0.33],["c",-0.09,-0.18,-0.09,-0.36,-0,-0.54],["c",0.09,-0.18,0.15,-0.24,0.33,-0.33],["l",0.15,-0.06],["l",1.47,0],["l",1.47,0],["l",-0,-1.47],["c",-0,-1.44,-0,-1.5,0.06,-1.62],["c",0.09,-0.18,0.15,-0.24,0.33,-0.33],["z"]],w:8.295,h:8.295},"scripts.upbow":{d:[["M",-4.65,-15.54],["c",0.12,-0.09,0.36,-0.06,0.48,0.03],["c",0.03,0.03,0.09,0.09,0.12,0.15],["c",0.03,0.06,0.66,2.13,1.41,4.62],["c",1.35,4.41,1.38,4.56,2.01,6.96],["l",0.63,2.46],["l",0.63,-2.46],["c",0.63,-2.4,0.66,-2.55,2.01,-6.96],["c",0.75,-2.49,1.38,-4.56,1.41,-4.62],["c",0.06,-0.15,0.18,-0.21,0.36,-0.24],["c",0.15,0,0.3,0.06,0.39,0.18],["c",0.15,0.21,0.24,-0.18,-2.1,7.56],["c",-1.2,3.96,-2.22,7.32,-2.25,7.41],["c",0,0.12,-0.06,0.27,-0.09,0.3],["c",-0.12,0.21,-0.6,0.21,-0.72,0],["c",-0.03,-0.03,-0.09,-0.18,-0.09,-0.3],["c",-0.03,-0.09,-1.05,-3.45,-2.25,-7.41],["c",-2.34,-7.74,-2.25,-7.35,-2.1,-7.56],["c",0.03,-0.03,0.09,-0.09,0.15,-0.12],["z"]],w:9.73,h:15.608},"scripts.downbow":{d:[["M",-5.55,-9.93],["l",0.09,-0.06],["l",5.46,0],["l",5.46,0],["l",0.09,0.06],["l",0.06,0.09],["l",0,4.77],["c",0,5.28,0,4.89,-0.18,5.01],["c",-0.18,0.12,-0.42,0.06,-0.54,-0.12],["c",-0.06,-0.09,-0.06,-0.18,-0.06,-2.97],["l",0,-2.85],["l",-4.83,0],["l",-4.83,0],["l",0,2.85],["c",0,2.79,0,2.88,-0.06,2.97],["c",-0.15,0.24,-0.51,0.24,-0.66,0],["c",-0.06,-0.09,-0.06,-0.21,-0.06,-4.89],["l",0,-4.77],["z"]],w:11.22,h:9.992},"scripts.turn":{d:[["M",-4.77,-3.9],["c",0.36,-0.06,1.05,-0.06,1.44,0.03],["c",0.78,0.15,1.5,0.51,2.34,1.14],["c",0.6,0.45,1.05,0.87,2.22,2.01],["c",1.11,1.08,1.62,1.5,2.22,1.86],["c",0.6,0.36,1.32,0.57,1.92,0.57],["c",0.9,-0,1.71,-0.57,1.89,-1.35],["c",0.24,-0.93,-0.39,-1.89,-1.35,-2.1],["l",-0.15,-0.06],["l",-0.09,0.15],["c",-0.03,0.09,-0.15,0.24,-0.24,0.33],["c",-0.72,0.72,-2.04,0.54,-2.49,-0.36],["c",-0.48,-0.93,0.03,-1.86,1.17,-2.19],["c",0.3,-0.09,1.02,-0.09,1.35,-0],["c",0.99,0.27,1.74,0.87,2.25,1.83],["c",0.69,1.41,0.63,3,-0.21,4.26],["c",-0.21,0.3,-0.69,0.81,-0.99,1.02],["c",-0.3,0.21,-0.84,0.45,-1.17,0.54],["c",-1.23,0.36,-2.49,0.15,-3.72,-0.6],["c",-0.75,-0.48,-1.41,-1.02,-2.85,-2.46],["c",-1.11,-1.08,-1.62,-1.5,-2.22,-1.86],["c",-0.6,-0.36,-1.32,-0.57,-1.92,-0.57],["c",-0.9,0,-1.71,0.57,-1.89,1.35],["c",-0.24,0.93,0.39,1.89,1.35,2.1],["l",0.15,0.06],["l",0.09,-0.15],["c",0.03,-0.09,0.15,-0.24,0.24,-0.33],["c",0.72,-0.72,2.04,-0.54,2.49,0.36],["c",0.48,0.93,-0.03,1.86,-1.17,2.19],["c",-0.3,0.09,-1.02,0.09,-1.35,0],["c",-0.99,-0.27,-1.74,-0.87,-2.25,-1.83],["c",-0.69,-1.41,-0.63,-3,0.21,-4.26],["c",0.21,-0.3,0.69,-0.81,0.99,-1.02],["c",0.48,-0.33,1.11,-0.57,1.74,-0.66],["z"]],w:16.366,h:7.893},"scripts.trill":{d:[["M",-0.51,-16.02],["c",0.12,-0.09,0.21,-0.18,0.21,-0.18],["l",-0.81,4.02],["l",-0.81,4.02],["c",0.03,0,0.51,-0.27,1.08,-0.6],["c",0.6,-0.3,1.14,-0.63,1.26,-0.66],["c",1.14,-0.54,2.31,-0.6,3.09,-0.18],["c",0.27,0.15,0.54,0.36,0.6,0.51],["l",0.06,0.12],["l",0.21,-0.21],["c",0.9,-0.81,2.22,-0.99,3.12,-0.42],["c",0.6,0.42,0.9,1.14,0.78,2.07],["c",-0.15,1.29,-1.05,2.31,-1.95,2.25],["c",-0.48,-0.03,-0.78,-0.3,-0.96,-0.81],["c",-0.09,-0.27,-0.09,-0.9,-0.03,-1.2],["c",0.21,-0.75,0.81,-1.23,1.59,-1.32],["l",0.24,-0.03],["l",-0.09,-0.12],["c",-0.51,-0.66,-1.62,-0.63,-2.31,0.03],["c",-0.39,0.42,-0.3,0.09,-1.23,4.77],["l",-0.81,4.14],["c",-0.03,0,-0.12,-0.03,-0.21,-0.09],["c",-0.33,-0.15,-0.54,-0.18,-0.99,-0.18],["c",-0.42,0,-0.66,0.03,-1.05,0.18],["c",-0.12,0.06,-0.21,0.09,-0.21,0.09],["c",0,-0.03,0.36,-1.86,0.81,-4.11],["c",0.9,-4.47,0.87,-4.26,0.69,-4.53],["c",-0.21,-0.36,-0.66,-0.51,-1.17,-0.36],["c",-0.15,0.06,-2.22,1.14,-2.58,1.38],["c",-0.12,0.09,-0.12,0.09,-0.21,0.6],["l",-0.09,0.51],["l",0.21,0.24],["c",0.63,0.75,1.02,1.47,1.2,2.19],["c",0.06,0.27,0.06,0.36,0.06,0.81],["c",0,0.42,0,0.54,-0.06,0.78],["c",-0.15,0.54,-0.33,0.93,-0.63,1.35],["c",-0.18,0.24,-0.57,0.63,-0.81,0.78],["c",-0.24,0.15,-0.63,0.36,-0.84,0.42],["c",-0.27,0.06,-0.66,0.06,-0.87,0.03],["c",-0.81,-0.18,-1.32,-1.05,-1.38,-2.46],["c",-0.03,-0.6,0.03,-0.99,0.33,-2.46],["c",0.21,-1.08,0.24,-1.32,0.21,-1.29],["c",-1.2,0.48,-2.4,0.75,-3.21,0.72],["c",-0.69,-0.06,-1.17,-0.3,-1.41,-0.72],["c",-0.39,-0.75,-0.12,-1.8,0.66,-2.46],["c",0.24,-0.18,0.69,-0.42,1.02,-0.51],["c",0.69,-0.18,1.53,-0.15,2.31,0.09],["c",0.3,0.09,0.75,0.3,0.99,0.45],["c",0.12,0.09,0.15,0.09,0.15,0.03],["c",0.03,-0.03,0.33,-1.59,0.72,-3.45],["c",0.36,-1.86,0.66,-3.42,0.69,-3.45],["c",0,-0.03,0.03,-0.03,0.21,0.03],["c",0.21,0.06,0.27,0.06,0.48,0.06],["c",0.42,-0.03,0.78,-0.18,1.26,-0.48],["c",0.15,-0.12,0.36,-0.27,0.48,-0.39],["z"],["m",-5.73,7.68],["c",-0.27,-0.03,-0.96,-0.06,-1.2,-0.03],["c",-0.81,0.12,-1.35,0.57,-1.5,1.2],["c",-0.18,0.66,0.12,1.14,0.75,1.29],["c",0.66,0.12,1.92,-0.12,3.18,-0.66],["l",0.33,-0.15],["l",0.09,-0.39],["c",0.06,-0.21,0.09,-0.42,0.09,-0.45],["c",0,-0.03,-0.45,-0.3,-0.75,-0.45],["c",-0.27,-0.15,-0.66,-0.27,-0.99,-0.36],["z"],["m",4.29,3.63],["c",-0.24,-0.39,-0.51,-0.75,-0.51,-0.69],["c",-0.06,0.12,-0.39,1.92,-0.45,2.28],["c",-0.09,0.54,-0.12,1.14,-0.06,1.38],["c",0.06,0.42,0.21,0.6,0.51,0.57],["c",0.39,-0.06,0.75,-0.48,0.93,-1.14],["c",0.09,-0.33,0.09,-1.05,-0,-1.38],["c",-0.09,-0.39,-0.24,-0.69,-0.42,-1.02],["z"]],w:17.963,h:16.49},"scripts.segno":{d:[["M",-3.72,-11.22],["c",0.78,-0.09,1.59,0.03,2.31,0.42],["c",1.2,0.6,2.01,1.71,2.31,3.09],["c",0.09,0.42,0.09,1.2,0.03,1.5],["c",-0.15,0.45,-0.39,0.81,-0.66,0.93],["c",-0.33,0.18,-0.84,0.21,-1.23,0.15],["c",-0.81,-0.18,-1.32,-0.93,-1.26,-1.89],["c",0.03,-0.36,0.09,-0.57,0.24,-0.9],["c",0.15,-0.33,0.45,-0.6,0.72,-0.75],["c",0.12,-0.06,0.18,-0.09,0.18,-0.12],["c",0,-0.03,-0.03,-0.15,-0.09,-0.24],["c",-0.18,-0.45,-0.54,-0.87,-0.96,-1.08],["c",-1.11,-0.57,-2.34,-0.18,-2.88,0.9],["c",-0.24,0.51,-0.33,1.11,-0.24,1.83],["c",0.27,1.92,1.5,3.54,3.93,5.13],["c",0.48,0.33,1.26,0.78,1.29,0.78],["c",0.03,0,1.35,-2.19,2.94,-4.89],["l",2.88,-4.89],["l",0.84,0],["l",0.87,0],["l",-0.03,0.06],["c",-0.15,0.21,-6.15,10.41,-6.15,10.44],["c",0,0,0.21,0.15,0.48,0.27],["c",2.61,1.47,4.35,3.03,5.13,4.65],["c",1.14,2.34,0.51,5.07,-1.44,6.39],["c",-0.66,0.42,-1.32,0.63,-2.13,0.69],["c",-2.01,0.09,-3.81,-1.41,-4.26,-3.54],["c",-0.09,-0.42,-0.09,-1.2,-0.03,-1.5],["c",0.15,-0.45,0.39,-0.81,0.66,-0.93],["c",0.33,-0.18,0.84,-0.21,1.23,-0.15],["c",0.81,0.18,1.32,0.93,1.26,1.89],["c",-0.03,0.36,-0.09,0.57,-0.24,0.9],["c",-0.15,0.33,-0.45,0.6,-0.72,0.75],["c",-0.12,0.06,-0.18,0.09,-0.18,0.12],["c",0,0.03,0.03,0.15,0.09,0.24],["c",0.18,0.45,0.54,0.87,0.96,1.08],["c",1.11,0.57,2.34,0.18,2.88,-0.9],["c",0.24,-0.51,0.33,-1.11,0.24,-1.83],["c",-0.27,-1.92,-1.5,-3.54,-3.93,-5.13],["c",-0.48,-0.33,-1.26,-0.78,-1.29,-0.78],["c",-0.03,0,-1.35,2.19,-2.91,4.89],["l",-2.88,4.89],["l",-0.87,0],["l",-0.87,0],["l",0.03,-0.06],["c",0.15,-0.21,6.15,-10.41,6.15,-10.44],["c",0,0,-0.21,-0.15,-0.48,-0.3],["c",-2.61,-1.44,-4.35,-3,-5.13,-4.62],["c",-0.9,-1.89,-0.72,-4.02,0.48,-5.52],["c",0.69,-0.84,1.68,-1.41,2.73,-1.53],["z"],["m",8.76,9.09],["c",0.03,-0.03,0.15,-0.03,0.27,-0.03],["c",0.33,0.03,0.57,0.18,0.72,0.48],["c",0.09,0.18,0.09,0.57,0,0.75],["c",-0.09,0.18,-0.21,0.3,-0.36,0.39],["c",-0.15,0.06,-0.21,0.06,-0.39,0.06],["c",-0.21,0,-0.27,0,-0.39,-0.06],["c",-0.3,-0.15,-0.48,-0.45,-0.48,-0.75],["c",0,-0.39,0.24,-0.72,0.63,-0.84],["z"],["m",-10.53,2.61],["c",0.03,-0.03,0.15,-0.03,0.27,-0.03],["c",0.33,0.03,0.57,0.18,0.72,0.48],["c",0.09,0.18,0.09,0.57,0,0.75],["c",-0.09,0.18,-0.21,0.3,-0.36,0.39],["c",-0.15,0.06,-0.21,0.06,-0.39,0.06],["c",-0.21,0,-0.27,0,-0.39,-0.06],["c",-0.3,-0.15,-0.48,-0.45,-0.48,-0.75],["c",0,-0.39,0.24,-0.72,0.63,-0.84],["z"]],w:15,h:22.504},"scripts.coda":{d:[["M",-0.21,-10.47],["c",0.18,-0.12,0.42,-0.06,0.54,0.12],["c",0.06,0.09,0.06,0.18,0.06,1.5],["l",0,1.38],["l",0.18,0],["c",0.39,0.06,0.96,0.24,1.38,0.48],["c",1.68,0.93,2.82,3.24,3.03,6.12],["c",0.03,0.24,0.03,0.45,0.03,0.45],["c",0,0.03,0.6,0.03,1.35,0.03],["c",1.5,0,1.47,0,1.59,0.18],["c",0.09,0.12,0.09,0.3,-0,0.42],["c",-0.12,0.18,-0.09,0.18,-1.59,0.18],["c",-0.75,0,-1.35,0,-1.35,0.03],["c",-0,0,-0,0.21,-0.03,0.42],["c",-0.24,3.15,-1.53,5.58,-3.45,6.36],["c",-0.27,0.12,-0.72,0.24,-0.96,0.27],["l",-0.18,-0],["l",-0,1.38],["c",-0,1.32,-0,1.41,-0.06,1.5],["c",-0.15,0.24,-0.51,0.24,-0.66,-0],["c",-0.06,-0.09,-0.06,-0.18,-0.06,-1.5],["l",-0,-1.38],["l",-0.18,-0],["c",-0.39,-0.06,-0.96,-0.24,-1.38,-0.48],["c",-1.68,-0.93,-2.82,-3.24,-3.03,-6.15],["c",-0.03,-0.21,-0.03,-0.42,-0.03,-0.42],["c",0,-0.03,-0.6,-0.03,-1.35,-0.03],["c",-1.5,-0,-1.47,-0,-1.59,-0.18],["c",-0.09,-0.12,-0.09,-0.3,0,-0.42],["c",0.12,-0.18,0.09,-0.18,1.59,-0.18],["c",0.75,-0,1.35,-0,1.35,-0.03],["c",0,-0,0,-0.21,0.03,-0.45],["c",0.24,-3.12,1.53,-5.55,3.45,-6.33],["c",0.27,-0.12,0.72,-0.24,0.96,-0.27],["l",0.18,-0],["l",0,-1.38],["c",0,-1.53,0,-1.5,0.18,-1.62],["z"],["m",-0.18,6.93],["c",0,-2.97,0,-3.15,-0.06,-3.15],["c",-0.09,0,-0.51,0.15,-0.66,0.21],["c",-0.87,0.51,-1.38,1.62,-1.56,3.51],["c",-0.06,0.54,-0.12,1.59,-0.12,2.16],["l",0,0.42],["l",1.2,0],["l",1.2,0],["l",0,-3.15],["z"],["m",1.17,-3.06],["c",-0.09,-0.03,-0.21,-0.06,-0.27,-0.09],["l",-0.12,0],["l",0,3.15],["l",0,3.15],["l",1.2,0],["l",1.2,0],["l",0,-0.81],["c",-0.06,-2.4,-0.33,-3.69,-0.93,-4.59],["c",-0.27,-0.39,-0.66,-0.69,-1.08,-0.81],["z"],["m",-1.17,10.14],["l",0,-3.15],["l",-1.2,-0],["l",-1.2,-0],["l",0,0.81],["c",0.03,0.96,0.06,1.47,0.15,2.13],["c",0.24,2.04,0.96,3.12,2.13,3.36],["l",0.12,-0],["l",0,-3.15],["z"],["m",3.18,-2.34],["l",0,-0.81],["l",-1.2,0],["l",-1.2,0],["l",0,3.15],["l",0,3.15],["l",0.12,0],["c",1.17,-0.24,1.89,-1.32,2.13,-3.36],["c",0.09,-0.66,0.12,-1.17,0.15,-2.13],["z"]],w:16.035,h:21.062},"scripts.comma":{d:[["M",1.14,-4.62],["c",0.3,-0.12,0.69,-0.03,0.93,0.15],["c",0.12,0.12,0.36,0.45,0.51,0.78],["c",0.9,1.77,0.54,4.05,-1.08,6.75],["c",-0.36,0.63,-0.87,1.38,-0.96,1.44],["c",-0.18,0.12,-0.42,0.06,-0.54,-0.12],["c",-0.09,-0.18,-0.09,-0.3,0.12,-0.6],["c",0.96,-1.44,1.44,-2.97,1.38,-4.35],["c",-0.06,-0.93,-0.3,-1.68,-0.78,-2.46],["c",-0.27,-0.39,-0.33,-0.63,-0.24,-0.96],["c",0.09,-0.27,0.36,-0.54,0.66,-0.63],["z"]],w:3.042,h:9.237},"scripts.roll":{d:[["M",1.95,-6],["c",0.21,-0.09,0.36,-0.09,0.57,0],["c",0.39,0.15,0.63,0.39,1.47,1.35],["c",0.66,0.75,0.78,0.87,1.08,1.05],["c",0.75,0.45,1.65,0.42,2.4,-0.06],["c",0.12,-0.09,0.27,-0.27,0.54,-0.6],["c",0.42,-0.54,0.51,-0.63,0.69,-0.63],["c",0.09,0,0.3,0.12,0.36,0.21],["c",0.09,0.12,0.12,0.3,0.03,0.42],["c",-0.06,0.12,-3.15,3.9,-3.3,4.08],["c",-0.06,0.06,-0.18,0.12,-0.27,0.18],["c",-0.27,0.12,-0.6,0.06,-0.99,-0.27],["c",-0.27,-0.21,-0.42,-0.39,-1.08,-1.14],["c",-0.63,-0.72,-0.81,-0.9,-1.17,-1.08],["c",-0.36,-0.18,-0.57,-0.21,-0.99,-0.21],["c",-0.39,0,-0.63,0.03,-0.93,0.18],["c",-0.36,0.15,-0.51,0.27,-0.9,0.81],["c",-0.24,0.27,-0.45,0.51,-0.48,0.54],["c",-0.12,0.09,-0.27,0.06,-0.39,0],["c",-0.24,-0.15,-0.33,-0.39,-0.21,-0.6],["c",0.09,-0.12,3.18,-3.87,3.33,-4.02],["c",0.06,-0.06,0.18,-0.15,0.24,-0.21],["z"]],w:10.817,h:6.125},"scripts.prall":{d:[["M",-4.38,-3.69],["c",0.06,-0.03,0.18,-0.06,0.24,-0.06],["c",0.3,0,0.27,-0.03,1.89,1.95],["l",1.53,1.83],["c",0.03,-0,0.57,-0.84,1.23,-1.83],["c",1.14,-1.68,1.23,-1.83,1.35,-1.89],["c",0.06,-0.03,0.18,-0.06,0.24,-0.06],["c",0.3,0,0.27,-0.03,1.89,1.95],["l",1.53,1.83],["l",0.48,-0.69],["c",0.51,-0.78,0.54,-0.84,0.69,-0.9],["c",0.42,-0.18,0.87,0.15,0.81,0.6],["c",-0.03,0.12,-0.3,0.51,-1.5,2.37],["c",-1.38,2.07,-1.5,2.22,-1.62,2.28],["c",-0.06,0.03,-0.18,0.06,-0.24,0.06],["c",-0.3,0,-0.27,0.03,-1.89,-1.95],["l",-1.53,-1.83],["c",-0.03,0,-0.57,0.84,-1.23,1.83],["c",-1.14,1.68,-1.23,1.83,-1.35,1.89],["c",-0.06,0.03,-0.18,0.06,-0.24,0.06],["c",-0.3,0,-0.27,0.03,-1.89,-1.95],["l",-1.53,-1.83],["l",-0.48,0.69],["c",-0.51,0.78,-0.54,0.84,-0.69,0.9],["c",-0.42,0.18,-0.87,-0.15,-0.81,-0.6],["c",0.03,-0.12,0.3,-0.51,1.5,-2.37],["c",1.38,-2.07,1.5,-2.22,1.62,-2.28],["z"]],w:15.011,h:7.5},"scripts.mordent":{d:[["M",-0.21,-4.95],["c",0.27,-0.15,0.63,0,0.75,0.27],["c",0.06,0.12,0.06,0.24,0.06,1.44],["l",0,1.29],["l",0.57,-0.84],["c",0.51,-0.75,0.57,-0.84,0.69,-0.9],["c",0.06,-0.03,0.18,-0.06,0.24,-0.06],["c",0.3,0,0.27,-0.03,1.89,1.95],["l",1.53,1.83],["l",0.48,-0.69],["c",0.51,-0.78,0.54,-0.84,0.69,-0.9],["c",0.42,-0.18,0.87,0.15,0.81,0.6],["c",-0.03,0.12,-0.3,0.51,-1.5,2.37],["c",-1.38,2.07,-1.5,2.22,-1.62,2.28],["c",-0.06,0.03,-0.18,0.06,-0.24,0.06],["c",-0.3,0,-0.27,0.03,-1.83,-1.89],["c",-0.81,-0.99,-1.5,-1.8,-1.53,-1.86],["c",-0.06,-0.03,-0.06,-0.03,-0.12,0.03],["c",-0.06,0.06,-0.06,0.15,-0.06,2.28],["c",-0,1.95,-0,2.25,-0.06,2.34],["c",-0.18,0.45,-0.81,0.48,-1.05,0.03],["c",-0.03,-0.06,-0.06,-0.24,-0.06,-1.41],["l",-0,-1.35],["l",-0.57,0.84],["c",-0.54,0.78,-0.6,0.87,-0.72,0.93],["c",-0.06,0.03,-0.18,0.06,-0.24,0.06],["c",-0.3,0,-0.27,0.03,-1.89,-1.95],["l",-1.53,-1.83],["l",-0.48,0.69],["c",-0.51,0.78,-0.54,0.84,-0.69,0.9],["c",-0.42,0.18,-0.87,-0.15,-0.81,-0.6],["c",0.03,-0.12,0.3,-0.51,1.5,-2.37],["c",1.38,-2.07,1.5,-2.22,1.62,-2.28],["c",0.06,-0.03,0.18,-0.06,0.24,-0.06],["c",0.3,0,0.27,-0.03,1.89,1.95],["l",1.53,1.83],["c",0.03,-0,0.06,-0.06,0.09,-0.09],["c",0.06,-0.12,0.06,-0.15,0.06,-2.28],["c",-0,-1.92,-0,-2.22,0.06,-2.31],["c",0.06,-0.15,0.15,-0.24,0.3,-0.3],["z"]],w:15.011,h:10.012},"flags.u8th":{d:[["M",-0.42,3.75],["l",0,-3.75],["l",0.21,0],["l",0.21,0],["l",0,0.18],["c",0,0.3,0.06,0.84,0.12,1.23],["c",0.24,1.53,0.9,3.12,2.13,5.16],["l",0.99,1.59],["c",0.87,1.44,1.38,2.34,1.77,3.09],["c",0.81,1.68,1.2,3.06,1.26,4.53],["c",0.03,1.53,-0.21,3.27,-0.75,5.01],["c",-0.21,0.69,-0.51,1.5,-0.6,1.59],["c",-0.09,0.12,-0.27,0.21,-0.42,0.21],["c",-0.15,0,-0.42,-0.12,-0.51,-0.21],["c",-0.15,-0.18,-0.18,-0.42,-0.09,-0.66],["c",0.15,-0.33,0.45,-1.2,0.57,-1.62],["c",0.42,-1.38,0.6,-2.58,0.6,-3.9],["c",0,-0.66,0,-0.81,-0.06,-1.11],["c",-0.39,-2.07,-1.8,-4.26,-4.59,-7.14],["l",-0.42,-0.45],["l",-0.21,0],["l",-0.21,0],["l",0,-3.75],["z"]],w:6.692,h:22.59},"flags.u16th":{d:[["M",-0.42,7.5],["l",0,-7.5],["l",0.21,0],["l",0.21,0],["l",0,0.39],["c",0.06,1.08,0.39,2.19,0.99,3.39],["c",0.45,0.9,0.87,1.59,1.95,3.12],["c",1.29,1.86,1.77,2.64,2.22,3.57],["c",0.45,0.93,0.72,1.8,0.87,2.64],["c",0.06,0.51,0.06,1.5,0,1.92],["c",-0.12,0.6,-0.3,1.2,-0.54,1.71],["l",-0.09,0.24],["l",0.18,0.45],["c",0.51,1.2,0.72,2.22,0.69,3.42],["c",-0.06,1.53,-0.39,3.03,-0.99,4.53],["c",-0.3,0.75,-0.36,0.81,-0.57,0.9],["c",-0.15,0.09,-0.33,0.06,-0.48,-0],["c",-0.18,-0.09,-0.27,-0.18,-0.33,-0.33],["c",-0.09,-0.18,-0.06,-0.3,0.12,-0.75],["c",0.66,-1.41,1.02,-2.88,1.08,-4.32],["c",0,-0.6,-0.03,-1.05,-0.18,-1.59],["c",-0.3,-1.2,-0.99,-2.4,-2.25,-3.87],["c",-0.42,-0.48,-1.53,-1.62,-2.19,-2.22],["l",-0.45,-0.42],["l",-0.03,1.11],["l",0,1.11],["l",-0.21,-0],["l",-0.21,-0],["l",0,-7.5],["z"],["m",1.65,0.09],["c",-0.3,-0.3,-0.69,-0.72,-0.9,-0.87],["l",-0.33,-0.33],["l",0,0.15],["c",0,0.3,0.06,0.81,0.15,1.26],["c",0.27,1.29,0.87,2.61,2.04,4.29],["c",0.15,0.24,0.6,0.87,0.96,1.38],["l",1.08,1.53],["l",0.42,0.63],["c",0.03,0,0.12,-0.36,0.21,-0.72],["c",0.06,-0.33,0.06,-1.2,0,-1.62],["c",-0.33,-1.71,-1.44,-3.48,-3.63,-5.7],["z"]],w:6.693,h:26.337},"flags.u32nd":{d:[["M",-0.42,11.247],["l",0,-11.25],["l",0.21,0],["l",0.21,0],["l",0,0.36],["c",0.09,1.68,0.69,3.27,2.07,5.46],["l",0.87,1.35],["c",1.02,1.62,1.47,2.37,1.86,3.18],["c",0.48,1.02,0.78,1.92,0.93,2.88],["c",0.06,0.48,0.06,1.5,0,1.89],["c",-0.09,0.42,-0.21,0.87,-0.36,1.26],["l",-0.12,0.3],["l",0.15,0.39],["c",0.69,1.56,0.84,2.88,0.54,4.38],["c",-0.09,0.45,-0.27,1.08,-0.45,1.47],["l",-0.12,0.24],["l",0.18,0.36],["c",0.33,0.72,0.57,1.56,0.69,2.34],["c",0.12,1.02,-0.06,2.52,-0.42,3.84],["c",-0.27,0.93,-0.75,2.13,-0.93,2.31],["c",-0.18,0.15,-0.45,0.18,-0.66,0.09],["c",-0.18,-0.09,-0.27,-0.18,-0.33,-0.33],["c",-0.09,-0.18,-0.06,-0.3,0.06,-0.6],["c",0.21,-0.36,0.42,-0.9,0.57,-1.38],["c",0.51,-1.41,0.69,-3.06,0.48,-4.08],["c",-0.15,-0.81,-0.57,-1.68,-1.2,-2.55],["c",-0.72,-0.99,-1.83,-2.13,-3.3,-3.33],["l",-0.48,-0.42],["l",-0.03,1.53],["l",0,1.56],["l",-0.21,0],["l",-0.21,0],["l",0,-11.25],["z"],["m",1.26,-3.96],["c",-0.27,-0.3,-0.54,-0.6,-0.66,-0.72],["l",-0.18,-0.21],["l",0,0.42],["c",0.06,0.87,0.24,1.74,0.66,2.67],["c",0.36,0.87,0.96,1.86,1.92,3.18],["c",0.21,0.33,0.63,0.87,0.87,1.23],["c",0.27,0.39,0.6,0.84,0.75,1.08],["l",0.27,0.39],["l",0.03,-0.12],["c",0.12,-0.45,0.15,-1.05,0.09,-1.59],["c",-0.27,-1.86,-1.38,-3.78,-3.75,-6.33],["z"],["m",-0.27,6.09],["c",-0.27,-0.21,-0.48,-0.42,-0.51,-0.45],["c",-0.06,-0.03,-0.06,-0.03,-0.06,0.21],["c",0,0.9,0.3,2.04,0.81,3.09],["c",0.48,1.02,0.96,1.77,2.37,3.63],["c",0.6,0.78,1.05,1.44,1.29,1.77],["c",0.06,0.12,0.15,0.21,0.15,0.18],["c",0.03,-0.03,0.18,-0.57,0.24,-0.87],["c",0.06,-0.45,0.06,-1.32,-0.03,-1.74],["c",-0.09,-0.48,-0.24,-0.9,-0.51,-1.44],["c",-0.66,-1.35,-1.83,-2.7,-3.75,-4.38],["z"]],w:6.697,h:32.145},"flags.u64th":{d:[["M",-0.42,15],["l",0,-15],["l",0.21,0],["l",0.21,0],["l",0,0.36],["c",0.06,1.2,0.39,2.37,1.02,3.66],["c",0.39,0.81,0.84,1.56,1.8,3.09],["c",0.81,1.26,1.05,1.68,1.35,2.22],["c",0.87,1.5,1.35,2.79,1.56,4.08],["c",0.06,0.54,0.06,1.56,-0.03,2.04],["c",-0.09,0.48,-0.21,0.99,-0.36,1.35],["l",-0.12,0.27],["l",0.12,0.27],["c",0.09,0.15,0.21,0.45,0.27,0.66],["c",0.69,1.89,0.63,3.66,-0.18,5.46],["l",-0.18,0.39],["l",0.15,0.33],["c",0.3,0.66,0.51,1.44,0.63,2.1],["c",0.06,0.48,0.06,1.35,0,1.71],["c",-0.15,0.57,-0.42,1.2,-0.78,1.68],["l",-0.21,0.27],["l",0.18,0.33],["c",0.57,1.05,0.93,2.13,1.02,3.18],["c",0.06,0.72,0,1.83,-0.21,2.79],["c",-0.18,1.02,-0.63,2.34,-1.02,3.09],["c",-0.15,0.33,-0.48,0.45,-0.78,0.3],["c",-0.18,-0.09,-0.27,-0.18,-0.33,-0.33],["c",-0.09,-0.18,-0.06,-0.3,0.03,-0.54],["c",0.75,-1.5,1.23,-3.45,1.17,-4.89],["c",-0.06,-1.02,-0.42,-2.01,-1.17,-3.15],["c",-0.48,-0.72,-1.02,-1.35,-1.89,-2.22],["c",-0.57,-0.57,-1.56,-1.5,-1.92,-1.77],["l",-0.12,-0.09],["l",0,1.68],["l",0,1.68],["l",-0.21,0],["l",-0.21,0],["l",0,-15],["z"],["m",0.93,-8.07],["c",-0.27,-0.3,-0.48,-0.54,-0.51,-0.54],["c",-0,0,-0,0.69,0.03,1.02],["c",0.15,1.47,0.75,2.94,2.04,4.83],["l",1.08,1.53],["c",0.39,0.57,0.84,1.2,0.99,1.44],["c",0.15,0.24,0.3,0.45,0.3,0.45],["c",-0,0,0.03,-0.09,0.06,-0.21],["c",0.36,-1.59,-0.15,-3.33,-1.47,-5.4],["c",-0.63,-0.93,-1.35,-1.83,-2.52,-3.12],["z"],["m",0.06,6.72],["c",-0.24,-0.21,-0.48,-0.42,-0.51,-0.45],["l",-0.06,-0.06],["l",0,0.33],["c",0,1.2,0.3,2.34,0.93,3.6],["c",0.45,0.9,0.96,1.68,2.25,3.51],["c",0.39,0.54,0.84,1.17,1.02,1.44],["c",0.21,0.33,0.33,0.51,0.33,0.48],["c",0.06,-0.09,0.21,-0.63,0.3,-0.99],["c",0.06,-0.33,0.06,-0.45,0.06,-0.96],["c",-0,-0.6,-0.03,-0.84,-0.18,-1.35],["c",-0.3,-1.08,-1.02,-2.28,-2.13,-3.57],["c",-0.39,-0.45,-1.44,-1.47,-2.01,-1.98],["z"],["m",0,6.72],["c",-0.24,-0.21,-0.48,-0.39,-0.51,-0.42],["l",-0.06,-0.06],["l",0,0.33],["c",0,1.41,0.45,2.82,1.38,4.35],["c",0.42,0.72,0.72,1.14,1.86,2.73],["c",0.36,0.45,0.75,0.99,0.87,1.2],["c",0.15,0.21,0.3,0.36,0.3,0.36],["c",0.06,0,0.3,-0.48,0.39,-0.75],["c",0.09,-0.36,0.12,-0.63,0.12,-1.05],["c",-0.06,-1.05,-0.45,-2.04,-1.2,-3.18],["c",-0.57,-0.87,-1.11,-1.53,-2.07,-2.49],["c",-0.36,-0.33,-0.84,-0.78,-1.08,-1.02],["z"]],w:6.682,h:39.694},"flags.d8th":{d:[["M",5.67,-21.63],["c",0.24,-0.12,0.54,-0.06,0.69,0.15],["c",0.06,0.06,0.21,0.36,0.39,0.66],["c",0.84,1.77,1.26,3.36,1.32,5.1],["c",0.03,1.29,-0.21,2.37,-0.81,3.63],["c",-0.6,1.23,-1.26,2.13,-3.21,4.38],["c",-1.35,1.53,-1.86,2.19,-2.4,2.97],["c",-0.63,0.93,-1.11,1.92,-1.38,2.79],["c",-0.15,0.54,-0.27,1.35,-0.27,1.8],["l",0,0.15],["l",-0.21,-0],["l",-0.21,-0],["l",0,-3.75],["l",0,-3.75],["l",0.21,0],["l",0.21,0],["l",0.48,-0.3],["c",1.83,-1.11,3.12,-2.1,4.17,-3.12],["c",0.78,-0.81,1.32,-1.53,1.71,-2.31],["c",0.45,-0.93,0.6,-1.74,0.51,-2.88],["c",-0.12,-1.56,-0.63,-3.18,-1.47,-4.68],["c",-0.12,-0.21,-0.15,-0.33,-0.06,-0.51],["c",0.06,-0.15,0.15,-0.24,0.33,-0.33],["z"]],w:8.492,h:21.691},"flags.ugrace":{d:[["M",6.03,6.93],["c",0.15,-0.09,0.33,-0.06,0.51,0],["c",0.15,0.09,0.21,0.15,0.3,0.33],["c",0.09,0.18,0.06,0.39,-0.03,0.54],["c",-0.06,0.15,-10.89,8.88,-11.07,8.97],["c",-0.15,0.09,-0.33,0.06,-0.48,0],["c",-0.18,-0.09,-0.24,-0.15,-0.33,-0.33],["c",-0.09,-0.18,-0.06,-0.39,0.03,-0.54],["c",0.06,-0.15,10.89,-8.88,11.07,-8.97],["z"]],w:12.019,h:9.954},"flags.dgrace":{d:[["M",-6.06,-15.93],["c",0.18,-0.09,0.33,-0.12,0.48,-0.06],["c",0.18,0.09,14.01,8.04,14.1,8.1],["c",0.12,0.12,0.18,0.33,0.18,0.51],["c",-0.03,0.21,-0.15,0.39,-0.36,0.48],["c",-0.18,0.09,-0.33,0.12,-0.48,0.06],["c",-0.18,-0.09,-14.01,-8.04,-14.1,-8.1],["c",-0.12,-0.12,-0.18,-0.33,-0.18,-0.51],["c",0.03,-0.21,0.15,-0.39,0.36,-0.48],["z"]],w:15.12,h:9.212},"flags.d16th":{d:[["M",6.84,-22.53],["c",0.27,-0.12,0.57,-0.06,0.72,0.15],["c",0.15,0.15,0.33,0.87,0.45,1.56],["c",0.06,0.33,0.06,1.35,0,1.65],["c",-0.06,0.33,-0.15,0.78,-0.27,1.11],["c",-0.12,0.33,-0.45,0.96,-0.66,1.32],["l",-0.18,0.27],["l",0.09,0.18],["c",0.48,1.02,0.72,2.25,0.69,3.3],["c",-0.06,1.23,-0.42,2.28,-1.26,3.45],["c",-0.57,0.87,-0.99,1.32,-3,3.39],["c",-1.56,1.56,-2.22,2.4,-2.76,3.45],["c",-0.42,0.84,-0.66,1.8,-0.66,2.55],["l",0,0.15],["l",-0.21,-0],["l",-0.21,-0],["l",0,-7.5],["l",0,-7.5],["l",0.21,-0],["l",0.21,-0],["l",0,1.14],["l",0,1.11],["l",0.27,-0.15],["c",1.11,-0.57,1.77,-0.99,2.52,-1.47],["c",2.37,-1.56,3.69,-3.15,4.05,-4.83],["c",0.03,-0.18,0.03,-0.39,0.03,-0.78],["c",0,-0.6,-0.03,-0.93,-0.24,-1.5],["c",-0.06,-0.18,-0.12,-0.39,-0.15,-0.45],["c",-0.03,-0.24,0.12,-0.48,0.36,-0.6],["z"],["m",-0.63,7.5],["c",-0.06,-0.18,-0.15,-0.36,-0.15,-0.36],["c",-0.03,0,-0.03,0.03,-0.06,0.06],["c",-0.06,0.12,-0.96,1.02,-1.95,1.98],["c",-0.63,0.57,-1.26,1.17,-1.44,1.35],["c",-1.53,1.62,-2.28,2.85,-2.55,4.32],["c",-0.03,0.18,-0.03,0.54,-0.06,0.99],["l",0,0.69],["l",0.18,-0.09],["c",0.93,-0.54,2.1,-1.29,2.82,-1.83],["c",0.69,-0.51,1.02,-0.81,1.53,-1.29],["c",1.86,-1.89,2.37,-3.66,1.68,-5.82],["z"]],w:8.475,h:22.591},"flags.d32nd":{d:[["M",6.794,-29.13],["c",0.27,-0.12,0.57,-0.06,0.72,0.15],["c",0.12,0.12,0.27,0.63,0.36,1.11],["c",0.33,1.59,0.06,3.06,-0.81,4.47],["l",-0.18,0.27],["l",0.09,0.15],["c",0.12,0.24,0.33,0.69,0.45,1.05],["c",0.63,1.83,0.45,3.57,-0.57,5.22],["l",-0.18,0.3],["l",0.15,0.27],["c",0.42,0.87,0.6,1.71,0.57,2.61],["c",-0.06,1.29,-0.48,2.46,-1.35,3.78],["c",-0.54,0.81,-0.93,1.29,-2.46,3],["c",-0.51,0.54,-1.05,1.17,-1.26,1.41],["c",-1.56,1.86,-2.25,3.36,-2.37,5.01],["l",0,0.33],["l",-0.21,-0],["l",-0.21,-0],["l",0,-11.25],["l",0,-11.25],["l",0.21,0],["l",0.21,0],["l",0,1.35],["l",0.03,1.35],["l",0.78,-0.39],["c",1.38,-0.69,2.34,-1.26,3.24,-1.92],["c",1.38,-1.02,2.28,-2.13,2.64,-3.21],["c",0.15,-0.48,0.18,-0.72,0.18,-1.29],["c",0,-0.57,-0.06,-0.9,-0.24,-1.47],["c",-0.06,-0.18,-0.12,-0.39,-0.15,-0.45],["c",-0.03,-0.24,0.12,-0.48,0.36,-0.6],["z"],["m",-0.63,7.2],["c",-0.09,-0.18,-0.12,-0.21,-0.12,-0.15],["c",-0.03,0.09,-1.02,1.08,-2.04,2.04],["c",-1.17,1.08,-1.65,1.56,-2.07,2.04],["c",-0.84,0.96,-1.38,1.86,-1.68,2.76],["c",-0.21,0.57,-0.27,0.99,-0.3,1.65],["l",0,0.54],["l",0.66,-0.33],["c",3.57,-1.86,5.49,-3.69,5.94,-5.7],["c",0.06,-0.39,0.06,-1.2,-0.03,-1.65],["c",-0.06,-0.39,-0.24,-0.9,-0.36,-1.2],["z"],["m",-0.06,7.2],["c",-0.06,-0.15,-0.12,-0.33,-0.15,-0.45],["l",-0.06,-0.18],["l",-0.18,0.21],["l",-1.83,1.83],["c",-0.87,0.9,-1.77,1.8,-1.95,2.01],["c",-1.08,1.29,-1.62,2.31,-1.89,3.51],["c",-0.06,0.3,-0.06,0.51,-0.09,0.93],["l",0,0.57],["l",0.09,-0.06],["c",0.75,-0.45,1.89,-1.26,2.52,-1.74],["c",0.81,-0.66,1.74,-1.53,2.22,-2.16],["c",1.26,-1.53,1.68,-3.06,1.32,-4.47],["z"]],w:8.475,h:29.191},"flags.d64th":{d:[["M",7.08,-32.88],["c",0.3,-0.12,0.66,-0.03,0.78,0.24],["c",0.18,0.33,0.27,2.1,0.15,2.64],["c",-0.09,0.39,-0.21,0.78,-0.39,1.08],["l",-0.15,0.3],["l",0.09,0.27],["c",0.03,0.12,0.09,0.45,0.12,0.69],["c",0.27,1.44,0.18,2.55,-0.3,3.6],["l",-0.12,0.33],["l",0.06,0.42],["c",0.27,1.35,0.33,2.82,0.21,3.63],["c",-0.12,0.6,-0.3,1.23,-0.57,1.8],["l",-0.15,0.27],["l",0.03,0.42],["c",0.06,1.02,0.06,2.7,0.03,3.06],["c",-0.15,1.47,-0.66,2.76,-1.74,4.41],["c",-0.45,0.69,-0.75,1.11,-1.74,2.37],["c",-1.05,1.38,-1.5,1.98,-1.95,2.73],["c",-0.93,1.5,-1.38,2.82,-1.44,4.2],["l",0,0.42],["l",-0.21,-0],["l",-0.21,-0],["l",0,-15],["l",0,-15],["l",0.21,-0],["l",0.21,-0],["l",0,1.86],["l",0,1.89],["c",0,-0,0.21,-0.03,0.45,-0.09],["c",2.22,-0.39,4.08,-1.11,5.19,-2.01],["c",0.63,-0.54,1.02,-1.14,1.2,-1.8],["c",0.06,-0.3,0.06,-1.14,-0.03,-1.65],["c",-0.03,-0.18,-0.06,-0.39,-0.09,-0.48],["c",-0.03,-0.24,0.12,-0.48,0.36,-0.6],["z"],["m",-0.45,6.15],["c",-0.03,-0.18,-0.06,-0.42,-0.06,-0.54],["l",-0.03,-0.18],["l",-0.33,0.3],["c",-0.42,0.36,-0.87,0.72,-1.68,1.29],["c",-1.98,1.38,-2.25,1.59,-2.85,2.16],["c",-0.75,0.69,-1.23,1.44,-1.47,2.19],["c",-0.15,0.45,-0.18,0.63,-0.21,1.35],["l",0,0.66],["l",0.39,-0.18],["c",1.83,-0.9,3.45,-1.95,4.47,-2.91],["c",0.93,-0.9,1.53,-1.83,1.74,-2.82],["c",0.06,-0.33,0.06,-0.87,0.03,-1.32],["z"],["m",-0.27,4.86],["c",-0.03,-0.21,-0.06,-0.36,-0.06,-0.36],["c",0,-0.03,-0.12,0.09,-0.24,0.24],["c",-0.39,0.48,-0.99,1.08,-2.16,2.19],["c",-1.47,1.38,-1.92,1.83,-2.46,2.49],["c",-0.66,0.87,-1.08,1.74,-1.29,2.58],["c",-0.09,0.42,-0.15,0.87,-0.15,1.44],["l",0,0.54],["l",0.48,-0.33],["c",1.5,-1.02,2.58,-1.89,3.51,-2.82],["c",1.47,-1.47,2.25,-2.85,2.4,-4.26],["c",0.03,-0.39,0.03,-1.17,-0.03,-1.71],["z"],["m",-0.66,7.68],["c",0.03,-0.15,0.03,-0.6,0.03,-0.99],["l",0,-0.72],["l",-0.27,0.33],["l",-1.74,1.98],["c",-1.77,1.92,-2.43,2.76,-2.97,3.9],["c",-0.51,1.02,-0.72,1.77,-0.75,2.91],["c",0,0.63,0,0.63,0.06,0.6],["c",0.03,-0.03,0.3,-0.27,0.63,-0.54],["c",0.66,-0.6,1.86,-1.8,2.31,-2.31],["c",1.65,-1.89,2.52,-3.54,2.7,-5.16],["z"]],w:8.485,h:32.932},"clefs.C":{d:[["M",0.06,-14.94],["l",0.09,-0.06],["l",1.92,0],["l",1.92,0],["l",0.09,0.06],["l",0.06,0.09],["l",0,14.85],["l",0,14.82],["l",-0.06,0.09],["l",-0.09,0.06],["l",-1.92,0],["l",-1.92,0],["l",-0.09,-0.06],["l",-0.06,-0.09],["l",0,-14.82],["l",0,-14.85],["z"],["m",5.37,0],["c",0.09,-0.06,0.09,-0.06,0.57,-0.06],["c",0.45,0,0.45,0,0.54,0.06],["l",0.06,0.09],["l",0,7.14],["l",0,7.11],["l",0.09,-0.06],["c",0.18,-0.18,0.72,-0.84,0.96,-1.2],["c",0.3,-0.45,0.66,-1.17,0.84,-1.65],["c",0.36,-0.9,0.57,-1.83,0.6,-2.79],["c",0.03,-0.48,0.03,-0.54,0.09,-0.63],["c",0.12,-0.18,0.36,-0.21,0.54,-0.12],["c",0.18,0.09,0.21,0.15,0.24,0.66],["c",0.06,0.87,0.21,1.56,0.57,2.22],["c",0.51,1.02,1.26,1.68,2.22,1.92],["c",0.21,0.06,0.33,0.06,0.78,0.06],["c",0.45,-0,0.57,-0,0.84,-0.06],["c",0.45,-0.12,0.81,-0.33,1.08,-0.6],["c",0.57,-0.57,0.87,-1.41,0.99,-2.88],["c",0.06,-0.54,0.06,-3,0,-3.57],["c",-0.21,-2.58,-0.84,-3.87,-2.16,-4.5],["c",-0.48,-0.21,-1.17,-0.36,-1.77,-0.36],["c",-0.69,0,-1.29,0.27,-1.5,0.72],["c",-0.06,0.15,-0.06,0.21,-0.06,0.42],["c",0,0.24,0,0.3,0.06,0.45],["c",0.12,0.24,0.24,0.39,0.63,0.66],["c",0.42,0.3,0.57,0.48,0.69,0.72],["c",0.06,0.15,0.06,0.21,0.06,0.48],["c",0,0.39,-0.03,0.63,-0.21,0.96],["c",-0.3,0.6,-0.87,1.08,-1.5,1.26],["c",-0.27,0.06,-0.87,0.06,-1.14,0],["c",-0.78,-0.24,-1.44,-0.87,-1.65,-1.68],["c",-0.12,-0.42,-0.09,-1.17,0.09,-1.71],["c",0.51,-1.65,1.98,-2.82,3.81,-3.09],["c",0.84,-0.09,2.46,0.03,3.51,0.27],["c",2.22,0.57,3.69,1.8,4.44,3.75],["c",0.36,0.93,0.57,2.13,0.57,3.36],["c",-0,1.44,-0.48,2.73,-1.38,3.81],["c",-1.26,1.5,-3.27,2.43,-5.28,2.43],["c",-0.48,-0,-0.51,-0,-0.75,-0.09],["c",-0.15,-0.03,-0.48,-0.21,-0.78,-0.36],["c",-0.69,-0.36,-0.87,-0.42,-1.26,-0.42],["c",-0.27,-0,-0.3,-0,-0.51,0.09],["c",-0.57,0.3,-0.81,0.9,-0.81,2.1],["c",-0,1.23,0.24,1.83,0.81,2.13],["c",0.21,0.09,0.24,0.09,0.51,0.09],["c",0.39,-0,0.57,-0.06,1.26,-0.42],["c",0.3,-0.15,0.63,-0.33,0.78,-0.36],["c",0.24,-0.09,0.27,-0.09,0.75,-0.09],["c",2.01,-0,4.02,0.93,5.28,2.4],["c",0.9,1.11,1.38,2.4,1.38,3.84],["c",-0,1.5,-0.3,2.88,-0.84,3.96],["c",-0.78,1.59,-2.19,2.64,-4.17,3.15],["c",-1.05,0.24,-2.67,0.36,-3.51,0.27],["c",-1.83,-0.27,-3.3,-1.44,-3.81,-3.09],["c",-0.18,-0.54,-0.21,-1.29,-0.09,-1.74],["c",0.15,-0.6,0.63,-1.2,1.23,-1.47],["c",0.36,-0.18,0.57,-0.21,0.99,-0.21],["c",0.42,0,0.63,0.03,1.02,0.21],["c",0.42,0.21,0.84,0.63,1.05,1.05],["c",0.18,0.36,0.21,0.6,0.21,0.96],["c",-0,0.3,-0,0.36,-0.06,0.51],["c",-0.12,0.24,-0.27,0.42,-0.69,0.72],["c",-0.57,0.42,-0.69,0.63,-0.69,1.08],["c",-0,0.24,-0,0.3,0.06,0.45],["c",0.12,0.21,0.3,0.39,0.57,0.54],["c",0.42,0.18,0.87,0.21,1.53,0.15],["c",1.08,-0.15,1.8,-0.57,2.34,-1.32],["c",0.54,-0.75,0.84,-1.83,0.99,-3.51],["c",0.06,-0.57,0.06,-3.03,-0,-3.57],["c",-0.12,-1.47,-0.42,-2.31,-0.99,-2.88],["c",-0.27,-0.27,-0.63,-0.48,-1.08,-0.6],["c",-0.27,-0.06,-0.39,-0.06,-0.84,-0.06],["c",-0.45,0,-0.57,0,-0.78,0.06],["c",-1.14,0.27,-2.01,1.17,-2.46,2.49],["c",-0.21,0.57,-0.3,0.99,-0.33,1.65],["c",-0.03,0.51,-0.06,0.57,-0.24,0.66],["c",-0.12,0.06,-0.27,0.06,-0.39,0],["c",-0.21,-0.09,-0.21,-0.15,-0.24,-0.75],["c",-0.09,-1.92,-0.78,-3.72,-2.01,-5.19],["c",-0.18,-0.21,-0.36,-0.42,-0.39,-0.45],["l",-0.09,-0.06],["l",-0,7.11],["l",-0,7.14],["l",-0.06,0.09],["c",-0.09,0.06,-0.09,0.06,-0.54,0.06],["c",-0.48,0,-0.48,0,-0.57,-0.06],["l",-0.06,-0.09],["l",-0,-14.82],["l",-0,-14.85],["z"]],w:20.31,h:29.97},"clefs.F":{d:[["M",6.3,-7.8],["c",0.36,-0.03,1.65,0,2.13,0.03],["c",3.6,0.42,6.03,2.1,6.93,4.86],["c",0.27,0.84,0.36,1.5,0.36,2.58],["c",0,0.9,-0.03,1.35,-0.18,2.16],["c",-0.78,3.78,-3.54,7.08,-8.37,9.96],["c",-1.74,1.05,-3.87,2.13,-6.18,3.12],["c",-0.39,0.18,-0.75,0.33,-0.81,0.36],["c",-0.06,0.03,-0.15,0.06,-0.18,0.06],["c",-0.15,0,-0.33,-0.18,-0.33,-0.33],["c",0,-0.15,0.06,-0.21,0.51,-0.48],["c",3,-1.77,5.13,-3.21,6.84,-4.74],["c",0.51,-0.45,1.59,-1.5,1.95,-1.95],["c",1.89,-2.19,2.88,-4.32,3.15,-6.78],["c",0.06,-0.42,0.06,-1.77,0,-2.19],["c",-0.24,-2.01,-0.93,-3.63,-2.04,-4.71],["c",-0.63,-0.63,-1.29,-1.02,-2.07,-1.2],["c",-1.62,-0.39,-3.36,0.15,-4.56,1.44],["c",-0.54,0.6,-1.05,1.47,-1.32,2.22],["l",-0.09,0.21],["l",0.24,-0.12],["c",0.39,-0.21,0.63,-0.24,1.11,-0.24],["c",0.3,0,0.45,0,0.66,0.06],["c",1.92,0.48,2.85,2.55,1.95,4.38],["c",-0.45,0.99,-1.41,1.62,-2.46,1.71],["c",-1.47,0.09,-2.91,-0.87,-3.39,-2.25],["c",-0.18,-0.57,-0.21,-1.32,-0.03,-2.28],["c",0.39,-2.25,1.83,-4.2,3.81,-5.19],["c",0.69,-0.36,1.59,-0.6,2.37,-0.69],["z"],["m",11.58,2.52],["c",0.84,-0.21,1.71,0.3,1.89,1.14],["c",0.3,1.17,-0.72,2.19,-1.89,1.89],["c",-0.99,-0.21,-1.5,-1.32,-1.02,-2.25],["c",0.18,-0.39,0.6,-0.69,1.02,-0.78],["z"],["m",0,7.5],["c",0.84,-0.21,1.71,0.3,1.89,1.14],["c",0.21,0.87,-0.3,1.71,-1.14,1.89],["c",-0.87,0.21,-1.71,-0.3,-1.89,-1.14],["c",-0.21,-0.84,0.3,-1.71,1.14,-1.89],["z"]],w:20.153,h:23.142},"clefs.G":{d:[["M",9.69,-37.41],["c",0.09,-0.09,0.24,-0.06,0.36,0],["c",0.12,0.09,0.57,0.6,0.96,1.11],["c",1.77,2.34,3.21,5.85,3.57,8.73],["c",0.21,1.56,0.03,3.27,-0.45,4.86],["c",-0.69,2.31,-1.92,4.47,-4.23,7.44],["c",-0.3,0.39,-0.57,0.72,-0.6,0.75],["c",-0.03,0.06,0,0.15,0.18,0.78],["c",0.54,1.68,1.38,4.44,1.68,5.49],["l",0.09,0.42],["l",0.39,-0],["c",1.47,0.09,2.76,0.51,3.96,1.29],["c",1.83,1.23,3.06,3.21,3.39,5.52],["c",0.09,0.45,0.12,1.29,0.06,1.74],["c",-0.09,1.02,-0.33,1.83,-0.75,2.73],["c",-0.84,1.71,-2.28,3.06,-4.02,3.72],["l",-0.33,0.12],["l",0.03,1.26],["c",0,1.74,-0.06,3.63,-0.21,4.62],["c",-0.45,3.06,-2.19,5.49,-4.47,6.21],["c",-0.57,0.18,-0.9,0.21,-1.59,0.21],["c",-0.69,-0,-1.02,-0.03,-1.65,-0.21],["c",-1.14,-0.27,-2.13,-0.84,-2.94,-1.65],["c",-0.99,-0.99,-1.56,-2.16,-1.71,-3.54],["c",-0.09,-0.81,0.06,-1.53,0.45,-2.13],["c",0.63,-0.99,1.83,-1.56,3,-1.53],["c",1.5,0.09,2.64,1.32,2.73,2.94],["c",0.06,1.47,-0.93,2.7,-2.37,2.97],["c",-0.45,0.06,-0.84,0.03,-1.29,-0.09],["l",-0.21,-0.09],["l",0.09,0.12],["c",0.39,0.54,0.78,0.93,1.32,1.26],["c",1.35,0.87,3.06,1.02,4.35,0.36],["c",1.44,-0.72,2.52,-2.28,2.97,-4.35],["c",0.15,-0.66,0.24,-1.5,0.3,-3.03],["c",0.03,-0.84,0.03,-2.94,-0,-3],["c",-0.03,-0,-0.18,-0,-0.36,0.03],["c",-0.66,0.12,-0.99,0.12,-1.83,0.12],["c",-1.05,-0,-1.71,-0.06,-2.61,-0.3],["c",-4.02,-0.99,-7.11,-4.35,-7.8,-8.46],["c",-0.12,-0.66,-0.12,-0.99,-0.12,-1.83],["c",-0,-0.84,-0,-1.14,0.15,-1.92],["c",0.36,-2.28,1.41,-4.62,3.3,-7.29],["l",2.79,-3.6],["c",0.54,-0.66,0.96,-1.2,0.96,-1.23],["c",-0,-0.03,-0.09,-0.33,-0.18,-0.69],["c",-0.96,-3.21,-1.41,-5.28,-1.59,-7.68],["c",-0.12,-1.38,-0.15,-3.09,-0.06,-3.96],["c",0.33,-2.67,1.38,-5.07,3.12,-7.08],["c",0.36,-0.42,0.99,-1.05,1.17,-1.14],["z"],["m",2.01,4.71],["c",-0.15,-0.3,-0.3,-0.54,-0.3,-0.54],["c",-0.03,0,-0.18,0.09,-0.3,0.21],["c",-2.4,1.74,-3.87,4.2,-4.26,7.11],["c",-0.06,0.54,-0.06,1.41,-0.03,1.89],["c",0.09,1.29,0.48,3.12,1.08,5.22],["c",0.15,0.42,0.24,0.78,0.24,0.81],["c",0,0.03,0.84,-1.11,1.23,-1.68],["c",1.89,-2.73,2.88,-5.07,3.15,-7.53],["c",0.09,-0.57,0.12,-1.74,0.06,-2.37],["c",-0.09,-1.23,-0.27,-1.92,-0.87,-3.12],["z"],["m",-2.94,20.7],["c",-0.21,-0.72,-0.39,-1.32,-0.42,-1.32],["c",0,0,-1.2,1.47,-1.86,2.37],["c",-2.79,3.63,-4.02,6.3,-4.35,9.3],["c",-0.03,0.21,-0.03,0.69,-0.03,1.08],["c",0,0.69,0,0.75,0.06,1.11],["c",0.12,0.54,0.27,0.99,0.51,1.47],["c",0.69,1.38,1.83,2.55,3.42,3.42],["c",0.96,0.54,2.07,0.9,3.21,1.08],["c",0.78,0.12,2.04,0.12,2.94,-0.03],["c",0.51,-0.06,0.45,-0.03,0.42,-0.3],["c",-0.24,-3.33,-0.72,-6.33,-1.62,-10.08],["c",-0.09,-0.39,-0.18,-0.75,-0.18,-0.78],["c",-0.03,-0.03,-0.42,-0,-0.81,0.09],["c",-0.9,0.18,-1.65,0.57,-2.22,1.14],["c",-0.72,0.72,-1.08,1.65,-1.05,2.64],["c",0.06,0.96,0.48,1.83,1.23,2.58],["c",0.36,0.36,0.72,0.63,1.17,0.9],["c",0.33,0.18,0.36,0.21,0.42,0.33],["c",0.18,0.42,-0.18,0.9,-0.6,0.87],["c",-0.18,-0.03,-0.84,-0.36,-1.26,-0.63],["c",-0.78,-0.51,-1.38,-1.11,-1.86,-1.83],["c",-1.77,-2.7,-0.99,-6.42,1.71,-8.19],["c",0.3,-0.21,0.81,-0.48,1.17,-0.63],["c",0.3,-0.09,1.02,-0.3,1.14,-0.3],["c",0.06,-0,0.09,-0,0.09,-0.03],["c",0.03,-0.03,-0.51,-1.92,-1.23,-4.26],["z"],["m",3.78,7.41],["c",-0.18,-0.03,-0.36,-0.06,-0.39,-0.06],["c",-0.03,0,0,0.21,0.18,1.02],["c",0.75,3.18,1.26,6.3,1.5,9.09],["c",0.06,0.72,0,0.69,0.51,0.42],["c",0.78,-0.36,1.44,-0.96,1.98,-1.77],["c",1.08,-1.62,1.2,-3.69,0.3,-5.55],["c",-0.81,-1.62,-2.31,-2.79,-4.08,-3.15],["z"]],w:19.051,h:57.057},"clefs.perc":{d:[["M",5.07,-7.44],["l",0.09,-0.06],["l",1.53,0],["l",1.53,0],["l",0.09,0.06],["l",0.06,0.09],["l",0,7.35],["l",0,7.32],["l",-0.06,0.09],["l",-0.09,0.06],["l",-1.53,-0],["l",-1.53,-0],["l",-0.09,-0.06],["l",-0.06,-0.09],["l",0,-7.32],["l",0,-7.35],["z"],["m",6.63,0],["l",0.09,-0.06],["l",1.53,0],["l",1.53,0],["l",0.09,0.06],["l",0.06,0.09],["l",0,7.35],["l",0,7.32],["l",-0.06,0.09],["l",-0.09,0.06],["l",-1.53,-0],["l",-1.53,-0],["l",-0.09,-0.06],["l",-0.06,-0.09],["l",0,-7.32],["l",0,-7.35],["z"]],w:9.99,h:14.97},"timesig.common":{d:[["M",6.66,-7.826],["c",0.72,-0.06,1.41,-0.03,1.98,0.09],["c",1.2,0.27,2.34,0.96,3.09,1.92],["c",0.63,0.81,1.08,1.86,1.14,2.73],["c",0.06,1.02,-0.51,1.92,-1.44,2.22],["c",-0.24,0.09,-0.3,0.09,-0.63,0.09],["c",-0.33,-0,-0.42,-0,-0.63,-0.06],["c",-0.66,-0.24,-1.14,-0.63,-1.41,-1.2],["c",-0.15,-0.3,-0.21,-0.51,-0.24,-0.9],["c",-0.06,-1.08,0.57,-2.04,1.56,-2.37],["c",0.18,-0.06,0.27,-0.06,0.63,-0.06],["l",0.45,0],["c",0.06,0.03,0.09,0.03,0.09,0],["c",0,0,-0.09,-0.12,-0.24,-0.27],["c",-1.02,-1.11,-2.55,-1.68,-4.08,-1.5],["c",-1.29,0.15,-2.04,0.69,-2.4,1.74],["c",-0.36,0.93,-0.42,1.89,-0.42,5.37],["c",0,2.97,0.06,3.96,0.24,4.77],["c",0.24,1.08,0.63,1.68,1.41,2.07],["c",0.81,0.39,2.16,0.45,3.18,0.09],["c",1.29,-0.45,2.37,-1.53,3.03,-2.97],["c",0.15,-0.33,0.33,-0.87,0.39,-1.17],["c",0.09,-0.24,0.15,-0.36,0.3,-0.39],["c",0.21,-0.03,0.42,0.15,0.39,0.36],["c",-0.06,0.39,-0.42,1.38,-0.69,1.89],["c",-0.96,1.8,-2.49,2.94,-4.23,3.18],["c",-0.99,0.12,-2.58,-0.06,-3.63,-0.45],["c",-0.96,-0.36,-1.71,-0.84,-2.4,-1.5],["c",-1.11,-1.11,-1.8,-2.61,-2.04,-4.56],["c",-0.06,-0.6,-0.06,-2.01,0,-2.61],["c",0.24,-1.95,0.9,-3.45,2.01,-4.56],["c",0.69,-0.66,1.44,-1.11,2.37,-1.47],["c",0.63,-0.24,1.47,-0.42,2.22,-0.48],["z"]],w:13.038,h:15.697},"timesig.cut":{d:[["M",6.24,-10.44],["c",0.09,-0.06,0.09,-0.06,0.48,-0.06],["c",0.36,0,0.36,0,0.45,0.06],["l",0.06,0.09],["l",0,1.23],["l",0,1.26],["l",0.27,0],["c",1.26,0,2.49,0.45,3.48,1.29],["c",1.05,0.87,1.8,2.28,1.89,3.48],["c",0.06,1.02,-0.51,1.92,-1.44,2.22],["c",-0.24,0.09,-0.3,0.09,-0.63,0.09],["c",-0.33,-0,-0.42,-0,-0.63,-0.06],["c",-0.66,-0.24,-1.14,-0.63,-1.41,-1.2],["c",-0.15,-0.3,-0.21,-0.51,-0.24,-0.9],["c",-0.06,-1.08,0.57,-2.04,1.56,-2.37],["c",0.18,-0.06,0.27,-0.06,0.63,-0.06],["l",0.45,-0],["c",0.06,0.03,0.09,0.03,0.09,-0],["c",0,-0.03,-0.45,-0.51,-0.66,-0.69],["c",-0.87,-0.69,-1.83,-1.05,-2.94,-1.11],["l",-0.42,0],["l",0,7.17],["l",0,7.14],["l",0.42,0],["c",0.69,-0.03,1.23,-0.18,1.86,-0.51],["c",1.05,-0.51,1.89,-1.47,2.46,-2.7],["c",0.15,-0.33,0.33,-0.87,0.39,-1.17],["c",0.09,-0.24,0.15,-0.36,0.3,-0.39],["c",0.21,-0.03,0.42,0.15,0.39,0.36],["c",-0.03,0.24,-0.21,0.78,-0.39,1.2],["c",-0.96,2.37,-2.94,3.9,-5.13,3.9],["l",-0.3,0],["l",0,1.26],["l",0,1.23],["l",-0.06,0.09],["c",-0.09,0.06,-0.09,0.06,-0.45,0.06],["c",-0.39,0,-0.39,0,-0.48,-0.06],["l",-0.06,-0.09],["l",0,-1.29],["l",0,-1.29],["l",-0.21,-0.03],["c",-1.23,-0.21,-2.31,-0.63,-3.21,-1.29],["c",-0.15,-0.09,-0.45,-0.36,-0.66,-0.57],["c",-1.11,-1.11,-1.8,-2.61,-2.04,-4.56],["c",-0.06,-0.6,-0.06,-2.01,0,-2.61],["c",0.24,-1.95,0.93,-3.45,2.04,-4.59],["c",0.42,-0.39,0.78,-0.66,1.26,-0.93],["c",0.75,-0.45,1.65,-0.75,2.61,-0.9],["l",0.21,-0.03],["l",0,-1.29],["l",0,-1.29],["z"],["m",-0.06,10.44],["c",0,-5.58,0,-6.99,-0.03,-6.99],["c",-0.15,0,-0.63,0.27,-0.87,0.45],["c",-0.45,0.36,-0.75,0.93,-0.93,1.77],["c",-0.18,0.81,-0.24,1.8,-0.24,4.74],["c",0,2.97,0.06,3.96,0.24,4.77],["c",0.24,1.08,0.66,1.68,1.41,2.07],["c",0.12,0.06,0.3,0.12,0.33,0.15],["l",0.09,0],["l",0,-6.96],["z"]],w:13.038,h:20.97},"0":{d:[["M",4.83,-14.97],["c",0.33,-0.03,1.11,0,1.47,0.06],["c",1.68,0.36,2.97,1.59,3.78,3.6],["c",1.2,2.97,0.81,6.96,-0.9,9.27],["c",-0.78,1.08,-1.71,1.71,-2.91,1.95],["c",-0.45,0.09,-1.32,0.09,-1.77,0],["c",-0.81,-0.18,-1.47,-0.51,-2.07,-1.02],["c",-2.34,-2.07,-3.15,-6.72,-1.74,-10.2],["c",0.87,-2.16,2.28,-3.42,4.14,-3.66],["z"],["m",1.11,0.87],["c",-0.21,-0.06,-0.69,-0.09,-0.87,-0.06],["c",-0.54,0.12,-0.87,0.42,-1.17,0.99],["c",-0.36,0.66,-0.51,1.56,-0.6,3],["c",-0.03,0.75,-0.03,4.59,-0,5.31],["c",0.09,1.5,0.27,2.4,0.6,3.06],["c",0.24,0.48,0.57,0.78,0.96,0.9],["c",0.27,0.09,0.78,0.09,1.05,-0],["c",0.39,-0.12,0.72,-0.42,0.96,-0.9],["c",0.33,-0.66,0.51,-1.56,0.6,-3.06],["c",0.03,-0.72,0.03,-4.56,-0,-5.31],["c",-0.09,-1.47,-0.27,-2.37,-0.6,-3.03],["c",-0.24,-0.48,-0.54,-0.78,-0.93,-0.9],["z"]],w:10.78,h:14.959},"1":{d:[["M",3.3,-15.06],["c",0.06,-0.06,0.21,-0.03,0.66,0.15],["c",0.81,0.39,1.08,0.39,1.83,0.03],["c",0.21,-0.09,0.39,-0.15,0.42,-0.15],["c",0.12,0,0.21,0.09,0.27,0.21],["c",0.06,0.12,0.06,0.33,0.06,5.94],["c",0,3.93,0,5.85,0.03,6.03],["c",0.06,0.36,0.15,0.69,0.27,0.96],["c",0.36,0.75,0.93,1.17,1.68,1.26],["c",0.3,0.03,0.39,0.09,0.39,0.3],["c",0,0.15,-0.03,0.18,-0.09,0.24],["c",-0.06,0.06,-0.09,0.06,-0.48,0.06],["c",-0.42,-0,-0.69,-0.03,-2.1,-0.24],["c",-0.9,-0.15,-1.77,-0.15,-2.67,-0],["c",-1.41,0.21,-1.68,0.24,-2.1,0.24],["c",-0.39,-0,-0.42,-0,-0.48,-0.06],["c",-0.06,-0.06,-0.06,-0.09,-0.06,-0.24],["c",0,-0.21,0.06,-0.27,0.36,-0.3],["c",0.75,-0.09,1.32,-0.51,1.68,-1.26],["c",0.12,-0.27,0.21,-0.6,0.27,-0.96],["c",0.03,-0.18,0.03,-1.59,0.03,-4.29],["c",0,-3.87,0,-4.05,-0.06,-4.14],["c",-0.09,-0.15,-0.18,-0.24,-0.39,-0.24],["c",-0.12,-0,-0.15,0.03,-0.21,0.06],["c",-0.03,0.06,-0.45,0.99,-0.96,2.13],["c",-0.48,1.14,-0.9,2.1,-0.93,2.16],["c",-0.06,0.15,-0.21,0.24,-0.33,0.24],["c",-0.24,0,-0.42,-0.18,-0.42,-0.39],["c",0,-0.06,3.27,-7.62,3.33,-7.74],["z"]],w:8.94,h:15.058},"2":{d:[["M",4.23,-14.97],["c",0.57,-0.06,1.68,0,2.34,0.18],["c",0.69,0.18,1.5,0.54,2.01,0.9],["c",1.35,0.96,1.95,2.25,1.77,3.81],["c",-0.15,1.35,-0.66,2.34,-1.68,3.15],["c",-0.6,0.48,-1.44,0.93,-3.12,1.65],["c",-1.32,0.57,-1.8,0.81,-2.37,1.14],["c",-0.57,0.33,-0.57,0.33,-0.24,0.27],["c",0.39,-0.09,1.26,-0.09,1.68,0],["c",0.72,0.15,1.41,0.45,2.1,0.9],["c",0.99,0.63,1.86,0.87,2.55,0.75],["c",0.24,-0.06,0.42,-0.15,0.57,-0.3],["c",0.12,-0.09,0.3,-0.42,0.3,-0.51],["c",0,-0.09,0.12,-0.21,0.24,-0.24],["c",0.18,-0.03,0.39,0.12,0.39,0.3],["c",0,0.12,-0.15,0.57,-0.3,0.87],["c",-0.54,1.02,-1.56,1.74,-2.79,2.01],["c",-0.42,0.09,-1.23,0.09,-1.62,0.03],["c",-0.81,-0.18,-1.32,-0.45,-2.01,-1.11],["c",-0.45,-0.45,-0.63,-0.57,-0.96,-0.69],["c",-0.84,-0.27,-1.89,0.12,-2.25,0.9],["c",-0.12,0.21,-0.21,0.54,-0.21,0.72],["c",0,0.12,-0.12,0.21,-0.27,0.24],["c",-0.15,0,-0.27,-0.03,-0.33,-0.15],["c",-0.09,-0.21,0.09,-1.08,0.33,-1.71],["c",0.24,-0.66,0.66,-1.26,1.29,-1.89],["c",0.45,-0.45,0.9,-0.81,1.92,-1.56],["c",1.29,-0.93,1.89,-1.44,2.34,-1.98],["c",0.87,-1.05,1.26,-2.19,1.2,-3.63],["c",-0.06,-1.29,-0.39,-2.31,-0.96,-2.91],["c",-0.36,-0.33,-0.72,-0.51,-1.17,-0.54],["c",-0.84,-0.03,-1.53,0.42,-1.59,1.05],["c",-0.03,0.33,0.12,0.6,0.57,1.14],["c",0.45,0.54,0.54,0.87,0.42,1.41],["c",-0.15,0.63,-0.54,1.11,-1.08,1.38],["c",-0.63,0.33,-1.2,0.33,-1.83,0],["c",-0.24,-0.12,-0.33,-0.18,-0.54,-0.39],["c",-0.18,-0.18,-0.27,-0.3,-0.36,-0.51],["c",-0.24,-0.45,-0.27,-0.84,-0.21,-1.38],["c",0.12,-0.75,0.45,-1.41,1.02,-1.98],["c",0.72,-0.72,1.74,-1.17,2.85,-1.32],["z"]],w:10.764,h:14.993},"3":{d:[["M",3.78,-14.97],["c",0.3,-0.03,1.41,0,1.83,0.06],["c",2.22,0.3,3.51,1.32,3.72,2.91],["c",0.03,0.33,0.03,1.26,-0.03,1.65],["c",-0.12,0.84,-0.48,1.47,-1.05,1.77],["c",-0.27,0.15,-0.36,0.24,-0.45,0.39],["c",-0.09,0.21,-0.09,0.36,0,0.57],["c",0.09,0.15,0.18,0.24,0.51,0.39],["c",0.75,0.42,1.23,1.14,1.41,2.13],["c",0.06,0.42,0.06,1.35,0,1.71],["c",-0.18,0.81,-0.48,1.38,-1.02,1.95],["c",-0.75,0.72,-1.8,1.2,-3.18,1.38],["c",-0.42,0.06,-1.56,0.06,-1.95,0],["c",-1.89,-0.33,-3.18,-1.29,-3.51,-2.64],["c",-0.03,-0.12,-0.03,-0.33,-0.03,-0.6],["c",0,-0.36,0,-0.42,0.06,-0.63],["c",0.12,-0.3,0.27,-0.51,0.51,-0.75],["c",0.24,-0.24,0.45,-0.39,0.75,-0.51],["c",0.21,-0.06,0.27,-0.06,0.6,-0.06],["c",0.33,0,0.39,0,0.6,0.06],["c",0.3,0.12,0.51,0.27,0.75,0.51],["c",0.36,0.33,0.57,0.75,0.6,1.2],["c",0,0.21,0,0.27,-0.06,0.42],["c",-0.09,0.18,-0.12,0.24,-0.54,0.54],["c",-0.51,0.36,-0.63,0.54,-0.6,0.87],["c",0.06,0.54,0.54,0.9,1.38,0.99],["c",0.36,0.06,0.72,0.03,0.96,-0.06],["c",0.81,-0.27,1.29,-1.23,1.44,-2.79],["c",0.03,-0.45,0.03,-1.95,-0.03,-2.37],["c",-0.09,-0.75,-0.33,-1.23,-0.75,-1.44],["c",-0.33,-0.18,-0.45,-0.18,-1.98,-0.18],["c",-1.35,0,-1.41,0,-1.5,-0.06],["c",-0.18,-0.12,-0.24,-0.39,-0.12,-0.6],["c",0.12,-0.15,0.15,-0.15,1.68,-0.15],["c",1.5,0,1.62,0,1.89,-0.15],["c",0.18,-0.09,0.42,-0.36,0.54,-0.57],["c",0.18,-0.42,0.27,-0.9,0.3,-1.95],["c",0.03,-1.2,-0.06,-1.8,-0.36,-2.37],["c",-0.24,-0.48,-0.63,-0.81,-1.14,-0.96],["c",-0.3,-0.06,-1.08,-0.06,-1.38,0.03],["c",-0.6,0.15,-0.9,0.42,-0.96,0.84],["c",-0.03,0.3,0.06,0.45,0.63,0.84],["c",0.33,0.24,0.42,0.39,0.45,0.63],["c",0.03,0.72,-0.57,1.5,-1.32,1.65],["c",-1.05,0.27,-2.1,-0.57,-2.1,-1.65],["c",0,-0.45,0.15,-0.96,0.39,-1.38],["c",0.12,-0.21,0.54,-0.63,0.81,-0.81],["c",0.57,-0.42,1.38,-0.69,2.25,-0.81],["z"]],w:9.735,h:14.967},"4":{d:[["M",8.64,-14.94],["c",0.27,-0.09,0.42,-0.12,0.54,-0.03],["c",0.09,0.06,0.15,0.21,0.15,0.3],["c",-0.03,0.06,-1.92,2.31,-4.23,5.04],["c",-2.31,2.73,-4.23,4.98,-4.26,5.01],["c",-0.03,0.06,0.12,0.06,2.55,0.06],["l",2.61,0],["l",0,-2.37],["c",0,-2.19,0.03,-2.37,0.06,-2.46],["c",0.03,-0.06,0.21,-0.18,0.57,-0.42],["c",1.08,-0.72,1.38,-1.08,1.86,-2.16],["c",0.12,-0.3,0.24,-0.54,0.27,-0.57],["c",0.12,-0.12,0.39,-0.06,0.45,0.12],["c",0.06,0.09,0.06,0.57,0.06,3.96],["l",0,3.9],["l",1.08,0],["c",1.05,0,1.11,0,1.2,0.06],["c",0.24,0.15,0.24,0.54,0,0.69],["c",-0.09,0.06,-0.15,0.06,-1.2,0.06],["l",-1.08,0],["l",0,0.33],["c",0,0.57,0.09,1.11,0.3,1.53],["c",0.36,0.75,0.93,1.17,1.68,1.26],["c",0.3,0.03,0.39,0.09,0.39,0.3],["c",0,0.15,-0.03,0.18,-0.09,0.24],["c",-0.06,0.06,-0.09,0.06,-0.48,0.06],["c",-0.42,0,-0.69,-0.03,-2.1,-0.24],["c",-0.9,-0.15,-1.77,-0.15,-2.67,0],["c",-1.41,0.21,-1.68,0.24,-2.1,0.24],["c",-0.39,0,-0.42,0,-0.48,-0.06],["c",-0.06,-0.06,-0.06,-0.09,-0.06,-0.24],["c",0,-0.21,0.06,-0.27,0.36,-0.3],["c",0.75,-0.09,1.32,-0.51,1.68,-1.26],["c",0.21,-0.42,0.3,-0.96,0.3,-1.53],["l",0,-0.33],["l",-2.7,0],["c",-2.91,0,-2.85,0,-3.09,-0.15],["c",-0.18,-0.12,-0.3,-0.39,-0.27,-0.54],["c",0.03,-0.06,0.18,-0.24,0.33,-0.45],["c",0.75,-0.9,1.59,-2.07,2.13,-3.03],["c",0.33,-0.54,0.84,-1.62,1.05,-2.16],["c",0.57,-1.41,0.84,-2.64,0.9,-4.05],["c",0.03,-0.63,0.06,-0.72,0.24,-0.81],["l",0.12,-0.06],["l",0.45,0.12],["c",0.66,0.18,1.02,0.24,1.47,0.27],["c",0.6,0.03,1.23,-0.09,2.01,-0.33],["z"]],w:11.795,h:14.994},"5":{d:[["M",1.02,-14.94],["c",0.12,-0.09,0.03,-0.09,1.08,0.06],["c",2.49,0.36,4.35,0.36,6.96,-0.06],["c",0.57,-0.09,0.66,-0.06,0.81,0.06],["c",0.15,0.18,0.12,0.24,-0.15,0.51],["c",-1.29,1.26,-3.24,2.04,-5.58,2.31],["c",-0.6,0.09,-1.2,0.12,-1.71,0.12],["c",-0.39,0,-0.45,0,-0.57,0.06],["c",-0.09,0.06,-0.15,0.12,-0.21,0.21],["l",-0.06,0.12],["l",0,1.65],["l",0,1.65],["l",0.21,-0.21],["c",0.66,-0.57,1.41,-0.96,2.19,-1.14],["c",0.33,-0.06,1.41,-0.06,1.95,0],["c",2.61,0.36,4.02,1.74,4.26,4.14],["c",0.03,0.45,0.03,1.08,-0.03,1.44],["c",-0.18,1.02,-0.78,2.01,-1.59,2.7],["c",-0.72,0.57,-1.62,1.02,-2.49,1.2],["c",-1.38,0.27,-3.03,0.06,-4.2,-0.54],["c",-1.08,-0.54,-1.71,-1.32,-1.86,-2.28],["c",-0.09,-0.69,0.09,-1.29,0.57,-1.74],["c",0.24,-0.24,0.45,-0.39,0.75,-0.51],["c",0.21,-0.06,0.27,-0.06,0.6,-0.06],["c",0.33,0,0.39,0,0.6,0.06],["c",0.3,0.12,0.51,0.27,0.75,0.51],["c",0.36,0.33,0.57,0.75,0.6,1.2],["c",0,0.21,0,0.27,-0.06,0.42],["c",-0.09,0.18,-0.12,0.24,-0.54,0.54],["c",-0.18,0.12,-0.36,0.3,-0.42,0.33],["c",-0.36,0.42,-0.18,0.99,0.36,1.26],["c",0.51,0.27,1.47,0.36,2.01,0.27],["c",0.93,-0.21,1.47,-1.17,1.65,-2.91],["c",0.06,-0.45,0.06,-1.89,0,-2.31],["c",-0.15,-1.2,-0.51,-2.1,-1.05,-2.55],["c",-0.21,-0.18,-0.54,-0.36,-0.81,-0.39],["c",-0.3,-0.06,-0.84,-0.03,-1.26,0.06],["c",-0.93,0.18,-1.65,0.6,-2.16,1.2],["c",-0.15,0.21,-0.27,0.3,-0.39,0.3],["c",-0.15,0,-0.3,-0.09,-0.36,-0.18],["c",-0.06,-0.09,-0.06,-0.15,-0.06,-3.66],["c",0,-3.39,0,-3.57,0.06,-3.66],["c",0.03,-0.06,0.09,-0.15,0.15,-0.18],["z"]],w:10.212,h:14.997},"6":{d:[["M",4.98,-14.97],["c",0.36,-0.03,1.2,0,1.59,0.06],["c",0.9,0.15,1.68,0.51,2.25,1.05],["c",0.57,0.51,0.87,1.23,0.84,1.98],["c",-0.03,0.51,-0.21,0.9,-0.6,1.26],["c",-0.24,0.24,-0.45,0.39,-0.75,0.51],["c",-0.21,0.06,-0.27,0.06,-0.6,0.06],["c",-0.33,0,-0.39,0,-0.6,-0.06],["c",-0.3,-0.12,-0.51,-0.27,-0.75,-0.51],["c",-0.39,-0.36,-0.57,-0.78,-0.57,-1.26],["c",0,-0.27,0,-0.3,0.09,-0.42],["c",0.03,-0.09,0.18,-0.21,0.3,-0.3],["c",0.12,-0.09,0.3,-0.21,0.39,-0.27],["c",0.09,-0.06,0.21,-0.18,0.27,-0.24],["c",0.06,-0.12,0.09,-0.15,0.09,-0.33],["c",0,-0.18,-0.03,-0.24,-0.09,-0.36],["c",-0.24,-0.39,-0.75,-0.6,-1.38,-0.57],["c",-0.54,0.03,-0.9,0.18,-1.23,0.48],["c",-0.81,0.72,-1.08,2.16,-0.96,5.37],["l",0,0.63],["l",0.3,-0.12],["c",0.78,-0.27,1.29,-0.33,2.1,-0.27],["c",1.47,0.12,2.49,0.54,3.27,1.29],["c",0.48,0.51,0.81,1.11,0.96,1.89],["c",0.06,0.27,0.06,0.42,0.06,0.93],["c",0,0.54,0,0.69,-0.06,0.96],["c",-0.15,0.78,-0.48,1.38,-0.96,1.89],["c",-0.54,0.51,-1.17,0.87,-1.98,1.08],["c",-1.14,0.3,-2.4,0.33,-3.24,0.03],["c",-1.5,-0.48,-2.64,-1.89,-3.27,-4.02],["c",-0.36,-1.23,-0.51,-2.82,-0.42,-4.08],["c",0.3,-3.66,2.28,-6.3,4.95,-6.66],["z"],["m",0.66,7.41],["c",-0.27,-0.09,-0.81,-0.12,-1.08,-0.06],["c",-0.72,0.18,-1.08,0.69,-1.23,1.71],["c",-0.06,0.54,-0.06,3,0,3.54],["c",0.18,1.26,0.72,1.77,1.8,1.74],["c",0.39,-0.03,0.63,-0.09,0.9,-0.27],["c",0.66,-0.42,0.9,-1.32,0.9,-3.24],["c",0,-2.22,-0.36,-3.12,-1.29,-3.42],["z"]],w:9.956,h:14.982},"7":{d:[["M",0.21,-14.97],["c",0.21,-0.06,0.45,0,0.54,0.15],["c",0.06,0.09,0.06,0.15,0.06,0.39],["c",0,0.24,0,0.33,0.06,0.42],["c",0.06,0.12,0.21,0.24,0.27,0.24],["c",0.03,0,0.12,-0.12,0.24,-0.21],["c",0.96,-1.2,2.58,-1.35,3.99,-0.42],["c",0.15,0.12,0.42,0.3,0.54,0.45],["c",0.48,0.39,0.81,0.57,1.29,0.6],["c",0.69,0.03,1.5,-0.3,2.13,-0.87],["c",0.09,-0.09,0.27,-0.3,0.39,-0.45],["c",0.12,-0.15,0.24,-0.27,0.3,-0.3],["c",0.18,-0.06,0.39,0.03,0.51,0.21],["c",0.06,0.18,0.06,0.24,-0.27,0.72],["c",-0.18,0.24,-0.54,0.78,-0.78,1.17],["c",-2.37,3.54,-3.54,6.27,-3.87,9],["c",-0.03,0.33,-0.03,0.66,-0.03,1.26],["c",0,0.9,0,1.08,0.15,1.89],["c",0.06,0.45,0.06,0.48,0.03,0.6],["c",-0.06,0.09,-0.21,0.21,-0.3,0.21],["c",-0.03,0,-0.27,-0.06,-0.54,-0.15],["c",-0.84,-0.27,-1.11,-0.3,-1.65,-0.3],["c",-0.57,0,-0.84,0.03,-1.56,0.27],["c",-0.6,0.18,-0.69,0.21,-0.81,0.15],["c",-0.12,-0.06,-0.21,-0.18,-0.21,-0.3],["c",0,-0.15,0.6,-1.44,1.2,-2.61],["c",1.14,-2.22,2.73,-4.68,5.1,-8.01],["c",0.21,-0.27,0.36,-0.48,0.33,-0.48],["c",0,0,-0.12,0.06,-0.27,0.12],["c",-0.54,0.3,-0.99,0.39,-1.56,0.39],["c",-0.75,0.03,-1.2,-0.18,-1.83,-0.75],["c",-0.99,-0.9,-1.83,-1.17,-2.31,-0.72],["c",-0.18,0.15,-0.36,0.51,-0.45,0.84],["c",-0.06,0.24,-0.06,0.33,-0.09,1.98],["c",0,1.62,-0.03,1.74,-0.06,1.8],["c",-0.15,0.24,-0.54,0.24,-0.69,0],["c",-0.06,-0.09,-0.06,-0.15,-0.06,-3.57],["c",0,-3.42,0,-3.48,0.06,-3.57],["c",0.03,-0.06,0.09,-0.12,0.15,-0.15],["z"]],w:10.561,h:15.093},"8":{d:[["M",4.98,-14.97],["c",0.33,-0.03,1.02,-0.03,1.32,0],["c",1.32,0.12,2.49,0.6,3.21,1.32],["c",0.39,0.39,0.66,0.81,0.78,1.29],["c",0.09,0.36,0.09,1.08,0,1.44],["c",-0.21,0.84,-0.66,1.59,-1.59,2.55],["l",-0.3,0.3],["l",0.27,0.18],["c",1.47,0.93,2.31,2.31,2.25,3.75],["c",-0.03,0.75,-0.24,1.35,-0.63,1.95],["c",-0.45,0.66,-1.02,1.14,-1.83,1.53],["c",-1.8,0.87,-4.2,0.87,-6,0.03],["c",-1.62,-0.78,-2.52,-2.16,-2.46,-3.66],["c",0.06,-0.99,0.54,-1.77,1.8,-2.97],["c",0.54,-0.51,0.54,-0.54,0.48,-0.57],["c",-0.39,-0.27,-0.96,-0.78,-1.2,-1.14],["c",-0.75,-1.11,-0.87,-2.4,-0.3,-3.6],["c",0.69,-1.35,2.25,-2.25,4.2,-2.4],["z"],["m",1.53,0.69],["c",-0.42,-0.09,-1.11,-0.12,-1.38,-0.06],["c",-0.3,0.06,-0.6,0.18,-0.81,0.3],["c",-0.21,0.12,-0.6,0.51,-0.72,0.72],["c",-0.51,0.87,-0.42,1.89,0.21,2.52],["c",0.21,0.21,0.36,0.3,1.95,1.23],["c",0.96,0.54,1.74,0.99,1.77,1.02],["c",0.09,0,0.63,-0.6,0.99,-1.11],["c",0.21,-0.36,0.48,-0.87,0.57,-1.23],["c",0.06,-0.24,0.06,-0.36,0.06,-0.72],["c",0,-0.45,-0.03,-0.66,-0.15,-0.99],["c",-0.39,-0.81,-1.29,-1.44,-2.49,-1.68],["z"],["m",-1.44,8.07],["l",-1.89,-1.08],["c",-0.03,0,-0.18,0.15,-0.39,0.33],["c",-1.2,1.08,-1.65,1.95,-1.59,3],["c",0.09,1.59,1.35,2.85,3.21,3.24],["c",0.33,0.06,0.45,0.06,0.93,0.06],["c",0.63,-0,0.81,-0.03,1.29,-0.27],["c",0.9,-0.42,1.47,-1.41,1.41,-2.4],["c",-0.06,-0.66,-0.39,-1.29,-0.9,-1.65],["c",-0.12,-0.09,-1.05,-0.63,-2.07,-1.23],["z"]],w:10.926,h:14.989},"9":{d:[["M",4.23,-14.97],["c",0.42,-0.03,1.29,0,1.62,0.06],["c",0.51,0.12,0.93,0.3,1.38,0.57],["c",1.53,1.02,2.52,3.24,2.73,5.94],["c",0.18,2.55,-0.48,4.98,-1.83,6.57],["c",-1.05,1.26,-2.4,1.89,-3.93,1.83],["c",-1.23,-0.06,-2.31,-0.45,-3.03,-1.14],["c",-0.57,-0.51,-0.87,-1.23,-0.84,-1.98],["c",0.03,-0.51,0.21,-0.9,0.6,-1.26],["c",0.24,-0.24,0.45,-0.39,0.75,-0.51],["c",0.21,-0.06,0.27,-0.06,0.6,-0.06],["c",0.33,-0,0.39,-0,0.6,0.06],["c",0.3,0.12,0.51,0.27,0.75,0.51],["c",0.39,0.36,0.57,0.78,0.57,1.26],["c",0,0.27,0,0.3,-0.09,0.42],["c",-0.03,0.09,-0.18,0.21,-0.3,0.3],["c",-0.12,0.09,-0.3,0.21,-0.39,0.27],["c",-0.09,0.06,-0.21,0.18,-0.27,0.24],["c",-0.06,0.12,-0.06,0.15,-0.06,0.33],["c",0,0.18,0,0.24,0.06,0.36],["c",0.24,0.39,0.75,0.6,1.38,0.57],["c",0.54,-0.03,0.9,-0.18,1.23,-0.48],["c",0.81,-0.72,1.08,-2.16,0.96,-5.37],["l",0,-0.63],["l",-0.3,0.12],["c",-0.78,0.27,-1.29,0.33,-2.1,0.27],["c",-1.47,-0.12,-2.49,-0.54,-3.27,-1.29],["c",-0.48,-0.51,-0.81,-1.11,-0.96,-1.89],["c",-0.06,-0.27,-0.06,-0.42,-0.06,-0.96],["c",0,-0.51,0,-0.66,0.06,-0.93],["c",0.15,-0.78,0.48,-1.38,0.96,-1.89],["c",0.15,-0.12,0.33,-0.27,0.42,-0.36],["c",0.69,-0.51,1.62,-0.81,2.76,-0.93],["z"],["m",1.17,0.66],["c",-0.21,-0.06,-0.57,-0.06,-0.81,-0.03],["c",-0.78,0.12,-1.26,0.69,-1.41,1.74],["c",-0.12,0.63,-0.15,1.95,-0.09,2.79],["c",0.12,1.71,0.63,2.4,1.77,2.46],["c",1.08,0.03,1.62,-0.48,1.8,-1.74],["c",0.06,-0.54,0.06,-3,0,-3.54],["c",-0.15,-1.05,-0.51,-1.53,-1.26,-1.68],["z"]],w:9.959,h:14.986},f:{d:[["M",9.93,-14.28],["c",1.53,-0.18,2.88,0.45,3.12,1.5],["c",0.12,0.51,0,1.32,-0.27,1.86],["c",-0.15,0.3,-0.42,0.57,-0.63,0.69],["c",-0.69,0.36,-1.56,0.03,-1.83,-0.69],["c",-0.09,-0.24,-0.09,-0.69,0,-0.87],["c",0.06,-0.12,0.21,-0.24,0.45,-0.42],["c",0.42,-0.24,0.57,-0.45,0.6,-0.72],["c",0.03,-0.33,-0.09,-0.39,-0.63,-0.42],["c",-0.3,0,-0.45,0,-0.6,0.03],["c",-0.81,0.21,-1.35,0.93,-1.74,2.46],["c",-0.06,0.27,-0.48,2.25,-0.48,2.31],["c",0,0.03,0.39,0.03,0.9,0.03],["c",0.72,0,0.9,0,0.99,0.06],["c",0.42,0.15,0.45,0.72,0.03,0.9],["c",-0.12,0.06,-0.24,0.06,-1.17,0.06],["l",-1.05,0],["l",-0.78,2.55],["c",-0.45,1.41,-0.87,2.79,-0.96,3.06],["c",-0.87,2.37,-2.37,4.74,-3.78,5.91],["c",-1.05,0.9,-2.04,1.23,-3.09,1.08],["c",-1.11,-0.18,-1.89,-0.78,-2.04,-1.59],["c",-0.12,-0.66,0.15,-1.71,0.54,-2.19],["c",0.69,-0.75,1.86,-0.54,2.22,0.39],["c",0.06,0.15,0.09,0.27,0.09,0.48],["c",-0,0.24,-0.03,0.27,-0.12,0.42],["c",-0.03,0.09,-0.15,0.18,-0.27,0.27],["c",-0.09,0.06,-0.27,0.21,-0.36,0.27],["c",-0.24,0.18,-0.36,0.36,-0.39,0.6],["c",-0.03,0.33,0.09,0.39,0.63,0.42],["c",0.42,0,0.63,-0.03,0.9,-0.15],["c",0.6,-0.3,0.96,-0.96,1.38,-2.64],["c",0.09,-0.42,0.63,-2.55,1.17,-4.77],["l",1.02,-4.08],["c",-0,-0.03,-0.36,-0.03,-0.81,-0.03],["c",-0.72,0,-0.81,0,-0.93,-0.06],["c",-0.42,-0.18,-0.39,-0.75,0.03,-0.9],["c",0.09,-0.06,0.27,-0.06,1.05,-0.06],["l",0.96,0],["l",0,-0.09],["c",0.06,-0.18,0.3,-0.72,0.51,-1.17],["c",1.2,-2.46,3.3,-4.23,5.34,-4.5],["z"]],w:16.155,h:19.445},m:{d:[["M",2.79,-8.91],["c",0.09,0,0.3,-0.03,0.45,-0.03],["c",0.24,0.03,0.3,0.03,0.45,0.12],["c",0.36,0.15,0.63,0.54,0.75,1.02],["l",0.03,0.21],["l",0.33,-0.3],["c",0.69,-0.69,1.38,-1.02,2.07,-1.02],["c",0.27,0,0.33,0,0.48,0.06],["c",0.21,0.09,0.48,0.36,0.63,0.6],["c",0.03,0.09,0.12,0.27,0.18,0.42],["c",0.03,0.15,0.09,0.27,0.12,0.27],["c",0,0,0.09,-0.09,0.18,-0.21],["c",0.33,-0.39,0.87,-0.81,1.29,-0.99],["c",0.78,-0.33,1.47,-0.21,2.01,0.33],["c",0.3,0.33,0.48,0.69,0.6,1.14],["c",0.09,0.42,0.06,0.54,-0.54,3.06],["c",-0.33,1.29,-0.57,2.4,-0.57,2.43],["c",0,0.12,0.09,0.21,0.21,0.21],["c",0.24,-0,0.75,-0.3,1.2,-0.72],["c",0.45,-0.39,0.6,-0.45,0.78,-0.27],["c",0.18,0.18,0.09,0.36,-0.45,0.87],["c",-1.05,0.96,-1.83,1.47,-2.58,1.71],["c",-0.93,0.33,-1.53,0.21,-1.8,-0.33],["c",-0.06,-0.15,-0.06,-0.21,-0.06,-0.45],["c",0,-0.24,0.03,-0.48,0.6,-2.82],["c",0.42,-1.71,0.6,-2.64,0.63,-2.79],["c",0.03,-0.57,-0.3,-0.75,-0.84,-0.48],["c",-0.24,0.12,-0.54,0.39,-0.66,0.63],["c",-0.03,0.09,-0.42,1.38,-0.9,3],["c",-0.9,3.15,-0.84,3,-1.14,3.15],["l",-0.15,0.09],["l",-0.78,0],["c",-0.6,0,-0.78,0,-0.84,-0.06],["c",-0.09,-0.03,-0.18,-0.18,-0.18,-0.27],["c",0,-0.03,0.36,-1.38,0.84,-2.97],["c",0.57,-2.04,0.81,-2.97,0.84,-3.12],["c",0.03,-0.54,-0.3,-0.72,-0.84,-0.45],["c",-0.24,0.12,-0.57,0.42,-0.66,0.63],["c",-0.06,0.09,-0.51,1.44,-1.05,2.97],["c",-0.51,1.56,-0.99,2.85,-0.99,2.91],["c",-0.06,0.12,-0.21,0.24,-0.36,0.3],["c",-0.12,0.06,-0.21,0.06,-0.9,0.06],["c",-0.6,0,-0.78,0,-0.84,-0.06],["c",-0.09,-0.03,-0.18,-0.18,-0.18,-0.27],["c",0,-0.03,0.45,-1.38,0.99,-2.97],["c",1.05,-3.18,1.05,-3.18,0.93,-3.45],["c",-0.12,-0.27,-0.39,-0.3,-0.72,-0.15],["c",-0.54,0.27,-1.14,1.17,-1.56,2.4],["c",-0.06,0.15,-0.15,0.3,-0.18,0.36],["c",-0.21,0.21,-0.57,0.27,-0.72,0.09],["c",-0.09,-0.09,-0.06,-0.21,0.06,-0.63],["c",0.48,-1.26,1.26,-2.46,2.01,-3.21],["c",0.57,-0.54,1.2,-0.87,1.83,-1.02],["z"]],w:14.687,h:9.126},p:{d:[["M",1.92,-8.7],["c",0.27,-0.09,0.81,-0.06,1.11,0.03],["c",0.54,0.18,0.93,0.51,1.17,0.99],["c",0.09,0.15,0.15,0.33,0.18,0.36],["l",-0,0.12],["l",0.3,-0.27],["c",0.66,-0.6,1.35,-1.02,2.13,-1.2],["c",0.21,-0.06,0.33,-0.06,0.78,-0.06],["c",0.45,0,0.51,0,0.84,0.09],["c",1.29,0.33,2.07,1.32,2.25,2.79],["c",0.09,0.81,-0.09,2.01,-0.45,2.79],["c",-0.54,1.26,-1.86,2.55,-3.18,3.03],["c",-0.45,0.18,-0.81,0.24,-1.29,0.24],["c",-0.69,-0.03,-1.35,-0.18,-1.86,-0.45],["c",-0.3,-0.15,-0.51,-0.18,-0.69,-0.09],["c",-0.09,0.03,-0.18,0.09,-0.18,0.12],["c",-0.09,0.12,-1.05,2.94,-1.05,3.06],["c",0,0.24,0.18,0.48,0.51,0.63],["c",0.18,0.06,0.54,0.15,0.75,0.15],["c",0.21,0,0.36,0.06,0.42,0.18],["c",0.12,0.18,0.06,0.42,-0.12,0.54],["c",-0.09,0.03,-0.15,0.03,-0.78,0],["c",-1.98,-0.15,-3.81,-0.15,-5.79,0],["c",-0.63,0.03,-0.69,0.03,-0.78,0],["c",-0.24,-0.15,-0.24,-0.57,0.03,-0.66],["c",0.06,-0.03,0.48,-0.09,0.99,-0.12],["c",0.87,-0.06,1.11,-0.09,1.35,-0.21],["c",0.18,-0.06,0.33,-0.18,0.39,-0.3],["c",0.06,-0.12,3.24,-9.42,3.27,-9.6],["c",0.06,-0.33,0.03,-0.57,-0.15,-0.69],["c",-0.09,-0.06,-0.12,-0.06,-0.3,-0.06],["c",-0.69,0.06,-1.53,1.02,-2.28,2.61],["c",-0.09,0.21,-0.21,0.45,-0.27,0.51],["c",-0.09,0.12,-0.33,0.24,-0.48,0.24],["c",-0.18,0,-0.36,-0.15,-0.36,-0.3],["c",0,-0.24,0.78,-1.83,1.26,-2.55],["c",0.72,-1.11,1.47,-1.74,2.28,-1.92],["z"],["m",5.37,1.47],["c",-0.27,-0.12,-0.75,-0.03,-1.14,0.21],["c",-0.75,0.48,-1.47,1.68,-1.89,3.15],["c",-0.45,1.47,-0.42,2.34,0,2.7],["c",0.45,0.39,1.26,0.21,1.83,-0.36],["c",0.51,-0.51,0.99,-1.68,1.38,-3.27],["c",0.3,-1.17,0.33,-1.74,0.15,-2.13],["c",-0.09,-0.15,-0.15,-0.21,-0.33,-0.3],["z"]],w:14.689,h:13.127},r:{d:[["M",6.33,-9.12],["c",0.27,-0.03,0.93,0,1.2,0.06],["c",0.84,0.21,1.23,0.81,1.02,1.53],["c",-0.24,0.75,-0.9,1.17,-1.56,0.96],["c",-0.33,-0.09,-0.51,-0.3,-0.66,-0.75],["c",-0.03,-0.12,-0.09,-0.24,-0.12,-0.3],["c",-0.09,-0.15,-0.3,-0.24,-0.48,-0.24],["c",-0.57,0,-1.38,0.54,-1.65,1.08],["c",-0.06,0.15,-0.33,1.17,-0.9,3.27],["c",-0.57,2.31,-0.81,3.12,-0.87,3.21],["c",-0.03,0.06,-0.12,0.15,-0.18,0.21],["l",-0.12,0.06],["l",-0.81,0.03],["c",-0.69,0,-0.81,0,-0.9,-0.03],["c",-0.09,-0.06,-0.18,-0.21,-0.18,-0.3],["c",0,-0.06,0.39,-1.62,0.9,-3.51],["c",0.84,-3.24,0.87,-3.45,0.87,-3.72],["c",0,-0.21,0,-0.27,-0.03,-0.36],["c",-0.12,-0.15,-0.21,-0.24,-0.42,-0.24],["c",-0.24,0,-0.45,0.15,-0.78,0.42],["c",-0.33,0.36,-0.45,0.54,-0.72,1.14],["c",-0.03,0.12,-0.21,0.24,-0.36,0.27],["c",-0.12,0,-0.15,0,-0.24,-0.06],["c",-0.18,-0.12,-0.18,-0.21,-0.06,-0.54],["c",0.21,-0.57,0.42,-0.93,0.78,-1.32],["c",0.54,-0.51,1.2,-0.81,1.95,-0.87],["c",0.81,-0.03,1.53,0.3,1.92,0.87],["l",0.12,0.18],["l",0.09,-0.09],["c",0.57,-0.45,1.41,-0.84,2.19,-0.96],["z"]],w:9.41,h:9.132},s:{d:[["M",4.47,-8.73],["c",0.09,0,0.36,-0.03,0.57,-0.03],["c",0.75,0.03,1.29,0.24,1.71,0.63],["c",0.51,0.54,0.66,1.26,0.36,1.83],["c",-0.24,0.42,-0.63,0.57,-1.11,0.42],["c",-0.33,-0.09,-0.6,-0.36,-0.6,-0.57],["c",0,-0.03,0.06,-0.21,0.15,-0.39],["c",0.12,-0.21,0.15,-0.33,0.18,-0.48],["c",0,-0.24,-0.06,-0.48,-0.15,-0.6],["c",-0.15,-0.21,-0.42,-0.24,-0.75,-0.15],["c",-0.27,0.06,-0.48,0.18,-0.69,0.36],["c",-0.39,0.39,-0.51,0.96,-0.33,1.38],["c",0.09,0.21,0.42,0.51,0.78,0.72],["c",1.11,0.69,1.59,1.11,1.89,1.68],["c",0.21,0.39,0.24,0.78,0.15,1.29],["c",-0.18,1.2,-1.17,2.16,-2.52,2.52],["c",-1.02,0.24,-1.95,0.12,-2.7,-0.42],["c",-0.72,-0.51,-0.99,-1.47,-0.6,-2.19],["c",0.24,-0.48,0.72,-0.63,1.17,-0.42],["c",0.33,0.18,0.54,0.45,0.57,0.81],["c",0,0.21,-0.03,0.3,-0.33,0.51],["c",-0.33,0.24,-0.39,0.42,-0.27,0.69],["c",0.06,0.15,0.21,0.27,0.45,0.33],["c",0.3,0.09,0.87,0.09,1.2,-0],["c",0.75,-0.21,1.23,-0.72,1.29,-1.35],["c",0.03,-0.42,-0.15,-0.81,-0.54,-1.2],["c",-0.24,-0.24,-0.48,-0.42,-1.41,-1.02],["c",-0.69,-0.42,-1.05,-0.93,-1.05,-1.47],["c",0,-0.39,0.12,-0.87,0.3,-1.23],["c",0.27,-0.57,0.78,-1.05,1.38,-1.35],["c",0.24,-0.12,0.63,-0.27,0.9,-0.3],["z"]],w:6.632,h:8.758},z:{d:[["M",2.64,-7.95],["c",0.36,-0.09,0.81,-0.03,1.71,0.27],["c",0.78,0.21,0.96,0.27,1.74,0.3],["c",0.87,0.06,1.02,0.03,1.38,-0.21],["c",0.21,-0.15,0.33,-0.15,0.48,-0.06],["c",0.15,0.09,0.21,0.3,0.15,0.45],["c",-0.03,0.06,-1.26,1.26,-2.76,2.67],["l",-2.73,2.55],["l",0.54,0.03],["c",0.54,0.03,0.72,0.03,2.01,0.15],["c",0.36,0.03,0.9,0.06,1.2,0.09],["c",0.66,0,0.81,-0.03,1.02,-0.24],["c",0.3,-0.3,0.39,-0.72,0.27,-1.23],["c",-0.06,-0.27,-0.06,-0.27,-0.03,-0.39],["c",0.15,-0.3,0.54,-0.27,0.69,0.03],["c",0.15,0.33,0.27,1.02,0.27,1.5],["c",0,1.47,-1.11,2.7,-2.52,2.79],["c",-0.57,0.03,-1.02,-0.09,-2.01,-0.51],["c",-1.02,-0.42,-1.23,-0.48,-2.13,-0.54],["c",-0.81,-0.06,-0.96,-0.03,-1.26,0.18],["c",-0.12,0.06,-0.24,0.12,-0.27,0.12],["c",-0.27,0,-0.45,-0.3,-0.36,-0.51],["c",0.03,-0.06,1.32,-1.32,2.91,-2.79],["l",2.88,-2.73],["c",-0.03,0,-0.21,0.03,-0.42,0.06],["c",-0.21,0.03,-0.78,0.09,-1.23,0.12],["c",-1.11,0.12,-1.23,0.15,-1.95,0.27],["c",-0.72,0.15,-1.17,0.18,-1.29,0.09],["c",-0.27,-0.18,-0.21,-0.75,0.12,-1.26],["c",0.39,-0.6,0.93,-1.02,1.59,-1.2],["z"]],w:8.573,h:8.743},"+":{d:[["M",3.48,-11.19],["c",0.18,-0.09,0.36,-0.09,0.54,0],["c",0.18,0.09,0.24,0.15,0.33,0.3],["l",0.06,0.15],["l",0,1.29],["l",0,1.29],["l",1.29,0],["c",1.23,0,1.29,0,1.41,0.06],["c",0.06,0.03,0.15,0.09,0.18,0.12],["c",0.12,0.09,0.21,0.33,0.21,0.48],["c",0,0.15,-0.09,0.39,-0.21,0.48],["c",-0.03,0.03,-0.12,0.09,-0.18,0.12],["c",-0.12,0.06,-0.18,0.06,-1.41,0.06],["l",-1.29,0],["l",0,1.29],["c",0,1.23,0,1.29,-0.06,1.41],["c",-0.09,0.18,-0.15,0.24,-0.3,0.33],["c",-0.21,0.09,-0.39,0.09,-0.57,0],["c",-0.18,-0.09,-0.24,-0.15,-0.33,-0.33],["c",-0.06,-0.12,-0.06,-0.18,-0.06,-1.41],["l",0,-1.29],["l",-1.29,0],["c",-1.23,0,-1.29,0,-1.41,-0.06],["c",-0.18,-0.09,-0.24,-0.15,-0.33,-0.33],["c",-0.09,-0.18,-0.09,-0.36,0,-0.54],["c",0.09,-0.18,0.15,-0.24,0.33,-0.33],["l",0.15,-0.06],["l",1.26,0],["l",1.29,0],["l",0,-1.29],["c",0,-1.23,0,-1.29,0.06,-1.41],["c",0.09,-0.18,0.15,-0.24,0.33,-0.33],["z"]],w:7.507,h:7.515},",":{d:[["M",1.32,-3.36],["c",0.57,-0.15,1.17,0.03,1.59,0.45],["c",0.45,0.45,0.6,0.96,0.51,1.89],["c",-0.09,1.23,-0.42,2.46,-0.99,3.93],["c",-0.3,0.72,-0.72,1.62,-0.78,1.68],["c",-0.18,0.21,-0.51,0.18,-0.66,-0.06],["c",-0.03,-0.06,-0.06,-0.15,-0.06,-0.18],["c",0,-0.06,0.12,-0.33,0.24,-0.63],["c",0.84,-1.8,1.02,-2.61,0.69,-3.24],["c",-0.12,-0.24,-0.27,-0.36,-0.75,-0.6],["c",-0.36,-0.15,-0.42,-0.21,-0.6,-0.39],["c",-0.69,-0.69,-0.69,-1.71,0,-2.4],["c",0.21,-0.21,0.51,-0.39,0.81,-0.45],["z"]],w:3.452,h:8.143},"-":{d:[["M",0.18,-5.34],["c",0.09,-0.06,0.15,-0.06,2.31,-0.06],["c",2.46,0,2.37,0,2.46,0.21],["c",0.12,0.21,0.03,0.42,-0.15,0.54],["c",-0.09,0.06,-0.15,0.06,-2.28,0.06],["c",-2.16,0,-2.22,0,-2.31,-0.06],["c",-0.27,-0.15,-0.27,-0.54,-0.03,-0.69],["z"]],w:5.001,h:0.81},".":{d:[["M",1.32,-3.36],["c",1.05,-0.27,2.1,0.57,2.1,1.65],["c",0,1.08,-1.05,1.92,-2.1,1.65],["c",-0.9,-0.21,-1.5,-1.14,-1.26,-2.04],["c",0.12,-0.63,0.63,-1.11,1.26,-1.26],["z"]],w:3.413,h:3.402}};
this.printSymbol=function(c,h,d,g,b){if(!a[d]){return null}var e=this.pathClone(a[d].d);e[0][1]+=c;e[0][2]+=h;var f=g.path().attr({path:e,stroke:"none",fill:"#000000","class":b});return f};this.getPathForSymbol=function(b,g,e,d,c){d=d||1;c=c||1;if(!a[e]){return null}var f=this.pathClone(a[e].d);if(d!==1||c!==1){this.pathScale(f,d,c)}f[0][1]+=b;f[0][2]+=g;return f};this.getSymbolWidth=function(b){if(a[b]){return a[b].w}return 0};this.getSymbolHeight=function(b){if(a[b]){return a[b].h}return 0};this.getSymbolAlign=function(b){if(b.substring(0,7)==="scripts"&&b!=="scripts.roll"){return"center"}return"left"};this.pathClone=function(g){var d=[];for(var c=0,e=g.length;c<e;c++){d[c]=[];for(var b=0,f=g[c].length;b<f;b++){d[c][b]=g[c][b]}}return d};this.pathScale=function(h,f,d){for(var c=0,e=h.length;c<e;c++){var k=h[c];var b,g;for(b=1,g=k.length;b<g;b++){k[b]*=(b%2)?f:d}}};this.getYCorr=function(b){switch(b){case"0":case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":case"9":case"+":return -3;case"timesig.common":case"timesig.cut":return -1;case"flags.d32nd":return -1;case"flags.d64th":return -2;case"flags.u32nd":return 1;case"flags.u64th":return 3;case"rests.whole":return 1;case"rests.half":return -1;case"rests.8th":return -1;case"rests.quarter":return -2;case"rests.16th":return -1;case"rests.32nd":return -1;case"rests.64th":return -1;default:return 0}}};if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.write){window.ABCJS.write={}}ABCJS.write.getDuration=function(a){var b=0;if(a.duration){b=a.duration}return b};ABCJS.write.getDurlog=function(a){if(a===undefined){return 0}return Math.floor(Math.log(a)/Math.log(2))};ABCJS.write.Layout=function(b,a){this.glyphs=b;this.isBagpipes=a;this.chartable={rest:{0:"rests.whole",1:"rests.half",2:"rests.quarter",3:"rests.8th",4:"rests.16th",5:"rests.32nd",6:"rests.64th",7:"rests.128th"},note:{"-1":"noteheads.dbl",0:"noteheads.whole",1:"noteheads.half",2:"noteheads.quarter",3:"noteheads.quarter",4:"noteheads.quarter",5:"noteheads.quarter",6:"noteheads.quarter"},uflags:{3:"flags.u8th",4:"flags.u16th",5:"flags.u32nd",6:"flags.u64th"},dflags:{3:"flags.d8th",4:"flags.d16th",5:"flags.d32nd",6:"flags.d64th"}};this.slurs={};this.ties=[];this.slursbyvoice={};this.tiesbyvoice={};this.endingsbyvoice={};this.s=0;this.v=0;this.stafflines=5;this.tripletmultiplier=1};ABCJS.write.Layout.prototype.getCurrentVoiceId=function(){return"s"+this.s+"v"+this.v};ABCJS.write.Layout.prototype.pushCrossLineElems=function(){this.slursbyvoice[this.getCurrentVoiceId()]=this.slurs;this.tiesbyvoice[this.getCurrentVoiceId()]=this.ties;this.endingsbyvoice[this.getCurrentVoiceId()]=this.partstartelem};ABCJS.write.Layout.prototype.popCrossLineElems=function(){this.slurs=this.slursbyvoice[this.getCurrentVoiceId()]||{};this.ties=this.tiesbyvoice[this.getCurrentVoiceId()]||[];this.partstartelem=this.endingsbyvoice[this.getCurrentVoiceId()]};ABCJS.write.Layout.prototype.getElem=function(){if(this.abcline.length<=this.pos){return null}return this.abcline[this.pos]};ABCJS.write.Layout.prototype.getNextElem=function(){if(this.abcline.length<=this.pos+1){return null}return this.abcline[this.pos+1]};ABCJS.write.Layout.prototype.printABCLine=function(a){this.minY=2;this.staffgroup=new ABCJS.write.StaffGroupElement();for(this.s=0;this.s<a.length;this.s++){this.printABCStaff(a[this.s])}return this.staffgroup};function adjustChordVerticalPosition(h){var c=16;var l=[];for(var g=0;g<h.voices.length;g++){for(var f=0;f<h.voices[g].children.length;f++){var d=h.voices[g].children[f];if(d.top+5>c){c=d.top+5}for(var e=0;e<d.children.length;e++){var a=d.children[e];if(a.type==="chord"){l.push(a)}}}}for(g=0;g<l.length;g++){var b=l[g];if(b.top<c){b.top=c;b.pitch=c;b.bottom=c;if(b.parent.top<c){b.parent.top=c}}}}ABCJS.write.Layout.prototype.printABCStaff=function(a){var b="";if(a.bracket){b+="bracket "+a.bracket+" "}if(a.brace){b+="brace "+a.brace+" "}for(this.v=0;this.v<a.voices.length;this.v++){this.voice=new ABCJS.write.VoiceElement(this.v,a.voices.length);if(this.v===0){this.voice.barfrom=(a.connectBarLines==="start"||a.connectBarLines==="continue");this.voice.barto=(a.connectBarLines==="continue"||a.connectBarLines==="end")}else{this.voice.duplicate=true}if(a.title&&a.title[this.v]){this.voice.header=a.title[this.v]}this.voice.addChild(this.printClef(a.clef));this.voice.addChild(this.printKeySignature(a.key));if(a.meter){this.voice.addChild(this.printTimeSignature(a.meter))}this.printABCVoice(a.voices[this.v]);this.staffgroup.addVoice(this.voice,this.s,this.stafflines)}adjustChordVerticalPosition(this.staffgroup)};ABCJS.write.Layout.prototype.printABCVoice=function(b){this.popCrossLineElems();this.stemdir=(this.isBagpipes)?"down":null;this.abcline=b;if(this.partstartelem){this.partstartelem=new ABCJS.write.EndingElem("",null,null);this.voice.addOther(this.partstartelem)}for(var a in this.slurs){if(this.slurs.hasOwnProperty(a)){this.slurs[a]=new ABCJS.write.TieElem(null,null,this.slurs[a].above,this.slurs[a].force);this.voice.addOther(this.slurs[a])}}for(var c=0;c<this.ties.length;c++){this.ties[c]=new ABCJS.write.TieElem(null,null,this.ties[c].above,this.ties[c].force);this.voice.addOther(this.ties[c])}for(this.pos=0;this.pos<this.abcline.length;this.pos++){var d=this.printABCElement();for(c=0;c<d.length;c++){this.voice.addChild(d[c])}}this.pushCrossLineElems()};ABCJS.write.Layout.prototype.printABCElement=function(){var d=[];var b=this.getElem();switch(b.el_type){case"note":d=this.printBeam();break;case"bar":d[0]=this.printBarLine(b);if(this.voice.duplicate){d[0].invisible=true}break;case"meter":d[0]=this.printTimeSignature(b);if(this.voice.duplicate){d[0].invisible=true}break;case"clef":d[0]=this.printClef(b);if(this.voice.duplicate){d[0].invisible=true}break;case"key":d[0]=this.printKeySignature(b);if(this.voice.duplicate){d[0].invisible=true}break;case"stem":this.stemdir=b.direction;break;case"part":var a=new ABCJS.write.AbsoluteElement(b,0,0,"part");a.addChild(new ABCJS.write.RelativeElement(b.title,0,0,18,{type:"text",attributes:{"font-weight":"bold","font-size":""+16*this.printer.scale+"px","font-family":"serif"}}));d[0]=a;break;default:var c=new ABCJS.write.AbsoluteElement(b,0,0,"unsupported");c.addChild(new ABCJS.write.RelativeElement("element type "+b.el_type,0,0,0,{type:"debug"}));d[0]=c}return d};ABCJS.write.Layout.prototype.printBeam=function(){var e=[];if(this.getElem().startBeam&&!this.getElem().endBeam){var f=new ABCJS.write.BeamElem(this.stemdir);var b=this.pos;var c;while(this.getElem()){c=this.printNote(this.getElem(),true,true);f.add(c);if(this.getElem().endBeam){break}this.pos++}var a=f.calcDir();this.pos=b;f=new ABCJS.write.BeamElem(a?"up":"down");var d=this.stemdir;this.stemdir=a?"up":"down";while(this.getElem()){c=this.printNote(this.getElem(),true);e.push(c);f.add(c);if(this.getElem().endBeam){break}this.pos++}this.stemdir=d;this.voice.addOther(f)}else{e[0]=this.printNote(this.getElem())}return e};ABCJS.write.sortPitch=function(c){var a;do{a=true;for(var d=0;
d<c.pitches.length-1;d++){if(c.pitches[d].pitch>c.pitches[d+1].pitch){a=false;var b=c.pitches[d];c.pitches[d]=c.pitches[d+1];c.pitches[d+1]=b}}}while(!a)};ABCJS.write.Layout.prototype.printNote=function(L,d,S){var o=null;var a=null;this.roomtaken=0;this.roomtakenright=0;var D=0;var U="";var B=null;var q=[];var I,O,l;var b,R,Q,e;var r=ABCJS.write.getDuration(L);if(r===0){r=0.25;d=true}var v=Math.floor(Math.log(r)/Math.log(2));var W=0;for(var f=Math.pow(2,v),P=f/2;f<r;W++,f+=P,P/=2){}if(L.startTriplet){if(L.startTriplet===2){this.tripletmultiplier=3/2}else{this.tripletmultiplier=(L.startTriplet-1)/L.startTriplet}}var g=new ABCJS.write.AbsoluteElement(L,r*this.tripletmultiplier,1,"note");if(L.rest){var k=7;if(this.stemdir==="down"){k=3}if(this.stemdir==="up"){k=11}switch(L.rest.type){case"whole":U=this.chartable.rest[0];L.averagepitch=k;L.minpitch=k;L.maxpitch=k;W=0;break;case"rest":U=this.chartable.rest[-v];L.averagepitch=k;L.minpitch=k;L.maxpitch=k;break;case"invisible":case"spacer":U=""}if(!S){o=this.printNoteHead(g,U,{verticalPos:k},null,0,-this.roomtaken,null,W,0,1)}if(o){g.addHead(o)}this.roomtaken+=this.accidentalshiftx;this.roomtakenright=Math.max(this.roomtakenright,this.dotshiftx)}else{ABCJS.write.sortPitch(L);var n=0;for(I=0,l=L.pitches.length;I<l;I++){n+=L.pitches[I].verticalPos}L.averagepitch=n/L.pitches.length;L.minpitch=L.pitches[0].verticalPos;this.minY=Math.min(L.minpitch,this.minY);L.maxpitch=L.pitches[L.pitches.length-1].verticalPos;var V=(L.averagepitch>=6)?"down":"up";if(this.stemdir){V=this.stemdir}for(I=(V==="down")?L.pitches.length-2:1;(V==="down")?I>=0:I<L.pitches.length;I=(V==="down")?I-1:I+1){var w=L.pitches[(V==="down")?I+1:I-1];var E=L.pitches[I];var F=(V==="down")?w.pitch-E.pitch:E.pitch-w.pitch;if(F<=1&&!w.printer_shift){E.printer_shift=(F)?"different":"same";if(E.verticalPos>11||E.verticalPos<1){q.push(E.verticalPos-(E.verticalPos%2))}if(V==="down"){this.roomtaken=this.glyphs.getSymbolWidth(this.chartable.note[-v])+2}else{D=this.glyphs.getSymbolWidth(this.chartable.note[-v])+2}}}this.accidentalSlot=[];for(I=0;I<L.pitches.length;I++){if(!d){if((V==="down"&&I!==0)||(V==="up"&&I!==l-1)){B=null}else{B=this.chartable[(V==="down")?"dflags":"uflags"][-v]}U=this.chartable.note[-v]}else{U="noteheads.quarter"}L.pitches[I].highestVert=L.pitches[I].verticalPos;var j=(this.stemdir==="up"||V==="up")&&I===0;var J=(this.stemdir==="down"||V==="down")&&I===l-1;if(!S&&(j||J)){if(L.startSlur||l===1){L.pitches[I].highestVert=L.pitches[l-1].verticalPos;if(this.stemdir==="up"||V==="up"){L.pitches[I].highestVert+=6}}if(L.startSlur){if(!L.pitches[I].startSlur){L.pitches[I].startSlur=[]}for(O=0;O<L.startSlur.length;O++){L.pitches[I].startSlur.push(L.startSlur[O])}}if(!S&&L.endSlur){L.pitches[I].highestVert=L.pitches[l-1].verticalPos;if(this.stemdir==="up"||V==="up"){L.pitches[I].highestVert+=6}if(!L.pitches[I].endSlur){L.pitches[I].endSlur=[]}for(O=0;O<L.endSlur.length;O++){L.pitches[I].endSlur.push(L.endSlur[O])}}}if(!S){o=this.printNoteHead(g,U,L.pitches[I],V,0,-this.roomtaken,B,W,D,1)}if(o){g.addHead(o)}this.roomtaken+=this.accidentalshiftx;this.roomtakenright=Math.max(this.roomtakenright,this.dotshiftx)}if(!d&&v<=-1){R=(V==="down")?L.minpitch-7:L.minpitch+1/3;if(R>6&&!this.stemdir){R=6}Q=(V==="down")?L.maxpitch-1/3:L.maxpitch+7;if(Q<6&&!this.stemdir){Q=6}e=(V==="down"||g.heads.length===0)?0:g.heads[0].w;b=(V==="down")?1:-1;g.addExtra(new ABCJS.write.RelativeElement(null,e,0,R,{type:"stem",pitch2:Q,linewidth:b}));this.minY=Math.min(R,this.minY);this.minY=Math.min(Q,this.minY)}}if(L.lyric!==undefined){var K="";window.ABCJS.parse.each(L.lyric,function(c){K+=c.syllable+c.divider+"\n"});g.addRight(new ABCJS.write.RelativeElement(K,0,K.length*5,0,{type:"debugLow"}))}if(!S&&L.gracenotes!==undefined){var u=3/5;var h=null;if(L.gracenotes.length>1){h=new ABCJS.write.BeamElem("grace",this.isBagpipes)}var T=[];for(O=L.gracenotes.length-1;O>=0;O--){this.roomtaken+=10;T[O]=this.roomtaken;if(L.gracenotes[O].accidental){this.roomtaken+=7}}for(O=0;O<L.gracenotes.length;O++){var t=L.gracenotes[O].verticalPos;B=(h)?null:this.chartable.uflags[(this.isBagpipes)?5:3];a=this.printNoteHead(g,"noteheads.quarter",L.gracenotes[O],"up",-T[O],-T[O],B,0,0,u);g.addExtra(a);if(L.gracenotes[O].acciaccatura){var z=L.gracenotes[O].verticalPos+7*u;var N=h?5:6;g.addRight(new ABCJS.write.RelativeElement("flags.ugrace",-T[O]+N,0,z,{scalex:u,scaley:u}))}if(h){var m={heads:[a],abcelem:{averagepitch:t,minpitch:t,maxpitch:t},duration:(this.isBagpipes)?1/32:1/16};h.add(m)}else{R=t+1/3*u;Q=t+7*u;e=a.dx+a.w;b=-0.6;g.addExtra(new ABCJS.write.RelativeElement(null,e,0,R,{type:"stem",pitch2:Q,linewidth:b}))}if(O===0&&!this.isBagpipes&&!(L.rest&&(L.rest.type==="spacer"||L.rest.type==="invisible"))){this.voice.addOther(new ABCJS.write.TieElem(a,o,false,true))}}if(h){this.voice.addOther(h)}}if(!S&&L.decoration){var s=this.printDecoration(L.decoration,L.maxpitch,(o)?o.w:0,g,this.roomtaken,V,L.minpitch);if(s){g.klass="mark"}}if(L.barNumber){g.addChild(new ABCJS.write.RelativeElement(L.barNumber,-10,0,0,{type:"debug"}))}for(O=L.maxpitch;O>11;O--){if(O%2===0&&!L.rest){g.addChild(new ABCJS.write.RelativeElement(null,-2,this.glyphs.getSymbolWidth(U)+4,O,{type:"ledger"}))}}for(O=L.minpitch;O<1;O++){if(O%2===0&&!L.rest){g.addChild(new ABCJS.write.RelativeElement(null,-2,this.glyphs.getSymbolWidth(U)+4,O,{type:"ledger"}))}}for(O=0;O<q.length;O++){var C=this.glyphs.getSymbolWidth(U);if(V==="down"){C=-C}g.addChild(new ABCJS.write.RelativeElement(null,C-2,this.glyphs.getSymbolWidth(U)+4,q[O],{type:"ledger"}))}if(L.chord!==undefined){for(O=0;O<L.chord.length;O++){var H=0;var G;switch(L.chord[O].position){case"left":this.roomtaken+=7;H=-this.roomtaken;G=L.averagepitch;g.addExtra(new ABCJS.write.RelativeElement(L.chord[O].name,H,this.glyphs.getSymbolWidth(L.chord[O].name[0])+4,G,{type:"text"}));break;case"right":this.roomtakenright+=4;H=this.roomtakenright;G=L.averagepitch;g.addRight(new ABCJS.write.RelativeElement(L.chord[O].name,H,this.glyphs.getSymbolWidth(L.chord[O].name[0])+4,G,{type:"text"}));break;case"below":G=L.minpitch-4;if(G>-3){G=-3}var M=L.chord[O].name.split("\n");for(var A=0;A<M.length;A++){g.addChild(new ABCJS.write.RelativeElement(M[A],H,0,G,{type:"text"}));G-=3}break;default:if(L.chord[O].rel_position){g.addChild(new ABCJS.write.RelativeElement(L.chord[O].name,H+L.chord[O].rel_position.x,0,L.minpitch+L.chord[O].rel_position.y/ABCJS.write.spacing.STEP,{type:"text"}))}else{g.addChild(new ABCJS.write.RelativeElement(L.chord[O].name,H,0,0,{type:"chord"}))}}}}if(L.startTriplet){this.triplet=new ABCJS.write.TripletElem(L.startTriplet,o,null,true);if(!S){this.voice.addOther(this.triplet)}}if(L.endTriplet&&this.triplet){this.triplet.anchor2=o;this.triplet=null;this.tripletmultiplier=1}return g};ABCJS.write.Layout.prototype.printNoteHead=function(m,z,A,o,h,e,u,p,x,B){var k=A.verticalPos;var d;var v;this.accidentalshiftx=0;this.dotshiftx=0;if(z===undefined){m.addChild(new ABCJS.write.RelativeElement("pitch is undefined",0,0,0,{type:"debug"}))
}else{if(z===""){d=new ABCJS.write.RelativeElement(null,0,0,k)}else{var n=h;if(A.printer_shift){var r=(A.printer_shift==="same")?1:0;n=(o==="down")?-this.glyphs.getSymbolWidth(z)*B+r:this.glyphs.getSymbolWidth(z)*B-r}d=new ABCJS.write.RelativeElement(z,n,this.glyphs.getSymbolWidth(z)*B,k,{scalex:B,scaley:B,extreme:((o==="down")?"below":"above")});if(u){var g=k+((o==="down")?-7:7)*B;if(B===1&&(o==="down")?(g>6):(g<6)){g=6}var q=(o==="down")?h:h+d.w-0.6;m.addRight(new ABCJS.write.RelativeElement(u,q,this.glyphs.getSymbolWidth(u)*B,g,{scalex:B,scaley:B}))}this.dotshiftx=d.w+x-2+5*p;for(;p>0;p--){var a=(1-Math.abs(k)%2);m.addRight(new ABCJS.write.RelativeElement("dots.dot",d.w+x-2+5*p,this.glyphs.getSymbolWidth("dots.dot"),k+a))}}}if(d){d.highestVert=A.highestVert}if(A.accidental){var b;switch(A.accidental){case"quartersharp":b="accidentals.halfsharp";break;case"dblsharp":b="accidentals.dblsharp";break;case"sharp":b="accidentals.sharp";break;case"quarterflat":b="accidentals.halfflat";break;case"flat":b="accidentals.flat";break;case"dblflat":b="accidentals.dblflat";break;case"natural":b="accidentals.nat"}var l=false;var w=e;for(var s=0;s<this.accidentalSlot.length;s++){if(k-this.accidentalSlot[s][0]>=6){this.accidentalSlot[s][0]=k;w=this.accidentalSlot[s][1];l=true;break}}if(l===false){w-=(this.glyphs.getSymbolWidth(b)*B+2);this.accidentalSlot.push([k,w]);this.accidentalshiftx=(this.glyphs.getSymbolWidth(b)*B+2)}m.addExtra(new ABCJS.write.RelativeElement(b,w,this.glyphs.getSymbolWidth(b),k,{scalex:B,scaley:B}))}if(A.endTie){if(this.ties[0]){this.ties[0].anchor2=d;this.ties=this.ties.slice(1,this.ties.length)}}if(A.startTie){var t=new ABCJS.write.TieElem(d,null,(this.stemdir==="down"||o==="down")&&this.stemdir!=="up",(this.stemdir==="down"||this.stemdir==="up"));this.ties[this.ties.length]=t;this.voice.addOther(t);m.startTie=true}if(A.endSlur){for(v=0;v<A.endSlur.length;v++){var y=A.endSlur[v];var f;if(this.slurs[y]){f=this.slurs[y].anchor2=d;delete this.slurs[y]}else{f=new ABCJS.write.TieElem(null,d,o==="down",(this.stemdir==="up"||o==="down")&&this.stemdir!=="down",this.stemdir);this.voice.addOther(f)}if(this.startlimitelem){f.startlimitelem=this.startlimitelem}}}if(A.startSlur){for(v=0;v<A.startSlur.length;v++){var y=A.startSlur[v].label;var f=new ABCJS.write.TieElem(d,null,(this.stemdir==="down"||o==="down")&&this.stemdir!=="up",false);this.slurs[y]=f;this.voice.addOther(f)}}return d};ABCJS.write.Layout.prototype.printDecoration=function(l,k,t,n,a,r,f){var q;var v;var j;var y;var s=[];var A=(k>9)?k+3:12;var h;var o=false;var m=this.minY-4;var x;a=a||0;if(k===5){A=14}var g=false;for(x=0;x<l.length;x++){if(l[x]==="staccato"||l[x]==="tenuto"||l[x]==="accent"){var u="scripts."+l[x];if(l[x]==="accent"){u="scripts.sforzato"}if(h===undefined){h=(r==="down")?k+2:f-2}else{h=(r==="down")?h+2:h-2}if(l[x]==="accent"){if(r==="up"){h--}else{h++}}else{switch(h){case 2:case 4:case 6:case 8:case 10:if(r==="up"){h--}else{h++}break}}if(k>9){A++}var c=t/2;if(this.glyphs.getSymbolAlign(u)!=="center"){c-=(this.glyphs.getSymbolWidth(q)/2)}n.addChild(new ABCJS.write.RelativeElement(u,c,this.glyphs.getSymbolWidth(u),h))}if(l[x]==="slide"&&n.heads[0]){var z=n.heads[0].pitch;var d=new ABCJS.write.RelativeElement("",-a-15,0,z-1);var b=new ABCJS.write.RelativeElement("",-a-5,0,z+1);n.addChild(d);n.addChild(b);this.voice.addOther(new ABCJS.write.TieElem(d,b,false))}}if(h+2>A){A=h+2}for(x=0;x<l.length;x++){o=false;switch(l[x]){case"trill":q="scripts.trill";break;case"roll":q="scripts.roll";break;case"irishroll":q="scripts.roll";break;case"marcato":q="scripts.umarcato";break;case"marcato2":q="scriopts.dmarcato";break;case"turn":q="scripts.turn";break;case"uppermordent":q="scripts.prall";break;case"pralltriller":q="scripts.prall";break;case"mordent":case"lowermordent":q="scripts.mordent";break;case"staccato":case"accent":case"tenuto":case"slide":continue;case"downbow":q="scripts.downbow";break;case"upbow":q="scripts.upbow";break;case"fermata":q="scripts.ufermata";break;case"invertedfermata":o=true;q="scripts.dfermata";break;case"breath":q=",";break;case"umarcato":q="scripts.umarcato";break;case"coda":q="scripts.coda";break;case"segno":q="scripts.segno";break;case"/":v=["flags.ugrace",1];continue;case"//":v=["flags.ugrace",2];continue;case"///":v=["flags.ugrace",3];continue;case"////":v=["flags.ugrace",4];continue;case"p":case"mp":case"pp":case"ppp":case"pppp":case"f":case"ff":case"fff":case"ffff":case"sfz":case"mf":var w=new ABCJS.write.DynamicDecoration(n,l[x]);this.voice.addOther(w);continue;case"mark":g=true;continue;case"diminuendo(":ABCJS.write.Layout.prototype.startDiminuendoX=n;j=undefined;continue;case"diminuendo)":j={start:ABCJS.write.Layout.prototype.startDiminuendoX,stop:n};ABCJS.write.Layout.prototype.startDiminuendoX=undefined;continue;case"crescendo(":ABCJS.write.Layout.prototype.startCrescendoX=n;y=undefined;continue;case"crescendo)":y={start:ABCJS.write.Layout.prototype.startCrescendoX,stop:n};ABCJS.write.Layout.prototype.startCrescendoX=undefined;continue;default:s[s.length]=l[x];continue}if(o){h=m;m-=5}else{h=A;A+=5}var c=t/2;if(this.glyphs.getSymbolAlign(q)!=="center"){c-=(this.glyphs.getSymbolWidth(q)/2)}n.addChild(new ABCJS.write.RelativeElement(q,c,this.glyphs.getSymbolWidth(q),h))}if(v){h=(r==="down")?k+1:k+9;c=t/2;c+=(r==="down")?-5:3;for(var e=0;e<v[1];e++){h-=1;n.addChild(new ABCJS.write.RelativeElement(v[0],c,this.glyphs.getSymbolWidth(v[0]),h))}}if(j){var p=new ABCJS.write.CrescendoElem(j.start,j.stop,">");this.voice.addOther(p)}if(y){var B=new ABCJS.write.CrescendoElem(y.start,y.stop,"<");this.voice.addOther(B)}if(s.length>0){n.addChild(new ABCJS.write.RelativeElement(s.join(","),0,0,0,{type:"debug"}))}return g};ABCJS.write.Layout.prototype.printBarLine=function(c){var i=new ABCJS.write.AbsoluteElement(c,0,10,"bar");var d=null;var j=0;var a=(c.type==="bar_right_repeat"||c.type==="bar_dbl_repeat");var e=(c.type!=="bar_left_repeat"&&c.type!=="bar_thick_thin"&&c.type!=="bar_invisible");var f=(c.type==="bar_right_repeat"||c.type==="bar_dbl_repeat"||c.type==="bar_left_repeat"||c.type==="bar_thin_thick"||c.type==="bar_thick_thin");var g=(c.type==="bar_left_repeat"||c.type==="bar_thick_thin"||c.type==="bar_thin_thin"||c.type==="bar_dbl_repeat");var b=(c.type==="bar_left_repeat"||c.type==="bar_dbl_repeat");if(a||b){for(var h in this.slurs){if(this.slurs.hasOwnProperty(h)){this.slurs[h].endlimitelem=i}}this.startlimitelem=i}if(a){i.addRight(new ABCJS.write.RelativeElement("dots.dot",j,1,7));i.addRight(new ABCJS.write.RelativeElement("dots.dot",j,1,5));j+=6}if(e){d=new ABCJS.write.RelativeElement(null,j,1,2,{type:"bar",pitch2:10,linewidth:0.6});i.addRight(d)}if(c.type==="bar_invisible"){d=new ABCJS.write.RelativeElement(null,j,1,2,{type:"none",pitch2:10,linewidth:0.6});i.addRight(d)}if(c.decoration){this.printDecoration(c.decoration,12,(f)?3:1,i,0,"down",2)}if(f){j+=4;d=new ABCJS.write.RelativeElement(null,j,4,2,{type:"bar",pitch2:10,linewidth:4});i.addRight(d);j+=5}if(this.partstartelem&&c.endEnding){this.partstartelem.anchor2=d;
this.partstartelem=null}if(g){j+=3;d=new ABCJS.write.RelativeElement(null,j,1,2,{type:"bar",pitch2:10,linewidth:0.6});i.addRight(d)}if(b){j+=3;i.addRight(new ABCJS.write.RelativeElement("dots.dot",j,1,7));i.addRight(new ABCJS.write.RelativeElement("dots.dot",j,1,5))}if(c.startEnding){this.partstartelem=new ABCJS.write.EndingElem(c.startEnding,d,null);this.voice.addOther(this.partstartelem)}return i};ABCJS.write.Layout.prototype.printClef=function(e){var f="clefs.G";var c=0;var d=new ABCJS.write.AbsoluteElement(e,0,10,"staff-extra");switch(e.type){case"treble":break;case"tenor":f="clefs.C";break;case"alto":f="clefs.C";break;case"bass":f="clefs.F";break;case"treble+8":c=1;break;case"tenor+8":f="clefs.C";c=1;break;case"bass+8":f="clefs.F";c=1;break;case"alto+8":f="clefs.C";c=1;break;case"treble-8":c=-1;break;case"tenor-8":f="clefs.C";c=-1;break;case"bass-8":f="clefs.F";c=-1;break;case"alto-8":f="clefs.C";c=-1;break;case"none":f="";break;case"perc":f="clefs.perc";break;default:d.addChild(new ABCJS.write.RelativeElement("clef="+e.type,0,0,0,{type:"debug"}))}var b=10;if(f!==""){d.addRight(new ABCJS.write.RelativeElement(f,b,this.glyphs.getSymbolWidth(f),e.clefPos))}if(c!==0){var g=2/3;var a=(this.glyphs.getSymbolWidth(f)-this.glyphs.getSymbolWidth("8")*g)/2;d.addRight(new ABCJS.write.RelativeElement("8",b+a,this.glyphs.getSymbolWidth("8")*g,(c>0)?16:-2,{scalex:g,scaley:g}))}if(e.stafflines===0){this.stafflines=0}else{this.stafflines=e.stafflines}return d};ABCJS.write.Layout.prototype.printKeySignature=function(c){var b=new ABCJS.write.AbsoluteElement(c,0,10,"staff-extra");var a=0;if(c.accidentals){window.ABCJS.parse.each(c.accidentals,function(e){var d=(e.acc==="sharp")?"accidentals.sharp":(e.acc==="natural")?"accidentals.nat":"accidentals.flat";b.addRight(new ABCJS.write.RelativeElement(d,a,this.glyphs.getSymbolWidth(d),e.verticalPos));a+=this.glyphs.getSymbolWidth(d)+2},this)}this.startlimitelem=b;return b};ABCJS.write.Layout.prototype.printTimeSignature=function(c){var b=new ABCJS.write.AbsoluteElement(c,0,20,"staff-extra");if(c.type==="specified"){for(var a=0;a<c.value.length;a++){if(a!==0){b.addRight(new ABCJS.write.RelativeElement("+",a*20-9,this.glyphs.getSymbolWidth("+"),7))}if(c.value[a].den){b.addRight(new ABCJS.write.RelativeElement(c.value[a].num,a*20,this.glyphs.getSymbolWidth(c.value[a].num.charAt(0))*c.value[a].num.length,9));b.addRight(new ABCJS.write.RelativeElement(c.value[a].den,a*20,this.glyphs.getSymbolWidth(c.value[a].den.charAt(0))*c.value[a].den.length,5))}else{b.addRight(new ABCJS.write.RelativeElement(c.value[a].num,a*20,this.glyphs.getSymbolWidth(c.value[a].num.charAt(0))*c.value[a].num.length,7))}}}else{if(c.type==="common_time"){b.addRight(new ABCJS.write.RelativeElement("timesig.common",0,this.glyphs.getSymbolWidth("timesig.common"),7))}else{if(c.type==="cut_time"){b.addRight(new ABCJS.write.RelativeElement("timesig.cut",0,this.glyphs.getSymbolWidth("timesig.cut"),7))}}}this.startlimitelem=b;return b};if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.write){window.ABCJS.write={}}ABCJS.write.RelativeElement=function(f,b,a,e,d){d=d||{};this.x=0;this.c=f;this.dx=b;this.w=a;this.pitch=e;this.scalex=d.scalex||1;this.scaley=d.scaley||1;this.type=d.type||"symbol";this.pitch2=d.pitch2;this.linewidth=d.linewidth;this.attributes=d.attributes;this.top=e+((d.extreme==="above")?7:0);this.bottom=e-((d.extreme==="below")?7:0)};ABCJS.write.RelativeElement.prototype.draw=function(b,a,c){this.x=a+this.dx;switch(this.type){case"symbol":if(this.c===null){return null}this.graphelem=b.printSymbol(this.x,this.pitch,this.c,this.scalex,this.scaley,b.addClasses("symbol"));break;case"debug":this.graphelem=b.debugMsg(this.x,this.c);break;case"debugLow":this.graphelem=b.printLyrics(this.x,this.c);break;case"chord":this.graphelem=b.printText(this.x,this.pitch,this.c,"start","chord");break;case"text":this.graphelem=b.printText(this.x,this.pitch,this.c,"start","annotation");break;case"bar":this.graphelem=b.printStem(this.x,this.linewidth,b.calcY(this.pitch),(c)?c:b.calcY(this.pitch2));break;case"stem":this.graphelem=b.printStem(this.x,this.linewidth,b.calcY(this.pitch),b.calcY(this.pitch2));break;case"ledger":this.graphelem=b.printStaveLine(this.x,this.x+this.w,this.pitch);break}if(this.scalex!==1&&this.graphelem){this.graphelem.scale(this.scalex,this.scaley,this.x,b.calcY(this.pitch))}if(this.attributes){this.graphelem.attr(this.attributes)}return this.graphelem};if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.write){window.ABCJS.write={}}ABCJS.write.StaffGroupElement=function(){this.voices=[];this.staffs=[];this.stafflines=[]};ABCJS.write.StaffGroupElement.prototype.addVoice=function(c,b,a){this.voices[this.voices.length]=c;if(!this.staffs[b]){this.staffs[this.staffs.length]={top:0,highest:7,lowest:7};this.stafflines[this.stafflines.length]=a}c.staff=this.staffs[b]};ABCJS.write.StaffGroupElement.prototype.finished=function(){for(var a=0;a<this.voices.length;a++){if(!this.voices[a].layoutEnded()){return false}}return true};ABCJS.write.StaffGroupElement.prototype.layout=function(h,f,a){this.spacingunits=0;this.minspace=1000;var m=f.paddingleft*f.scale;var b=0;for(var e=0;e<this.voices.length;e++){if(this.voices[e].header){var q=f.paper.text(100*f.scale,-10*f.scale,this.voices[e].header).attr({"font-size":12*f.scale,"font-family":"serif","font-weight":"bold"});b=Math.max(b,q.getBBox().width);q.remove()}}m=m+b*(1/f.scale)*1.1;this.startx=m;var d=0;if(a){console.log("init layout")}for(e=0;e<this.voices.length;e++){this.voices[e].beginLayout(m)}var l=0;while(!this.finished()){d=null;for(e=0;e<this.voices.length;e++){if(!this.voices[e].layoutEnded()&&(!d||this.voices[e].getDurationIndex()<d)){d=this.voices[e].getDurationIndex()}}if(a){console.log("currentduration: ",d)}var o=[];var n=[];for(e=0;e<this.voices.length;e++){if(this.voices[e].getDurationIndex()!==d){n.push(this.voices[e])}else{o.push(this.voices[e]);if(a){console.log("in: voice ",e)}}}l=0;var p=0;for(e=0;e<o.length;e++){if(o[e].getNextX()>m){m=o[e].getNextX();l=o[e].getSpacingUnits();p=o[e].spacingduration}}this.spacingunits+=l;this.minspace=Math.min(this.minspace,l);for(e=0;e<o.length;e++){var g=o[e].layoutOneItem(m,h);var r=g-m;if(r>0){m=g;for(var c=0;c<e;c++){o[c].shiftRight(r)}}}for(e=0;e<n.length;e++){n[e].spacingduration-=p;n[e].updateNextX(m,h)}for(e=0;e<o.length;e++){var k=o[e];k.updateIndices()}}for(e=0;e<this.voices.length;e++){if(this.voices[e].getNextX()>m){m=this.voices[e].getNextX();l=this.voices[e].getSpacingUnits()}}this.spacingunits+=l;this.w=m;for(e=0;e<this.voices.length;e++){this.voices[e].w=this.w}};ABCJS.write.StaffGroupElement.prototype.draw=function(e,h){this.y=h;for(var d=0;d<this.staffs.length;d++){var c=this.staffs[d].highest-((d===0)?20:15);var b=this.staffs[d].lowest-((d===this.staffs.length-1)?0:0);this.staffs[d].top=h;if(c>0){h+=c*ABCJS.write.spacing.STEP}this.staffs[d].y=h;h+=ABCJS.write.spacing.STAVEHEIGHT*0.9;if(b<0){h-=b*ABCJS.write.spacing.STEP}this.staffs[d].bottom=h;if(this.stafflines[d]!==0){e.y=this.staffs[d].y;
if(this.stafflines[d]===undefined){this.stafflines[d]=5}e.printStave(this.startx,this.w,this.stafflines[d])}}this.height=h-this.y;var g=0;e.measureNumber=null;for(d=0;d<this.voices.length;d++){this.voices[d].draw(e,g);g=this.voices[d].barbottom}e.measureNumber=null;if(this.staffs.length>1){e.y=this.staffs[0].y;var f=e.calcY(10);e.y=this.staffs[this.staffs.length-1].y;var a=e.calcY(2);e.printStem(this.startx,0.6,f,a)}};if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.write){window.ABCJS.write={}}ABCJS.write.TieElem=function(d,b,a,c){this.anchor1=d;this.anchor2=b;this.above=a;this.force=c};ABCJS.write.TieElem.prototype.draw=function(c,e,a){var d;var b;if(this.startlimitelem){e=this.startlimitelem.x+this.startlimitelem.w}if(this.endlimitelem){a=this.endlimitelem.x}if(!this.force&&this.anchor2&&this.anchor2.pitch===this.anchor2.top){this.above=true}if(this.anchor1){e=this.anchor1.x;d=this.above?this.anchor1.highestVert:this.anchor1.pitch;if(!this.anchor2){b=this.above?this.anchor1.highestVert:this.anchor1.pitch}}if(this.anchor2){a=this.anchor2.x;b=this.above?this.anchor2.highestVert:this.anchor2.pitch;if(!this.anchor1){d=this.above?this.anchor2.highestVert:this.anchor2.pitch}}c.drawArc(e,a,d,b,this.above)};if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.write){window.ABCJS.write={}}ABCJS.write.TripletElem=function(d,c,b,a){this.anchor1=c;this.anchor2=b;this.above=a;this.number=d};ABCJS.write.TripletElem.prototype.draw=function(d,g,c){if(this.anchor1&&this.anchor2){var f=this.above?16:-1;if(this.anchor1.parent.beam&&this.anchor1.parent.beam===this.anchor2.parent.beam){var b=this.anchor1.parent.beam;this.above=b.asc;f=b.pos}else{this.drawLine(d,d.calcY(f))}var e=this.anchor1.x+this.anchor2.x;var a=0;if(b){if(this.above){e+=(this.anchor2.w+this.anchor1.w);a=4}else{a=-4}}else{e+=this.anchor2.w}d.printText(e/2,f+a,this.number,"middle","triplet").attr({"font-size":"10px","font-style":"italic"})}};ABCJS.write.TripletElem.prototype.drawLine=function(c,e){var b;var d=this.anchor1.x;b=ABCJS.write.sprintf("M %f %f L %f %f",d,e,d,e+5);c.printPath({path:b,stroke:"#000000","class":c.addClasses("triplet")});var a=this.anchor2.x+this.anchor2.w;b=ABCJS.write.sprintf("M %f %f L %f %f",a,e,a,e+5);c.printPath({path:b,stroke:"#000000","class":c.addClasses("triplet")});b=ABCJS.write.sprintf("M %f %f L %f %f",d,e,(d+a)/2-5,e);c.printPath({path:b,stroke:"#000000","class":c.addClasses("triplet")});b=ABCJS.write.sprintf("M %f %f L %f %f",(d+a)/2+5,e,a,e);c.printPath({path:b,stroke:"#000000","class":c.addClasses("triplet")})};if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.write){window.ABCJS.write={}}ABCJS.write.VoiceElement=function(b,a){this.children=[];this.beams=[];this.otherchildren=[];this.w=0;this.duplicate=false;this.voicenumber=b;this.voicetotal=a};ABCJS.write.VoiceElement.prototype.addChild=function(c){if(c.type==="bar"){var b=true;for(var a=0;b&&a<this.children.length;a++){if(this.children[a].type!=="staff-extra"){b=false}}if(!b){this.beams.push("bar");this.otherchildren.push("bar")}}this.children[this.children.length]=c};ABCJS.write.VoiceElement.prototype.addOther=function(a){if(a instanceof ABCJS.write.BeamElem){this.beams.push(a)}else{this.otherchildren.push(a)}};ABCJS.write.VoiceElement.prototype.updateIndices=function(){if(!this.layoutEnded()){this.durationindex+=this.children[this.i].duration;if(this.children[this.i].duration===0){this.durationindex=Math.round(this.durationindex*64)/64}this.i++}};ABCJS.write.VoiceElement.prototype.layoutEnded=function(){return(this.i>=this.children.length)};ABCJS.write.VoiceElement.prototype.getDurationIndex=function(){return this.durationindex-(this.children[this.i]&&(this.children[this.i].duration>0)?0:5e-7)};ABCJS.write.VoiceElement.prototype.getSpacingUnits=function(){return(this.minx<this.nextx)?Math.sqrt(this.spacingduration*8):0};ABCJS.write.VoiceElement.prototype.getNextX=function(){return Math.max(this.minx,this.nextx)};ABCJS.write.VoiceElement.prototype.beginLayout=function(a){this.i=0;this.durationindex=0;this.ii=this.children.length;this.startx=a;this.minx=a;this.nextx=a;this.spacingduration=0};ABCJS.write.VoiceElement.prototype.layoutOneItem=function(a,d){var c=this.children[this.i];if(!c){return 0}var b=a-this.minx;if(b<c.getExtraWidth()){a+=c.getExtraWidth()-b}c.x=a;this.spacingduration=c.duration;this.minx=a+c.getMinWidth();if(this.i!==this.ii-1){this.minx+=c.minspacing}this.updateNextX(a,d);this.staff.highest=Math.max(c.top,this.staff.highest);this.staff.lowest=Math.min(c.bottom,this.staff.lowest);return a};ABCJS.write.VoiceElement.prototype.updateNextX=function(a,b){this.nextx=a+(b*Math.sqrt(this.spacingduration*8))};ABCJS.write.VoiceElement.prototype.shiftRight=function(a){var b=this.children[this.i];if(!b){return}b.x+=a;this.minx+=a;this.nextx+=a};ABCJS.write.VoiceElement.prototype.draw=function(f,e){var a=this.w-1;f.y=this.staff.y;f.staffbottom=this.staff.bottom;this.barbottom=f.calcY(2);f.measureNumber=null;if(this.header){var g=12-(this.voicenumber+1)*(12/(this.voicetotal+1));var c=(this.startx-f.paddingleft)/2+f.paddingleft;c=c*f.scale;f.paper.text(c,f.calcY(g)*f.scale,this.header).attr({"font-size":12*f.scale,"font-family":"serif","font-weight":"bold","class":f.addClasses("staff-extra voice-name")})}for(var d=0,h=this.children.length;d<h;d++){var b=this.children[d];var k=false;if(b.type!=="staff-extra"&&f.measureNumber===null){f.measureNumber=0;k=true}b.draw(f,(this.barto||d===h-1)?e:0);if(b.type==="bar"&&!k){f.measureNumber++}}f.measureNumber=0;window.ABCJS.parse.each(this.beams,function(i){if(i==="bar"){f.measureNumber++}else{i.draw(f)}});f.measureNumber=0;var j=this;window.ABCJS.parse.each(this.otherchildren,function(i){if(i==="bar"){f.measureNumber++}else{i.draw(f,j.startx+10,a)}})};if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.write){window.ABCJS.write={}}ABCJS.write.spacing=function(){};ABCJS.write.spacing.FONTEM=360;ABCJS.write.spacing.FONTSIZE=30;ABCJS.write.spacing.STEP=ABCJS.write.spacing.FONTSIZE*93/720;ABCJS.write.spacing.SPACE=10;ABCJS.write.spacing.TOPNOTE=20;ABCJS.write.spacing.STAVEHEIGHT=100;ABCJS.write.Printer=function(b,a){a=a||{};this.y=0;this.paper=b;this.space=3*ABCJS.write.spacing.SPACE;this.glyphs=new ABCJS.write.Glyphs();this.listeners=[];this.selected=[];this.ingroup=false;this.scale=a.scale||1;this.staffwidth=a.staffwidth||740;this.paddingtop=a.paddingtop||15;this.paddingbottom=a.paddingbottom||30;this.paddingright=a.paddingright||50;this.paddingleft=a.paddingleft||15;this.editable=a.editable||false;this.usingSvg=(window.SVGAngle||document.implementation.hasFeature("http://www.w3.org/TR/SVG11/feature#BasicStructure","1.1")?true:false);if(this.usingSvg&&a.add_classes){Raphael._availableAttrs["class"]=""}};ABCJS.write.Printer.prototype.addClasses=function(b){var a=[];if(b.length>0){a.push(b)}if(this.lineNumber!==null){a.push("l"+this.lineNumber)}if(this.measureNumber!==null){a.push("m"+this.measureNumber)}return a.join(" ")};ABCJS.write.Printer.prototype.notifySelect=function(b){this.clearSelection();
this.selected=[b];b.highlight();for(var a=0;a<this.listeners.length;a++){this.listeners[a].highlight(b.abcelem)}};ABCJS.write.Printer.prototype.notifyChange=function(b){for(var a=0;a<this.listeners.length;a++){this.listeners[a].modelChanged()}};ABCJS.write.Printer.prototype.clearSelection=function(){for(var a=0;a<this.selected.length;a++){this.selected[a].unhighlight()}this.selected=[]};ABCJS.write.Printer.prototype.addSelectListener=function(a){this.listeners[this.listeners.length]=a};ABCJS.write.Printer.prototype.rangeHighlight=function(b,d){this.clearSelection();for(var i=0;i<this.staffgroups.length;i++){var f=this.staffgroups[i].voices;for(var g=0;g<f.length;g++){var a=f[g].children;for(var c=0;c<a.length;c++){var h=a[c].abcelem.startChar;var e=a[c].abcelem.endChar;if((d>h&&b<e)||((d===b)&&d===e)){this.selected[this.selected.length]=a[c];a[c].highlight()}}}}};ABCJS.write.Printer.prototype.beginGroup=function(){this.path=[];this.lastM=[0,0];this.ingroup=true};ABCJS.write.Printer.prototype.addPath=function(c){c=c||[];if(c.length===0){return}c[0][0]="m";c[0][1]-=this.lastM[0];c[0][2]-=this.lastM[1];this.lastM[0]+=c[0][1];this.lastM[1]+=c[0][2];this.path.push(c[0]);for(var a=1,b=c.length;a<b;a++){if(c[a][0]==="m"){this.lastM[0]+=c[a][1];this.lastM[1]+=c[a][2]}this.path.push(c[a])}};ABCJS.write.Printer.prototype.endGroup=function(a){this.ingroup=false;if(this.path.length===0){return null}var b=this.paper.path().attr({path:this.path,stroke:"none",fill:"#000000","class":this.addClasses(a)});if(this.scale!==1){b.scale(this.scale,this.scale,0,0)}return b};ABCJS.write.Printer.prototype.printStaveLine=function(x1,x2,pitch){var isIE=
/*@cc_on!@*/
false;var dy=0.35;var fill="#000000";if(isIE){dy=1;fill="#666666"}var y=this.calcY(pitch);var pathString=ABCJS.write.sprintf("M %f %f L %f %f L %f %f L %f %f z",x1,y-dy,x2,y-dy,x2,y+dy,x1,y+dy);var ret=this.paper.path().attr({path:pathString,stroke:"none",fill:fill,"class":this.addClasses("staff")}).toBack();if(this.scale!==1){ret.scale(this.scale,this.scale,0,0)}return ret};ABCJS.write.Printer.prototype.printStem=function(x,dx,y1,y2){if(dx<0){var tmp=y2;y2=y1;y1=tmp}var isIE=
/*@cc_on!@*/
false;var fill="#000000";if(isIE&&dx<1){dx=1;fill="#666666"}if(~~x===x){x+=0.05}var pathArray=[["M",x,y1],["L",x,y2],["L",x+dx,y2],["L",x+dx,y1],["z"]];if(!isIE&&this.ingroup){this.addPath(pathArray)}else{var ret=this.paper.path().attr({path:pathArray,stroke:"none",fill:fill,"class":this.addClasses("stem")}).toBack();if(this.scale!==1){ret.scale(this.scale,this.scale,0,0)}return ret}};ABCJS.write.Printer.prototype.printText=function(a,e,d,c,f){c=c||"start";var b=this.paper.text(a*this.scale,this.calcY(e)*this.scale,d).attr({"text-anchor":c,"font-size":12*this.scale,"class":this.addClasses(f)});return b};ABCJS.write.Printer.prototype.printSymbol=function(k,d,c,g,f,j){var b;if(!c){return null}if(c.length>0&&c.indexOf(".")<0){var h=this.paper.set();var l=0;for(var e=0;e<c.length;e++){var a=this.glyphs.getYCorr(c.charAt(e));b=this.glyphs.printSymbol(k+l,this.calcY(d+a),c.charAt(e),this.paper,j);if(b){h.push(b);l+=this.glyphs.getSymbolWidth(c.charAt(e))}else{this.debugMsg(k,"no symbol:"+c)}}if(this.scale!==1){h.scale(this.scale,this.scale,0,0)}return h}else{var a=this.glyphs.getYCorr(c);if(this.ingroup){this.addPath(this.glyphs.getPathForSymbol(k,this.calcY(d+a),c,g,f))}else{b=this.glyphs.printSymbol(k,this.calcY(d+a),c,this.paper,j);if(b){if(this.scale!==1){b.scale(this.scale,this.scale,0,0)}return b}else{this.debugMsg(k,"no symbol:"+c)}}return null}};ABCJS.write.Printer.prototype.printPath=function(b){var a=this.paper.path().attr(b);if(this.scale!==1){a.scale(this.scale,this.scale,0,0)}return a};ABCJS.write.Printer.prototype.drawArc=function(n,m,q,p,o){n=n+6;m=m+4;q=q+((o)?1.5:-1.5);p=p+((o)?1.5:-1.5);var c=this.calcY(q);var b=this.calcY(p);var h=m-n;var g=b-c;var f=Math.sqrt(h*h+g*g);var e=h/f;var d=g/f;var u=f/3.5;var i=((o)?-1:1)*Math.min(25,Math.max(4,u));var l=n+u*e-i*d;var t=c+u*d+i*e;var j=m-u*e-i*d;var r=b-u*d+i*e;var a=2;var k=ABCJS.write.sprintf("M %f %f C %f %f %f %f %f %f C %f %f %f %f %f %f z",n,c,l,t,j,r,m,b,j-a*d,r+a*e,l-a*d,t+a*e,n,c);var s=this.paper.path().attr({path:k,stroke:"none",fill:"#000000","class":this.addClasses("slur")});if(this.scale!==1){s.scale(this.scale,this.scale,0,0)}return s};ABCJS.write.Printer.prototype.debugMsg=function(a,b){return this.paper.text(a,this.y,b).scale(this.scale,this.scale,0,0).attr({"class":this.addClasses("debug-msg")})};ABCJS.write.Printer.prototype.debugMsgLow=function(a,b){return this.paper.text(a,this.calcY(this.layouter.minY-7),b).attr({"font-family":"serif","font-size":12,"text-anchor":"begin","class":this.addClasses("debug-msg")}).scale(this.scale,this.scale,0,0)};ABCJS.write.Printer.prototype.printLyrics=function(a,c){var b=this.paper.text(a,this.calcY(this.layouter.minY-7),c).attr({"font-family":"Times New Roman","font-weight":"bold","font-size":14,"text-anchor":"begin","class":this.addClasses("lyrics")}).scale(this.scale,this.scale,0,0);b[0].setAttribute("class","abc-lyric");return b};ABCJS.write.Printer.prototype.calcY=function(a){return this.y+((ABCJS.write.spacing.TOPNOTE-a)*ABCJS.write.spacing.STEP)};ABCJS.write.Printer.prototype.printStave=function(a,d,b){if(b===1){this.printStaveLine(a,d,6);return}for(var c=0;c<b;c++){this.printStaveLine(a,d,(c+1)*2)}};ABCJS.write.Printer.prototype.printABC=function(a){if(a[0]===undefined){a=[a]}this.y=0;for(var b=0;b<a.length;b++){this.printTune(a[b])}};ABCJS.write.Printer.prototype.printTempo=function(t,k,q,h,e,j){var f={"text-anchor":"start","font-size":12*e.scale,"font-weight":"bold","class":this.addClasses("tempo")};if(t.preString){var o=k.text(j*e.scale,h*e.scale+20*e.scale,t.preString).attr(f);j+=(o.getBBox().width+20*e.scale)}if(t.duration){var g=0.75*e.scale;var w=14.5;var a=t.duration[0];var n=new ABCJS.write.AbsoluteElement(t,a,1,"tempo");var u=Math.floor(Math.log(a)/Math.log(2));var r=0;for(var m=Math.pow(2,u),i=m/2;m<a;r++,m+=i,i/=2){}var z=q.chartable.note[-u];var v=q.chartable.uflags[-u];var p=q.printNoteHead(n,z,{verticalPos:w},"up",0,0,v,r,0,g);n.addHead(p);if(a<1){var d=w+1/3*g;var b=w+7*g;var l=p.dx+p.w;var s=-0.6*e.scale;n.addExtra(new ABCJS.write.RelativeElement(null,l,0,d,{type:"stem",pitch2:b,linewidth:s}))}n.x=j*(1/e.scale);n.draw(e,null);j+=(n.w+5*e.scale);o=k.text(j,h*e.scale+20*e.scale,"= "+t.bpm).attr(f);j+=o.getBBox().width+10*e.scale}if(t.postString){k.text(j,h*e.scale+20*e.scale,t.postString).attr(f)}h+=15*e.scale;return h};ABCJS.write.Printer.prototype.printTune=function(abctune){this.lineNumber=null;this.measureNumber=null;this.layouter=new ABCJS.write.Layout(this.glyphs,abctune.formatting.bagpipes);this.layouter.printer=this;if(abctune.media==="print"){var m=abctune.formatting.topmargin===undefined?54:abctune.formatting.topmargin;this.y+=m}else{this.y+=this.paddingtop}if(abctune.formatting.staffwidth){this.width=abctune.formatting.staffwidth}else{this.width=this.staffwidth}this.width+=this.paddingleft;if(abctune.formatting.scale){this.scale=abctune.formatting.scale
}if(abctune.metaText.title){this.paper.text(this.width*this.scale/2,this.y,abctune.metaText.title).attr({"font-size":20*this.scale,"font-family":"serif","class":this.addClasses("title meta-top")})}this.y+=20*this.scale;if(abctune.lines[0]&&abctune.lines[0].subtitle){this.printSubtitleLine(abctune.lines[0]);this.y+=20*this.scale}if(abctune.metaText.rhythm){this.paper.text(this.paddingleft,this.y,abctune.metaText.rhythm).attr({"text-anchor":"start","font-style":"italic","font-family":"serif","font-size":12*this.scale,"class":this.addClasses("meta-top")});!(abctune.metaText.author||abctune.metaText.origin||abctune.metaText.composer)&&(this.y+=15*this.scale)}var composerLine="";if(abctune.metaText.composer){composerLine+=abctune.metaText.composer}if(abctune.metaText.origin){composerLine+=" ("+abctune.metaText.origin+")"}if(composerLine.length>0){this.paper.text(this.width*this.scale,this.y,composerLine).attr({"text-anchor":"end","font-style":"italic","font-family":"serif","font-size":12*this.scale,"class":this.addClasses("meta-top")});this.y+=15}if(abctune.metaText.author){this.paper.text(this.width*this.scale,this.y,abctune.metaText.author).attr({"text-anchor":"end","font-style":"italic","font-family":"serif","font-size":12*this.scale,"class":this.addClasses("meta-top")});this.y+=15}if(abctune.metaText.tempo&&!abctune.metaText.tempo.suppress){this.y=this.printTempo(abctune.metaText.tempo,this.paper,this.layouter,this.y,this,50,-1);this.y+=20*this.scale}this.staffgroups=[];var maxwidth=this.width;for(var line=0;line<abctune.lines.length;line++){this.lineNumber=line;var abcline=abctune.lines[line];if(abcline.staff){staffgroup=this.printStaffLine(abctune,abcline,line);if(staffgroup.w>maxwidth){maxwidth=staffgroup.w}}else{if(abcline.subtitle&&line!==0){this.printSubtitleLine(abcline);this.y+=20*this.scale}else{if(abcline.text){if(typeof abcline.text==="string"){this.paper.text(100,this.y,"TEXT: "+abcline.text).attr({"class":this.addClasses("defined-text")})}else{var str="";for(var i=0;i<abcline.text.length;i++){str+=" FONT "+abcline.text[i].text}this.paper.text(100,this.y,"TEXT: "+str).attr({"class":this.addClasses("defined-text")})}this.y+=20*this.scale}}}}this.lineNumber=null;this.measureNumber=null;var extraText="";var text2;var height;if(abctune.metaText.partOrder){extraText+="Part Order: "+abctune.metaText.partOrder+"\n"}if(abctune.metaText.unalignedWords){for(var j=0;j<abctune.metaText.unalignedWords.length;j++){if(typeof abctune.metaText.unalignedWords[j]==="string"){extraText+=abctune.metaText.unalignedWords[j]+"\n"}else{for(var k=0;k<abctune.metaText.unalignedWords[j].length;k++){extraText+=" FONT "+abctune.metaText.unalignedWords[j][k].text}extraText+="\n"}}text2=this.paper.text(this.paddingleft*this.scale+50*this.scale,this.y*this.scale+25*this.scale,extraText).attr({"text-anchor":"start","font-family":"serif","font-size":17*this.scale,"class":this.addClasses("meta-bottom")});height=text2.getBBox().height+17*this.scale;text2.translate(0,height/2);this.y+=height;extraText=""}if(abctune.metaText.book){extraText+="Book: "+abctune.metaText.book+"\n"}if(abctune.metaText.source){extraText+="Source: "+abctune.metaText.source+"\n"}if(abctune.metaText.discography){extraText+="Discography: "+abctune.metaText.discography+"\n"}if(abctune.metaText.notes){extraText+="Notes: "+abctune.metaText.notes+"\n"}if(abctune.metaText.transcription){extraText+="Transcription: "+abctune.metaText.transcription+"\n"}if(abctune.metaText.history){extraText+="History: "+abctune.metaText.history+"\n"}if(abctune.metaText["abc-copyright"]){extraText+="Copyright: "+abctune.metaText["abc-copyright"]+"\n"}if(abctune.metaText["abc-creator"]){extraText+="Creator: "+abctune.metaText["abc-creator"]+"\n"}if(abctune.metaText["abc-edited-by"]){extraText+="Edited By: "+abctune.metaText["abc-edited-by"]+"\n"}text2=this.paper.text(this.paddingleft,this.y*this.scale+25*this.scale,extraText).attr({"text-anchor":"start","font-family":"serif","font-size":17*this.scale,"class":this.addClasses("meta-bottom")});height=text2.getBBox().height;if(!height){height=25*this.scale}text2.translate(0,height/2);this.y+=25*this.scale+height*this.scale;var sizetoset={w:(maxwidth+this.paddingright)*this.scale,h:(this.y+this.paddingbottom)*this.scale};this.paper.setSize(sizetoset.w,sizetoset.h);var isIE=
/*@cc_on!@*/
false;if(isIE){this.paper.canvas.parentNode.style.width=sizetoset.w+"px";this.paper.canvas.parentNode.style.height=""+sizetoset.h+"px"}else{this.paper.canvas.parentNode.setAttribute("style","width:"+sizetoset.w+"px")}};ABCJS.write.Printer.prototype.printSubtitleLine=function(a){this.paper.text(this.width/2,this.y,a.subtitle).attr({"font-size":16,"class":"text meta-top"}).scale(this.scale,this.scale,0,0)};function centerWholeRests(b){for(var e=0;e<b.length;e++){var g=b[e];for(var c=1;c<g.children.length-1;c++){var a=g.children[c];if(a.abcelem.rest&&a.abcelem.rest.type==="whole"){var f=g.children[c-1];var h=g.children[c+1];var d=(h.x-f.x)/2+f.x;a.x=d-a.w/2}}}}ABCJS.write.Printer.prototype.printStaffLine=function(g,d,b){var h=this.layouter.printABCLine(d.staff);var c=this.space;for(var f=0;f<3;f++){h.layout(c,this,false);if(b&&b===g.lines.length-1&&h.w/this.width<0.66&&!g.formatting.stretchlast){break}var a=h.spacingunits*c;var e=h.w-a;if(h.spacingunits>0){c=(this.width-e)/h.spacingunits;if(c*h.minspace>50){c=50/h.minspace}}}centerWholeRests(h.voices);h.draw(this,this.y);this.staffgroups[this.staffgroups.length]=h;this.y=h.y+h.height;this.y+=ABCJS.write.spacing.STAVEHEIGHT*0.2;return h};if(!window.ABCJS){window.ABCJS={}}if(!window.ABCJS.write){window.ABCJS.write={}}ABCJS.write.sprintf=function(){var g=0,e,h=arguments[g++],k=[],d,j,l,b;while(h){if(d=/^[^\x25]+/.exec(h)){k.push(d[0])}else{if(d=/^\x25{2}/.exec(h)){k.push("%")}else{if(d=/^\x25(?:(\d+)\$)?(\+)?(0|'[^$])?(-)?(\d+)?(?:\.(\d+))?([b-fosuxX])/.exec(h)){if(((e=arguments[d[1]||g++])==null)||(e==undefined)){throw ("Too few arguments.")}if(/[^s]/.test(d[7])&&(typeof(e)!="number")){throw ("Expecting number but found "+typeof(e))}switch(d[7]){case"b":e=e.toString(2);break;case"c":e=String.fromCharCode(e);break;case"d":e=parseInt(e);break;case"e":e=d[6]?e.toExponential(d[6]):e.toExponential();break;case"f":e=d[6]?parseFloat(e).toFixed(d[6]):parseFloat(e);break;case"o":e=e.toString(8);break;case"s":e=((e=String(e))&&d[6]?e.substring(0,d[6]):e);break;case"u":e=Math.abs(e);break;case"x":e=e.toString(16);break;case"X":e=e.toString(16).toUpperCase();break}e=(/[def]/.test(d[7])&&d[2]&&e>0?"+"+e:e);l=d[3]?d[3]=="0"?"0":d[3].charAt(1):" ";b=d[5]-String(e).length;j=d[5]?str_repeat(l,b):"";k.push(d[4]?e+j:j+e)}else{throw ("Huh ?!")}}}h=h.substring(d[0].length)}return k.join("")};
; browserify_shim__define__module__export__(typeof ABCJS != "undefined" ? ABCJS : window.ABCJS);

}).call(global, undefined, undefined, undefined, undefined, function defineExport(ex) { module.exports = ex; });

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],25:[function(require,module,exports){
var Mutator = require("./Mutator");

var basic = require("./basic"); 


var Mutations = {
	basic: Mutator.make(basic)
};

module.exports = Mutations;
},{"./Mutator":26,"./basic":27}],26:[function(require,module,exports){
var utils = require("../utils");

function _defaultWeights( data ) {
	return utils.array.make(0.5, data.length);
}

/* 
	#Contract 
	data is an array;
*/
function _validate( data, mutationFunc, weightsFunction ) {

	if ( !Array.isArray( data ) ) {
		throw new TypeError("Invalid argument data. Should be an array.");
	}
	
	if ( typeof mutationFunc !== "function" ) {
		throw new TypeError("Invalid argument mutateFunc. Should be function.");
	}
	
	if ( weightsFunction && typeof weightsFunction !== "function" ) {
		throw new TypeError("Invalid argument weightsFunction. Should be function.");
	}

}

function make( mutationFunc, weightsFunction ) {
	return function( data, options ) {
		/*Throw on errors*/
		_validate( data, mutationFunc, weightsFunction );
		
		options = options || {};
		
		/* Default weights or custom if specified */
		var weights = weightsFunction? weightsFunction(data) : _defaultWeights(data);
		return mutationFunc( data.slice(), weights, options );
	};
} 

module.exports = {
	make: make
};
},{"../utils":28}],27:[function(require,module,exports){
function mutate( data, weights ) {
	
	for ( var i = 0, l = data.length; i < l; i++ ) {
		
		if ( Math.random() < weights[i] ) {
			continue;
		}

		
		/* MUTATION FUNCTION */
		if ( i === data.length - 1) {
			continue;
		}

		var temp = data[i];

		data[i] = data[i+1];
		data[i+1] = temp;
		
	}

	return data;
}

module.exports = mutate;

},{}],28:[function(require,module,exports){
function checkArray( arr ) {
	if ( !Array.isArray(arr) ) {
		throw new TypeError("arr should be an array " + arr + " given.");
	}
}

function checkObj( obj ) {
	if ( !obj || typeof obj !== "object" ) {
		throw new TypeError('obj should be an object ${obj} given');
	}
}

var array = {
	make: function( value, length ) {
		var arr = [], i = length;
		while( i-- ) {
			arr[i] = value;
		}
		return arr;
	},
	randomKey: function( arr ) {
		checkArray(arr);
		return Math.floor(Math.random() * arr.length);
	},
	
	randomElement: function( arr ) {
		var randomKey = array.randomKey(arr);
		return arr[randomKey];
	},
	
	findObjectByKey: function( array, field, value ) {
		var filtered = array.filter(function( element ) {
			return (element.hasOwnProperty(field) && element[field] === value);
		});
		
		return filtered[0];
	}
};

var obj = {
	randomElement: function( obj ) {
		checkObj(obj);
		
		var keys = Object.keys(obj);
		
		var randomKey = array.randomElement(keys);
		
		return obj[randomKey];
	}
};

module.exports = {
	array: array,
	obj: obj
};
},{}],29:[function(require,module,exports){
var rules = {
	range: (function() {
		var prefix = "range:";
		var regexp = /\[(\d),(\d)\]/;
		
		
		function getParams( string ) {
			
			var result = regexp.exec(string);
			
			if ( !result ) {
				return false;
			}
			
			return { 
				"from": result[1],
				"to": result[2] 
		    };
		}
				
		function run( data, paramsString ) {
			var params = getParams(paramsString);
			if ( !params ) {
				return false;
			}
			
			return data >= params.to && data <= params.from; 
		}
				
		return {
			prefix: prefix,
			run: run
		};
	})()
};



function validate( value, rule ) {

/*	var rulesObjs = Object.keys(rules).filter(function( key ) {
		return rule.indexOf(rule[key].prefix) !== -1;
	});
*/	
	if ( !rulesObjs || !rulesObjs.length ) {
		return false;
	}
	
	
}


module.exports = validate;
},{}],30:[function(require,module,exports){
// hbsfy compiled Handlebars template
var HandlebarsCompiler = require('hbsfy/runtime');
module.exports = HandlebarsCompiler.template({"1":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "		<div class=\"large-6 columns\">\r\n			<div class=\"row collapse prefix-radius\">\r\n				<div class=\"small-3 columns\">\r\n					<span class=\"prefix\">"
    + escapeExpression(((helper = (helper = helpers.description || (depth0 != null ? depth0.description : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"description","hash":{},"data":data}) : helper)))
    + "</span>\r\n				</div>\r\n				<div class=\"small-9 columns\">\r\n					<input data-config-field=\""
    + escapeExpression(((helper = (helper = helpers.field || (depth0 != null ? depth0.field : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"field","hash":{},"data":data}) : helper)))
    + "\" type=\""
    + escapeExpression(((helper = (helper = helpers.type || (depth0 != null ? depth0.type : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"type","hash":{},"data":data}) : helper)))
    + "\" "
    + escapeExpression(((helper = (helper = helpers.additionalAttributes || (depth0 != null ? depth0.additionalAttributes : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"additionalAttributes","hash":{},"data":data}) : helper)))
    + " placeholder=\"\">\r\n				</div>\r\n			</div>\r\n		</div>\r\n";
},"compiler":[6,">= 2.0.0-beta.1"],"main":function(depth0,helpers,partials,data) {
  var stack1, buffer = "<section>\r\n	<div class=\"row\">\r\n";
  stack1 = helpers.each.call(depth0, (depth0 != null ? depth0.items : depth0), {"name":"each","hash":{},"fn":this.program(1, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "	</div>\r\n</section>";
},"useData":true});

},{"hbsfy/runtime":9}],31:[function(require,module,exports){
// hbsfy compiled Handlebars template
var HandlebarsCompiler = require('hbsfy/runtime');
module.exports = HandlebarsCompiler.template({"compiler":[6,">= 2.0.0-beta.1"],"main":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "<tr data-id=\""
    + escapeExpression(((helper = (helper = helpers.index || (depth0 != null ? depth0.index : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"index","hash":{},"data":data}) : helper)))
    + "\" data-callback=\"select\" data-type=\"callback\">\r\n	<td>"
    + escapeExpression(((helper = (helper = helpers.index || (depth0 != null ? depth0.index : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"index","hash":{},"data":data}) : helper)))
    + "</td>\r\n	<td>"
    + escapeExpression(((helper = (helper = helpers.fitness || (depth0 != null ? depth0.fitness : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"fitness","hash":{},"data":data}) : helper)))
    + "</td>\r\n</tr>\r\n";
},"useData":true});

},{"hbsfy/runtime":9}]},{},[1])