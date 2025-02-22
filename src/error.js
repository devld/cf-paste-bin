export class APIError extends Error {
  status = 500

  /**
   * @param {string} message
   * @param {ErrorOptions} [options]
   */
  constructor(message, options) {
    super(message, options)
  }

  /**
   * @returns {import("./routes").RouteHandlerResult}
   */
  toResult() {
    return { status: this.status, body: { message: this.message } }
  }
}

export class BadRequestError extends APIError {
  status = 400
  /** @param {string} [message] */
  constructor(message) {
    super(message || 'Bad request')
  }
}

export class ForbiddenError extends APIError {
  status = 403
}

export class PasteBinItemExistsError extends APIError {
  status = 409
}

export class PasteBinItemNotFoundError extends APIError {
  status = 404
}
