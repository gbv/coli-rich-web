export class ForbiddenAccessError extends Error {
  constructor(message) {
    message = message || "Access is forbidden."
    super(message)
    this.statusCode = 403
  }
}
