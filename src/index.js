/// <reference path="../node_modules/@cloudflare/workers-types/index.d.ts" />

import Store from './store'
import routes from './routes'

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

    const store = new Store(env.DB)

    for (const route of routes) {
      if (method !== route.method) continue
      const matched = route.pathMatcher.exec(url.pathname)
      if (!matched) continue

      /** @type {import('./routes').RouteHandlerArg} */
      const handlerArg = {
        params: matched.groups ?? {},
        store,
      }

      console.log(`handle ${route.handler.name}: ${url}`)
      try {
        /**
         * @type {import('./routes').RouteHandlerResult}
         */
        const result = await route.handler(handlerArg) ?? { status: 204 }
        return new Response(result.body !== undefined ? JSON.stringify(result.body) : undefined, {
          status: result.status,
          headers: result.headers,
        })
      } catch (err) {
        console.error(`handle error ${route.handler.name}: ${url}`, err)
        return new Response(JSON.stringify({ message: err.message }), { status: err.status ?? 500 })
      }
    }

    return env.ASSETS.fetch(url, { method, headers: originalRequest.headers })
  },
}
