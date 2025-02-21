/// <reference path="../node_modules/@cloudflare/workers-types/index.d.ts" />

export default class Store {
  /** @type {D1Database} */
  #db
  /** @type {D1Database} */
  constructor(db) {
    this.#db = db
  }

  /**
   * @param {string} key
   * @returns {Promise<PasteBinItem | null>}
   */
  getPasteBinItem(key) {

  }
}

/**
 * @typedef PasteBinItem
 * @property {string} key
 * @property {string} content
 * @property {string | null} adminPassword
 * @property {number} createdAt
 * @property {number} expiredAt
 */
