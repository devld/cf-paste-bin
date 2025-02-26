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
 * @type {Route[]}
 */
const routes = [
  {
    method: 'GET',
    pathMatcher: /^\/(?<keyReq>.+)$/,
    handler: async function getAndRedirect({ params, env: { store, getFile } }) {
      const parsedKeyReq = parsePasteBinItemKeyReq(params.keyReq)
      if (!parsedKeyReq) return { status: 404 }
      const { key, type, adminPassword } = parsedKeyReq
      /** @type {import('./store').PasteBinItem} */
      let item
      try {
        item = await store.getPasteBinItem(key)
      } catch (err) {
        if (!(err instanceof PasteBinItemNotFoundError)) throw err

        return { status: 404 }
      }

      /**
       * @param {any} data
       * @param {string} templateFile
       * @param {RouteHandlerResult}
       */
      async function renderTemplate(data, templateFile) {
        const content = await (await getFile(templateFile)).text()
        return {
          body: content.replace('/* DATA INJECTION POINT */', `data = ${JSON.stringify(data)}`),
          rawBody: true,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }
      }

      if (type === 'admin') {
        if (adminPassword !== item.adminPassword) return { status: 403 }
        return renderTemplate(item, '/index.html')
      }

      if (item.expiredAt && item.expiredAt.isBefore(dayjs())) {
        return { status: 410 }
      }

      if (type === 'u') {
        const url = item.content.trim()
        if (isValidURL(item.content)) return { status: 302, headers: { location: url } }
      }
      if (type === 'md') {
        return renderTemplate(item.content, '/render-markdown.html')
      }

      return {
        body: item.content,
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
]

export default routes

/**
 * @typedef RouteHandlerEnv
 * @property {Store} store
 * @property {(name: string) => Promise<Blob>} getFile
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
