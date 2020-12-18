# vue-router源码分析 - 第一波
今天主要介绍`VueRouter`的源码,首先可以去`gitHub`上下载`vue-router`的源码,我这里已经下载好了~

分享之前, 先配上一张图, 大家可以对着图中结构去阅读文章, 避免迷失~

![图一](https://github.com/UU-GIT/vue-router-source-analysis/blob/master/images/vue-router.png)

## 文件目录结构
先看一下目录结构:

![图一](https://github.com/UU-GIT/vue-router-source-analysis/blob/master/images/1.png)

```
├── build					// 构建脚本
├── dist					// 输出目录
├── docs					// 项目文档
├── docs-gitbook			// gitbook配置
├── examples				// 示例代码,调试的时候使用
├── flow					// 类型声明
├── scripts					// 构建相关
├── src						// 源码目录
│   ├── components 			// 公共组件<router-view> and <router-link> 的实现
│   ├── history				// 路由类实现
│   ├── util				// 工具库
│   ├── create-matcher.js	// 根据传入的配置对象创建路由映射表
│   ├── create-route-map.js	// 根据routes配置对象创建路由映射表
│   ├── index.js			// 主入口 VueRouter 构造函数
│   └── install.js			// VueRouter装载入口,在Vue beforeCreate生命周期时,vue-router开始初始化
├── test					// 测试文件
└── types					// TypeScript 声明
```
我们待会要分析的源码就是 `src` 中的内容.

## 入口/出口文件
首先我们从 `package.json` 看起,在`package.json`里面我们会注意的:

```js
"build": "node build/build.js"
```
`build`: 通过执行 `build/build.js` 文件,来生成最终`dist`下的正式的`vue-router`文件；
`build/build.js`文件主要是做一些文件的读取输出等,重要的配置实在`build/configs.js`里面,简单看一下`build/configs.js`:
```javascript
/* 
 * file:最终输出的文件的位置及名称
 * format:文件编译的格式
 * env:环境标记
 */
module.exports = [{
    file: resolve('dist/vue-router.js'),
    format: 'umd',
    env: 'development'
  },
  {
    file: resolve('dist/vue-router.min.js'),
    format: 'umd',
    env: 'production'
  },
  {
    file: resolve('dist/vue-router.common.js'),
    format: 'cjs'
  },
  {
    file: resolve('dist/vue-router.esm.js'),
    format: 'es'
  }
].map(genConfig)

function genConfig (opts) {
  const config = {
    input: {
      input: resolve('src/index.js'), // 打包的入口文件
      plugins: [...], // 插件
    },
    // 文件输出配置
    output: {
      file: opts.file,
      format: opts.format,
      banner,
      name: 'VueRouter'
    }
  }

  if (opts.env) {
    // 生成/开发环境下降process.env.NODE_ENV替换为'development/production'
    config.input.plugins.unshift(replace({
      'process.env.NODE_ENV': JSON.stringify(opts.env)
    }))
  }
  return config
}
```
从上面代码中可以看出打包的入口是 `src/index.js` 文件,所以等下我们要从 `src/index.js` 看起

## 路由注册

### vue-router的使用
在看源码之前,先回顾一下在项目中我们是如何使用`vue-router`的
```js
// vue文件中
<div id="app">
    <!-- 路由匹配到的组件将渲染在这里  -->
    <router-view></router-view>
</div>

// router.js
// 1. 安装 插件
import VueRouter from 'vue-router';
Vue.use(VueRouter);

// 2. 创建 router 实例
const routes = [{ path: '/foo', component: Foo }]
const router = new VueRouter({ routes });

// 3. 挂载router
const app = new Vue({router}).$mount('#app');
```
上述代码中用到的 `VueRouter` 对象,就在`vue-router` 的入口文件 `src/index.js`中.

根据上面的例子,会发现利用 `VueRouter`是通过 `Vue.js` 提供的插件机制`.use(plugin)` 来安装,而这个插件机制则会调用该 `plugin` 对象的 `install` 方法,看代码:
```javascript
// src/index.js
import { install } from './install'

export default class VueRouter { 
    static install: () => void;
    // ...
 }

VueRouter.install = install
 VueRouter.version = '__VERSION__'
 ​
 if (inBrowser && window.Vue) {
   window.Vue.use(VueRouter)
 }
```
首先这个文件暴露了一个类 `VueRouter`,并且在后面在它之上还加了`install`方法,用作`Vue`的插件.另外还判断了浏览器和全局Vue的存在,直接装载插件,避免在全局引用的时候不需要再调用`Vue.use(VueRouter)`.

### Vue.use
Vue 提供了 Vue.use 的全局 API 来注册这些插件,所以我们先来分析一下它的实现原理,定义在 `vue/src/core/global-api/use.js` 中:
```javascript
export function initUse (Vue: GlobalAPI) {
  Vue.use = function (plugin: Function | Object) {
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    const args = toArray(arguments, 1)
    args.unshift(this)
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args)
    }
    installedPlugins.push(plugin)
    return this
  }
}
```
`Vue.use` 接受一个 `plugin` 参数,并且维护了一个 `_installedPlugins` 数组,它存储所有注册过的 `plugin`；接着又会判断 `plugin` 有没有定义 `install` 方法,如果有的话则调用该方法,并且该方法执行的第一个参数是 `Vue`；最后把 `plugin` 存储到 `installedPlugins` 中.

可以看到 `Vue` 提供的插件注册机制很简单,每个插件都需要实现一个静态的 `install` 方法,当我们执行 `Vue.use` 注册插件的时候,就会执行这个 `install` 方法,并且在这个 `install` 方法的第一个参数我们可以拿到 Vue 对象,这样的好处就是作为插件的编写方不需要再额外去import Vue 了

### 路由安装
上面我们提到在`src/index.js`中为`VueRouter`添加了`install`的方法,然后来看一下`vue-router/src/install.js` 里面是如何进行路由插件的安装的:

```javascript
// Vue.use安装插件时候需要暴露的install方法
export function install(Vue) {
  // 判断是否已经启动安装vue-router,确保 install 逻辑只执行一次
  if (install.installed && _Vue === Vue) return
  install.installed = true

  // 保存Vue实例, 作为 Vue 的插件对 Vue 对象是有依赖的,但又不能去单独去 import Vue,因为那样会增加包体积,所以就通过这种方式拿到 Vue 对象
  _Vue = Vue

  // 判断是否已定义
  const isDef = v => v !== undefined
  // 进行注册router实例
  const registerInstance = (vm, callVal) => {
    // 至少存在一个 VueComponent 时, _parentVnode 属性才存在
    let i = vm.$options._parentVnode
    /* 
     * isDef(i):VueComponent存在的前提下
     * isDef(i = i.data):VueComponent的data之后进行初始化
     * isDef(i = i.registerRouteInstance):registerRouteInstance在src/components/view.js,只有早<router-view>的下一层组件实例中才会执行if
     */
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      // 这里的i = vm.$options._parentVnode.data.registerRouteInstance
      i(vm, callVal)
    }
  }
  Vue.mixin({
    // 在beforeCreate执行环境的时候,this指向的是新创建出来的vm实例
    beforeCreate() {
      // 首次初始化路由,只执行一次
      if (isDef(this.$options.router)) {
        // 如果vm实例配置项有router选项的时候,那么这个vm实例就是router的根组件
        this._routerRoot = this
        // 把VueRouter实例挂载到_router上
        this._router = this.$options.router
        // init定义在src/index.js中
        this._router.init(this)
        // Vue.util.defineReactive, 通过Vue中观察者劫持数据的方法,劫持_route,当_route触发setter方法的时候,则会通知到依赖的组件
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        // 如果不是路由根目录组件的时候,那么就会通过$parent一级级获取父组件的_routerRoot属性赋值为根组件
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      // 进行注册路由操作
      registerInstance(this, this)
    },
    destroyed() {
      // 取消注册
      registerInstance(this)
    }
  })
  // 给Vue原型新增属性:$router,$route,这样Vue的所有组件都会有这2个属性了
  Object.defineProperty(Vue.prototype, '$router', {
    get() { return this._routerRoot._router }
  })
  // $route为当前的route
  Object.defineProperty(Vue.prototype, '$route', {
    get() { return this._routerRoot._route }
  })

  // 注册router-view router-link组件,这样就可以在页面使用
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  const strats = Vue.config.optionMergeStrategies
  // 为路由新增3个钩子挂在在Vue上,和created方法一样
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
```

`install` 方法主要分为几个部分:

1. 通过 `Vue.mixin` 在 `beforeCreate`、 `destroyed` 的时候将一些路由方法挂载到每个 vue 实例中
2. 通过给 `Vue.prototype` 定义 `$router`、`$route` 属性把他们注入到所有组件中(主要是为了方便访问`router`,`route`)
3. 注册全局公共组件 `router-view`、`router-link`
4. 注册路由的钩子

## VueRouter

### VueRouter init
在 `src/index.js`中有这么一句`this._router.init(this)`,现在详细看一下 VueRouter 的`init`.
```js
init(app: any) {
    // 未安装就调用init会抛出异常
    process.env.NODE_ENV !== 'production' &&
      assert(
        install.installed,
        `not installed. Make sure to call \`Vue.use(VueRouter)\` ` +
        `before creating root instance.`
      )
    // 将当前vm实例保存在app中
    this.apps.push(app)
    // app被destroyed时候,会$emit hook:destroyed事件,监听这个事件,执行下面方法,从apps 里将app移除
    app.$once('hook:destroyed', () => {
      const index = this.apps.indexOf(app)
      if (index > -1) this.apps.splice(index, 1)
      if (this.app === app) this.app = this.apps[0] || null
      if (!this.app) this.history.teardown()
    })
    if (this.app) {
      return
    }
    // this.app保存当前vm实例
    this.app = app

    // history是vueRouter维护的全局变量
    const history = this.history
    // 针对不同路由模式做不同的处理
    if (history instanceof HTML5History || history instanceof HashHistory) {
      const handleInitialScroll = routeOrError => {
        const from = history.current
        const expectScroll = this.options.scrollBehavior
        const supportsScroll = supportsPushState && expectScroll

        if (supportsScroll && 'fullPath' in routeOrError) {
          handleScroll(this, routeOrError, from, false)
        }
      }
      const setupListeners = routeOrError => {
        history.setupListeners() // 设置 popstate/hashchange 事件监听
        handleInitialScroll(routeOrError)
      }
      // transitionTo是history的核心方法
      history.transitionTo(
        history.getCurrentLocation(),  // 当前地址
        setupListeners, // 成功 
        setupListeners  // 失败
      )
    }

    // 路由全局监听,将apps中的组件的_route全部更新至最新的
    history.listen(route => {
      this.apps.forEach(app => {
        app._route = route  // app._route 是当前跳转的路由
      })
    })
  }
```
所以汇总一下`init` 方法里主要做了几件事:
1. 将当前vm实例保存到`apps` 里,当执行`destroyed`的时候,将当前vm实例从`apps`中移除
2. 通过 `history.transitionTo` 触发路由变化,通过 `history.listen` 监听路由变化来更新根组件实例.

### VueRouter constructor
继续,看完`init`,来看下`constructor`的时候做了些什么？
1. 设置路由匹配的模式(设置`mode`)
2. 根据不同的`mode`,实例化不同的`History`类,赋值`this.history`

```js
constructor(options: RouterOptions = {}) {
    // 路由匹配方式,默认为hash
    let mode = options.mode || 'hash'
    this.fallback =
        mode === 'history' && !supportsPushState && options.fallback !== false
    // 如果不支持history则退回为hash
    if (this.fallback) {
        mode = 'hash'
    }
    // 非浏览器环境强制abstract,比如node中
    if (!inBrowser) {
        mode = 'abstract'
    }
    this.mode = mode

    // 跟进mode的不同,实例化不同的History类, 后面的this.history就是History的实例
    switch (mode) {
        case 'history':
        this.history = new HTML5History(this, options.base)
        break
        case 'hash':
        this.history = new HashHistory(this, options.base, this.fallback)
        break
        case 'abstract':
        this.history = new AbstractHistory(this, options.base)
        break
        default:
        if (process.env.NODE_ENV !== 'production') {
            assert(false, `invalid mode: ${mode}`)
        }
    }
}
```
3种路由的模式源码在`src/history`下, 这个下次在讲哈~

### VueRouter 钩子及其他方法
在`src/index.js`这个文件中,还有些方法,来看一下
```javascript
export default class VueRouter {
  constructor(options: RouterOptions = {}) { }
  get currentRoute() { } // 获取当前路由
  
  // 注册一些钩子事件
  beforeEach(fn: Function): Function { }
  beforeResolve(fn: Function): Function { }
  afterEach(fn: Function): Function { }
  onReady(cb: Function, errorCb?: Function) { }
  onError(errorCb: Function) { }

  // 下面这些应该比较熟悉了,经常在项目中应该会用到
  push(location: RawLocation, onComplete?: Function, onAbort?: Function) { }
  replace(location: RawLocation, onComplete?: Function, onAbort?: Function) { }
  go(n: number) { }
  back() { }
  forward() { }

  // 获取路由匹配的组件 
  getMatchedComponents(to?: RawLocation | Route) { }
  // 根据路由对象返回浏览器路径等信息
  resolve(to: RawLocation, current?: Route, append?: boolean) { }
}
```

## macther
VueRouter中还有一个重要的方法就是`macther`:
```js
export default class VueRouter {
    constructor(options: RouterOptions = {}) {
        // 生成matcher
        this.matcher = createMatcher(options.routes || [], this)
    }
    // ...
    match(raw: RawLocation, current?: Route, redirectedFrom?: Location): Route {
        return this.matcher.match(raw, current, redirectedFrom)
    }
    // 动态添加路由 
    addRoutes(routes: Array<RouteConfig>) {
        this.matcher.addRoutes(routes)
        if (this.history.current !== START) {
            this.history.transitionTo(this.history.getCurrentLocation())
        }
    }
}
```
### createMatcher
继续来看一下`createMatcher`,路径在`src/create-matcher.js`
```js
// 创建路由映射表
export function createMatcher(
  routes: Array<RouteConfig>,
  router: VueRouter
): Matcher {
    // 根据传入的配置对象创建路由映射表
    const { pathList, pathMap, nameMap } = createRouteMap(routes)

    // 动态添加路由
    function addRoutes(routes) {
    createRouteMap(routes, pathList, pathMap, nameMap)
    }
    /* 
     * match: 根据传入的raw和当前的路径currentRoute计算出一个新的路径并返回
     * raw: 它可以是一个 url 字符串,也可以是一个 Location 对象
     * currentRoute: 当前的路径
     * redirectedFrom: 重定向相关
     */
    function match (
        raw: RawLocation,
        currentRoute?: Route,
        redirectedFrom?: Location
    ): Route {
        // 根据 raw,current 计算出新的 location
        const location = normalizeLocation(raw, currentRoute, false, router);
        const { name } = location;
        if (name) {
          // 有name的情况, 进行nameMap映射, 获取到路由记录, 处理当前路由params,返回_createRoute处理的结果
        } else if (location.path) {
          // 有path的情况,到pathList和PathMap里匹配到路由记录,符合matchRoute的情况下返回_createRoute处理的结果
        }
    }
    // 跟进路由重定向/路由重命名做不同的处理
    function _createRoute (
        record: ?RouteRecord,
        location: Location,
        redirectedFrom?: Location
    ): Route {
        if (record && record.redirect) {
            return redirect(record, redirectedFrom || location)
        }
        if (record && record.matchAs) {
            return alias(record, location, record.matchAs)
        }
            return createRoute(record, location, redirectedFrom, router)
        }
    return {
        match,
        addRoutes
    }
}
```
1. 路由匹配器`macther`是由`createMatcher`生成一个对象,它会将传入`VueRouter`类的路由记录(routes)进行内部转换,创建路由映射表
`createMatcher` 接收 2 个参数:
- `router`, new VueRouter 返回的实例
- `routes`, 用户定义的路由配置,我们`new VueRouter`时传入的参数`routes`

`createMatcher` 对外提供根据`match`和`addRoutes`:
`match` - 返回的是一个路径,根据传入的`raw`和当前的路径`currentRoute`计算出一个新的路径并返回;
`addRoutes` - 动态添加路由配置,因为在实际开发中有些场景是不能提前把路由写死的,需要根据一些条件动态添加路由,`addRoutes` 的方法十分简单,再次调用 `createRouteMap` 即可,传入新的 `routes` 配置,由于 `pathList、pathMap、nameMap` 都是引用类型,执行 `addRoutes` 后会修改它们的值;

### createRouteMap
`createMatcher`中有个比较重要的方法就是`createRouteMap`,`createRouteMap` 的定义在 `src/create-route-map.js` 中, `createRouteMap` 返回3个值:
- `pathList` 存储所有的 path;
- `pathMap` 表示 path 到 RouteRecord 的映射关系;
- `nameMap` 表示 name 到 RouteRecord 的映射关系;

```js
export function createRouteMap (
  routes: Array<RouteConfig>,
  oldPathList?: Array<string>,
  oldPathMap?: Dictionary<RouteRecord>,
  oldNameMap?: Dictionary<RouteRecord>
): {
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>
} {
  const pathList: Array<string> = oldPathList || []
  const pathMap: Dictionary<RouteRecord> = oldPathMap || Object.create(null)
  const nameMap: Dictionary<RouteRecord> = oldNameMap || Object.create(null)
  // 遍历配置对象的 routes 配置,为每个路由配置添加路由记录
  routes.forEach(route => {
    addRouteRecord(pathList, pathMap, nameMap, route)
  })
  // 确保通配符在 pathList 数组中最后一项
  for (let i = 0, l = pathList.length; i < l; i++) {
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0])
      l--
      i--
    }
  }
  if (process.env.NODE_ENV === 'development') {
    // 如果路由不包括前导斜杠,则发出警告
    const found = pathList
      .filter(path => path && path.charAt(0) !== '*' && path.charAt(0) !== '/')
    // 检查是否缺少正斜杠
    if (found.length > 0) {
      const pathNames = found.map(path => `- ${path}`).join('\n')
      warn(false, `Non-nested routes must include a leading slash character. Fix the following routes: \n${pathNames}`)
    }
  }

  return {
    pathList,
    pathMap,
    nameMap
  }

  /**
   * addRouteRecord:路由记录
   * 将路由所有的路由记录映射到pathMap、nameMap中,
   * 处理嵌套路由:递归调用此方法,parent表示父级路由
   * 处理路由别名:把路径别名看成是指向同一个组件的路由记录,由此方法处理一遍这个别名组成的路由
   * 处理路由名称:若存在路由名称,则将该路由映射到nameMap中存储
   */
  function addRouteRecord (
    pathList: Array<string>,
    pathMap: Dictionary<RouteRecord>,
    nameMap: Dictionary<RouteRecord>,
    route: RouteConfig,
    parent?: RouteRecord,
    matchAs?: string
  ) {
    ...
  }
}
```
总结一下,`createRouteMap` 主要做了哪些事:
1. 存储所有的`path`,为每个`route`的`path`和`name`创建映射关系;
2. 遍历`routes`为每一个`route`,执行`addRouteRecord`方法生成一条记录;
3. `addRouteRecord`处理完路由后得到 `pathList` `pathMap` `nameMap`,将其组成对象并返回;


## 后续
`vue-route`的源码我们现在才看了开头,后面还有`router-link`, `router-view`, `history`,工程还很大,后面我在继续加更~

U也是参考借鉴了诸多大佬的优秀文章, 写的有误的地方还请大家见谅及时帮忙指出,U心怀感激~

本文首发于[UU的GitHub](https://github.com/UU-GIT/vue-router-source-analysis),转载请注明出处哦,感谢支持~

## 关注UU
大家也可以关注我的公众号`【前端UU】`,定期获取好文推荐哟～

![图一](https://github.com/UU-GIT/vue-router-source-analysis/blob/master/images/qrcode.jpg)

## 参考文章
1. [Vue\.js 技术揭秘](https://ustbhuangyi.github.io/vue-analysis/v2/vue-router)
2. [vue-router 源码阅读 - 文件结构与注册机制](https://github.com/SHERlocked93/vue-router-analysis)
3. [带你全面分析vue-router源码(万字长文)](https://www.yuque.com/johniexu/frontend/su0uf8)