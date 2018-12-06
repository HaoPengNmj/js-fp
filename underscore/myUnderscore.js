(function () {
    // 基础设置
    // --------------

    // Establish the root object, `window` (`self`) in the browser, `global`
    // on the server, or `this` in some virtual machines. We use `self`
    // instead of `window` for `WebWorker` support.
    // self 是 window.self, self 属性是对窗口的自身的只读引用, 
    // 经常会使用 self 来代替 window 对象. 在防 HTTP 劫持的时候就会使用 window.top 是不是等于 window.self 来判断是不是被劫持了. 
    // 第一行的意思就是判断代码是不是在客户端下运行也就是 window 对象里面, 如果 self 是一个对象而且 self.self === self 的话那么就说明是在浏览器端
    // global 是 node 环境下的全局对象的引用, 类似于 self, global.global === global 的话就说明是 node 环境下
    // 如果都不是那么就是在其他的一些 js 环境里面比如 web worker, 你可以在浏览器里面试试
    // 详细请看: https://github.com/zhangxiang958/underscore-sourcecodeAnalysis/issues/1
    var root = typeof self == 'object' && self.self === self && self ||
        typeof global == 'object' && global.global === global && global ||
        this ||
        {};

    // Save the previous value of the `_` variable.
    // 将 underscore 对象缓存起来
    var previousUnderscore = root._;

    // Save bytes in the minified (but not gzipped) version:
    // 
    var ArrayProto = Array.prototype, ObjProto = Object.prototype;
    var SymbolProto = typeof Symbol !== 'undefined' ? Symbol.prototype : null;

    // Create quick reference variables for speed access to core prototypes.
    // 将常用的数组或对象方法缓存起来, 提高读取速度.
    var push = ArrayProto.push,
        slice = ArrayProto.slice,
        toString = ObjProto.toString,
        hasOwnProperty = ObjProto.hasOwnProperty;

    // All **ECMAScript 5** native function implementations that we hope to use
    // are declared here.
    // 将一些常用的原生方法缓存起来, 可以方便压缩和提高读取速度. 
    // Array.isArray 方法其实就是我们常用判断是不是数组的方法, 不过我自己常用的是 Object.prototype.toString.call() 这个方法 判断值是不是 [object Array], 如果是就是数组对象, 实际上 Array.isArray 的 polyfill 也是这么做的. 
    // Object.keys 是返回对象的所有键名数组, 这样就可以直接时候迭代器, 而不需要 for in 循环了. 
    // Object.create 方法是常用于原型继承的, 它返回一个新的对象, 这个对象和输入的对象已经进行了 原型链中的原型指针的连接(proto).
    var nativeIsArray = Array.isArray,
        nativeKeys = Object.keys,
        nativeCreate = Object.create;

    // Naked function reference for surrogate-prototype-swapping.
    // 创建一个 "干净" 的构造函数用于实现优化后的组合继承.
    var Ctor = function () { };

    // Create a safe reference to the Underscore object for use below.
    // 这里是创建了 underscore 对象.这个函数的目的其实就是为了创建 underscore 对象, 如果在 new 命令的时候有对象传进来, 那么就将这个对象传给新建对象的 _wrapped 属性存储起来.
    var _ = function (obj) {
        if (obj instanceof _) return obj;
        if (!(this instanceof _)) return new _(obj);
        this._wrapped = obj;
    };

    // Export the Underscore object for **Node.js**, with
    // backwards-compatibility for their old module API. If we're in
    // the browser, add `_` as a global object.
    // (`nodeType` is checked to ensure that `module`
    // and `exports` are not HTML elements.)
    // 这段代码如何理解呢? 
    // 这个是前端与 node.js 通用的模块封装模式, 
    // 我们知道 exports 和 module.exports 是 node 模块化的显著标志, 
    // 第一个先判断 exports 是否存在, 还有就是判断 exports 变量是否有 nodeType 属性, 
    // 如果有, 说明 exports 变量是一个 html 元素, 所以不使用 node 方式模块加载, 
    // 同理 module 变量也是这样.这里不再细讲 exports 和 module.exports 的区别, 
    // 简单总结就是 exports 看作是 module.exports 的一个快照.
    if (typeof exports != 'undefined' && !exports.nodeType) {
        if (typeof module != 'undefined' && !module.nodeType && module.exports) {
            exports = module.exports = _;
        }
        exports._ = _;
    } else {
        root._ = _;
    }

    // Current version.
    // 当前版本为 1.8.3
    _.VERSION = '1.8.3';

    // Internal function that returns an efficient (for current engines) version
    // of the passed-in callback, to be repeatedly applied in other Underscore
    // functions.
    // 一个内部动态实现绑定 this 的函数.
    // 这个函数是什么意思？从整体上看并没有太大的意思，我们知道 this 的指向是动态的，
    // 所以在实际开发中肯定免不了对函数的 this 值进行硬绑定的做法，但是 bind 函数会有兼容性问题， 
    // 所以会倾向于使用 call 方法和 apply 方法，这两个原生函数在使用的时候区别就在于 call 后面是可以跟随 n 的参数，
    // 而 apply 后面是跟随数组形式的参数的， 那为什么 underscore 源码需要将这两种方法区分呢？
    // 可以看到 optimizeCb 函数会将传递参数少于或等于 4 个的采用 call 方法来绑定 this， 
    // 而对于多于 4 个参数的方法则会采用 apply 方法来进行绑定，其实这是代码性能优化的手段，
    // apply 方法在执行的时候其实是比 call 方法要慢得多， apply 方法在执行的时候需要对传进来的参数数组 进行深拷贝：apply 内部执行伪代码
    // 请参考文章: https://github.com/zhangxiang958/underscore-sourcecodeAnalysis/issues/3
    var optimizeCb = function (func, context, argCount) {
        if (context === void 0) return func;
        switch (argCount) {
            case 1: return function (value) {
                return func.call(context, value);
            };
            // The 2-parameter case has been omitted only because no current consumers
            // made use of it.
            case null:
            case 3: return function (value, index, collection) {
                return func.call(context, value, index, collection);
            };
            case 4: return function (accumulator, value, index, collection) {
                return func.call(context, accumulator, value, index, collection);
            };
        }
        return function () {
            return func.apply(context, arguments);
        };
    };

    var builtinIteratee;

    // An internal function to generate callbacks that can be applied to each
    // element in a collection, returning the desired result — either `identity`,
    // an arbitrary callback, a property matcher, or a property accessor.
    // cb 函数到底是做什么的? cb 函数是一个内部方法, 一下子可能看不出来它的功能, 但是我们可以借助 _.iteratee 函数来看, 
    var cb = function (value, context, argCount) {
        if (_.iteratee !== builtinIteratee) return _.iteratee(value, context);
        if (value == null) return _.identity;
        if (_.isFunction(value)) return optimizeCb(value, context, argCount);
        if (_.isObject(value) && !_.isArray(value)) return _.matcher(value);
        return _.property(value);
    };

    // External wrapper for our callback generator. Users may customize
    // `_.iteratee` if they want additional predicate/iteratee shorthand styles.
    // This abstraction hides the internal-only argCount argument.
    // 根据文档 "_.iteratee 函数是用来生成可以应用到集合中每个元素的回调的, 返回想要的结果", 
    // 而 _.iteratee 函数主要是用在了 _.each, _.map, _.find, _.filter 等等的这些需要回调的函数的.
    _.iteratee = builtinIteratee = function (value, context) {
        return cb(value, context, Infinity);
    };

    // Similar to ES6's rest param (http://ariya.ofilabs.com/2013/03/es6-and-rest-parameter.html)
    // This accumulates the arguments passed into an array, after a given index.
    // 这个函数是用来模仿 ES6 语法中的拓展运算符的.
    // items 代表的就是除了第一个定义的形参 array 之外, 剩余的其他参数都变成了 items 的一部分, 
    // 而 items 会将剩余的所有参数集中起来, 放入一个数组里面, 所以 items 本身 就是一个数组, 
    // 里面按顺序存放了除 array 之外的传进来的参数. 那么我们在没有 ES6 语法的情况下, 就需要使用 arguments 对象, 
    // 将传进来的没有对应形参名的参数放入到一个数组里面, 所以我们当然需要知道函数本来已经定义了多少个已经命名了的形参的数量, 
    // 假如原来函数已经定义了 2 个参数, 那么我们就从 arguments 的第三个参数也就是 arguments 转化后得到的数组的下标为 2 的元素开始放入到 rest 数组中. 
    // 这也就是 startIndex 的意义. 然后通过一个闭包, 缓存起 startIndex 的值, 然后将模拟 rest 数组的生成:
    // https://github.com/zhangxiang958/underscore-sourcecodeAnalysis/issues/5
    // 为什么要使用这样一个 restArg 函数呢? 因为如果不使用这样的函数模拟 rest 运算符, 而是在每个函数调用 [].slice.call(arguments); 的话, 这样代码就耦合了
    // 而且代码复用性不高.
    var restArgs = function (func, startIndex) {
        startIndex = startIndex == null ? func.length - 1 : +startIndex;
        // 闭包缓存
        return function () {
            var length = Math.max(arguments.length - startIndex, 0),
                rest = Array(length),
                index = 0;
            for (; index < length; index++) {
                rest[index] = arguments[index + startIndex];
            }
            // 下面这里就是针对参数个数的多少进行 apply 和 call 的优化.
            switch (startIndex) {
                case 0: return func.call(this, rest);
                case 1: return func.call(this, arguments[0], rest);
                case 2: return func.call(this, arguments[0], arguments[1], rest);
            }
            var args = Array(startIndex + 1);
            for (index = 0; index < startIndex; index++) {
                args[index] = arguments[index];
            }
            args[startIndex] = rest;
            return func.apply(this, args);
        };
    };

    // An internal function for creating a new object that inherits from another.
    // 内部函数, 用于实现继承(组合继承)
    var baseCreate = function (prototype) {
        if (!_.isObject(prototype)) return {};
        if (nativeCreate) return nativeCreate(prototype);
        Ctor.prototype = prototype;
        var result = new Ctor;
        Ctor.prototype = null;
        return result;
    };


    // shallowProperty 函数是用来获取对象对应键名的值的, 
    var shallowProperty = function (key) {
        return function (obj) {
            return obj == null ? void 0 : obj[key];
        };
    };
    // deepGet 函数则主要是在 property 或者 propertyOf 这两个根据键名获取键值的函数中, 
    // 当输入的键名值为数组类型的时候, 采用遍历的方式 取值, 它是一个内部的工具函数. 
    var deepGet = function (obj, path) {
        var length = path.length;
        for (var i = 0; i < length; i++) {
            if (obj == null) return void 0;
            obj = obj[path[i]];
        }
        return length ? obj : void 0;
    };

    // Helper for collection methods to determine whether a collection
    // should be iterated as an array or as an object.
    // Related: http://people.mozilla.org/~jorendorff/es6-draft.html#sec-tolength
    // Avoids a very nasty iOS 8 JIT bug on ARM-64. #2094
    // 下面这里都是一些集合类函数的辅助函数.
    // getLength 是一个获取对象 length 属性的工具方法, 而 MAX_ARRAY_INDEX 为 2 的 53 次方减 1, 
    // 而这个是 javascript 中能表示的最大整数值.
    var MAX_ARRAY_INDEX = Math.pow(2, 53) - 1;
    var getLength = shallowProperty('length');
    // isArrayLike 是为了判断一个对象是不是类数组对象
    // 什么是类数组对象? 像我们常见的 arguments 对象, DOM 中的 NodeList 对象等等这些都是类数组对象, 
    // 他们有 length 属性并且表示的是对象 拥有的元素的数量, 但是却没有数组的某些方法像 forEach, map 等等.
    // 这也就是所谓的鸭子模型, 所以我们在使用 underscore 集合函数的时候要避免传入拥有 length 属性的对象, 否则会被当作数组使用.
    var isArrayLike = function (collection) {
        var length = getLength(collection);
        return typeof length == 'number' && length >= 0 && length <= MAX_ARRAY_INDEX;
    };

    // Collection Functions
    // --------------------

    // The cornerstone, an `each` implementation, aka `forEach`.
    // Handles raw objects in addition to array-likes. Treats all
    // sparse array-likes as if they were dense.
    // each 函数中 obj 就是你需要遍历的那个对象, 
    // iteratee 是你定义的处理数据回调函数, context 是执行上下文, 回调函数的 this 值将会是 context. 
    // 而对于第一句 iteratee = optimizeCb(iteratee, context);, 就是之前所说的视命名参数数量而使用 call 或 apply 动态生成回调的函数, 这里函数式编程的优势就体现了, 每个函数只负责单一的功能, 组合起来威力很大. 
    // 然后对传进来的对象进行类型判断, 如果是类数组类型(有 length 属性, 并且是一个大于 1 小于 2 的 23 次方减 1 的数), 
    // 那么就使用下标的形式也就是方括号的形式来遍历对象. 
    // 如果不是, 那么就使用 _.keys 函数, 将对象的键名提取出来, 并返回键名数组, 然后根据键名数组中的键名, 逐个提取 obj 对象中的键值, 进行遍历. 
    _.each = _.forEach = function (obj, iteratee, context) {
        iteratee = optimizeCb(iteratee, context);
        var i, length;
        if (isArrayLike(obj)) {
            for (i = 0, length = obj.length; i < length; i++) {
                iteratee(obj[i], i, obj);
            }
        } else {
            // 不知道大家在对象遍历的时候有没有疑问, 我在看的时候, 我觉得 _.keys 非常奇怪, 
            // 为什么需要先提取键名数组, 使用 for...in 循环然后使用 hasOwnProperty 来判断对象是否拥有该键不可以吗? 
            // 其实这里作者非常巧妙, 第一将获取键名的函数独立出去, 有利于其他函数的复用, 而且这样显得非常简洁.
            // 第二 keys 数组如果能用原生的 Object.keys 当然最好, 但是会有兼容性问题, 所以需要使用 for...in 循环来兼容, 
            // 所以不将 for...in 循环不写在 each 函数里面可以减低耦合度, 优化代码性能(for..in 不是必需执行的循环).
            // 最后一点在于 IE9 的兼容问题, 在低于 IE9 的浏览器版本里面, 当对象中含有像 toString, valueOf, isPropertyOf, propertyIsEnumerable, hasOwnProperty, toLocaleString 这些属性名的键值对时, 
            // 这些属性是无法使用 for...in 循环遍历出来的. 也就是 collectNonEnumProps 函数里面所做的内容.
            var keys = _.keys(obj);
            for (i = 0, length = keys.length; i < length; i++) {
                iteratee(obj[keys[i]], keys[i], obj);
            }
        }
        return obj;
    };
});