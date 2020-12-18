/* @flow */

import { install } from './install'
import { START } from './util/route'
import { assert } from './util/warn'
import { inBrowser } from './util/dom'
import { cleanPath } from './util/path'
import { createMatcher } from './create-matcher'
import { normalizeLocation } from './util/location'
import { supportsPushState } from './util/push-state'
import { handleScroll } from './util/scroll'

import { HashHistory } from './history/hash'
import { HTML5History } from './history/html5'
import { AbstractHistory } from './history/abstract'

import type { Matcher } from './create-matcher'

import { isNavigationFailure, NavigationFailureType } from './util/errors'

export default class VueRouter {
  static install: () => void
  static version: string
  static isNavigationFailure: Function
  static NavigationFailureType: any

  app: any
  apps: Array<any>
  ready: boolean
  readyCbs: Array<Function>
  options: RouterOptions  // 创建实例时传的参数
  mode: string
  history: HashHistory | HTML5History | AbstractHistory
  matcher: Matcher // 路由匹配器
  fallback: boolean  // 是否向后兼容
  beforeHooks: Array<?NavigationGuard>
  resolveHooks: Array<?NavigationGuard>
  afterHooks: Array<?AfterNavigationHook>

  constructor(options: RouterOptions = {}) {
    this.app = null
    this.apps = []
    this.options = options
    this.beforeHooks = []
    this.resolveHooks = []
    this.afterHooks = []
    this.matcher = createMatcher(options.routes || [], this)

    // 路由匹配方式，默认为hash
    let mode = options.mode || 'hash'
    this.fallback =
      mode === 'history' && !supportsPushState && options.fallback !== false
    // 如果不支持history则退回为hash
    if (this.fallback) {
      mode = 'hash'
    }
    // 非浏览器环境强制abstract，比如node中
    if (!inBrowser) {
      mode = 'abstract'
    }
    this.mode = mode

    // 根据mode的不同，实例化不同的History类,并赋值this.history
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

  match(raw: RawLocation, current?: Route, redirectedFrom?: Location): Route {
    return this.matcher.match(raw, current, redirectedFrom)
  }

  // 获取当前的路由
  get currentRoute(): ?Route {
    return this.history && this.history.current
  }

  init(app: any /* Vue component instance */) {
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
    // 跟进mode的不同,实例化不同的History类, 后面的this.history就是History的实例
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
        // 设置 popstate/hashchange 事件监听
        history.setupListeners()
        handleInitialScroll(routeOrError)
      }
      // transitionTo是history的核心方法
      history.transitionTo(
        history.getCurrentLocation(), // 当前地址
        setupListeners, // 成功 
        setupListeners // 失败
      )
    }

    // 路由全局监听,将apps中的组件的_route全部更新至最新的
    history.listen(route => {
      this.apps.forEach(app => {
        app._route = route // app._route 是当前跳转的路由
      })
    })
  }
  // 注册一些钩子事件
  beforeEach(fn: Function): Function {
    return registerHook(this.beforeHooks, fn)
  }
  beforeResolve(fn: Function): Function {
    return registerHook(this.resolveHooks, fn)
  }
  afterEach(fn: Function): Function {
    return registerHook(this.afterHooks, fn)
  }
  onReady(cb: Function, errorCb?: Function) {
    this.history.onReady(cb, errorCb)
  }
  onError(errorCb: Function) {
    this.history.onError(errorCb)
  }

  push(location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // $flow-disable-line
    if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
      return new Promise((resolve, reject) => {
        this.history.push(location, resolve, reject)
      })
    } else {
      this.history.push(location, onComplete, onAbort)
    }
  }

  replace(location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // $flow-disable-line
    if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
      return new Promise((resolve, reject) => {
        this.history.replace(location, resolve, reject)
      })
    } else {
      this.history.replace(location, onComplete, onAbort)
    }
  }

  go(n: number) {
    this.history.go(n)
  }

  back() {
    this.go(-1)
  }

  forward() {
    this.go(1)
  }
  // 获取匹配到的路由组件
  getMatchedComponents(to?: RawLocation | Route): Array<any> {
    const route: any = to
      ? to.matched
        ? to
        : this.resolve(to).route
      : this.currentRoute
    if (!route) {
      return []
    }
    return [].concat.apply(
      [],
      route.matched.map(m => {
        return Object.keys(m.components).map(key => {
          return m.components[key]
        })
      })
    )
  }
  // 根据路由对象返回浏览器路径等信息
  resolve(
    to: RawLocation,
    current?: Route,
    append?: boolean
  ): {
    location: Location,
    route: Route,
    href: string,
    // for backwards compat
    normalizedTo: Location,
    resolved: Route
  } {
    current = current || this.history.current
    const location = normalizeLocation(to, current, append, this)
    const route = this.match(location, current)
    const fullPath = route.redirectedFrom || route.fullPath
    const base = this.history.base
    const href = createHref(base, fullPath, this.mode)
    return {
      location,
      route,
      href,
      // for backwards compat
      normalizedTo: location,
      resolved: route
    }
  }

  addRoutes(routes: Array<RouteConfig>) {
    this.matcher.addRoutes(routes)
    if (this.history.current !== START) {
      this.history.transitionTo(this.history.getCurrentLocation())
    }
  }
}

function registerHook(list: Array<any>, fn: Function): Function {
  list.push(fn)
  return () => {
    const i = list.indexOf(fn)
    if (i > -1) list.splice(i, 1)
  }
}

function createHref(base: string, fullPath: string, mode) {
  var path = mode === 'hash' ? '#' + fullPath : fullPath
  return base ? cleanPath(base + '/' + path) : path
}

// Vue.use安装插件时候需要暴露的install方法
VueRouter.install = install
VueRouter.version = '__VERSION__'
VueRouter.isNavigationFailure = isNavigationFailure
VueRouter.NavigationFailureType = NavigationFailureType

// 兼容用script标签引用的方法
if (inBrowser && window.Vue) {
  window.Vue.use(VueRouter)
}
