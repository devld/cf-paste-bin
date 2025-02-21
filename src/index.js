/// <reference path="../node_modules/@cloudflare/workers-types/index.d.ts" />

/**
 * @type {Route[]}
 */
const routes = [
  {
    method: 'GET',
    pathMatcher: /^\/(?<id>.+)$/,
    handler: function getAndRedirect({ params }) {
      const id = params.id

      const urls = { 250214: 'https://devld.cn/res/250214.mp4' }
      if (urls[id]) {
        return new Response(null, { status: 302, headers: { location: urls[id] } })
      }

      return new Response(null, { status: 404 })
    },
  },
]

/**
 * @type {ExportedHandler<{ ASSETS: { fetch: typeof fetch }; PATH_PREFIX: string }>}
 */
export default {
  async fetch(originalRequest, env) {
    const method = originalRequest.method
    const url = new URL(originalRequest.url)
    if (url.pathname !== env.PATH_PREFIX && !url.pathname.startsWith(env.PATH_PREFIX + '/')) {
      return new Response(null, { status: 404 })
    }
    url.pathname = url.pathname.substring(env.PATH_PREFIX.length) || '/'

    for (const route of routes) {
      if (method !== route.method) continue
      const matched = route.pathMatcher.exec(url.pathname)
      if (!matched) continue

      console.log(`handle ${route.handler.name}: ${url}`)
      try {
        return route.handler({ params: matched.groups ?? {} }) ?? new Response(null, { status: 204 })
      } catch (err) {
        console.error(`handle error ${route.handler.name}: ${url}`, err)
        return new Response(JSON.stringify({ message: err.message }), { status: err.status ?? 500 })
      }
    }

    return env.ASSETS.fetch(url, { method, headers: originalRequest.headers })
  },
}

/**
 * @typedef RouteHandlerArg
 * @property {Record<string, string>} params
 */

/**
 * @typedef Route
 * @property {'GET'|'POST'} method
 * @property {RegExp} pathMatcher
 * @property {(arg: RouteHandlerArg) => Response | undefined} handler
 */
