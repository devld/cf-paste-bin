import dayjs from 'dayjs'
import { customAlphabet } from 'nanoid'
import Store from './store'
import { isPlainObject, isValidURL } from './utils'
import { BadRequestError, ForbiddenError, PasteBinItemExistsError, PasteBinItemNotFoundError } from './error'

const KEY_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const KEY_TYPE_SEP = '-'
const ADMIN_PASSWORD_PREFIX = '$'

const INITIAL_KEY_LENGTH = 4
const MAX_KEY_LENGTH = 16
const ADMIN_PASSWORD_LENGTH = 16

const nanoid = customAlphabet(KEY_CHARS)

/** @type {Route[]} */
const extraRouteHandlers = []
/** @type {Record<string, PasteBinItemTypeHandler>} */
const extraPasteBinItemTypeHandlers = {}

/**
 * @type {Record<string, PasteBinItemTypeHandler>}
 */
const pasteBinItemsTypeHandlers = {
  u: async (data) => {
    const url = data.content.trim()
    if (isValidURL(data.content)) return { status: 302, headers: { location: url } }
  },
  md: async (data, env) =>
    renderTemplate('/render-markdown.html', env, {
      data: { content: data.content, createdAt: data.createdAt, updatedAt: data.updatedAt },
    }),
  ...extraPasteBinItemTypeHandlers,
}

/**
 * @type {Route[]}
 */
const routes = [
  {
    method: 'GET',
    pathMatcher: /^\/(?<keyReq>.*)$/,
    handler: async function getAndRedirect({ params, env }) {
      if (!params.keyReq) return renderTemplate('/index.html', env)

      const parsedKeyReq = parsePasteBinItemKeyReq(params.keyReq)
      if (!parsedKeyReq) return { status: 404 }
      const { key, type, adminPassword } = parsedKeyReq
      /** @type {import('./store').PasteBinItem} */
      let data
      try {
        data = await env.store.getPasteBinItem(key)
      } catch (err) {
        if (!(err instanceof PasteBinItemNotFoundError)) throw err

        return { status: 404 }
      }

      if (type === 'admin') {
        if (adminPassword !== data.adminPassword) return { status: 403 }
        return renderTemplate('/index.html', env, { data })
      }

      if (data.expiredAt && data.expiredAt.isBefore(dayjs())) {
        return { status: 410 }
      }

      const typeHandler = type ? pasteBinItemsTypeHandlers[type] : null
      const typeResp = typeHandler ? await typeHandler(data, env) : null
      if (typeResp) return typeResp

      return {
        body: data.content,
        rawBody: true,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }
    },
  },
  {
    method: 'POST',
    pathMatcher: /^\/$/,
    handler: async function createPasteBinItem({ query, body, env: { store } }) {
      const payload = extractPasteBinItemPayload(query, body)
      let isCustomKey = false
      if (payload.key) {
        if (!isValidPasteBinItemKey(payload.key)) throw new BadRequestError('Invalid key: ' + payload.key)
        isCustomKey = true
      } else {
        payload.key = nanoid(INITIAL_KEY_LENGTH)
      }
      if (!payload.content) throw new BadRequestError('No content provided')

      payload.adminPassword = nanoid(ADMIN_PASSWORD_LENGTH)

      /** @type {import('./store').PasteBinItem} */
      let createdItem
      while (true) {
        try {
          createdItem = await store.createPasteBinItem(payload)
          break
        } catch (err) {
          if (err instanceof PasteBinItemExistsError) {
            if (!isCustomKey) {
              payload.key = nanoid(Math.min(MAX_KEY_LENGTH, payload.key.length + 1))
              continue
            }
          }
          throw err
        }
      }
      return { status: 201, body: createdItem }
    },
  },
  {
    method: 'PATCH',
    pathMatcher: /^\/(?<key>.+)$/,
    handler: async function updatePasteBinItem({ params, query, body, env: { store } }) {
      const key = params.key
      if (!isValidPasteBinItemKey(key)) throw new BadRequestError('Invalid key: ' + key)

      const payload = extractPasteBinItemPayload(query, body)
      const createdItem = await store.getPasteBinItem(key)
      if (createdItem.adminPassword !== payload.adminPassword) throw new ForbiddenError('Invalid admin password')

      const updatedItem = await store.updatePasteBinItem({
        key,
        content: payload.content,
        expiredAt: payload.expiredAt,
      })

      return { body: updatedItem }
    },
  },
  ...extraRouteHandlers,
]

export default routes

/**
 * @param {string} templateFile
 * @param {RouteHandlerEnv} env
 * @param {Record<string, any>} data
 * @param {RouteHandlerResult}
 */
async function renderTemplate(templateFile, env, data = {}) {
  const content = await (await env.getFile(templateFile)).text()

  /** @type {[string, any][]} */
  const injections = [['config', { PATH_PREFIX: env.PATH_PREFIX, KEY_TYPE_SEP, ADMIN_PASSWORD_PREFIX }], ...Object.entries(data)]

  const REPLACEMENT_SUFFIX = ' = null // INJECTION_POINT'
  const body = injections
    .reduce((content, [key, value]) => content.replace(`${key}${REPLACEMENT_SUFFIX}`, `${key} = ${JSON.stringify(value)}`), content)
    .replaceAll(REPLACEMENT_SUFFIX, ' = null')

  return { body, rawBody: true, headers: { 'content-type': 'text/html; charset=utf-8' } }
}

/**
 * @param {string} keyReq
 * @returns {{ key: string; type: string | null; adminPassword?: string }}
 */
function parsePasteBinItemKeyReq(keyReq) {
  if (typeof keyReq !== 'string') return null
  if (!keyReq.includes(KEY_TYPE_SEP)) return { key: keyReq, type: null }

  const [key, type] = keyReq.split(KEY_TYPE_SEP)
  if (!key) return null

  if (type?.startsWith(ADMIN_PASSWORD_PREFIX)) {
    return { key, type: 'admin', adminPassword: type.slice(ADMIN_PASSWORD_PREFIX.length) }
  }

  return { key, type }
}

function isValidPasteBinItemKey(key) {
  return (
    typeof key === 'string' && key.length > 0 && key.length <= MAX_KEY_LENGTH && key.split('').every((char) => KEY_CHARS.includes(char))
  )
}

/**
 * @param {URLSearchParams} query
 * @param {any} body
 */
function extractPasteBinItemPayload(query, body) {
  /** @type {Partial<Parameters<InstanceType<typeof Store>['createPasteBinItem']>[0]>} */
  const payload = {
    key: query.get('key'),
    content: query.get('content'),
    adminPassword: query.get('adminPassword'),
    expiredAt: query.get('expiredAt') ? dayjs(query.get('expiredAt')) : null,
  }
  if (isPlainObject(body)) {
    payload.key = body.key ?? payload.key
    payload.content = body.content ?? payload.content
    payload.adminPassword = body.adminPassword ?? payload.adminPassword
    payload.expiredAt = (body.expiredAt ? dayjs(body.expiredAt) || null : null) ?? payload.expiredAt
  }
  if (typeof payload.content !== 'string') delete payload.content
  if (payload.expiredAt && !payload.expiredAt.isValid()) delete payload.expiredAt

  return payload
}

/**
 * @typedef RouteHandlerEnv
 * @property {Store} store
 * @property {(name: string) => Promise<Blob>} getFile
 * @property {string} PATH_PREFIX
 */

/**
 * @typedef RouteHandlerArg
 * @property {Record<string, string>} params
 * @property {URLSearchParams} query
 * @property {Headers} headers
 * @property {any} body
 * @property {RouteHandlerEnv} env
 */

/**
 * @typedef RouteHandlerResult
 * @property {number} [status]
 * @property {Record<string, string>} headers
 * @property {any} body
 * @property {boolean} [rawBody]
 */

/**
 * @typedef Route
 * @property {'GET'|'POST'|'PATCH'|'DELETE'} method
 * @property {RegExp} pathMatcher
 * @property {(arg: RouteHandlerArg) => Promise<RouteHandlerResult | undefined> | RouteHandlerResult | undefined} handler
 */

/**
 * @callback PasteBinItemTypeHandler
 * @param {import('./store').PasteBinItem} data
 * @param {RouteHandlerEnv} env
 * @returns {Promise<RouteHandlerResult | undefined>}
 */
