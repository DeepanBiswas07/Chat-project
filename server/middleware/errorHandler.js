"use strict";

const isProduction = process.env.NODE_ENV === "production";

function notFound(req, res, next) {
  const err = new Error(`Not Found: ${req.method} ${req.originalUrl}`);
  err.statusCode = 404;
  next(err);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.statusCode || err.status || 500;

  if (status >= 500) {
    console.error(`[ERROR] ${req.method} ${req.originalUrl} → ${status}`, err);
  } else {
    console.warn(`[WARN] ${req.method} ${req.originalUrl} → ${status}: ${err.message}`);
  }

  const message =
    isProduction && status >= 500
      ? "Internal server error"
      : err.message || "An unexpected error occurred";

  return res.status(status).json({ success: false, error: message });
}

module.exports = { notFound, errorHandler };
