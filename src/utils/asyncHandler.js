/**
 * Wraps an async Express route handler so rejected promises are forwarded to
 * the error-handling middleware (Express 4 does not do this automatically).
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
