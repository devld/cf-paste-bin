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
