/// <reference path="../node_modules/@cloudflare/workers-types/index.d.ts" />

import dayjs, { Dayjs } from 'dayjs'
import { PasteBinItemExistsError, APIError, PasteBinItemNotFoundError } from './error'

const PASTE_BIN_ITEMS_TABLE = 'paste_bin_items'

export default class Store {
  /** @type {D1Database} */
  #db
  /** @type {D1Database} */
  constructor(db) {
    this.#db = db
  }

  /**
   * @param {string} key
   * @returns {Promise<PasteBinItem>}
   * @throws {PasteBinItemNotFoundError}
   */
  async getPasteBinItem(key) {
    const record = await this.#db.prepare(`SELECT * FROM ${PASTE_BIN_ITEMS_TABLE} WHERE key = ?`).bind(key).first()
    if (!record) throw new PasteBinItemNotFoundError(`paste bin item with key '${key}' not found`)
    return this.#recordToPasteBinItem(record)
  }

  /**
   * @param {Omit<PasteBinItem, 'createdAt' | 'updatedAt'>} item
   * @returns {Promise<PasteBinItem>}
   * @throws {PasteBinItemExistsError}
   */
  async createPasteBinItem(item) {
    const now = dayjs()
    try {
      /** @type {PasteBinItem} */
      const newItem = { ...item, createdAt: now, updatedAt: now }
      await this.#db
        .prepare(
          `INSERT INTO ${PASTE_BIN_ITEMS_TABLE}(\`key\`, \`content\`, \`admin_password\`, \`expired_at\`, \`created_at\`, \`updated_at\`) VALUES(?, ?, ?, ?, ?, ?)`
        )
        .bind(
          newItem.key,
          newItem.content,
          newItem.adminPassword,
          newItem.expiredAt?.toDate().getTime() || null,
          newItem.createdAt.toDate().getTime(),
          newItem.updatedAt.toDate().getTime()
        )
        .run()
      return newItem
    } catch (e) {
      if (e.message.includes('D1_ERROR: UNIQUE constraint')) {
        return new PasteBinItemExistsError(`paste bin item with key '${item.key}' already exists`)
      }
      return new APIError(e.message, { cause: e })
    }
  }

  /**
   * @param {Partial<Pick<PasteBinItem, 'content' | 'expiredAt'>> & Pick<PasteBinItem, 'key'>} item
   * @returns {Promise<PasteBinItem>}
   * @throws {PasteBinItemNotFoundError}
   */
  async updatePasteBinItem(item) {
    /** @type {[string, any][]} */
    const changes = [['updated_at', Date.now()]]
    if (item.content !== undefined) changes.push(['content', item.content])
    if (item.expiredAt !== undefined) changes.push(['expired_at', item.expiredAt?.toDate().getTime() || null])

    /** @type {D1Response} */
    const result = await this.#db
      .prepare(`UPDATE ${PASTE_BIN_ITEMS_TABLE} SET ${changes.map(([column]) => `${column} = ?`).join(', ')} WHERE key = ?`)
      .bind(...changes.map(([_, value]) => value), item.key)
      .run()

    if (result.meta.changes === 0) {
      throw new PasteBinItemNotFoundError(`paste bin item with key '${item.key}' not found`)
    }
    return this.getPasteBinItem(item.key)
  }

  /**
   * @param {Record<string, any>} record
   * @returns {PasteBinItem}
   */
  #recordToPasteBinItem(record) {
    return {
      key: record.key,
      content: record.content,
      adminPassword: record.admin_password,
      expiredAt: record.expired_at ? dayjs(record.expired_at) : null,
      createdAt: dayjs(record.created_at),
      updatedAt: dayjs(record.updated_at),
    }
  }
}

/**
 * @typedef PasteBinItem
 * @property {string} key
 * @property {string} content
 * @property {string | null} adminPassword
 * @property {Dayjs | null} expiredAt
 * @property {Dayjs} createdAt
 * @property {Dayjs} updatedAt
 */
