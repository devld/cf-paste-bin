import { parse } from 'node-html-parser'

/**
 * @param {any} obj
 * @returns {obj is Record<string, any>}
 */
export function isPlainObject(obj) {
  return Object.prototype.toString.call(obj) === '[object Object]'
}

/**
 * @param {any} url
 * @returns {url is string}
 */
export function isValidURL(url) {
  return (
    typeof url === 'string' &&
    url.match(/^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/)
  )
}

/**
 * @param {string} html
 * @returns {Record<string, string> | undefined}
 */
export function parseHTMLRefNodeAtBeginning(html) {
  let endIndex = html.indexOf('</a>')
  if (endIndex === -1) return
  html = html.substring(0, endIndex + '</a>'.length)
  const a = parse(html).firstElementChild
  if (!a) return
  if (a.getAttribute('class') !== 'cf-paste-bin-ref') return
  const parsedAttrs = Object.keys(a.attributes)
    .filter((key) => key.startsWith('data-'))
    .map((key) => ({ key, value: a.attributes[key] }))
    .map((item) => ({
      value: item.value,
      key: item.key.substring('data-'.length).replaceAll(/-([A-Za-z])/g, (_, char) => char.toUpperCase()),
    }))
    .reduce((acc, item) => ({ ...acc, [item.key]: item.value }), {})
  return parsedAttrs
}
