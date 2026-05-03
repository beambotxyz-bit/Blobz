'use strict';

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code || 'http_error';
  return error;
}

module.exports = { httpError };
