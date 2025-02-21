import Store from './store'

/**
 * @type {Route[]}
 */
const routes = [
  {
    method: 'GET',
    pathMatcher: /^\/(?<id>.+)$/,
    handler: async function getAndRedirect({ params, store }) {
      const id = params.id

      const item = await store.getPasteBinItem(id)
      console.log(item)

      const urls = { 250214: 'https://devld.cn/res/250214.mp4' }
      if (urls[id]) {
        return { status: 302, headers: { location: urls[id] } }
      }

      return { status: 404 }
    },
  },
]

export default routes

/**
 * @typedef RouteHandlerArg
 * @property {Record<string, string>} params
 * @property {Store} store
 */

/**
 * @typedef RouteHandlerResult
 * @property {number} status
 * @property {Record<string, string>} headers
 * @property {any} body
 */

/**
 * @typedef Route
 * @property {'GET'|'POST'} method
 * @property {RegExp} pathMatcher
 * @property {(arg: RouteHandlerArg) => Promise<RouteHandlerResult | undefined> | RouteHandlerResult | undefined} handler
 */
