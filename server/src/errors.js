// Throw this from services when a business rule blocks an action.
// The error handler turns it into a JSON response with the given status.
export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
