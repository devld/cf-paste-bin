/// <reference path="../node_modules/@cloudflare/workers-types/index.d.ts" />

import Store from './store'
import routes from './routes'
import { APIError } from './error'

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

    let body
    try {
      const contentType = originalRequest.headers.get('content-type')

      if (contentType?.includes('application/json')) body = await originalRequest.json()
      else body = originalRequest.body
    } catch (err) {
      console.log(err)
      return new Response(null, { status: 400 })
    }

    /** @type {import('./routes').Route | undefined} */
    let matchedRoute
    /** @type {import('./routes').RouteHandlerArg} */
    const handlerArg = {
      params: {},
      query: url.searchParams,
      headers: originalRequest.headers,
      body: body,
      env: {
        store: new Store(env.DB),
        getFile: async (name) => {
          const assetUrl = new URL(name, url.origin)
          const resp = await env.ASSETS.fetch(assetUrl)
          if (!resp.ok) throw new APIError('File not found')
          return resp.blob()
        },
      },
    }

    for (const route of routes) {
      if (method !== route.method) continue
      const matched = route.pathMatcher.exec(url.pathname)
      if (!matched) continue

      handlerArg.params = matched.groups ?? {}
      matchedRoute = route
    }

    if (!matchedRoute) {
      return env.ASSETS.fetch(url, { method, headers: originalRequest.headers })
    }

    console.log(`handle ${matchedRoute.handler.name}: ${url}`)
    /** @type {import('./routes').RouteHandlerResult} */
    let result
    try {
      result = (await matchedRoute.handler(handlerArg)) ?? { status: 204 }
    } catch (err) {
      console.error(`handle error ${matchedRoute.handler.name}: ${url}`, err)
      if (!(err instanceof APIError)) {
        return new Response(JSON.stringify({ message: 'Internal Server Error' }), { status: 500 })
      }
      result = err.toResult()
    }

    if (!result) return new Response(null, { status: 204 })
    if (result.rawBody) return new Response(result.body, { status: result.status, headers: result.headers })

    return new Response(result.body !== undefined ? JSON.stringify(result.body) : undefined, {
      status: result.status,
      headers: { ...result.headers, 'content-type': result.body !== undefined ? 'application/json' : undefined },
    })
  },
}
