import View from './components/view'
import Link from './components/link'

export let _Vue

// Vue.use安装插件时候需要暴露的install方法
export function install(Vue) {
  // 判断是否已经启动安装vue-router，确保 install 逻辑只执行一次
  if (install.installed && _Vue === Vue) return
  install.installed = true

  // 保存Vue实例, 作为 Vue 的插件对 Vue 对象是有依赖的，但又不能去单独去 import Vue，因为那样会增加包体积，所以就通过这种方式拿到 Vue 对象
  _Vue = Vue

  // 判断是否已定义
  const isDef = v => v !== undefined

  // 进行注册router实例
  const registerInstance = (vm, callVal) => {
    // 至少存在一个 VueComponent 时, _parentVnode 属性才存在
    let i = vm.$options._parentVnode
    /* 
     * isDef(i)：VueComponent存在的前提下
     * isDef(i = i.data)：VueComponent的data之后进行初始化
     * isDef(i = i.registerRouteInstance)：registerRouteInstance在src/components/view.js，只有早<router-view>的下一层组件实例中才会执行if
     */
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      // 这里的i = vm.$options._parentVnode.data.registerRouteInstance
      i(vm, callVal)
    }
  }

  // 
  Vue.mixin({
    // 在beforeCreate执行环境的时候，this指向的是新创建出来的vm实例
    beforeCreate() {
      // 首次初始化路由，只执行一次
      if (isDef(this.$options.router)) {
        // 如果配置项有router选项的时候，那么这个vm实例就是router的根组件
        this._routerRoot = this
        // 把VueRouter实例挂载到_router上
        this._router = this.$options.router
        // init定义在src/index.js中
        this._router.init(this)
        // Vue.util.defineReactive, 通过Vue中观察者劫持数据的方法，劫持_route，当_route触发setter方法的时候，则会通知到依赖的组件
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        // 如果不是路由根目录组件的时候，那么就会通过$parent一级级获取将_routerRoot属性赋值为根目录组件
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

  // 给Vue原型新增属性：$router，$route，这样Vue的所有组件都会有这2个属性了
  Object.defineProperty(Vue.prototype, '$router', {
    get() { return this._routerRoot._router }
  })

  Object.defineProperty(Vue.prototype, '$route', {
    get() { return this._routerRoot._route }
  })

  // 注册router-view router-link组件，这样就可以在页面使用
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  const strats = Vue.config.optionMergeStrategies
  // 为路由新增3个钩子挂在在Vue上，和created方法一样
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
